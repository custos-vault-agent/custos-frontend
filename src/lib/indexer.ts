// Reads the derived `Agent` / `SharePricePoint` entities from the Envio
// indexer (custos-indexer/schema.graphql). Everything here is history or
// slow-changing metadata; live vault numbers still come from the chain in
// onchain.ts so a user's own action never looks stale.

import { formatUnits } from "viem";
import { fromTokenUnits } from "./chain";
import { formatAmount } from "./format";
import type { ActivityEntry } from "./types";

const GRAPHQL_URL = import.meta.env.VITE_ENVIO_GRAPHQL_URL as
	| string
	| undefined;

export type IndexedAgent = {
	id: `0x${string}`;
	creator: `0x${string}`;
	wallet: `0x${string}`;
	vault: `0x${string}`;
	name: `0x${string}`;
	description: string;
	feeRate: number;
	isPublic: boolean;
	registeredAt: number;
	swapCount: number;
	volume: bigint;
	// Creator's latest NanSigil attestation plaintext, null until attested.
	nansenLabel: string | null;
	nansenPnl: bigint | null;
	nansenWinRate: number | null;
	nansenAttestedAt: number | null;
	subscriberCount: number;
	yieldDeployed: bigint;
	realizedPnl: bigint;
	closedCount: number;
	winCount: number;
};

export type IndexedPricePoint = {
	agent: string;
	timestamp: number;
	sharePrice: bigint;
	totalAssets: bigint;
	notional: bigint;
	source: "seed" | "swap" | "breaker";
};

export type IndexedPosition = {
	agent: string;
	vault: string;
	shares: bigint;
	assetsIn: bigint;
	assetsOut: bigint;
};

export type IndexedSnapshot = {
	agent: string;
	timestamp: number;
	sharePrice: bigint;
	totalAssets: bigint;
	subscriberCount: number;
};

// The position table is only queried for a connected holder.
const buildQuery = (withHolder: boolean) => `
query Agents($chainId: Int!, $since: Int!${withHolder ? ", $holder: String!" : ""}) {
  Agent(where: { chainId: { _eq: $chainId } }, order_by: { registeredAt: asc }) {
    id creator wallet vault name description feeRate isPublic registeredAt swapCount volume
    nansenLabel nansenPnl nansenWinRate nansenAttestedAt
    subscriberCount yieldDeployed realizedPnl closedCount winCount
  }
  SharePricePoint(where: { chainId: { _eq: $chainId } }, order_by: { timestamp: asc }) {
    agent timestamp sharePrice totalAssets notional source
  }
  Market(where: { chainId: { _eq: $chainId } }) {
    id baseSymbol baseDecimals
  }
  AgentSnapshot(where: { chainId: { _eq: $chainId }, timestamp: { _gte: $since } }, order_by: { timestamp: asc }, limit: 10000) {
    agent timestamp sharePrice totalAssets subscriberCount
  }${
		withHolder
			? `
  VaultPosition(where: { chainId: { _eq: $chainId }, holder: { _eq: $holder } }) {
    agent vault shares assetsIn assetsOut
  }`
			: ""
	}
}`;

/** Hasura returns BigInt columns as strings. */
const big = (v: unknown) => BigInt(String(v));

export type IndexedData = {
	agents: IndexedAgent[];
	pointsByAgent: Map<string, IndexedPricePoint[]>;
	snapshotsByAgent: Map<string, IndexedSnapshot[]>;
	/** Keyed by lowercased agent id. Empty without a holder. */
	positionsByAgent: Map<string, IndexedPosition>;
	/** Keyed by lowercased market address. */
	markets: Map<string, MarketMeta>;
};

export type MarketMeta = { symbol: string; decimals: number };

const THIRTY_DAYS = 30 * 24 * 60 * 60;

