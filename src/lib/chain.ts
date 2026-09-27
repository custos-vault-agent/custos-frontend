import {
	type Address,
	defineChain,
	getAddress,
	isAddress,
	zeroAddress,
} from "viem";
import type { ResetPeriod } from "./types";

// Chain and contract addresses come from the environment, so one build can point
// at testnet and another at mainnet without a code change. Vite inlines every
// VITE_* value at build time, so a change needs a rebuild, not a restart.
function required(name: string, value: string | undefined): string {
	if (!value) throw new Error(`missing env ${name}`);
	return value;
}

/** Fails at startup on a malformed address, rather than on the first call. */
function address(
	name: string,
	value: string | undefined,
	fallback?: Address,
): Address {
	if (!value) {
		if (fallback !== undefined) return fallback;
		throw new Error(`missing env ${name}`);
	}
	if (!isAddress(value))
		throw new Error(`env ${name} is not an address: ${value}`);
	return getAddress(value);
}

const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID ?? "10143");

export const monadChain = defineChain({
	id: CHAIN_ID,
	name: CHAIN_ID === 143 ? "Monad" : "Monad Testnet",
	nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
	rpcUrls: {
		default: { http: [required("VITE_RPC_URL", import.meta.env.VITE_RPC_URL)] },
	},
	// Without this every publicClient.multicall throws ChainDoesNotSupportContract,
	// which empties the whole agent list. The canonical Multicall3 deployment is at
	// the same address on Monad as elsewhere; VITE_MULTICALL3 overrides it.
	contracts: {
		multicall3: {
			address: address(
				"VITE_MULTICALL3",
				import.meta.env.VITE_MULTICALL3,
				"0xcA11bde05977b3631167028862bE2a173976CA11",
			),
		},
	},
});

export const CONTRACTS = {
	custosCore: address("VITE_CUSTOS_CORE", import.meta.env.VITE_CUSTOS_CORE),
	usdc: address("VITE_USDC", import.meta.env.VITE_USDC),
	// NanSigil (repo nansigil-contract). The zero address disables the badge
	// lookup, which is what an empty value means while it is not deployed.
	nansigil: address(
		"VITE_NANSIGIL",
		import.meta.env.VITE_NANSIGIL,
		zeroAddress,
	),
	// Yield source the protocol allowlisted (`setYieldSourceAllowed`). The zero
	// address means none exists, and a new vault then keeps its USDC idle.
	yieldSource: address(
		"VITE_YIELD_SOURCE",
		import.meta.env.VITE_YIELD_SOURCE,
		zeroAddress,
	),
};

export const USDC_DECIMALS = 6;

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
