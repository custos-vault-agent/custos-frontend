import type { Actor, Agent } from "#/lib/types";
import { DAY, MOCK_NOW } from "./clock";

export const OWNER_ADDRESS = "0x7Ac41f9E2B6d8C0a5E3b71D4F82c9A0b1E6d3C57";

export const OWNER_ACTOR: Actor = {
	kind: "owner",
	name: "you",
	address: OWNER_ADDRESS,
};

export function agentActor(agent: Agent): Actor {
	return {
		kind: "agent",
		agentId: agent.id,
		name: agent.name,
		address: agent.agentAddress,
	};
}

/**
 * Four fields per agent come straight from the brief: name, description,
 * allowance and agent wallet. `stats` does not — see the design spec §8.
 *
 * Note `arb-hunter`: used (3,100) sits above allowance (2,500). That is the
 * state an owner lands in after lowering a cap below current usage, and it is
 * seeded deliberately so the warning path is reachable without setup.
 */
export const SEED_AGENTS: Agent[] = [
	{
		id: "grid-bot-7",
		name: "grid-bot-7",
		description:
			"Tight grid maker on MON/USDC. Fixed 0.15% spread, no leverage.",
		agentAddress: "0x3F81b26cA07d9E45c1B8a3D07f2E64C9b58Da112",
		ownerAddress: OWNER_ADDRESS,
		allowance: 4000,
		used: 3440,
		resetPeriod: "daily",
		status: "active",
		registeredAt: MOCK_NOW - 42 * DAY,
		stats: { volume30d: 71_000, trades30d: 3880, pnl30d: -1.8 },
	},
	{
		id: "arb-hunter",
		name: "arb-hunter",
		description:
			"Cross-venue arbitrage between Kuru and external quotes. Latency sensitive.",
		agentAddress: "0xB94e07D2c5A138fE60b7C41a9D3e8025Fa6C7d33",
		ownerAddress: OWNER_ADDRESS,
		allowance: 2500,
		used: 3100,
		resetPeriod: "daily",
		status: "active",
		registeredAt: MOCK_NOW - 19 * DAY,
		stats: { volume30d: 128_000, trades30d: 640, pnl30d: 4.2 },
	},
	{
		id: "mon-dca",
		name: "mon-dca",
		description:
			"Buys a fixed size of MON every day at 09:00 UTC. Never sells.",
		agentAddress: "0x2Dd0a91B7fE34c06d85Ab219c7E403bF6a1D9E48",
		ownerAddress: OWNER_ADDRESS,
		allowance: 1500,
		used: 420,
		resetPeriod: "daily",
		status: "active",
		registeredAt: MOCK_NOW - 8 * DAY,
		stats: { volume30d: 22_000, trades30d: 120, pnl30d: 1.1 },
	},
	{
		id: "night-scalper",
		name: "night-scalper",
		description:
			"Scalps thin overnight books. Paused pending a strategy rewrite.",
		agentAddress: "0x6Fa3C82b19D7e045A2c6B308f91E7d24Cb05A97e",
		ownerAddress: OWNER_ADDRESS,
		allowance: 1000,
		used: 0,
		resetPeriod: "weekly",
		status: "paused",
		registeredAt: MOCK_NOW - 63 * DAY,
		stats: { volume30d: 9000, trades30d: 410, pnl30d: -0.4 },
	},

	// Registered by other owners. Read-only in the public directory.
	{
		id: "deep-liquidity",
		name: "deep-liquidity",
		description:
			"Passive two-sided quoting across the five deepest Kuru markets.",
		agentAddress: "0xC17b4E9a83D06f25B7a1c94E0D38f6A2b95C7401",
		ownerAddress: "0x91D3a7F02b6E45c8017Da9B3c25E6f80A417dC93",
		allowance: 25_000,
		used: 11_200,
		resetPeriod: "weekly",
		status: "active",
		registeredAt: MOCK_NOW - 96 * DAY,
		stats: { volume30d: 480_000, trades30d: 12_400, pnl30d: 2.9 },
	},
	{
		id: "vol-harvester",
		name: "vol-harvester",
		description:
			"Sells realised-vol premium into spikes. Sizes down in drawdown.",
		agentAddress: "0x48Ea72B0c19D6f35a8B203E7c94D165Fb7a0E829",
		ownerAddress: "0x91D3a7F02b6E45c8017Da9B3c25E6f80A417dC93",
		allowance: 15_000,
		used: 14_100,
		resetPeriod: "monthly",
		status: "active",
		registeredAt: MOCK_NOW - 51 * DAY,
		stats: { volume30d: 310_000, trades30d: 2200, pnl30d: 6.4 },
	},
	{
		id: "kuru-mm-alpha",
		name: "kuru-mm-alpha",
		description: "Reference market maker. Highest uptime on the registry.",
		agentAddress: "0xA05f31D7b2E846c09B7a4C13e6D2508Fa9c3B764",
		ownerAddress: "0x5B7c2E90a41D63f8027Ac5B19e34D760F82a1C05",
		allowance: 50_000,
		used: 21_000,
		resetPeriod: "monthly",
		status: "active",
		registeredAt: MOCK_NOW - 120 * DAY,
		stats: { volume30d: 1_240_000, trades30d: 41_000, pnl30d: 0.9 },
	},
	{
		id: "basis-trader",
		name: "basis-trader",
		description: "Captures spot-perp basis. Currently underwater on funding.",
		agentAddress: "0x7E62b0Ac3D91f458a17C2450E9dB63A7c0184Ef2",
		ownerAddress: "0x5B7c2E90a41D63f8027Ac5B19e34D760F82a1C05",
		allowance: 8000,
		used: 1200,
		resetPeriod: "weekly",
		status: "active",
		registeredAt: MOCK_NOW - 34 * DAY,
		stats: { volume30d: 96_000, trades30d: 340, pnl30d: -3.1 },
	},
	{
		id: "momentum-9",
		name: "momentum-9",
		description:
			"Trend follower on MON. Runs hot — sits near its cap most days.",
		agentAddress: "0xD3907Ac1b8E246f05C7a91B3e0D485Fa2c76B913",
		ownerAddress: "0xE24a91C0b7D365f8017Ac4B29e13D670F85a2C41",
		allowance: 5000,
		used: 4990,
		resetPeriod: "daily",
		status: "active",
		registeredAt: MOCK_NOW - 11 * DAY,
		stats: { volume30d: 54_000, trades30d: 890, pnl30d: 11.2 },
	},
];