export async function fetchIndexedAgents(
	chainId: number,
	holder?: string,
): Promise<IndexedData | null> {
	if (!GRAPHQL_URL) return null;
	const since = Math.floor(Date.now() / 1000) - THIRTY_DAYS;
	const res = await fetch(GRAPHQL_URL, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			query: buildQuery(!!holder),
			variables: {
				chainId,
				since,
				...(holder ? { holder: holder.toLowerCase() } : {}),
			},
		}),
	});
	if (!res.ok) throw new Error(`indexer ${res.status}`);
	const { data, errors } = await res.json();
	if (errors?.length) throw new Error(errors[0].message);

	const agents: IndexedAgent[] = data.Agent.map(
		(a: Record<string, unknown>) => ({
			...a,
			feeRate: Number(a.feeRate),
			registeredAt: Number(a.registeredAt),
			swapCount: Number(a.swapCount),
			volume: big(a.volume),
			nansenLabel: (a.nansenLabel as string | null) ?? null,
			nansenPnl: a.nansenPnl == null ? null : big(a.nansenPnl),
			nansenWinRate: a.nansenWinRate == null ? null : Number(a.nansenWinRate),
			nansenAttestedAt:
				a.nansenAttestedAt == null ? null : Number(a.nansenAttestedAt),
			subscriberCount: Number(a.subscriberCount ?? 0),
			yieldDeployed: big(a.yieldDeployed ?? 0),
			realizedPnl: big(a.realizedPnl ?? 0),
			closedCount: Number(a.closedCount ?? 0),
			winCount: Number(a.winCount ?? 0),
		}),
	);

	const pointsByAgent = new Map<string, IndexedPricePoint[]>();
	for (const p of data.SharePricePoint as Record<string, unknown>[]) {
		const key = String(p.agent);
		const list = pointsByAgent.get(key) ?? [];
		list.push({
			agent: key,
			timestamp: Number(p.timestamp),
			sharePrice: big(p.sharePrice),
			totalAssets: big(p.totalAssets),
			notional: big(p.notional),
			source: p.source as IndexedPricePoint["source"],
		});
		pointsByAgent.set(key, list);
	}

	const snapshotsByAgent = new Map<string, IndexedSnapshot[]>();
	for (const p of (data.AgentSnapshot ?? []) as Record<string, unknown>[]) {
		const key = String(p.agent).toLowerCase();
		const list = snapshotsByAgent.get(key) ?? [];
		list.push({
			agent: key,
			timestamp: Number(p.timestamp),
			sharePrice: big(p.sharePrice),
			totalAssets: big(p.totalAssets),
			subscriberCount: Number(p.subscriberCount),
		});
		snapshotsByAgent.set(key, list);
	}

	const positionsByAgent = new Map<string, IndexedPosition>();
	for (const p of (data.VaultPosition ?? []) as Record<string, unknown>[]) {
		const agent = String(p.agent).toLowerCase();
		positionsByAgent.set(agent, {
			agent,
			vault: String(p.vault),
			shares: big(p.shares),
			assetsIn: big(p.assetsIn),
			assetsOut: big(p.assetsOut),
		});
	}

	const markets = new Map<string, MarketMeta>(
		((data.Market ?? []) as Record<string, unknown>[]).map((m) => [
			String(m.id).toLowerCase(),
			{ symbol: String(m.baseSymbol), decimals: Number(m.baseDecimals) },
		]),
	);
	return { agents, pointsByAgent, snapshotsByAgent, positionsByAgent, markets };
}

const ACTIVITY_TABLES = [
	["AgentVault_SubscriberDeposited", "vault subscriber assets shares"],
	["AgentVault_SubscriberRedeemed", "vault subscriber assets shares"],
	["AgentVault_SeedDeposited", "vault creator assets shares"],
	[
		"AgentVault_SwapExecuted",
		"vault agentId market isBuy baseAmount quoteAmount notionalCharged newSharePrice",
	],
	[
		"AgentVault_FeeMinted",
		"vault creator feeShares feeAssets newHighWaterMark",
	],
	[
		"AgentVault_CircuitBreakerTriggered",
		"vault currentSharePrice highWaterMark maxDrawdownBps",
	],
] as const;

