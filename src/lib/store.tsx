import type { Eip1193Provider } from "@aurora-is-near/intents-connect";
import { usePrivy } from "@privy-io/react-auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { createContext, useContext, useMemo, useState } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { AgentVaultAbi } from "./abi/AgentVault";
import { MockERC20Abi } from "./abi/MockERC20";
import {
	type AuroraUsdc,
	createAuroraRunner,
	evmConnector,
	vaultDepositRecipe,
} from "./aurora";
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
	/** "monad" deposits straight from the wallet; anything else goes through Aurora. */
	chain: string;
	symbol: string;
	amount: number;
	/** Required for a non-Monad chain: the USDC token on the origin and on Monad. */
	aurora?: { origin: AuroraUsdc; destination: AuroraUsdc };
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
	const { address, connector } = useAccount();
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

	function startFlight(input: SubscribeInput, steps: RouteStep[]) {
		const agent = agents.find((a) => a.id === input.agentId);
		const id = `subscribe-${input.agentId}-${Date.now()}`;
		setInFlight((list) => [
			...list,
			{
				id,
				kind: "subscribe",
				actor: { kind: "owner", name: "you", address: address ?? "" },
				agentId: input.agentId,
				timestamp: Date.now(),
				title: `Subscribe · ${agent?.name ?? input.agentId.slice(0, 10)}`,
				amount: `${input.amount.toLocaleString("en-US")} ${input.symbol}`,
				status: "in-progress",
				steps,
			},
		]);
		const setStep = (
			index: number,
			state: RouteStep["state"],
			detail?: string,
		) => {
			steps[index] = { ...steps[index], state, detail } as RouteStep;
			patchFlight(id, { steps: [...steps] });
		};
		const fail = (index: number, err: unknown) =>
			patchFlight(id, {
				status: "failed",
				reason: txErrorMessage(err),
				steps: steps.map((s, i) =>
					i === index ? { ...s, state: "failed", detail: undefined } : s,
				),
			});
		return { id, setStep, fail };
	}

	/** Same-chain path: approve USDC to the vault, then an ordinary ERC-4626 deposit. */
	async function depositOnMonad(input: SubscribeInput) {
		if (!address) throw new Error("connect a wallet first");
		if (!publicClient) throw new Error("no public client");
		const agent = agents.find((a) => a.id === input.agentId);
		if (!agent) throw new Error("unknown agent");
		const vault = agent.vault.address as `0x${string}`;
		const assets = BigInt(Math.round(input.amount * 10 ** USDC_DECIMALS));

		const flight = startFlight(input, [
			{ id: "approve", label: "Approve USDC", state: "active" },
			{ id: "deposit", label: `Deposit into ${agent.name}`, state: "pending" },
		]);
		let step = 0;
		try {
			const approveHash = await writeContractAsync({
				address: CONTRACTS.usdc,
				abi: MockERC20Abi,
				functionName: "approve",
				args: [vault, assets],
			});
			flight.setStep(0, "active", "confirming");
			await publicClient.waitForTransactionReceipt({ hash: approveHash });
			flight.setStep(0, "done");
			step = 1;
			flight.setStep(1, "active");

			const depositHash = await writeContractAsync({
				address: vault,
				abi: AgentVaultAbi,
				functionName: "deposit",
				args: [assets, address],
			});
			flight.setStep(1, "active", "confirming");
			await publicClient.waitForTransactionReceipt({ hash: depositHash });
			flight.setStep(1, "done");

			await queryClient.invalidateQueries({ queryKey: ["agents"] });
			dismissInFlight(flight.id);
		} catch (err) {
			flight.fail(step, err);
			throw err;
		}
	}

	/** Cross-chain path: Aurora bridges USDC to the user's intermediary on Monad and
	 *  runs approve + deposit from there. The route steps follow the SDK's phases. */
	async function depositViaAurora(input: SubscribeInput) {
		if (!address || !connector) throw new Error("connect a wallet first");
		if (!input.aurora) throw new Error("aurora tokens missing");
		const agent = agents.find((a) => a.id === input.agentId);
		if (!agent) throw new Error("unknown agent");
		const { origin, destination } = input.aurora;
		const amount = BigInt(
			Math.round(input.amount * 10 ** origin.decimals),
		).toString();

		const flight = startFlight(input, [
			{ id: "sign", label: "Sign intent", state: "active" },
			{
				id: "deposit",
				label: `Send USDC on ${origin.blockchain}`,
				state: "pending",
			},
			{
				id: "settle",
				label: `Bridge and deposit into ${agent.name}`,
				state: "pending",
			},
		]);
		let step = 0;
		const getProvider = () =>
			connector.getProvider() as Promise<Eip1193Provider>;
		const runner = createAuroraRunner(
			evmConnector(address, getProvider, [
				origin.blockchain,
				destination.blockchain,
			]),
			getProvider,
			(event) => {
				if (event.type === "deposit-sent") {
					flight.setStep(1, "done", event.txHash.slice(0, 10));
					step = 2;
					flight.setStep(2, "active");
				}
			},
		);
		try {
			await runner.run({
				recipe: vaultDepositRecipe(destination),
				params: { vault: agent.vault.address as `0x${string}` },
				quote: {
					originAsset: origin.assetId,
					destinationAsset: destination.assetId,
					amount,
					swapType: "EXACT_INPUT",
					slippageTolerance: 100,
				},
				originChain: origin.blockchain,
				originToken: {
					contractAddress: origin.contractAddress,
					decimals: origin.decimals,
				},
				depositViaWallet: true,
			});
			flight.setStep(2, "done");
			await queryClient.invalidateQueries({ queryKey: ["agents"] });
			dismissInFlight(flight.id);
		} catch (err) {
			flight.fail(step, err);
			throw err;
		}
	}

	async function subscribeOnChain(input: SubscribeInput) {
		return input.chain === "monad"
			? depositOnMonad(input)
			: depositViaAurora(input);
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
