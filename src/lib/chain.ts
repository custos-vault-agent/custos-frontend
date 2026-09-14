import { defineChain } from "viem";
import type { ResetPeriod } from "./types";

// Monad testnet. Confirmed via `cast chain-id --rpc-url <VITE_RPC_URL>` -> 10143.
export const monadTestnet = defineChain({
	id: 10143,
	name: "Monad Testnet",
	nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
	rpcUrls: {
		default: { http: [import.meta.env.VITE_RPC_URL as string] },
	},
});

// Real, stable testnet addresses — copied from
// custos-contract/deployments/anvil.json. If the contracts are redeployed,
// update these literals (there is no runtime deployment-file lookup; this
// is a persistent chain, not local Anvil where addresses reset every run).
export const CONTRACTS = {
	custosCore: "0xCfBbd07b107A6cb7e685e555E4C9ef956d11a0bB" as const,
	nansenModule: "0xF7E5618cA647B23916d366B9d1E24727D95Aa24A" as const,
	usdc: "0xdA4Ce9769cb5A1EF725d7847f0B8b2b7a1908645" as const,
	mon: "0x1a4E9Ecf9F68F413E59F414b31d5F48fDb99d852" as const,
};

export const USDC_DECIMALS = 6;

/** Minimum USDC seed for agent registration (set in custos-contract/script/Deploy.s.sol:63). */
export const MIN_SEED = 500;

/** Raw token-unit bigint (6-decimal USDC or USDC-denominated shares) -> plain number. */
export function fromTokenUnits(raw: bigint): number {
	return Number(raw) / 10 ** USDC_DECIMALS;
}

/** AgentVault's `highWaterMark()` is stored 1e18-scaled fixed point -> plain ratio. */
export function fromSharePriceUnits(raw: bigint): number {
	return Number(raw) / 1e18;
}

// registerAgent/setPeriod take periodLength in raw seconds — these are the
// only four values the UI ever writes, so round-tripping through
// secondsToResetPeriod always lands exactly on one of them.
export const RESET_PERIOD_SECONDS: Record<ResetPeriod, number> = {
	daily: 86_400,
	weekly: 604_800,
	monthly: 2_592_000,
	never: 0,
};

export function secondsToResetPeriod(seconds: bigint | number): ResetPeriod {
	const s = Number(seconds);
	if (s <= 0) return "never";
	if (s <= RESET_PERIOD_SECONDS.daily) return "daily";
	if (s <= RESET_PERIOD_SECONDS.weekly) return "weekly";
	return "monthly";
}