const ACTIVITY_QUERY = `
query Activity($chainId: Int!) {
${ACTIVITY_TABLES.map(
	([t, f]) =>
		`  ${t}(where: { chainId: { _eq: $chainId } }, order_by: { timestamp: desc }, limit: 50) { id timestamp ${f} }`,
).join("\n")}
}`;

export type ActivityRows = Record<
	(typeof ACTIVITY_TABLES)[number][0],
	Record<string, unknown>[]
>;

export async function fetchIndexedActivity(
	chainId: number,
): Promise<ActivityRows | null> {
	if (!GRAPHQL_URL) return null;
	const res = await fetch(GRAPHQL_URL, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ query: ACTIVITY_QUERY, variables: { chainId } }),
	});
	if (!res.ok) throw new Error(`indexer ${res.status}`);
	const { data, errors } = await res.json();
	if (errors?.length) throw new Error(errors[0].message);
	return data;
}

export type VaultAgent = { id: string; name: string; agentAddress: string };

const usdc = (v: unknown) => `${formatAmount(fromTokenUnits(big(v)))} USDC`;

export function toActivity(
	rows: Partial<ActivityRows>,
	agentsByVault: Map<string, VaultAgent>,
	base: MarketMeta | null,
	markets: Map<string, MarketMeta> = new Map(),
): ActivityEntry[] {
	const out: ActivityEntry[] = [];
	const add = (
		table: keyof ActivityRows,
		build: (
			r: Record<string, unknown>,
			a: VaultAgent,
		) => Omit<ActivityEntry, "id" | "agentId" | "timestamp" | "status">,
	) => {
		for (const r of rows[table] ?? []) {
			const a = agentsByVault.get(String(r.vault).toLowerCase());
			if (!a) continue;
			out.push({
				id: String(r.id),
				agentId: a.id,
				timestamp: Number(r.timestamp) * 1000,
				status: "filled",
				...build(r, a),
			});
		}
	};
	const owner = (address: unknown, name = "subscriber") => ({
		kind: "owner" as const,
		name,
		address: String(address),
	});

	add("AgentVault_SubscriberDeposited", (r, a) => ({
		kind: "subscribe",
		actor: owner(r.subscriber),
		title: `Subscribe · ${a.name}`,
		amount: usdc(r.assets),
	}));
	add("AgentVault_SubscriberRedeemed", (r, a) => ({
		kind: "redeem",
		actor: owner(r.subscriber),
		title: `Redeem · ${a.name}`,
		amount: usdc(r.assets),
	}));
	add("AgentVault_SeedDeposited", (r, a) => ({
		kind: "seed-deposit",
		actor: owner(r.creator, "creator"),
		title: `Seed · ${a.name}`,
		amount: usdc(r.assets),
	}));
	add("AgentVault_SwapExecuted", (r, a) => {
		const token = markets.get(String(r.market).toLowerCase()) ?? base;
		return {
			kind: "agent-trade",
			actor: {
				kind: "agent",
				agentId: a.id,
				name: a.name,
				address: a.agentAddress,
			},
			title: `${r.isBuy ? "Buy" : "Sell"} · ${a.name}`,
			amount: usdc(r.notionalCharged),
			amountSub: token
				? `${formatAmount(Number(formatUnits(big(r.baseAmount), token.decimals)))} ${token.symbol}`
				: undefined,
		};
	});
	add("AgentVault_FeeMinted", (r, a) => ({
		kind: "fee-mint",
		actor: owner(r.creator, "creator"),
		title: `Performance fee · ${a.name}`,
		amount: usdc(r.feeAssets),
	}));
	// The event carries no creator, so the vault itself is the actor.
	add("AgentVault_CircuitBreakerTriggered", (r, a) => ({
		kind: "circuit-breaker",
		actor: owner(r.vault, "vault"),
		title: `Circuit breaker · ${a.name}`,
		amount: "",
		reason: `Drawdown reached ${Number(r.maxDrawdownBps) / 100}%`,
	}));

	return out.sort((x, y) => y.timestamp - x.timestamp);
}
