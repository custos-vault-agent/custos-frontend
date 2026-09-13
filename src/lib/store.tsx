import type { ReactNode } from "react";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useReducer,
	useState,
} from "react";
import { SEED_ACTIVITY } from "#/mock/activity";
import { agentActor, OWNER_ACTOR, OWNER_ADDRESS, SEED_AGENTS } from "#/mock/agents";
import { SEED_POSITIONS } from "#/mock/positions";
import {
	advanceSteps,
	depositRouteSteps,
	STEP_TIMING,
	startSteps,
} from "#/mock/routes";
import type {
	ActivityEntry,
	Agent,
	AssetSymbol,
	ChainId,
	Position,
	ResetPeriod,
	RouteStep,
} from "./types";

type SubscribeCredit = { agentId: string; assets: number };

type InFlight = {
	entry: ActivityEntry;
	/** Wall-clock time at which the next step should complete. */
	nextAt: number;
	/** Applied to the vault + position once the route lands. */
	subscribeCredit?: SubscribeCredit;
};

type State = {
	connected: boolean;
	agents: Agent[];
	positions: Position[];
	history: ActivityEntry[];
	inFlight: InFlight[];
};

type Action =
	| { type: "connect" }
	| { type: "disconnect" }
	| { type: "register"; agent: Agent }
	| { type: "allowance"; id: string; allowance: number; resetPeriod: ResetPeriod }
	| { type: "status"; id: string; status: Agent["status"] }
	| { type: "set-public"; id: string; isPublic: boolean }
	| { type: "redeem"; agentId: string; shares: number }
	| { type: "start-flight"; flight: InFlight }
	| { type: "tick-flight"; now: number }
	| { type: "record"; entry: ActivityEntry };

function initialState(): State {
	return {
		connected: true,
		agents: SEED_AGENTS,
		positions: SEED_POSITIONS,
		history: SEED_ACTIVITY,
		inFlight: [],
	};
}

/** Mints shares at the vault's current price and upserts the subscriber's
 *  position. Shared by the "subscribe lands" and future direct-credit paths
 *  so the math lives in exactly one place. */
function applySubscribe(state: State, agentId: string, assets: number): State {
	const agent = state.agents.find((a) => a.id === agentId);
	if (!agent) return state;

	const sharesMinted = assets / agent.vault.sharePrice;
	const agents = state.agents.map((a) =>
		a.id === agentId
			? {
					...a,
					vault: {
						...a.vault,
						totalAssets: a.vault.totalAssets + assets,
						totalShares: a.vault.totalShares + sharesMinted,
					},
				}
			: a,
	);

	const existing = state.positions.find(
		(p) => p.agentId === agentId && p.subscriberAddress === OWNER_ADDRESS,
	);
	const positions = existing
		? state.positions.map((p) =>
				p === existing
					? {
							...p,
							shares: p.shares + sharesMinted,
							depositedAssets: p.depositedAssets + assets,
						}
					: p,
			)
		: [
				...state.positions,
				{
					agentId,
					subscriberAddress: OWNER_ADDRESS,
					shares: sharesMinted,
					depositedAssets: assets,
				},
			];

	return { ...state, agents, positions };
}

/** Burns shares at the vault's current price. Returns the assets paid out
 *  so the caller can record an accurate activity entry. */
function applyRedeem(
	state: State,
	agentId: string,
	shares: number,
): { state: State; assets: number } {
	const agent = state.agents.find((a) => a.id === agentId);
	if (!agent) return { state, assets: 0 };

	const assets = shares * agent.vault.sharePrice;
	const agents = state.agents.map((a) =>
		a.id === agentId
			? {
					...a,
					vault: {
						...a.vault,
						totalAssets: Math.max(0, a.vault.totalAssets - assets),
						totalShares: Math.max(0, a.vault.totalShares - shares),
					},
				}
			: a,
	);
	const positions = state.positions
		.map((p) =>
			p.agentId === agentId && p.subscriberAddress === OWNER_ADDRESS
				? { ...p, shares: Math.max(0, p.shares - shares) }
				: p,
		)
		.filter((p) => p.shares > 0.0001);

	return { state: { ...state, agents, positions }, assets };
}

