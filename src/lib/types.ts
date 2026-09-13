export type ChainId = "monad" | "solana" | "base" | "arbitrum" | "ethereum";

export type AssetSymbol = "USDC" | "MON" | "SOL" | "ETH" | "WBTC";

export type Asset = {
	symbol: AssetSymbol;
	name: string;
	chain: ChainId;
};

export type ResetPeriod = "daily" | "weekly" | "monthly" | "never";

export type AgentStatus = "active" | "paused" | "revoked";

/**
 * Derived, not stored on chain. The brief keeps exactly four fields per agent
 * (name, description, allowance, agent wallet). These numbers would come from
 * an off-chain indexer over Trade Module events — see the design spec §8.
 */
export type AgentStats = {
	volume30d: number;
	trades30d: number;
	pnl30d: number;
};

export type Agent = {
	id: string;
	name: string;
	description: string;
	/** The wallet the agent signs with. It can only ever touch the Custos contract. */
	agentAddress: string;
	/** Registration is always signed by the owner, never the agent. */
	ownerAddress: string;
	allowance: number;
	used: number;
	resetPeriod: ResetPeriod;
	status: AgentStatus;
	registeredAt: number;
	stats: AgentStats;
};

export type Actor =
	| { kind: "owner"; name: string; address: string }
	| { kind: "agent"; agentId: string; name: string; address: string };

export type OrderSide = "buy" | "sell";

export type LimitOrder = {
	id: string;
	pair: string;
	side: OrderSide;
	price: number;
	total: number;
	filled: number;
	createdAt: number;
	status: "open" | "filled" | "cancelled";
	actor: Actor;
};

export type RouteStepState = "done" | "active" | "pending" | "failed";

export type RouteStep = {
	id: string;
	label: string;
	detail?: string;
	state: RouteStepState;
};

export type ActivityKind =
	| "swap"
	| "limit"
	| "agent-trade"
	| "deposit"
	| "withdraw"
	| "allowance-change";

export type ActivityStatus =
	| "filled"
	| "in-progress"
	| "failed"
	| "recorded"
	| "cancelled";

export type ActivityEntry = {
	id: string;
	kind: ActivityKind;
	actor: Actor;
	timestamp: number;
	title: string;
	subtitle?: string;
	amount: string;
	amountSub?: string;
	status: ActivityStatus;
	txHash?: string;
	/** Present while a cross-chain route is still resolving. */
	steps?: RouteStep[];
	/** Present for a limit order that is partially filled. */
	fill?: { filled: number; total: number };
	/** Consecutive trades from one agent collapse into a single row. */
	groupCount?: number;
	groupChildren?: ActivityEntry[];
	/** Why a rejected action was rejected, e.g. "allowance exhausted". */
	reason?: string;
	orderId?: string;
};

export type Vault = {
	asset: AssetSymbol;
	balance: number;
	/** Sum of every active agent's allowance. */
	delegated: number;
};

export type SwapMode = "market" | "limit";

export type Quote = {
	rate: number;
	receive: number;
	minimumReceived: number;
	priceImpact: number;
	networkFee: number;
	protocolFee: number;
};
