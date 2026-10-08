import type { Eip1193Provider } from "@aurora-is-near/intents-connect";
import { usePrivy } from "@privy-io/react-auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
	createContext,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { stringToHex, zeroAddress } from "viem";
import {
	useAccount,
	usePublicClient,
	useSwitchChain,
	useWriteContract,
} from "wagmi";
import { AgentVaultAbi } from "./abi/AgentVault";
import { CustosCoreAbi } from "./abi/CustosCore";
import { MockERC20Abi } from "./abi/MockERC20";
import { NanSigilAbi } from "./abi/NanSigil";
import { createAuroraRunner, evmConnector, vaultDepositRecipe } from "./aurora";
import {
	CONTRACTS,
	monadChain,
	RESET_PERIOD_SECONDS,
	USDC_DECIMALS,
} from "./chain";
import { isResumable, parse, serialize, storageKey } from "./inflight";
import { pullAttestation } from "./nansigil";
import { fetchAgents } from "./onchain";
import { txErrorMessage } from "./txErrors";
import type {
	ActivityEntry,
	ActivityKind,
	Agent,
	Position,
	RedeemInput,
	RegisterInput,
	ResetPeriod,
	RouteStep,
	SubscribeInput,
} from "./types";

export type { RedeemInput, RegisterInput, SubscribeInput };

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
	/** Pull a signed Nansen profile for the connected wallet and relay it. */
	claimNansenBadge: () => void;
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
	/** True when `resumeFlight` would act on this entry. */
	canResume: (entry: ActivityEntry) => boolean;
	/** Re-runs an interrupted Monad deposit or registration, skipping an approve that already landed. */
	resumeFlight: (id: string) => void;
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
	const { address, connector, chainId: walletChainId } = useAccount();
	const publicClient = usePublicClient({ chainId: monadChain.id });
	const { switchChainAsync } = useSwitchChain();
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
	// Ids this session is actively driving; a stored entry from before a reload is not.
	const live = useRef(new Set<string>());
	const storeKey = connectedAddress
		? storageKey(monadChain.id, connectedAddress)
		: null;
	const [loadedKey, setLoadedKey] = useState<string | null>(null);

	useEffect(() => {
		let stored: ActivityEntry[] = [];
		if (storeKey) {
			try {
				stored = parse(localStorage.getItem(storeKey), Date.now());
			} catch {}
		}
		// Keep only what this session is driving: another account's entries must not
		// follow a wallet switch, or they would be saved under the new key.
		setInFlight((cur) => {
			const own = cur.filter((c) => live.current.has(c.id));
			return [...stored.filter((s) => !own.some((c) => c.id === s.id)), ...own];
		});
		setLoadedKey(storeKey);
	}, [storeKey]);

	useEffect(() => {
		if (!storeKey || loadedKey !== storeKey) return;
		try {
			localStorage.setItem(storeKey, serialize(inFlight));
		} catch {}
	}, [inFlight, storeKey, loadedKey]);

	const patchFlight = (id: string, patch: Partial<ActivityEntry>) =>
		setInFlight((list) =>
			list.map((e) => (e.id === id ? { ...e, ...patch } : e)),
		);
	const dismissInFlight = (id: string) => {
		live.current.delete(id);
		setInFlight((list) => list.filter((e) => e.id !== id));
	};

	function startFlight(
		meta: {
			kind: ActivityKind;
			/** Distinguishes concurrent flights of the same kind. */
			key: string;
			agentId: string;
			title: string;
			amount: string;
			resume?: ActivityEntry["resume"];
		},
		steps: RouteStep[],
	) {
		const id = `${meta.kind}-${meta.key}-${Date.now()}`;
		live.current.add(id);
		setInFlight((list) => [
			...list,
			{
				id,
				kind: meta.kind,
				actor: { kind: "owner", name: "you", address: address ?? "" },
				agentId: meta.agentId,
				timestamp: Date.now(),
				title: meta.title,
				amount: meta.amount,
				status: "in-progress",
				steps,
				resume: meta.resume,
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
		const fail = (index: number, err: unknown) => {
			live.current.delete(id);
			patchFlight(id, {
				status: "failed",
				reason: txErrorMessage(err),
				steps: steps.map((s, i) =>
					i === index ? { ...s, state: "failed", detail: undefined } : s,
				),
			});
		};
		return { id, setStep, fail };
	}

	// A previous Aurora deposit can leave the wallet on an origin chain.
	async function ensureMonad() {
		if (walletChainId !== monadChain.id)
			await switchChainAsync({ chainId: monadChain.id });
	}

	/** Same-chain path: approve USDC to the vault, then an ordinary ERC-4626 deposit. */
	async function depositOnMonad(input: SubscribeInput, staleId?: string) {
		if (!address) throw new Error("connect a wallet first");
		if (!publicClient) throw new Error("no public client");
		const agent = agents.find((a) => a.id === input.agentId);
		if (!agent) throw new Error("unknown agent");
		const vault = agent.vault.address as `0x${string}`;
		const assets = BigInt(Math.round(input.amount * 10 ** USDC_DECIMALS));

		const flight = startFlight(
			{
				kind: "subscribe",
				key: input.agentId,
				agentId: input.agentId,
				title: `Subscribe · ${agent.name}`,
				amount: `${input.amount.toLocaleString("en-US")} ${input.symbol}`,
				resume: {
					action: "subscribe",
					chain: input.chain,
					symbol: input.symbol,
					amount: input.amount,
				},
			},
			[
				{ id: "approve", label: "Approve USDC", state: "active" },
				{
					id: "deposit",
					label: `Deposit into ${agent.name}`,
					state: "pending",
				},
			],
		);
		if (staleId) dismissInFlight(staleId);
		let step = 0;
		try {
			await ensureMonad();
			const approved =
				(await publicClient.readContract({
					address: CONTRACTS.usdc,
					abi: MockERC20Abi,
					functionName: "allowance",
					args: [address, vault],
				})) >= assets;
			if (approved) {
				flight.setStep(0, "done", "already approved");
			} else {
				const approveHash = await writeContractAsync({
					address: CONTRACTS.usdc,
					abi: MockERC20Abi,
					functionName: "approve",
					args: [vault, assets],
				});
				flight.setStep(0, "active", "confirming");
				await publicClient.waitForTransactionReceipt({ hash: approveHash });
				flight.setStep(0, "done");
			}
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

		const flight = startFlight(
			{
				kind: "subscribe",
				key: input.agentId,
				agentId: input.agentId,
				title: `Subscribe · ${agent.name}`,
				amount: `${input.amount.toLocaleString("en-US")} ${input.symbol}`,
				resume: {
					action: "subscribe",
					chain: input.chain,
					symbol: input.symbol,
					amount: input.amount,
				},
			},
			[
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
			],
		);
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

	/** Registration: approve the seed to CustosCore, then one `registerAgent`
	 *  call that deploys the vault, pulls the seed and locks its shares. */
	async function registerAgentOnChain(input: RegisterInput, staleId?: string) {
		if (!address) throw new Error("connect a wallet first");
		if (!publicClient) throw new Error("no public client");
		const seed = BigInt(Math.round(input.seedAmount * 10 ** USDC_DECIMALS));
		const allowance = BigInt(Math.round(input.allowance * 10 ** USDC_DECIMALS));
		// address(0) keeps the vault's USDC idle; anything else must be allowlisted
		// by the protocol or registerAgent reverts with YieldSourceNotAllowed.
		const yieldSource = input.yieldEnabled
			? CONTRACTS.yieldSource
			: zeroAddress;

		const flight = startFlight(
			{
				kind: "seed-deposit",
				key: input.name,
				agentId: "",
				title: `Register · ${input.name}`,
				amount: `${input.seedAmount.toLocaleString("en-US")} USDC`,
				resume: { action: "register", input },
			},
			[
				{ id: "approve", label: "Approve seed USDC", state: "active" },
				{ id: "register", label: "Register and seed vault", state: "pending" },
			],
		);
		if (staleId) dismissInFlight(staleId);
		let step = 0;
		try {
			await ensureMonad();
			const approved =
				(await publicClient.readContract({
					address: CONTRACTS.usdc,
					abi: MockERC20Abi,
					functionName: "allowance",
					args: [address, CONTRACTS.custosCore],
				})) >= seed;
			if (approved) {
				flight.setStep(0, "done", "already approved");
			} else {
				const approveHash = await writeContractAsync({
					address: CONTRACTS.usdc,
					abi: MockERC20Abi,
					functionName: "approve",
					args: [CONTRACTS.custosCore, seed],
				});
				flight.setStep(0, "active", "confirming");
				await publicClient.waitForTransactionReceipt({ hash: approveHash });
				flight.setStep(0, "done");
			}
			step = 1;
			flight.setStep(1, "active");

			const registerHash = await writeContractAsync({
				address: CONTRACTS.custosCore,
				abi: CustosCoreAbi,
				functionName: "registerAgent",
				args: [
					stringToHex(input.name, { size: 32 }),
					input.description,
					input.agentAddress as `0x${string}`,
					allowance,
					RESET_PERIOD_SECONDS[input.resetPeriod],
					input.feeRateBps,
					input.maxDrawdownBps,
					yieldSource,
					input.maxUtilizationBps,
					input.isPublic,
					seed,
				],
			});
			flight.setStep(1, "active", "confirming");
			await publicClient.waitForTransactionReceipt({ hash: registerHash });
			flight.setStep(1, "done");

			await queryClient.invalidateQueries({ queryKey: ["agents"] });
			dismissInFlight(flight.id);
		} catch (err) {
			flight.fail(step, err);
			throw err;
		}
	}

	/** Badge: pull the signed profile, then relay it to NanSigil. Custos reads
	 *  `latest(creator)`, so one claim covers every agent of this wallet. */
	async function claimNansenBadgeOnChain() {
		if (!address) throw new Error("connect a wallet first");
		if (!publicClient) throw new Error("no public client");
		if (CONTRACTS.nansigil === zeroAddress)
			throw new Error("NanSigil is not configured for this deployment");

		const flight = startFlight(
			{
				kind: "vault-config",
				key: address,
				agentId: "",
				title: "Nansen badge",
				amount: "",
			},
			[
				{ id: "pull", label: "Pull signed profile", state: "active" },
				{ id: "submit", label: "Relay to NanSigil", state: "pending" },
			],
		);
		let step = 0;
		try {
			await ensureMonad();
			const attestation = await pullAttestation(address);
			// An empty label means Nansen knows the wallet but gives it no badge.
			// Submitting that costs gas and shows nothing, so stop here instead.
			if (!attestation.label)
				throw new Error("Nansen has no label for this wallet yet.");
			flight.setStep(0, "done", attestation.label);
			step = 1;
			flight.setStep(1, "active");

			const hash = await writeContractAsync({
				address: CONTRACTS.nansigil,
				abi: NanSigilAbi,
				functionName: "submit",
				args: [
					attestation.wallet,
					attestation.label,
					attestation.pnl,
					attestation.winRate,
					BigInt(attestation.timestamp),
					attestation.signature,
				],
			});
			flight.setStep(1, "active", "confirming");
			await publicClient.waitForTransactionReceipt({ hash });
			flight.setStep(1, "done");

			// The chip reads `latest` through wagmi, the label through the indexer.
			await queryClient.invalidateQueries({ queryKey: ["readContract"] });
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

	// A flight this session still drives would start a second deposit.
	const canResume = (e: ActivityEntry) =>
		isResumable(e) && !live.current.has(e.id);

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
		registerAgent: (input) => {
			// The in-flight card carries the failure; this is for devtools.
			registerAgentOnChain(input).catch((err) =>
				console.error("registerAgent failed:", err),
			);
		},
		claimNansenBadge: () => {
			// The in-flight card carries the failure; this is for devtools.
			claimNansenBadgeOnChain().catch((err) =>
				console.error("claimNansenBadge failed:", err),
			);
		},
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
		canResume,
		resumeFlight: (id) => {
			const e = inFlight.find((x) => x.id === id);
			const r = e?.resume;
			if (!e || !r || !canResume(e)) return;
			const run =
				r.action === "register"
					? registerAgentOnChain(r.input, id)
					: depositOnMonad(
							{
								agentId: e.agentId,
								chain: r.chain,
								symbol: r.symbol,
								amount: r.amount,
							},
							id,
						);
			run.catch((err) => console.error("resume failed:", err));
		},
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
