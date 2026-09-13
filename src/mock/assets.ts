import type { Asset, AssetSymbol, ChainId, Quote } from "#/lib/types";

export const CHAIN_LABEL: Record<ChainId, string> = {
	monad: "Monad",
	solana: "Solana",
	base: "Base",
	arbitrum: "Arbitrum",
	ethereum: "Ethereum",
};

export const ASSETS: Asset[] = [
	{ symbol: "USDC", name: "USD Coin", chain: "solana" },
	{ symbol: "SOL", name: "Solana", chain: "solana" },
	{ symbol: "USDC", name: "USD Coin", chain: "base" },
	{ symbol: "ETH", name: "Ether", chain: "base" },
	{ symbol: "ETH", name: "Ether", chain: "arbitrum" },
	{ symbol: "WBTC", name: "Wrapped Bitcoin", chain: "arbitrum" },
	{ symbol: "USDC", name: "USD Coin", chain: "ethereum" },
	{ symbol: "MON", name: "Monad", chain: "monad" },
	{ symbol: "USDC", name: "USD Coin", chain: "monad" },
];

/** Reference USD prices. Everything else is derived, so the app never
 *  contradicts itself the way independently invented rates would. */
export const USD_PRICE: Record<AssetSymbol, number> = {
	USDC: 1,
	MON: 0.2958,
	SOL: 142.3,
	ETH: 2480,
	WBTC: 63120,
};

export const WALLET_BALANCE: Record<string, number> = {
	"USDC:solana": 4210,
	"SOL:solana": 38.4,
	"USDC:base": 12_400,
	"ETH:base": 2.15,
	"ETH:arbitrum": 0.82,
	"WBTC:arbitrum": 0.14,
	"USDC:ethereum": 3100,
	"MON:monad": 18_450,
	"USDC:monad": 900,
};

export function assetKey(symbol: AssetSymbol, chain: ChainId): string {
	return `${symbol}:${chain}`;
}

export function balanceOf(symbol: AssetSymbol, chain: ChainId): number {
	return WALLET_BALANCE[assetKey(symbol, chain)] ?? 0;
}

export function assetsForChain(chain: ChainId): Asset[] {
	return ASSETS.filter((a) => a.chain === chain);
}

/**
 * Deterministic jitter driven by a tick counter rather than Math.random, so a
 * re-render never changes the quote underneath the user and the displayed rate
 * always matches the receive amount.
 */
function jitter(tick: number): number {
	return 1 + Math.sin(tick * 0.7) * 0.0012;
}

export function quoteFor(
	amount: number,
	from: AssetSymbol,
	to: AssetSymbol,
	tick: number,
	slippageBps = 50,
): Quote {
	const base = USD_PRICE[from] / USD_PRICE[to];
	const rate = base * jitter(tick);
	const notional = amount * USD_PRICE[from];

	// Impact grows with size against a shallow book. Purely illustrative.
	const priceImpact = Math.min(2.4, (notional / 250_000) * 0.85);
	const gross = amount * rate;
	const receive = gross * (1 - priceImpact / 100);

	return {
		rate,
		receive,
		minimumReceived: receive * (1 - slippageBps / 10_000),
		priceImpact,
		networkFee: 0.42,
		protocolFee: notional * 0.0005,
	};
}
