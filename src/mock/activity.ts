import type { ActivityEntry, Actor } from "#/lib/types";
import { agentActor, OWNER_ACTOR, SEED_AGENTS } from "./agents";
import { HOUR, MINUTE, MOCK_NOW } from "./clock";
import { completedSteps, depositRouteSteps } from "./routes";

function actorFor(id: string): Actor {
	const agent = SEED_AGENTS.find((a) => a.id === id);
	if (!agent) throw new Error(`unknown seed agent: ${id}`);
	return agentActor(agent);
}

function gridChild(
	index: number,
	side: "Bought" | "Sold",
	size: number,
	price: number,
): ActivityEntry {
	return {
		id: `grid-child-${index}`,
		kind: "agent-trade",
		actor: actorFor("grid-bot-7"),
		agentId: "grid-bot-7",
		timestamp: MOCK_NOW - (60 + index * 3) * MINUTE,
		title: `${side} MON/USDC`,
		subtitle: "maker",
		amount: `${size.toFixed(1)} MON`,
		amountSub: `@ ${price.toFixed(4)}`,
		status: "filled",
		txHash: `0x${(0x4a71b0 + index * 977).toString(16)}…`,
	};
}

const gridChildren: ActivityEntry[] = [
	gridChild(0, "Bought", 420.0, 0.2958),
	gridChild(1, "Sold", 418.5, 0.2969),
	gridChild(2, "Bought", 419.2, 0.2955),
	gridChild(3, "Sold", 421.7, 0.2971),
	gridChild(4, "Bought", 417.9, 0.2952),
	gridChild(5, "Sold", 420.4, 0.2968),
];

/**
 * History is settled records only. Anything still actionable lives in the
 * in-flight block and is created at runtime by the store.
 */
export const SEED_ACTIVITY: ActivityEntry[] = [
	{
		id: "act-grid-group",
		kind: "agent-trade",
		actor: actorFor("grid-bot-7"),
		agentId: "grid-bot-7",
		timestamp: MOCK_NOW - 43 * MINUTE,
		title: "18 trades MON/USDC",
		subtitle: "maker · 13:31–13:47",
		amount: "7,540 MON",
		amountSub: "avg 0.2961",
		status: "filled",
		groupCount: 18,
		groupChildren: gridChildren,
	},
	{
		id: "act-dca",
		kind: "agent-trade",
		actor: actorFor("mon-dca"),
		agentId: "mon-dca",
		timestamp: MOCK_NOW - 5 * HOUR - 30 * MINUTE,
		title: "Bought MON/USDC",
		subtitle: "scheduled · daily",
		amount: "1,420.0 MON",
		amountSub: "@ 0.2949",
		status: "filled",
		txHash: "0x9c14ab…",
	},
	{
		id: "act-allowance",
		kind: "vault-config",
		actor: OWNER_ACTOR,
		agentId: "arb-hunter",
		timestamp: MOCK_NOW - 5 * HOUR - 15 * MINUTE,
		title: "Allowance changed · arb-hunter",
		subtitle: "5,000 → 2,500 USDC",
		amount: "—",
		status: "recorded",
		txHash: "0x71f0dd…",
	},
	{
		id: "act-subscribe",
		kind: "subscribe",
		actor: OWNER_ACTOR,
		agentId: "arb-hunter",
		timestamp: MOCK_NOW - 6 * HOUR - 27 * MINUTE,
		title: "Subscribe · arb-hunter",
		subtitle: "from Base via Aurora Intents",
		amount: "1,200 USDC",
		amountSub: "4 steps · 41s",
		status: "filled",
		steps: completedSteps(depositRouteSteps("base")),
		txHash: "0x2ba847…",
	},
	{
		id: "act-rejected",
		kind: "agent-trade",
		actor: actorFor("arb-hunter"),
		agentId: "arb-hunter",
		timestamp: MOCK_NOW - 6 * HOUR - 32 * MINUTE,
		title: "Buy MON/USDC",
		amount: "1,200 USDC",
		amountSub: "@ 0.2931",
		status: "failed",
		reason: "allowance exhausted",
	},
	{
		id: "act-circuit-breaker",
		kind: "circuit-breaker",
		actor: OWNER_ACTOR,
		agentId: "night-scalper",
		timestamp: MOCK_NOW - 30 * HOUR,
		title: "Circuit breaker triggered · night-scalper",
		subtitle: "drawdown exceeded 15% from high-water mark",
		amount: "—",
		status: "recorded",
		txHash: "0xa931cc…",
	},
	{
		id: "act-redeem",
		kind: "redeem",
		actor: OWNER_ACTOR,
		agentId: "grid-bot-7",
		timestamp: MOCK_NOW - 49 * HOUR,
		title: "Redeem · grid-bot-7",
		subtitle: "to owner wallet",
		amount: "1,500 USDC",
		status: "filled",
		txHash: "0xc07a15…",
	},
	{
		id: "act-register",
		kind: "seed-deposit",
		actor: OWNER_ACTOR,
		agentId: "mon-dca",
		timestamp: MOCK_NOW - 8 * 24 * HOUR,
		title: "Agent registered · mon-dca",
		subtitle: "seed 500 USDC · locked",
		amount: "—",
		status: "recorded",
		txHash: "0x3f9b28…",
	},
];
