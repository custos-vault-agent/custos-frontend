import type { Agent } from "./types";

export function formatNumber(value: number, decimals = 2): string {
	return value.toLocaleString("en-US", {
		minimumFractionDigits: decimals,
		maximumFractionDigits: decimals,
	});
}

/** Whole numbers stay whole; fractions keep just enough to stay honest. */
export function formatAmount(value: number): string {
	if (Number.isInteger(value)) return value.toLocaleString("en-US");
	if (Math.abs(value) >= 1000) return formatNumber(value, 2);
	if (Math.abs(value) >= 1) return formatNumber(value, 4);
	return formatNumber(value, 6);
}

export function formatCompactUsd(value: number): string {
	const abs = Math.abs(value);
	if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
	if (abs >= 1_000) return `$${Math.round(value / 1_000)}k`;
	return `$${value.toFixed(0)}`;
}

export function formatPercent(value: number, decimals = 2): string {
	const sign = value > 0 ? "+" : "";
	// Idle yield moves a share price by parts per million; 2 decimals would print 0.00%.
	const d = value !== 0 && Math.abs(value) < 0.01 ? 4 : decimals;
	return `${sign}${value.toFixed(d)}%`;
}

/** USDC has 6 decimals, and that is the precision a share price actually carries. */
export function formatPrice(value: number): string {
	return value.toFixed(6);
}

/** Curation enforces a USDC quote, so a market reads as a pair plus its address. */
export function marketLabel(baseSymbol: string, market: string): string {
	return `${baseSymbol}/USDC (${shortAddress(market)})`;
}

export function shortAddress(address: string, lead = 6, tail = 4): string {
	if (address.length <= lead + tail + 1) return address;
	return `${address.slice(0, lead)}…${address.slice(-tail)}`;
}

export function formatClock(timestamp: number): string {
	return new Date(timestamp).toLocaleTimeString("en-US", {
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	});
}

export function formatDay(timestamp: number): string {
	return new Date(timestamp).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
	});
}

export function formatElapsed(ms: number): string {
	if (ms < 1000) return `${ms}ms`;
	if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
	return `${Math.round(ms / 60_000)}m`;
}

export function isToday(timestamp: number): boolean {
	const now = new Date();
	const then = new Date(timestamp);
	return (
		now.getFullYear() === then.getFullYear() &&
		now.getMonth() === then.getMonth() &&
		now.getDate() === then.getDate()
	);
}

export function usagePercent(used: number, allowance: number): number {
	if (allowance <= 0) return 0;
	return Math.min(100, (used / allowance) * 100);
}

/** (value + withdrawn) / deposited - 1, as a fraction. Null with nothing deposited. */
export function moneyWeightedReturn(
	value: number,
	assetsOut: number,
	assetsIn: number,
): number | null {
	return assetsIn > 0 ? (value + assetsOut) / assetsIn - 1 : null;
}

const IDLE_DAYS = 14;

/** Pill for a vault that holds capital but does not trade. Null when fine or
 *  when the status pill already says why. */
export function livenessPill(agent: Agent): {
	label: string;
	tone: "neutral" | "progress";
} | null {
	const { stats, vault, status } = agent;
	if (!stats.indexed || status !== "active" || vault.totalAssets <= 0)
		return null;
	if (stats.lastTradeAt === null)
		return { label: "no trades yet", tone: "neutral" };
	return Date.now() - stats.lastTradeAt > IDLE_DAYS * 86_400_000
		? { label: `idle ${IDLE_DAYS}d`, tone: "progress" }
		: null;
}

/** "3d 4h", "5h 20m", "12m", "40s". */
export function formatDuration(seconds: number): string {
	const d = Math.floor(seconds / 86_400);
	const h = Math.floor((seconds % 86_400) / 3_600);
	const m = Math.floor((seconds % 3_600) / 60);
	if (d > 0) return `${d}d ${h}h`;
	if (h > 0) return `${h}h ${m}m`;
	if (m > 0) return `${m}m`;
	return `${Math.floor(seconds)}s`;
}

// Heuristics, not facts: upper bound of the average hold for each style.
export const STYLE_MAX_HOLD_SECONDS = {
	scalper: 3_600,
	intraday: 86_400,
	swing: 7 * 86_400,
} as const;

/** Null when the agent has no trades or the indexer is absent. */
export function tradingStyle(agent: Agent): string | null {
	const b = agent.behaviour;
	if (!b) return null;
	if (b.swapCount === 0) return "dormant";
	if (b.avgHoldSeconds === null) return null;
	const t = STYLE_MAX_HOLD_SECONDS;
	return b.avgHoldSeconds <= t.scalper
		? "scalper"
		: b.avgHoldSeconds <= t.intraday
			? "intraday"
			: b.avgHoldSeconds <= t.swing
				? "swing"
				: "position";
}
