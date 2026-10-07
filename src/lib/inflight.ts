import type { ActivityEntry } from "./types";

export const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export const storageKey = (chainId: number, address: string) =>
	`custos.inflight.${chainId}.${address.toLowerCase()}`;

export const serialize = (entries: ActivityEntry[]) => JSON.stringify(entries);

function valid(e: unknown): e is ActivityEntry {
	if (!e || typeof e !== "object") return false;
	const x = e as Record<string, unknown>;
	return (
		typeof x.id === "string" &&
		typeof x.kind === "string" &&
		typeof x.agentId === "string" &&
		typeof x.timestamp === "number" &&
		typeof x.title === "string" &&
		typeof x.amount === "string" &&
		typeof x.status === "string" &&
		!!x.actor &&
		typeof x.actor === "object" &&
		(x.steps === undefined || Array.isArray(x.steps))
	);
}

/** Never throws: bad JSON or a wrong shape yields fewer entries, at worst none. */
export function parse(raw: string | null, now: number): ActivityEntry[] {
	if (!raw) return [];
	try {
		const data: unknown = JSON.parse(raw);
		if (!Array.isArray(data)) return [];
		return data.filter((e) => valid(e) && now - e.timestamp <= MAX_AGE_MS);
	} catch {
		return [];
	}
}
