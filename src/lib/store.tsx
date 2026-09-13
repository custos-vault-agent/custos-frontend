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
import {
	agentActor,
	OWNER_ACTOR,
	OWNER_ADDRESS,
	SEED_AGENTS,
} from "#/mock/agents";
import { SEED_ORDERS } from "#/mock/orders";
import {
	advanceSteps,
	depositRouteSteps,
	STEP_TIMING,
	startSteps,
	swapRouteSteps,
} from "#/mock/routes";
import type {
	ActivityEntry,
	Agent,
	AssetSymbol,
	ChainId,
	LimitOrder,
	OrderSide,
	ResetPeriod,
	RouteStep,
} from "./types";

const SEED_BALANCE = 12_480;

type InFlight = {
	entry: ActivityEntry;
	/** Wall-clock time at which the next step should complete. */
	nextAt: number;
	/** Applied to the vault once the route lands. */
	credit?: number;
};

type State = {
	connected: boolean;
	balance: number;
	agents: Agent[];
	orders: LimitOrder[];
	history: ActivityEntry[];
	inFlight: InFlight[];
};

type Action =
	| { type: "connect" }
	| { type: "disconnect" }
	| { type: "register"; agent: Agent }
	| {
			type: "allowance";
			id: string;
			allowance: number;
			resetPeriod: ResetPeriod;
	  }
	| { type: "status"; id: string; status: Agent["status"] }
	| { type: "cancel-order"; id: string }
	| { type: "place-order"; order: LimitOrder }
	| { type: "withdraw"; amount: number }
	| { type: "start-flight"; flight: InFlight }
	| { type: "tick-flight"; now: number }
	| { type: "record"; entry: ActivityEntry };

function initialState(): State {
	return {
		connected: true,
		balance: SEED_BALANCE,
		agents: SEED_AGENTS,
		orders: SEED_ORDERS,
		history: SEED_ACTIVITY,
		inFlight: [],
	};
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
						? {
								...a,
								allowance: action.allowance,
								resetPeriod: action.resetPeriod,
							}
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

		case "cancel-order":
			return {
				...state,
				orders: state.orders.filter((o) => o.id !== action.id),
			};

		case "place-order":
			return { ...state, orders: [action.order, ...state.orders] };

		case "withdraw":
			return { ...state, balance: Math.max(0, state.balance - action.amount) };

		case "start-flight":
			return { ...state, inFlight: [action.flight, ...state.inFlight] };

		case "record":
			return { ...state, history: [action.entry, ...state.history] };

		case "tick-flight": {
			let balance = state.balance;
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
					if (flight.credit) balance += flight.credit;
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
				// Nothing crossed a boundary; keep the previous object so React
				// does not re-render every consumer four times a second.
				const unchanged = still.every((f, i) => f === state.inFlight[i]);
				if (unchanged) return state;
			}

			return {
				...state,
				balance,
				inFlight: still,
				history: landed.length ? [...landed, ...state.history] : state.history,
			};
		}
	}
}

export type RegisterInput = {
	name: string;
	description: string;
	agentAddress: string;
	allowance: number;
	resetPeriod: ResetPeriod;
};

export type SwapInput = {
	fromSymbol: AssetSymbol;
	toSymbol: AssetSymbol;
	sourceChain: ChainId;
	amount: number;
	receive: number;
};

