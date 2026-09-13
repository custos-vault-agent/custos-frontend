import type { Asset, AssetSymbol, ChainId } from "#/lib/types";

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
