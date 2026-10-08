import type { AuroraUsdc } from "./aurora";
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
 * Derived, not stored on chain — an off-chain indexer would compute these
 * from SwapExecuted events. See design spec §3.
 */
export type AgentStats = {
	volume30d: number;
	trades30d: number;
	pnl30d: number;
};

/**
 * One ERC-4626 vault per agent (spec v1 D13). `sharePrice` is the single
 * source of truth for performance; everything else is a trust signal shown
 * next to it.
 */
export type Vault = {
	address: string;
	asset: "USDC";
	/** idle balance + yield position — the ERC-4626 totalAssets(). */
	totalAssets: number;
	totalShares: number;
	sharePrice: number;
	/** For the sparkline. Oldest first. */
	sharePriceHistory: { t: number; price: number }[];
	highWaterMark: number;
	/** Immutable after register (D18). Basis points, 0-5000 (0-50%). */
	feeRateBps: number;
	/** Immutable (D21). 0 = circuit breaker disabled, else 100-5000 (1%-50%). */
	maxDrawdownBps: number;
	/** Immutable (D24) — the reserve ratio. 1000-9500 (10%-95%). */
	maxUtilizationBps: number;
	/** Immutable (D22). */
	yieldEnabled: boolean;
	yieldApyBps: number;
	/** Locked forever at the dead address (D15) — informational only. */
	seedAssets: number;
	circuitBreakerTripped: boolean;
};

/** On-chain-attested creator credibility (spec v1 D23). */
export type NansenBadge = {
	verified: boolean;
	label: "Smart Trader" | "Fund" | "Whale" | null;
	pnlUsd: number;
	winRatePct: number;
	attestedAt: number;
	/** True once `attestedAt` is more than 30 days old. */
	stale: boolean;
};

/** Smart Money netflow signal for one token a vault has traded (spec §12.3). */
export type SmartMoneySignal = {
	tokenSymbol: AssetSymbol;
	netFlow24h: number;
	netFlow7d: number;
	trend: "accumulating" | "distributing" | "neutral";
};

/** A subscriber's holding in one vault. Not a field on Agent — a vault can
 *  have many positions, and "vaults I'm subscribed to" needs its own list. */
export type Position = {
	agentId: string;
	subscriberAddress: string;
	shares: number;
	/** Cost basis, for the P/L readout. Unset when unknown (share balance only). */
	depositedAssets?: number;
};

export type Agent = {
	id: string;
	name: string;
	description: string;
	/** The wallet the agent signs with. It can only ever call executeSwap. */
	agentAddress: string;
	creatorAddress: string;
	/** D16 — hides from the marketplace listing. On-chain deposit stays open. */
	isPublic: boolean;
	/** Per-period trading limit, mutable by the creator. Independent of the
	 *  immutable reserve ratio on `vault.maxUtilizationBps` (D24). */
	allowance: number;
	used: number;
	resetPeriod: ResetPeriod;
	status: AgentStatus;
	registeredAt: number;
	vault: Vault;
	nansen: NansenBadge | null;
	stats: AgentStats;
};

export type Actor =
	| { kind: "owner"; name: string; address: string }
	| { kind: "agent"; agentId: string; name: string; address: string };

export type RouteStepState = "done" | "active" | "pending" | "failed";

export type RouteStep = {
	id: string;
	label: string;
	detail?: string;
	state: RouteStepState;
};

export type ActivityKind =
	| "agent-trade"
	| "subscribe"
	| "redeem"
	| "seed-deposit"
	| "fee-mint"
	| "circuit-breaker"
	| "vault-config";

export type ActivityStatus = "filled" | "in-progress" | "failed" | "recorded";

export type ActivityEntry = {
	id: string;
	kind: ActivityKind;
	actor: Actor;
	/** The agent/vault this entry concerns. Every remaining kind has one —
	 *  this is what the vault detail page filters "recent activity" by. */
	agentId: string;
	timestamp: number;
	title: string;
	subtitle?: string;
	amount: string;
	amountSub?: string;
	status: ActivityStatus;
	txHash?: string;
	/** Present while a cross-chain route is still resolving. */
	steps?: RouteStep[];
	/** Consecutive trades from one agent collapse into a single row. */
	groupCount?: number;
	groupChildren?: ActivityEntry[];
	/** Why a rejected action was rejected, e.g. "allowance exhausted". */
	reason?: string;
	/** What a subscribe or registration needs to be run again from the Activity page. */
	resume?:
		| { action: "subscribe"; chain: string; symbol: string; amount: number }
		| { action: "register"; input: RegisterInput }
		| { action: "badge" };
};

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