function reducer(state: State, action: Action): State {
	switch (action.type) {
		case "connect":
			return { ...state, connected: true };

		case "disconnect":
			return { ...state, connected: false };

		case "register":
			return { ...state, agents: [action.agent, ...state.agents] };

		case "allowance":
			return {
				...state,
				agents: state.agents.map((a) =>
					a.id === action.id
						? { ...a, allowance: action.allowance, resetPeriod: action.resetPeriod }
						: a,
				),
			};

		case "status":
			return {
				...state,
				agents: state.agents.map((a) =>
					a.id === action.id ? { ...a, status: action.status } : a,
				),
			};

		case "set-public":
			return {
				...state,
				agents: state.agents.map((a) =>
					a.id === action.id ? { ...a, isPublic: action.isPublic } : a,
				),
			};

		case "redeem":
			return applyRedeem(state, action.agentId, action.shares).state;

		case "start-flight":
			return { ...state, inFlight: [action.flight, ...state.inFlight] };

		case "record":
			return { ...state, history: [action.entry, ...state.history] };

		case "tick-flight": {
			let next = state;
			const landed: ActivityEntry[] = [];
			const still: InFlight[] = [];

			for (const flight of state.inFlight) {
				if (action.now < flight.nextAt) {
					still.push(flight);
					continue;
				}

				const steps = flight.entry.steps ?? [];
				const result = advanceSteps(steps);
				const entry: ActivityEntry = { ...flight.entry, steps: result.steps };

				if (result.done) {
					if (flight.subscribeCredit) {
						next = applySubscribe(
							next,
							flight.subscribeCredit.agentId,
							flight.subscribeCredit.assets,
						);
					}
					landed.push({ ...entry, status: "filled" });
				} else {
					const index = result.steps.findIndex((s) => s.state === "active");
					still.push({
						...flight,
						entry,
						nextAt: action.now + (STEP_TIMING[index] ?? 900),
					});
				}
			}

			if (landed.length === 0 && still.length === state.inFlight.length) {
				const unchanged = still.every((f, i) => f === state.inFlight[i]);
				if (unchanged) return next;
			}

			return {
				...next,
				inFlight: still,
				history: landed.length ? [...landed, ...next.history] : next.history,
			};
		}
	}
}

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
	chain: ChainId;
	symbol: AssetSymbol;
	amount: number;
};

export type RedeemInput = {
	agentId: string;
	shares: number;
	chain: ChainId;
};

