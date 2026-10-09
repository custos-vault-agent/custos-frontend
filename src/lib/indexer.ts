// Reads the derived `Agent` / `SharePricePoint` entities from the Envio
// indexer (custos-indexer/schema.graphql). Everything here is history or
// slow-changing metadata; live vault numbers still come from the chain in
// onchain.ts so a user's own action never looks stale.

import { formatUnits } from "viem";
import { fromTokenUnits } from "./chain";
import { formatAmount, shortAddress } from "./format";
import type { ActivityEntry, MarketFlow } from "./types";

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
	markets: string[];
	assetsInTotal: bigint;
	assetsOutTotal: bigint;
	buyCount: number;
	maxNotional: bigint;
	tradeHours: number[];
	holdSecondsTotal: bigint;
	breakerCount: number;
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
query Agents($chainId: Int!, $since: Int!, $flowSince: Int!${withHolder ? ", $holder: String!" : ""}) {
  Agent(where: { chainId: { _eq: $chainId } }, order_by: { registeredAt: asc }) {
    id creator wallet vault name description feeRate isPublic registeredAt swapCount volume
    nansenLabel nansenPnl nansenWinRate nansenAttestedAt
    subscriberCount yieldDeployed realizedPnl closedCount winCount
    markets assetsInTotal assetsOutTotal
    buyCount maxNotional tradeHours holdSecondsTotal breakerCount
  }
  SharePricePoint(where: { chainId: { _eq: $chainId } }, order_by: { timestamp: asc }) {
    agent timestamp sharePrice totalAssets notional source
  }
  YieldSource(where: { chainId: { _eq: $chainId }, allowed: { _eq: true } }) {
    id
  }
  Market(where: { chainId: { _eq: $chainId } }) {
    id baseSymbol baseDecimals
  }
  MarketFlowBucket(where: { chainId: { _eq: $chainId }, timestamp: { _gte: $flowSince } }, limit: 10000) {
    market timestamp buyNotional sellNotional swapCount
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
	marketFlow: MarketFlow[];
	/** Yield sources the indexer last saw allowlisted; unconfirmed against the chain. */
	yieldSources: `0x${string}`[];
};

export type MarketMeta = { symbol: string; decimals: number };

const THIRTY_DAYS = 30 * 24 * 60 * 60;
const DAY = 24 * 60 * 60;

/** Sums hourly buckets per market over 24h and 7d; net flow is buys minus sells. */
export function reduceMarketFlow(
	buckets: Record<string, unknown>[],
	markets: Map<string, MarketMeta>,
): MarketFlow[] {
	const dayAgo = Math.floor(Date.now() / 1000) - DAY;
	const acc = new Map<string, MarketFlow>();
	for (const b of buckets) {
		const market = String(b.market).toLowerCase();
		const buy = fromTokenUnits(big(b.buyNotional));
		const sell = fromTokenUnits(big(b.sellNotional));
		const f = acc.get(market) ?? {
			market,
			symbol: markets.get(market)?.symbol ?? shortAddress(market),
			netFlow24h: 0,
			netFlow7d: 0,
			buyNotional7d: 0,
			sellNotional7d: 0,
			swapCount7d: 0,
			trend: "neutral" as const,
		};
		if (Number(b.timestamp) >= dayAgo) f.netFlow24h += buy - sell;
		f.netFlow7d += buy - sell;
		f.buyNotional7d += buy;
		f.sellNotional7d += sell;
		f.swapCount7d += Number(b.swapCount);
		acc.set(market, f);
	}
	return [...acc.values()].map((f) => {
		const gross = f.buyNotional7d + f.sellNotional7d;
		const ratio = gross > 0 ? f.netFlow7d / gross : 0;
		return {
			...f,
			trend:
				ratio > 0.1
					? "accumulating"
					: ratio < -0.1
						? "distributing"
						: "neutral",
		};
	});
}

export async function fetchIndexedAgents(
	chainId: number,
	holder?: string,
): Promise<IndexedData | null> {
	if (!GRAPHQL_URL) return null;
	const now = Math.floor(Date.now() / 1000);
	const since = now - THIRTY_DAYS;
	const res = await fetch(GRAPHQL_URL, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			query: buildQuery(!!holder),
			variables: {
				chainId,
				since,
				flowSince: now - 7 * DAY,
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
			markets: ((a.markets ?? []) as string[]).map((m) => m.toLowerCase()),
			assetsInTotal: big(a.assetsInTotal ?? 0),
			assetsOutTotal: big(a.assetsOutTotal ?? 0),
			buyCount: Number(a.buyCount ?? 0),
			maxNotional: big(a.maxNotional ?? 0),
			tradeHours: Array.from({ length: 24 }, (_, h) =>
				Number((a.tradeHours as number[] | null)?.[h] ?? 0),
			),
			holdSecondsTotal: big(a.holdSecondsTotal ?? 0),
			breakerCount: Number(a.breakerCount ?? 0),
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
	return {
		agents,
		pointsByAgent,
		snapshotsByAgent,
		positionsByAgent,
		markets,
		yieldSources: ((data.YieldSource ?? []) as { id: string }[]).map(
			(y) => y.id as `0x${string}`,
		),
		marketFlow: reduceMarketFlow(data.MarketFlowBucket ?? [], markets),
	};
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

export type IndexedAttestation = {
	label: string;
	pnl: number;
	winRate: number;
	timestamp: number;
};

// `_ilike` not `_eq`: the indexer stores the wallet as the event emitted it,
// which may be checksummed.
const ATTESTATION_QUERY = `
query Attestations($chainId: Int!, $wallet: String!) {
  NanSigil_AttestationSubmitted(where: { chainId: { _eq: $chainId }, wallet: { _ilike: $wallet } }, order_by: { timestamp: asc }, limit: 200) {
    label pnl winRate timestamp
  }
}`;

/** A wallet's full attestation history, oldest first. Null without an indexer. */
export async function fetchIndexedAttestations(
	chainId: number,
	wallet: string,
): Promise<IndexedAttestation[] | null> {
	if (!GRAPHQL_URL) return null;
	const res = await fetch(GRAPHQL_URL, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			query: ATTESTATION_QUERY,
			variables: { chainId, wallet: wallet.toLowerCase() },
		}),
	});
	if (!res.ok) throw new Error(`indexer ${res.status}`);
	const { data, errors } = await res.json();
	if (errors?.length) throw new Error(errors[0].message);
	return (data.NanSigil_AttestationSubmitted as Record<string, unknown>[]).map(
		(r) => ({
			label: String(r.label),
			pnl: fromTokenUnits(big(r.pnl)),
			winRate: Number(r.winRate),
			timestamp: Number(r.timestamp),
		}),
	);
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
