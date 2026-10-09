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
import { formatAmount } from "./format";
import { fetchIndexedActivity, toActivity } from "./indexer";
import { isResumable, parse, serialize, storageKey } from "./inflight";
import { pullAttestation } from "./nansigil";
import { fetchAgents } from "./onchain";
import { txErrorMessage } from "./txErrors";
import type {
	ActivityEntry,
	ActivityKind,
	Agent,
	MarketFlow,
	Position,
	RedeemInput,
	RegisterInput,
	ResetPeriod,
	RouteStep,
	SubscribeInput,
	YieldSourceOption,
} from "./types";

export type { RedeemInput, RegisterInput, SubscribeInput };

export type Toast = {
	id: string;
	tone: "pending" | "ok" | "fail";
	title: string;
	detail?: string;
};

type StoreValue = {
	connected: boolean;
	connectedAddress: string | null;
	agents: Agent[];
	agentsLoading: boolean;
	yieldSources: YieldSourceOption[];
	myAgents: Agent[];
	positions: Position[];
	marketFlow: MarketFlow[];
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
	toasts: Toast[];
	dismissToast: (id: string) => void;
	/** True when `resumeFlight` would act on this entry. */
	canResume: (entry: ActivityEntry) => boolean;
	/** Re-runs an interrupted Monad deposit or registration, skipping an approve that already landed. */
	resumeFlight: (id: string) => void;
};

