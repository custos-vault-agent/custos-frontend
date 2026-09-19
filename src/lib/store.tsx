import { usePrivy } from "@privy-io/react-auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { createContext, useContext, useMemo, useState } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { AgentVaultAbi } from "./abi/AgentVault";
import { CustosCoreAbi } from "./abi/CustosCore";
import { MockAuroraReceiverAbi } from "./abi/MockAuroraReceiver";
import { MockERC20Abi } from "./abi/MockERC20";
import { CONTRACTS, USDC_DECIMALS } from "./chain";
import { fetchAgents } from "./onchain";
import { txErrorMessage } from "./txErrors";
import type {
	ActivityEntry,
	Agent,
	Position,
	ResetPeriod,
	RouteStep,
} from "./types";

export type RegisterInput = {
	name: string;
	description: string;
	agentAddress: string;
	seedAmount: number;
	allowance: number;
	resetPeriod: ResetPeriod;
	feeRateBps: number;
	maxDrawdownBps: number;
	maxUtilizationBps: number;
	yieldEnabled: boolean;
	isPublic: boolean;
};

export type SubscribeInput = {
	agentId: string;
	chain: string;
	symbol: string;
	amount: number;
};

export type RedeemInput = {
	agentId: string;
	shares: number;
	chain: string;
};

type StoreValue = {
	connected: boolean;
	connectedAddress: string | null;
	agents: Agent[];
	agentsLoading: boolean;
	myAgents: Agent[];
	positions: Position[];
	myPositions: Position[];
	history: ActivityEntry[];
	inFlight: ActivityEntry[];
	tick: number;
	connect: () => void;
	disconnect: () => void;
	registerAgent: (input: RegisterInput) => void;
	setAllowance: (
		id: string,
		allowance: number,
		resetPeriod: ResetPeriod,
	) => void;
	pauseAgent: (id: string) => void;
	resumeAgent: (id: string) => void;
	revokeAgent: (id: string) => void;
	setPublic: (id: string, isPublic: boolean) => void;
	subscribe: (input: SubscribeInput) => void;
	redeem: (input: RedeemInput) => void;
	/** Clears a finished (failed) in-flight entry from the panel that shows it. */
	dismissInFlight: (id: string) => void;
};

const STUB_MESSAGE =
	"not implemented yet — this plan is read-only; writes land in a later plan";

