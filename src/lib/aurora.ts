// Aurora Intents Connect: a subscriber on another chain deposits into a vault on
// Monad. The SDK bridges the asset to a per-user intermediary account on Monad
// and executes our steps from there, so the vault sees an ordinary
// `deposit(assets, receiver)`; no receiver contract on our side.
//
// Mainnet only (Monad 143). Gated by VITE_AURORA_ENABLED until Custos is there.
import {
	createExecutionRunner,
	createIntentsConnectApi,
	type Eip1193Provider,
	EVM_CHAIN_IDS,
	type Recipe,
	type RunnerEvent,
	type SupportedToken,
	type WalletConnector,
} from "@aurora-is-near/intents-connect";
import { evm } from "@aurora-is-near/intents-connect-wallet/evm";
import type { Address } from "viem";

export const AURORA_ENABLED = import.meta.env.VITE_AURORA_ENABLED === "true";

/** Display names for the chains Aurora reports as `blockchain` slugs. */
export const CHAIN_LABEL: Record<string, string> = {
	monad: "Monad",
	base: "Base",
	arbitrum: "Arbitrum",
	eth: "Ethereum",
	ethereum: "Ethereum",
	optimism: "Optimism",
	polygon: "Polygon",
	bsc: "BNB Chain",
	avalanche: "Avalanche",
	gnosis: "Gnosis",
	scroll: "Scroll",
};
export const chainLabel = (slug: string) => CHAIN_LABEL[slug] ?? slug;
const API_BASE = "https://intents-connect-api.aurora.dev/api/v1";
const DESTINATION_CHAIN = "monad";

export type AuroraUsdc = SupportedToken & {
	contractAddress: string;
	blockchain: string;
	assetId: string;
	decimals: number;
};

/** USDC on every EVM chain Aurora can bridge from, plus USDC on Monad (the destination). */
export async function fetchAuroraUsdc(): Promise<{
	origins: AuroraUsdc[];
	destination: AuroraUsdc | null;
}> {
	const res = await fetch(`${API_BASE}/supported_tokens`);
	if (!res.ok) throw new Error(`aurora supported_tokens ${res.status}`);
	const tokens = (await res.json()) as SupportedToken[];
	const usdc = tokens.filter(
		(t): t is AuroraUsdc =>
			t.symbol === "USDC" &&
			!!t.contractAddress &&
			!!t.assetId &&
			!!t.blockchain &&
			typeof t.decimals === "number" &&
			t.blockchain in EVM_CHAIN_IDS,
	);
	return {
		origins: usdc.filter((t) => t.blockchain !== DESTINATION_CHAIN),
		destination: usdc.find((t) => t.blockchain === DESTINATION_CHAIN) ?? null,
	};
}

/** approve + deposit into one vault, with the connected wallet as share receiver. */
export function vaultDepositRecipe(
	destination: AuroraUsdc,
): Recipe<{ vault: Address }> {
	return {
		id: "custos-vault-deposit",
		intent: "custos_vault_deposit",
		title: "Deposit into a Custos vault",
		flow: "bridge-in",
		type: "evm",
		destination: {
			chain: DESTINATION_CHAIN,
			assetId: destination.assetId,
			tokenAddress: destination.contractAddress,
		},
		// `amount` is opaque (a literal or the {MIN_AMOUNT_OUT} placeholder); template it, never parse it.
		buildSteps: ({ userAddress, amount }, { vault }) => [
			{
				to: destination.contractAddress,
				functionSignature: "approve(address,uint256)",
				parameters: [vault, amount],
				value: "0",
			},
			{
				to: vault,
				functionSignature: "deposit(uint256,address)",
				parameters: [amount, userAddress],
				value: "0",
			},
		],
	};
}

/** Wraps the wagmi-connected EVM wallet as the SDK's WalletConnector (EIP-191 signing). */
export function evmConnector(
	address: Address,
	getProvider: () => Promise<Eip1193Provider>,
	chains: string[],
): WalletConnector {
	return {
		id: "custos-wagmi",
		name: "Connected wallet",
		chains,
		signingStandard: "erc191",
		connect: async () => {},
		disconnect: async () => {},
		getAddress: () => address,
		getProviders: () => ({ evm: getProvider }),
		getChainId: async () =>
			Number(await (await getProvider()).request({ method: "eth_chainId" })),
	};
}

export function createAuroraRunner(
	connector: WalletConnector,
	getProvider: () => Promise<Eip1193Provider>,
	onEvent: (event: RunnerEvent) => void,
) {
	return createExecutionRunner({
		api: createIntentsConnectApi({
			baseUrl: API_BASE,
			apiKeyProxyUrl: "/api/aurora",
		}),
		wallet: connector,
		plugins: { evm },
		pluginOptions: { provider: getProvider },
		onEvent,
	});
}
