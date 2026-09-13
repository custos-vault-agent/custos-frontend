import type { Actor, Agent, NansenBadge, Vault } from "#/lib/types";
import { DAY, MOCK_NOW } from "./clock";

export const OWNER_ADDRESS = "0x7Ac41f9E2B6d8C0a5E3b71D4F82c9A0b1E6d3C57";
export const MIN_SEED = 500;

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

function history(prices: number[], stepMs = DAY): Vault["sharePriceHistory"] {
	return prices.map((price, i) => ({
		t: MOCK_NOW - (prices.length - 1 - i) * stepMs,
		price,
	}));
}

/** Fills in every immutable-by-default field; pass only what one agent's
 *  vault actually differs on. `totalAssets` derives from the last history
 *  point unless overridden, so shares/price never disagree with each other. */
function vault(
	address: string,
	sharePriceHistory: Vault["sharePriceHistory"],
	overrides: Partial<Vault> = {},
): Vault {
	const sharePrice = sharePriceHistory.at(-1)?.price ?? 1;
	const totalAssets = overrides.totalAssets ?? 10_000;
	return {
		address,
		asset: "USDC",
		totalAssets,
		totalShares: totalAssets / sharePrice,
		sharePrice,
		sharePriceHistory,
		highWaterMark: Math.max(...sharePriceHistory.map((p) => p.price)),
		feeRateBps: 1000,
		maxDrawdownBps: 2000,
		maxUtilizationBps: 7000,
		yieldEnabled: true,
		yieldApyBps: 500,
		seedAssets: 500,
		circuitBreakerTripped: false,
		...overrides,
	};
}

function nansen(overrides: Partial<NansenBadge> = {}): NansenBadge {
	return {
		verified: true,
		label: null,
		pnlUsd: 0,
		winRatePct: 0,
		attestedAt: MOCK_NOW - 3 * DAY,
		stale: false,
		...overrides,
	};
}

/**
 * Nine agents, same identities as before. Deliberately covers every visual
 * state the vault detail page and marketplace card need to render:
 *   - grid-bot-7: verified Nansen badge, healthy vault
 *   - arb-hunter: STALE Nansen badge (attested >30 days ago)
 *   - mon-dca: no Nansen badge at all (nansen: null)
 *   - night-scalper: circuit breaker TRIPPED, unlisted (isPublic: false)
 *   - the rest: verified badges, varying fee/drawdown/utilization/yield
 */