function stub(name: string) {
	return (..._args: unknown[]) => {
		console.warn(`useStore().${name}: ${STUB_MESSAGE}`);
	};
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
	const { ready, authenticated, login, logout } = usePrivy();
	const { address } = useAccount();
	const publicClient = usePublicClient();
	const { writeContractAsync } = useWriteContract();
	const queryClient = useQueryClient();

	const { data: agents = [], isLoading: agentsLoading } = useQuery({
		queryKey: ["agents"],
		queryFn: () => {
			if (!publicClient) throw new Error("no public client");
			return fetchAgents(publicClient);
		},
		enabled: !!publicClient,
		refetchInterval: 10_000,
	});

	const connectedAddress = address ?? null;

	const myAgents = useMemo(
		() =>
			connectedAddress
				? agents.filter(
						(a) =>
							a.creatorAddress.toLowerCase() ===
								connectedAddress.toLowerCase() && a.status !== "revoked",
					)
				: [],
		[agents, connectedAddress],
	);

	// Position tracking (shares-per-subscriber) needs an indexer or a
	// balanceOf-per-vault read this plan doesn't add yet — empty until a
	// later plan wires it, same "honest zero" philosophy as agent.stats.
	const positions: Position[] = [];
	const myPositions: Position[] = [];
	const history: ActivityEntry[] = [];

	// Transactions this session is driving right now. The TopBar counts them
	// and SubscribeFlow renders the route of its own; a failed entry stays
	// until dismissed so the reason is readable, a successful one is removed
	// the moment the receipt lands (that removal is what flips "landed").
	const [inFlight, setInFlight] = useState<ActivityEntry[]>([]);
	const patchFlight = (id: string, patch: Partial<ActivityEntry>) =>
		setInFlight((list) =>
			list.map((e) => (e.id === id ? { ...e, ...patch } : e)),
		);
	const dismissInFlight = (id: string) =>
		setInFlight((list) => list.filter((e) => e.id !== id));

	// Aurora Intents Connect only ships a mainnet widget/API today, so the
	// cross-chain leg (source chain -> solver -> bridged USDC landing here)
	// isn't something this hackathon build can integrate against yet. This
	// wallet is treated as already holding the resulting USDC on Monad
	// testnet, and MockAuroraReceiver.fulfillIntent (deployed in place of the
	// real Aurora Receiver, see chain.ts) takes it from there exactly like
	// the real one would once bridging lands.
	async function subscribeOnChain(input: SubscribeInput) {
		if (!address) throw new Error("connect a wallet first");
		if (!publicClient) throw new Error("no public client");
		const assets = BigInt(Math.round(input.amount * 10 ** USDC_DECIMALS));
		const agent = agents.find((a) => a.id === input.agentId);

		const id = `subscribe-${input.agentId}-${Date.now()}`;
		const steps: RouteStep[] = [
			{ id: "approve", label: "Approve USDC", state: "active" },
			{ id: "intent", label: "Send intent", state: "pending" },
			{
				id: "credit",
				label: `Credit ${agent?.name ?? "vault"}`,
				state: "pending",
			},
		];
		const setStep = (
			index: number,
			state: RouteStep["state"],
			detail?: string,
		) =>
			patchFlight(id, {
				steps: steps.map((s, i) => (i === index ? { ...s, state, detail } : s)),
			});
		setInFlight((list) => [
			...list,
			{
				id,
				kind: "subscribe",
				actor: { kind: "owner", name: "you", address },
				agentId: input.agentId,
				timestamp: Date.now(),
				title: `Subscribe · ${agent?.name ?? input.agentId.slice(0, 10)}`,
				amount: `${input.amount.toLocaleString("en-US")} ${input.symbol}`,
				status: "in-progress",
				steps,
			},
		]);

		let step = 0;
		try {
			const approveHash = await writeContractAsync({
				address: CONTRACTS.usdc,
				abi: MockERC20Abi,
				functionName: "approve",
				args: [CONTRACTS.auroraReceiver, assets],
			});
			setStep(0, "active", "confirming");
			await publicClient.waitForTransactionReceipt({ hash: approveHash });
			steps[0] = { ...steps[0], state: "done", detail: undefined } as RouteStep;
			step = 1;
			setStep(1, "active");

			const intentHash = await writeContractAsync({
				address: CONTRACTS.auroraReceiver,
				// Errors from the vault/core bubble through the receiver; their ABIs
				// are what turns a raw revert into a name txErrorMessage can read.
				abi: [...MockAuroraReceiverAbi, ...CustosCoreAbi, ...AgentVaultAbi],
				functionName: "fulfillIntent",
				args: [input.agentId as `0x${string}`, address, assets],
			});
			setStep(1, "active", "confirming");
			await publicClient.waitForTransactionReceipt({ hash: intentHash });
			steps[1] = { ...steps[1], state: "done", detail: undefined } as RouteStep;
			step = 2;
			setStep(2, "done");

			await queryClient.invalidateQueries({ queryKey: ["agents"] });
			dismissInFlight(id);
		} catch (err) {
			const reason = txErrorMessage(err);
			patchFlight(id, {
				status: "failed",
				reason,
				steps: steps.map((s, i) =>
					i === step ? { ...s, state: "failed", detail: undefined } : s,
				),
			});
			throw err;
		}
	}

	const value: StoreValue = {
		connected: ready && authenticated,
		connectedAddress,
		agents,
		agentsLoading,
		myAgents,
		positions,
		myPositions,
		history,
		inFlight,
		tick: 0,
		connect: () => login(),
		disconnect: () => logout(),
		registerAgent: stub("registerAgent"),
		setAllowance: stub("setAllowance"),
		pauseAgent: stub("pauseAgent"),
		resumeAgent: stub("resumeAgent"),
		revokeAgent: stub("revokeAgent"),
		setPublic: stub("setPublic"),
		subscribe: (input) => {
			// The failure is already on screen via inFlight; the log is for devtools.
			subscribeOnChain(input).catch((err) =>
				console.error("subscribe failed:", err),
			);
		},
		redeem: stub("redeem"),
		dismissInFlight,
	};

	return (
		<StoreContext.Provider value={value}>{children}</StoreContext.Provider>
	);
}

export function useStore(): StoreValue {
	const value = useContext(StoreContext);
	if (!value) throw new Error("useStore must be used inside <StoreProvider>");
	return value;
}
