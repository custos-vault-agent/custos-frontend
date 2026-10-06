import { PrivyProvider } from "@privy-io/react-auth";
import { createConfig, WagmiProvider } from "@privy-io/wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { http } from "viem";
import { AURORA_ENABLED, ORIGIN_CHAINS } from "./aurora";
import { monadChain } from "./chain";

const originChains = AURORA_ENABLED ? Object.values(ORIGIN_CHAINS) : [];
const supportedChains = [monadChain, ...originChains] as const;

const wagmiConfig = createConfig({
	chains: supportedChains,
	transports: Object.fromEntries(supportedChains.map((c) => [c.id, http()])),
});

const queryClient = new QueryClient();

export function Web3Provider({ children }: { children: ReactNode }) {
	return (
		<PrivyProvider
			appId={import.meta.env.VITE_PRIVY_APP_ID as string}
			config={{
				loginMethods: ["wallet", "email"],
				appearance: { walletChainType: "ethereum-only" },
				defaultChain: monadChain,
				supportedChains: [...supportedChains],
			}}
		>
			<QueryClientProvider client={queryClient}>
				<WagmiProvider config={wagmiConfig}>{children}</WagmiProvider>
			</QueryClientProvider>
		</PrivyProvider>
	);
}
