import type { LimitOrder } from "#/lib/types";
import { OWNER_ACTOR } from "./agents";
import { HOUR, MOCK_NOW } from "./clock";

export const SEED_ORDERS: LimitOrder[] = [
	{
		id: "ord-1",
		pair: "MON/USDC",
		side: "buy",
		price: 0.284,
		total: 2000,
		filled: 800,
		createdAt: MOCK_NOW - 3 * HOUR,
		status: "open",
		actor: OWNER_ACTOR,
	},
	{
		id: "ord-2",
		pair: "MON/USDC",
		side: "sell",
		price: 0.312,
		total: 5000,
		filled: 0,
		createdAt: MOCK_NOW - 26 * HOUR,
		status: "open",
		actor: OWNER_ACTOR,
	},
];