export const SEED_AGENTS: Agent[] = [
	{
		id: "grid-bot-7",
		name: "grid-bot-7",
		description:
			"Tight grid maker on MON/USDC. Fixed 0.15% spread, no leverage.",
		agentAddress: "0x3F81b26cA07d9E45c1B8a3D07f2E64C9b58Da112",
		creatorAddress: OWNER_ADDRESS,
		isPublic: true,
		allowance: 4000,
		used: 3440,
		resetPeriod: "daily",
		status: "active",
		registeredAt: MOCK_NOW - 42 * DAY,
		vault: vault(
			"0xVAULTgrid0000000000000000000000000000001",
			history([1, 1.008, 1.014, 1.02, 1.011, 1.019]),
			{ totalAssets: 71_000, feeRateBps: 1000, maxUtilizationBps: 7000 },
		),
		nansen: nansen({
			label: "Smart Trader",
			pnlUsd: 42_000,
			winRatePct: 61,
			attestedAt: MOCK_NOW - 4 * DAY,
		}),
		stats: { volume30d: 71_000, trades30d: 3880, pnl30d: -1.8 },
	},
	{
		id: "arb-hunter",
		name: "arb-hunter",
		description:
			"Cross-venue arbitrage between Kuru and external quotes. Latency sensitive.",
		agentAddress: "0xB94e07D2c5A138fE60b7C41a9D3e8025Fa6C7d33",
		creatorAddress: OWNER_ADDRESS,
		isPublic: true,
		allowance: 2500,
		used: 3100,
		resetPeriod: "daily",
		status: "active",
		registeredAt: MOCK_NOW - 19 * DAY,
		vault: vault(
			"0xVAULTarb00000000000000000000000000000002",
			history([1, 1.02, 1.05, 1.03, 1.07, 1.081]),
			{ totalAssets: 128_000, feeRateBps: 1500, maxUtilizationBps: 8000 },
		),
		nansen: nansen({
			label: "Fund",
			pnlUsd: 310_000,
			winRatePct: 58,
			attestedAt: MOCK_NOW - 40 * DAY,
			stale: true,
		}),
		stats: { volume30d: 128_000, trades30d: 640, pnl30d: 4.2 },
	},
	{
		id: "mon-dca",
		name: "mon-dca",
		description:
			"Buys a fixed size of MON every day at 09:00 UTC. Never sells.",
		agentAddress: "0x2Dd0a91B7fE34c06d85Ab219c7E403bF6a1D9E48",
		creatorAddress: OWNER_ADDRESS,
		isPublic: true,
		allowance: 1500,
		used: 420,
		resetPeriod: "daily",
		status: "active",
		registeredAt: MOCK_NOW - 8 * DAY,
		vault: vault(
			"0xVAULTdca00000000000000000000000000000003",
			history([1, 1.003, 1.006, 1.009, 1.011, 1.014]),
			{ totalAssets: 22_000, feeRateBps: 500, maxUtilizationBps: 6000 },
		),
		nansen: null,
		stats: { volume30d: 22_000, trades30d: 120, pnl30d: 1.1 },
	},
	{
		id: "night-scalper",
		name: "night-scalper",
		description:
			"Scalps thin overnight books. Paused pending a strategy rewrite.",
		agentAddress: "0x6Fa3C82b19D7e045A2c6B308f91E7d24Cb05A97e",
		creatorAddress: OWNER_ADDRESS,
		isPublic: false,
		allowance: 1000,
		used: 0,
		resetPeriod: "weekly",
		status: "paused",
		registeredAt: MOCK_NOW - 63 * DAY,
		vault: vault(
			"0xVAULTnight000000000000000000000000000004",
			history([1, 1.01, 1.06, 0.97, 0.9, 0.84]),
			{
				totalAssets: 9000,
				feeRateBps: 1000,
				maxDrawdownBps: 1500,
				maxUtilizationBps: 7000,
				circuitBreakerTripped: true,
			},
		),
		nansen: nansen({
			label: null,
			pnlUsd: -8000,
			winRatePct: 41,
			attestedAt: MOCK_NOW - 2 * DAY,
		}),
		stats: { volume30d: 9000, trades30d: 410, pnl30d: -0.4 },
	},
	{
		id: "deep-liquidity",
		name: "deep-liquidity",
		description:
			"Passive two-sided quoting across the five deepest Kuru markets.",
		agentAddress: "0xC17b4E9a83D06f25B7a1c94E0D38f6A2b95C7401",
		creatorAddress: "0x91D3a7F02b6E45c8017Da9B3c25E6f80A417dC93",
		isPublic: true,
		allowance: 25_000,
		used: 11_200,
		resetPeriod: "weekly",
		status: "active",
		registeredAt: MOCK_NOW - 96 * DAY,
		vault: vault(
			"0xVAULTdeep000000000000000000000000000005",
			history([1, 1.04, 1.09, 1.12, 1.15, 1.18]),
			{ totalAssets: 480_000, feeRateBps: 800, maxUtilizationBps: 6500 },
		),
		nansen: nansen({
			label: "Whale",
			pnlUsd: 1_900_000,
			winRatePct: 55,
			attestedAt: MOCK_NOW - 1 * DAY,
		}),
		stats: { volume30d: 480_000, trades30d: 12_400, pnl30d: 2.9 },
	},
	{
		id: "vol-harvester",
		name: "vol-harvester",
		description:
			"Sells realised-vol premium into spikes. Sizes down in drawdown.",
		agentAddress: "0x48Ea72B0c19D6f35a8B203E7c94D165Fb7a0E829",
		creatorAddress: "0x91D3a7F02b6E45c8017Da9B3c25E6f80A417dC93",
		isPublic: true,
		allowance: 15_000,
		used: 14_100,
		resetPeriod: "monthly",
		status: "active",
		registeredAt: MOCK_NOW - 51 * DAY,
		vault: vault(
			"0xVAULTvol0000000000000000000000000000006",
			history([1, 1.11, 1.22, 1.19, 1.28, 1.34]),
			{ totalAssets: 310_000, feeRateBps: 2000, maxUtilizationBps: 8500 },
		),
		nansen: nansen({
			label: "Smart Trader",
			pnlUsd: 88_000,
			winRatePct: 63,
			attestedAt: MOCK_NOW - 6 * DAY,
		}),
		stats: { volume30d: 310_000, trades30d: 2200, pnl30d: 6.4 },
	},
	{
		id: "kuru-mm-alpha",
		name: "kuru-mm-alpha",
		description: "Reference market maker. Highest uptime on the registry.",
		agentAddress: "0xA05f31D7b2E846c09B7a4C13e6D2508Fa9c3B764",
		creatorAddress: "0x5B7c2E90a41D63f8027Ac5B19e34D760F82a1C05",
		isPublic: true,
		allowance: 50_000,
		used: 21_000,
		resetPeriod: "monthly",
		status: "active",
		registeredAt: MOCK_NOW - 120 * DAY,
		vault: vault(
			"0xVAULTkuru000000000000000000000000000007",
			history([1, 1.02, 1.05, 1.08, 1.1, 1.13]),
			{ totalAssets: 1_240_000, feeRateBps: 600, maxUtilizationBps: 6000 },
		),
		nansen: nansen({
			label: "Fund",
			pnlUsd: 4_100_000,
			winRatePct: 52,
			attestedAt: MOCK_NOW - 10 * DAY,
		}),
		stats: { volume30d: 1_240_000, trades30d: 41_000, pnl30d: 0.9 },
	},
	{
		id: "basis-trader",
		name: "basis-trader",
		description: "Captures spot-perp basis. Currently underwater on funding.",
		agentAddress: "0x7E62b0Ac3D91f458a17C2450E9dB63A7c0184Ef2",
		creatorAddress: "0x5B7c2E90a41D63f8027Ac5B19e34D760F82a1C05",
		isPublic: true,
		allowance: 8000,
		used: 1200,
		resetPeriod: "weekly",
		status: "active",
		registeredAt: MOCK_NOW - 34 * DAY,
		vault: vault(
			"0xVAULTbasis00000000000000000000000000008",
			history([1, 0.99, 0.96, 0.94, 0.95, 0.93]),
			{ totalAssets: 96_000, feeRateBps: 1200, maxUtilizationBps: 7500 },
		),
		nansen: nansen({
			label: null,
			pnlUsd: -21_000,
			winRatePct: 44,
			attestedAt: MOCK_NOW - 5 * DAY,
		}),
		stats: { volume30d: 96_000, trades30d: 340, pnl30d: -3.1 },
	},
	{
		id: "momentum-9",
		name: "momentum-9",
		description:
			"Trend follower on MON. Runs hot — sits near its cap most days.",
		agentAddress: "0xD3907Ac1b8E246f05C7a91B3e0D485Fa2c76B913",
		creatorAddress: "0xE24a91C0b7D365f8017Ac4B29e13D670F85a2C41",
		isPublic: true,
		allowance: 5000,
		used: 4990,
		resetPeriod: "daily",
		status: "active",
		registeredAt: MOCK_NOW - 11 * DAY,
		vault: vault(
			"0xVAULTmom00000000000000000000000000000009",
			history([1, 1.05, 1.12, 1.2, 1.28, 1.36]),
			{ totalAssets: 54_000, feeRateBps: 1800, maxUtilizationBps: 9000 },
		),
		nansen: nansen({
			label: "Smart Trader",
			pnlUsd: 61_000,
			winRatePct: 66,
			attestedAt: MOCK_NOW - 8 * DAY,
		}),
		stats: { volume30d: 54_000, trades30d: 890, pnl30d: 11.2 },
	},
];