type StoreValue = {
	connected: boolean;
	balance: number;
	delegated: number;
	available: number;
	agents: Agent[];
	myAgents: Agent[];
	orders: LimitOrder[];
	openOrders: LimitOrder[];
	history: ActivityEntry[];
	inFlight: ActivityEntry[];
	/** Drives quote jitter, so the rate moves without ever contradicting itself. */
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
	cancelOrder: (id: string) => void;
	placeLimitOrder: (input: {
		pair: string;
		side: OrderSide;
		price: number;
		total: number;
	}) => void;
	submitSwap: (input: SwapInput) => void;
	submitDeposit: (input: {
		chain: ChainId;
		symbol: AssetSymbol;
		amount: number;
	}) => void;
	submitWithdraw: (input: { chain: ChainId; amount: number }) => void;
};

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
	const [state, dispatch] = useReducer(reducer, undefined, initialState);
	const [tick, setTick] = useState(0);

	// Advances in-flight routes. 250ms is fine-grained enough that a step never
	// looks like it lands late, and the reducer bails out when nothing changed.
	useEffect(() => {
		if (state.inFlight.length === 0) return;
		const id = window.setInterval(
			() => dispatch({ type: "tick-flight", now: Date.now() }),
			250,
		);
		return () => window.clearInterval(id);
	}, [state.inFlight.length]);

	// Quote drift. Slow enough to read, fast enough to feel live.
	useEffect(() => {
		const id = window.setInterval(() => setTick((t) => t + 1), 3000);
		return () => window.clearInterval(id);
	}, []);

	const delegated = useMemo(
		() =>
			state.agents
				.filter(
					(a) => a.ownerAddress === OWNER_ADDRESS && a.status === "active",
				)
				.reduce((sum, a) => sum + a.allowance, 0),
		[state.agents],
	);

	const myAgents = useMemo(
		() =>
			state.agents.filter(
				(a) => a.ownerAddress === OWNER_ADDRESS && a.status !== "revoked",
			),
		[state.agents],
	);

	const openOrders = useMemo(
		() => state.orders.filter((o) => o.status === "open"),
		[state.orders],
	);

	const inFlightEntries = useMemo(
		() => state.inFlight.map((f) => f.entry),
		[state.inFlight],
	);

	const startFlight = useCallback(
		(entry: ActivityEntry, steps: RouteStep[], credit?: number) => {
			dispatch({
				type: "start-flight",
				flight: {
					entry: { ...entry, steps: startSteps(steps) },
					nextAt: Date.now() + STEP_TIMING[0],
					credit,
				},
			});
		},
		[],
	);

	const registerAgent = useCallback((input: RegisterInput) => {
		const agent: Agent = {
			id: `${input.name}-${Date.now().toString(36)}`,
			name: input.name,
			description: input.description,
			agentAddress: input.agentAddress,
			ownerAddress: OWNER_ADDRESS,
			allowance: input.allowance,
			used: 0,
			resetPeriod: input.resetPeriod,
			status: "active",
			registeredAt: Date.now(),
			// A brand new agent has no track record. Showing zeros is the honest
			// answer; inventing a history would be the dishonest one.
			stats: { volume30d: 0, trades30d: 0, pnl30d: 0 },
		};
		dispatch({ type: "register", agent });
		dispatch({
			type: "record",
			entry: {
				id: `reg-${agent.id}`,
				kind: "allowance-change",
				actor: OWNER_ACTOR,
				timestamp: Date.now(),
				title: `Agent registered · ${agent.name}`,
				subtitle: `allowance ${agent.allowance.toLocaleString("en-US")} USDC · ${agent.resetPeriod}`,
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
					kind: "allowance-change",
					actor: OWNER_ACTOR,
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
					kind: "allowance-change",
					actor: OWNER_ACTOR,
					timestamp: Date.now(),
					title: `${verb} · ${agent.name}`,
					amount: "—",
					status: "recorded",
				},
			});
		},
		[state.agents],
	);

	const cancelOrder = useCallback(
		(id: string) => {
			const order = state.orders.find((o) => o.id === id);
			dispatch({ type: "cancel-order", id });
			if (!order) return;
			dispatch({
				type: "record",
				entry: {
					id: `cancel-${id}`,
					kind: "limit",
					actor: order.actor,
					timestamp: Date.now(),
					title: `Limit ${order.side} ${order.pair} @ ${order.price.toFixed(4)}`,
					subtitle: "cancelled by owner",
					amount: `${order.total.toLocaleString("en-US")} MON`,
					amountSub:
						order.filled > 0
							? `${order.filled.toLocaleString("en-US")} filled before cancel`
							: "no fill",
					status: "cancelled",
				},
			});
		},
		[state.orders],
	);

	const placeLimitOrder = useCallback(
		(input: {
			pair: string;
			side: OrderSide;
			price: number;
			total: number;
		}) => {
			dispatch({
				type: "place-order",
				order: {
					id: `ord-${Date.now().toString(36)}`,
					pair: input.pair,
					side: input.side,
					price: input.price,
					total: input.total,
					filled: 0,
					createdAt: Date.now(),
					status: "open",
					actor: OWNER_ACTOR,
				},
			});
		},
		[],
	);

	const submitSwap = useCallback(
		(input: SwapInput) => {
			startFlight(
				{
					id: `swap-${Date.now().toString(36)}`,
					kind: "swap",
					actor: OWNER_ACTOR,
					timestamp: Date.now(),
					title: `Swap ${input.fromSymbol} → ${input.toSymbol}`,
					subtitle: `from ${input.sourceChain}`,
					amount: `${input.amount.toLocaleString("en-US")} ${input.fromSymbol}`,
					amountSub: `→ ${input.receive.toLocaleString("en-US", {
						maximumFractionDigits: 2,
					})} ${input.toSymbol}`,
					status: "in-progress",
				},
				swapRouteSteps(input.sourceChain),
			);
		},
		[startFlight],
	);

	const submitDeposit = useCallback(
		(input: { chain: ChainId; symbol: AssetSymbol; amount: number }) => {
			startFlight(
				{
					id: `dep-${Date.now().toString(36)}`,
					kind: "deposit",
					actor: OWNER_ACTOR,
					timestamp: Date.now(),
					title: `Deposit from ${input.chain}`,
					subtitle: "via Aurora Intents",
					amount: `${input.amount.toLocaleString("en-US")} ${input.symbol}`,
					status: "in-progress",
				},
				depositRouteSteps(input.chain),
				input.amount,
			);
		},
		[startFlight],
	);

	const submitWithdraw = useCallback(
		(input: { chain: ChainId; amount: number }) => {
			dispatch({ type: "withdraw", amount: input.amount });
			dispatch({
				type: "record",
				entry: {
					id: `wd-${Date.now().toString(36)}`,
					kind: "withdraw",
					actor: OWNER_ACTOR,
					timestamp: Date.now(),
					title: `Withdraw to ${input.chain}`,
					subtitle: "settled by Aurora solver",
					amount: `${input.amount.toLocaleString("en-US")} USDC`,
					status: "filled",
				},
			});
		},
		[],
	);

	const value: StoreValue = {
		connected: state.connected,
		balance: state.balance,
		delegated,
		available: Math.max(0, state.balance - delegated),
		agents: state.agents.filter((a) => a.status !== "revoked"),
		myAgents,
		orders: state.orders,
		openOrders,
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
		cancelOrder,
		placeLimitOrder,
		submitSwap,
		submitDeposit,
		submitWithdraw,
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
