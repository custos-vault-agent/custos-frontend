// Reads the derived `Agent` / `SharePricePoint` entities from the Envio
// indexer (custos-indexer/schema.graphql). Everything here is history or
// slow-changing metadata; live vault numbers still come from the chain in
// onchain.ts so a user's own action never looks stale.

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
};

export type IndexedPricePoint = {
	agent: string;
	timestamp: number;
	sharePrice: bigint;
	totalAssets: bigint;
	notional: bigint;
	source: "seed" | "swap" | "breaker";
};

const QUERY = `
query Agents($chainId: Int!) {
  Agent(where: { chainId: { _eq: $chainId } }, order_by: { registeredAt: asc }) {
    id creator wallet vault name description feeRate isPublic registeredAt swapCount volume
  }
  SharePricePoint(where: { chainId: { _eq: $chainId } }, order_by: { timestamp: asc }) {
    agent timestamp sharePrice totalAssets notional source
  }
}`;

/** Hasura returns BigInt columns as strings. */
const big = (v: unknown) => BigInt(String(v));

export type IndexedData = {
	agents: IndexedAgent[];
	pointsByAgent: Map<string, IndexedPricePoint[]>;
};

export async function fetchIndexedAgents(
	chainId: number,
): Promise<IndexedData | null> {
	if (!GRAPHQL_URL) return null;
	const res = await fetch(GRAPHQL_URL, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ query: QUERY, variables: { chainId } }),
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
	return { agents, pointsByAgent };
}
