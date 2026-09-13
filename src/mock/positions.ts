import type { Position } from "#/lib/types";
import { OWNER_ADDRESS } from "./agents";

export const SEED_POSITIONS: Position[] = [
	{
		agentId: "arb-hunter",
		subscriberAddress: OWNER_ADDRESS,
		shares: 1150,
		depositedAssets: 1200,
	},
	{
		agentId: "grid-bot-7",
		subscriberAddress: OWNER_ADDRESS,
		shares: 2000,
		depositedAssets: 2000,
	},
];
