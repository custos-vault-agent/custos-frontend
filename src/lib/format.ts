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
	return `${sign}${value.toFixed(decimals)}%`;
}

export function formatPrice(value: number): string {
	return value.toFixed(4);
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
