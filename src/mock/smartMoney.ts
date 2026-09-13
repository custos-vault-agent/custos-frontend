import type { SmartMoneySignal } from "#/lib/types";

const SMART_MONEY: Record<string, SmartMoneySignal[]> = {
	"arb-hunter": [
		{
			tokenSymbol: "MON",
			netFlow24h: 2_300_000,
			netFlow7d: 9_100_000,
			trend: "accumulating",
		},
	],
	"grid-bot-7": [
		{
			tokenSymbol: "MON",
			netFlow24h: -420_000,
			netFlow7d: 180_000,
			trend: "neutral",
		},
	],
	"vol-harvester": [
		{
			tokenSymbol: "ETH",
			netFlow24h: -1_800_000,
			netFlow7d: -6_200_000,
			trend: "distributing",
		},
	],
};

export function smartMoneyFor(agentId: string): SmartMoneySignal[] {
	return SMART_MONEY[agentId] ?? [];
}