type StoreValue = {
	connected: boolean;
	agents: Agent[];
	myAgents: Agent[];
	positions: Position[];
	myPositions: Position[];
	history: ActivityEntry[];
	inFlight: ActivityEntry[];
	/** Drives quote jitter elsewhere and keeps re-renders honest here. */
	tick: number;
	connect: () => void;
	disconnect: () => void;
	registerAgent: (input: RegisterInput) => void;
	setAllowance: (id: string, allowance: number, resetPeriod: ResetPeriod) => void;
	pauseAgent: (id: string) => void;
	resumeAgent: (id: string) => void;
	revokeAgent: (id: string) => void;
	setPublic: (id: string, isPublic: boolean) => void;
	subscribe: (input: SubscribeInput) => void;
	redeem: (input: RedeemInput) => void;
};

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
	const [state, dispatch] = useReducer(reducer, undefined, initialState);
	const [tick, setTick] = useState(0);

	useEffect(() => {
		if (state.inFlight.length === 0) return;
		const id = window.setInterval(
			() => dispatch({ type: "tick-flight", now: Date.now() }),
			250,
		);
		return () => window.clearInterval(id);
	}, [state.inFlight.length]);

	useEffect(() => {
		const id = window.setInterval(() => setTick((t) => t + 1), 3000);
		return () => window.clearInterval(id);
	}, []);

	const myAgents = useMemo(
		() =>
			state.agents.filter(
				(a) => a.creatorAddress === OWNER_ADDRESS && a.status !== "revoked",
			),
		[state.agents],
	);

	const myPositions = useMemo(
		() => state.positions.filter((p) => p.subscriberAddress === OWNER_ADDRESS),
		[state.positions],
	);

	const inFlightEntries = useMemo(
		() => state.inFlight.map((f) => f.entry),
		[state.inFlight],
	);

	const startFlight = useCallback(
		(entry: ActivityEntry, steps: RouteStep[], subscribeCredit?: SubscribeCredit) => {
			dispatch({
				type: "start-flight",
				flight: {
					entry: { ...entry, steps: startSteps(steps) },
					nextAt: Date.now() + STEP_TIMING[0],
					subscribeCredit,
				},
			});
		},
		[],
	);

	const registerAgent = useCallback((input: RegisterInput) => {
		const id = `${input.name}-${Date.now().toString(36)}`;
		const agent: Agent = {
			id,
			name: input.name,
			description:
				input.description.trim() || "No description provided by the creator.",
			agentAddress: input.agentAddress,
			creatorAddress: OWNER_ADDRESS,
			isPublic: input.isPublic,
			allowance: input.allowance,
			used: 0,
			resetPeriod: input.resetPeriod,
			status: "active",
			registeredAt: Date.now(),
			vault: {
				address: `0xVAULT${id.slice(0, 10).toUpperCase()}`,
				asset: "USDC",
				totalAssets: input.seedAmount,
				totalShares: input.seedAmount,
				sharePrice: 1,
				sharePriceHistory: [{ t: Date.now(), price: 1 }],
				highWaterMark: 1,
				feeRateBps: input.feeRateBps,
				maxDrawdownBps: input.maxDrawdownBps,
				maxUtilizationBps: input.maxUtilizationBps,
				yieldEnabled: input.yieldEnabled,
				yieldApyBps: input.yieldEnabled ? 500 : 0,
				seedAssets: input.seedAmount,
				circuitBreakerTripped: false,
			},
			nansen: null,
			// A brand new agent has no track record. Showing zeros is the honest
			// answer; inventing a history would be the dishonest one.
			stats: { volume30d: 0, trades30d: 0, pnl30d: 0 },
		};
		dispatch({ type: "register", agent });
		dispatch({
			type: "record",
			entry: {
				id: `seed-${id}`,
				kind: "seed-deposit",
				actor: OWNER_ACTOR,
				agentId: id,
				timestamp: Date.now(),
				title: `Agent registered · ${agent.name}`,
				subtitle: `seed ${input.seedAmount.toLocaleString("en-US")} USDC · locked`,
				amount: "—",
				status: "recorded",
			},
		});
	}, []);

	const setAllowance = useCallback(
		(id: string, allowance: number, resetPeriod: ResetPeriod) => {
			const agent = state.agents.find((a) => a.id === id);
			dispatch({ type: "allowance", id, allowance, resetPeriod });
			if (!agent) return;
			dispatch({
				type: "record",
				entry: {
					id: `alw-${id}-${Date.now()}`,
					kind: "vault-config",
					actor: OWNER_ACTOR,
					agentId: id,
					timestamp: Date.now(),
					title: `Allowance changed · ${agent.name}`,
					subtitle: `${agent.allowance.toLocaleString("en-US")} → ${allowance.toLocaleString("en-US")} USDC`,
					amount: "—",
					status: "recorded",
				},
			});
		},
		[state.agents],
	);

	const setStatus = useCallback(
		(id: string, status: Agent["status"], verb: string) => {
			const agent = state.agents.find((a) => a.id === id);
			dispatch({ type: "status", id, status });
			if (!agent) return;
			dispatch({
				type: "record",
				entry: {
					id: `st-${id}-${Date.now()}`,
					kind: "vault-config",
					actor: OWNER_ACTOR,
					agentId: id,
					timestamp: Date.now(),
					title: `${verb} · ${agent.name}`,
					amount: "—",
					status: "recorded",
				},
			});
		},
		[state.agents],
	);

	const setPublic = useCallback(
		(id: string, isPublic: boolean) => {
			const agent = state.agents.find((a) => a.id === id);
			dispatch({ type: "set-public", id, isPublic });
			if (!agent) return;
			dispatch({
				type: "record",
				entry: {
					id: `pub-${id}-${Date.now()}`,
					kind: "vault-config",
					actor: OWNER_ACTOR,
					agentId: id,
					timestamp: Date.now(),
					title: `${isPublic ? "Listed" : "Unlisted"} · ${agent.name}`,
					amount: "—",
					status: "recorded",
				},
			});
		},
		[state.agents],
	);

	const subscribe = useCallback(
		(input: SubscribeInput) => {
			const agent = state.agents.find((a) => a.id === input.agentId);
			if (!agent) return;
			startFlight(
				{
					id: `sub-${Date.now().toString(36)}`,
					kind: "subscribe",
					actor: OWNER_ACTOR,
					agentId: input.agentId,
					timestamp: Date.now(),
					title: `Subscribe · ${agent.name}`,
					subtitle: `from ${input.chain} via Aurora Intents`,
					amount: `${input.amount.toLocaleString("en-US")} ${input.symbol}`,
					status: "in-progress",
				},
				depositRouteSteps(input.chain),
				{ agentId: input.agentId, assets: input.amount },
			);
		},
		[state.agents, startFlight],
	);

	const redeem = useCallback(
		(input: RedeemInput) => {
			const agent = state.agents.find((a) => a.id === input.agentId);
			if (!agent) return;
			const { assets } = applyRedeem(state, input.agentId, input.shares);
			dispatch({ type: "redeem", agentId: input.agentId, shares: input.shares });
			dispatch({
				type: "record",
				entry: {
					id: `red-${Date.now().toString(36)}`,
					kind: "redeem",
					actor: OWNER_ACTOR,
					agentId: input.agentId,
					timestamp: Date.now(),
					title: `Redeem · ${agent.name}`,
					subtitle: `to ${input.chain}`,
					amount: `${assets.toLocaleString("en-US", { maximumFractionDigits: 2 })} USDC`,
					status: "filled",
				},
			});
		},
		[state],
	);

	const value: StoreValue = {
		connected: state.connected,
		agents: state.agents.filter((a) => a.status !== "revoked"),
		myAgents,
		positions: state.positions,
		myPositions,
		history: state.history,
		inFlight: inFlightEntries,
		tick,
		connect: () => dispatch({ type: "connect" }),
		disconnect: () => dispatch({ type: "disconnect" }),
		registerAgent,
		setAllowance,
		pauseAgent: (id) => setStatus(id, "paused", "Agent paused"),
		resumeAgent: (id) => setStatus(id, "active", "Agent resumed"),
		revokeAgent: (id) => setStatus(id, "revoked", "Access revoked"),
		setPublic,
		subscribe,
		redeem,
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

export { agentActor, OWNER_ADDRESS };
