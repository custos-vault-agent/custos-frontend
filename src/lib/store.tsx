import { usePrivy } from "@privy-io/react-auth";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { createContext, useContext, useMemo } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { fetchAgents } from "./onchain";
import type {
	ActivityEntry,
	Agent,
	Position,
	ResetPeriod,
} from "./types";

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
	chain: string;
	symbol: string;
	amount: number;
};

export type RedeemInput = {
	agentId: string;
	shares: number;
	chain: string;
};

type StoreValue = {
	connected: boolean;
	connectedAddress: string | null;
	agents: Agent[];
	myAgents: Agent[];
	positions: Position[];
	myPositions: Position[];
	history: ActivityEntry[];
	inFlight: ActivityEntry[];
	tick: number;
	connect: () => void;
	disconnect: () => void;
	registerAgent: (input: RegisterInput) => void;
	setAllowance: (id: string, allowance: number, resetPeriod: ResetPeriod) => void;
	pauseAgent: (id: string) => void;
	resumeAgent: (id: string) => void;
	revokeAgent: (id: string) => void;
	setPublic: (id: string, isPublic: boolean) => void;
	subscribe: (input: SubscribeInput) => void;
	redeem: (input: RedeemInput) => void;
};

const STUB_MESSAGE =
	"not implemented yet — this plan is read-only; writes land in a later plan";

function stub(name: string) {
	return (..._args: unknown[]) => {
		console.warn(`useStore().${name}: ${STUB_MESSAGE}`);
	};
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
	const { ready, authenticated, login, logout } = usePrivy();
	const { address } = useAccount();
	const publicClient = usePublicClient();

	const { data: agents = [] } = useQuery({
		queryKey: ["agents"],
		queryFn: () => {
			if (!publicClient) throw new Error("no public client");
			return fetchAgents(publicClient);
		},
		enabled: !!publicClient,
		refetchInterval: 10_000,
	});

	const connectedAddress = address ?? null;

	const myAgents = useMemo(
		() =>
			connectedAddress
				? agents.filter(
						(a) =>
							a.creatorAddress.toLowerCase() === connectedAddress.toLowerCase() &&
							a.status !== "revoked",
					)
				: [],
		[agents, connectedAddress],
	);

	// Position tracking (shares-per-subscriber) needs an indexer or a
	// balanceOf-per-vault read this plan doesn't add yet — empty until a
	// later plan wires it, same "honest zero" philosophy as agent.stats.
	const positions: Position[] = [];
	const myPositions: Position[] = [];
	const history: ActivityEntry[] = [];
	const inFlight: ActivityEntry[] = [];

	const value: StoreValue = {
		connected: ready && authenticated,
		connectedAddress,
		agents,
		myAgents,
		positions,
		myPositions,
		history,
		inFlight,
		tick: 0,
		connect: () => login(),
		disconnect: () => logout(),
		registerAgent: stub("registerAgent"),
		setAllowance: stub("setAllowance"),
		pauseAgent: stub("pauseAgent"),
		resumeAgent: stub("resumeAgent"),
		revokeAgent: stub("revokeAgent"),
		setPublic: stub("setPublic"),
		subscribe: stub("subscribe"),
		redeem: stub("redeem"),
	};

	return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
	const value = useContext(StoreContext);
	if (!value) throw new Error("useStore must be used inside <StoreProvider>");
	return value;
}
