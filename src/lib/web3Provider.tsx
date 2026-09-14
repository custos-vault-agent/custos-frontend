import { PrivyProvider } from "@privy-io/react-auth";
import { WagmiProvider, createConfig } from "@privy-io/wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http } from "viem";
import type { ReactNode } from "react";
import { monadTestnet } from "./chain";

const wagmiConfig = createConfig({
	chains: [monadTestnet],
	transports: {
		[monadTestnet.id]: http(),
	},
});

const queryClient = new QueryClient();

export function Web3Provider({ children }: { children: ReactNode }) {
	return (
		<PrivyProvider
			appId={import.meta.env.VITE_PRIVY_APP_ID as string}
			config={{
				loginMethods: ["wallet", "email"],
				appearance: { walletChainType: "ethereum-only" },
				defaultChain: monadTestnet,
				supportedChains: [monadTestnet],
			}}
		>
			<QueryClientProvider client={queryClient}>
				<WagmiProvider config={wagmiConfig}>{children}</WagmiProvider>
			</QueryClientProvider>
		</PrivyProvider>
	);
}