const EMPTY_AGENTS: Agent[] = [];
const EMPTY_POSITIONS: Position[] = [];
const EMPTY_FLOW: MarketFlow[] = [];
const EMPTY_YIELD: YieldSourceOption[] = [];

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
	const { ready, authenticated, login, logout } = usePrivy();
	const { address, connector, chainId: walletChainId } = useAccount();
	const publicClient = usePublicClient({ chainId: monadChain.id });
	const { switchChainAsync } = useSwitchChain();
	const { writeContractAsync } = useWriteContract();
	const queryClient = useQueryClient();

	const { data, isLoading: agentsLoading } = useQuery({
		queryKey: ["agents", address],
		queryFn: () => {
			if (!publicClient) throw new Error("no public client");
			return fetchAgents(publicClient, address);
		},
		enabled: !!publicClient,
		refetchInterval: 10_000,
	});

	const agents = data?.agents ?? EMPTY_AGENTS;
	const myPositions = data?.positions ?? EMPTY_POSITIONS;
	const base = data?.base ?? null;
	const markets = data?.markets;
	const marketFlow = data?.marketFlow ?? EMPTY_FLOW;
	const yieldSources = data?.yieldSources ?? EMPTY_YIELD;
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

	// Every subscriber of every agent needs the indexer; only the connected
	// wallet's own balances are read on-chain (myPositions).
	const positions: Position[] = [];
	const { data: activityRows } = useQuery({
		queryKey: ["activity", monadChain.id],
		queryFn: () => fetchIndexedActivity(monadChain.id),
		refetchInterval: 30_000,
		retry: false,
	});
	const history = useMemo(() => {
		if (!activityRows) return [];
		const byVault = new Map(
			agents.map((a) => [a.vault.address.toLowerCase(), a]),
		);
		return toActivity(activityRows, byVault, base, markets);
	}, [activityRows, agents, base, markets]);

	// Transactions this session is driving right now. The TopBar counts them
	// and SubscribeFlow renders the route of its own; a failed entry stays
	// until dismissed so the reason is readable, a successful one is removed
	// the moment the receipt lands (that removal is what flips "landed").
	const [inFlight, setInFlight] = useState<ActivityEntry[]>([]);
	// Ids this session is actively driving; a stored entry from before a reload is not.
	const live = useRef(new Set<string>());
	const creatorQueue = useRef<Promise<void>>(Promise.resolve());
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

	const [toasts, setToasts] = useState<Toast[]>([]);
	const titles = useRef(new Map<string, string>());
	const dismissToast = (id: string) =>
		setToasts((list) => list.filter((t) => t.id !== id));
	// One toast per flight id; a later state replaces the earlier one.
	const pushToast = (t: Toast) => {
		setToasts((list) => [...list.filter((x) => x.id !== t.id), t]);
		if (t.tone !== "pending") setTimeout(() => dismissToast(t.id), 6_000);
	};

	// Keep the finished row visible for a while; the timer is bound to this id.
	const finishFlight = (id: string, txHash?: string) => {
		patchFlight(id, { status: "filled", txHash });
		pushToast({
			id,
			tone: "ok",
			title: titles.current.get(id) ?? "Transaction",
		});
		titles.current.delete(id);
		setTimeout(() => dismissInFlight(id), 20_000);
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
		titles.current.set(id, meta.title);
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
			if (detail === "confirming")
				pushToast({
					id,
					tone: "pending",
					title: meta.title,
					detail: `${steps[index].label}: transaction sent, waiting for confirmation`,
				});
		};
		const fail = (index: number, err: unknown) => {
			live.current.delete(id);
			const reason = txErrorMessage(err);
			titles.current.delete(id);
			pushToast({ id, tone: "fail", title: meta.title, detail: reason });
			patchFlight(id, {
				status: "failed",
				reason,
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
			finishFlight(flight.id, depositHash);
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
			finishFlight(flight.id);
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
					// address(0) keeps USDC idle; else it must be allowlisted on-chain.
					input.yieldSource as `0x${string}`,
					input.maxUtilizationBps,
					input.isPublic,
					seed,
				],
			});
			flight.setStep(1, "active", "confirming");
			await publicClient.waitForTransactionReceipt({ hash: registerHash });
			flight.setStep(1, "done");

			await queryClient.invalidateQueries({ queryKey: ["agents"] });
			finishFlight(flight.id, registerHash);
		} catch (err) {
			flight.fail(step, err);
			throw err;
		}
	}

	/** Badge: pull the signed profile, then relay it to NanSigil. Custos reads
	 *  `latest(creator)`, so one claim covers every agent of this wallet. */
	async function claimNansenBadgeOnChain(staleId?: string) {
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
				resume: { action: "badge" },
			},
			[
				{ id: "pull", label: "Pull signed profile", state: "active" },
				{ id: "submit", label: "Relay to NanSigil", state: "pending" },
			],
		);
		if (staleId) dismissInFlight(staleId);
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
			finishFlight(flight.id, hash);
		} catch (err) {
			flight.fail(step, err);
			throw err;
		}
	}

	/** Burns shares for assets. No resume payload: a redeem that landed must
	 *  never be replayed from Activity, and there is no approve step to save. */
	async function redeemOnChain(input: RedeemInput) {
		if (input.chain !== "monad")
			throw new Error("Redeem is only available on Monad.");
		if (!address) throw new Error("connect a wallet first");
		if (!publicClient) throw new Error("no public client");
		const agent = agents.find((a) => a.id === input.agentId);
		if (!agent) throw new Error("unknown agent");
		const vault = agent.vault.address as `0x${string}`;
		const shares = BigInt(Math.round(input.shares * 10 ** USDC_DECIMALS));

		const flight = startFlight(
			{
				kind: "redeem",
				key: input.agentId,
				agentId: input.agentId,
				title: `Redeem · ${agent.name}`,
				amount: `${formatAmount(input.shares)} shares`,
			},
			[
				{
					id: "redeem",
					label: `Redeem from ${agent.name}`,
					state: "active",
				},
			],
		);
		try {
			await ensureMonad();
			// Both checks live inside the flight, so either one reaches the screen.
			if (shares < 1n) throw new Error("Amount is too small to redeem.");
			const max = (await publicClient.readContract({
				address: vault,
				abi: AgentVaultAbi,
				functionName: "maxRedeem",
				args: [address],
			})) as bigint;
			if (shares > max) throw new Error("More than you can redeem.");

			const hash = await writeContractAsync({
				address: vault,
				abi: AgentVaultAbi,
				functionName: "redeem",
				args: [shares, address, address],
			});
			flight.setStep(0, "active", "confirming");
			await publicClient.waitForTransactionReceipt({ hash });
			flight.setStep(0, "done");

			await queryClient.invalidateQueries({ queryKey: ["agents"] });
			finishFlight(flight.id, hash);
		} catch (err) {
			flight.fail(0, err);
			throw err;
		}
	}

	// A union, so a wrong argument for a function is a type error at the call site.
	type CreatorCall = { label: string } & (
		| { functionName: "pauseAgent" | "resumeAgent" | "revokeAgent"; args: [] }
		| { functionName: "setPublic"; args: [boolean] }
		| { functionName: "setAllowance"; args: [bigint] }
		| { functionName: "setPeriod"; args: [number] }
	);

	/** Creator-only CustosCore writes, one transaction per step. No resume
	 *  payload: the user presses the button again instead of replaying a stale one. */
	async function creatorActionOnChain(
		id: string,
		title: string,
		calls: CreatorCall[],
	) {
		if (!address) throw new Error("connect a wallet first");
		if (!publicClient) throw new Error("no public client");
		const agent = agents.find((a) => a.id === id);
		if (!agent) throw new Error("unknown agent");
		if (calls.length === 0) return;

		const flight = startFlight(
			{
				kind: "vault-config",
				key: id,
				agentId: id,
				title: `${title} · ${agent.name}`,
				amount: "",
			},
			calls.map((c, i) => ({
				id: c.functionName,
				label: c.label,
				state: i === 0 ? "active" : "pending",
			})),
		);
		let step = 0;
		let lastHash: string | undefined;
		try {
			await ensureMonad();
			for (; step < calls.length; step++) {
				flight.setStep(step, "active");
				const hash = await writeContractAsync({
					address: CONTRACTS.custosCore,
					abi: CustosCoreAbi,
					functionName: calls[step].functionName,
					args: [id, ...calls[step].args],
				} as never);
				lastHash = hash;
				flight.setStep(step, "active", "confirming");
				await publicClient.waitForTransactionReceipt({ hash });
				flight.setStep(step, "done");
			}
			await queryClient.invalidateQueries({ queryKey: ["agents"] });
			finishFlight(flight.id, lastHash);
		} catch (err) {
			flight.fail(step, err);
			throw err;
		}
	}

	// Saving allowance and visibility together would otherwise open two wallet
	// popups at once, so creator actions run one after another.
	const runCreatorAction = (
		id: string,
		title: string,
		calls: CreatorCall[],
	) => {
		creatorQueue.current = creatorQueue.current
			.then(() => creatorActionOnChain(id, title, calls))
			.catch((err) => console.error(`${title} failed:`, err));
	};

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
		yieldSources,
		myAgents,
		positions,
		marketFlow,
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
		setAllowance: (id, allowance, resetPeriod) => {
			const agent = agents.find((a) => a.id === id);
			const calls: CreatorCall[] = [];
			if (agent?.allowance !== allowance)
				calls.push({
					label: "Set allowance",
					functionName: "setAllowance",
					args: [BigInt(Math.round(allowance * 10 ** USDC_DECIMALS))],
				});
			if (agent?.resetPeriod !== resetPeriod)
				calls.push({
					label: "Set reset period",
					functionName: "setPeriod",
					args: [RESET_PERIOD_SECONDS[resetPeriod]],
				});
			runCreatorAction(id, "Allowance", calls);
		},
		pauseAgent: (id) =>
			runCreatorAction(id, "Pause", [
				{ label: "Pause agent", functionName: "pauseAgent", args: [] },
			]),
		resumeAgent: (id) =>
			runCreatorAction(id, "Resume", [
				{ label: "Resume agent", functionName: "resumeAgent", args: [] },
			]),
		revokeAgent: (id) =>
			runCreatorAction(id, "Revoke", [
				{ label: "Revoke agent", functionName: "revokeAgent", args: [] },
			]),
		setPublic: (id, isPublic) =>
			runCreatorAction(id, "Visibility", [
				{
					label: isPublic ? "Make public" : "Make private",
					functionName: "setPublic",
					args: [isPublic],
				},
			]),
		subscribe: (input) => {
			// The failure is already on screen via inFlight; the log is for devtools.
			subscribeOnChain(input).catch((err) =>
				console.error("subscribe failed:", err),
			);
		},
		redeem: (input) => {
			redeemOnChain(input).catch((err) => console.error("redeem failed:", err));
		},
		dismissInFlight,
		toasts,
		dismissToast,
		canResume,
		resumeFlight: (id) => {
			const e = inFlight.find((x) => x.id === id);
			const r = e?.resume;
			if (!e || !r || !canResume(e)) return;
			const run =
				r.action === "register"
					? registerAgentOnChain(r.input, id)
					: r.action === "badge"
						? claimNansenBadgeOnChain(id)
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
