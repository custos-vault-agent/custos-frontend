import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AgentSealBadge } from "#/components/AgentSealBadge";
import { TextInput } from "#/components/ui/fields";
import { Chip, Empty, Label } from "#/components/ui/primitives";
import { useStore } from "#/lib/store";
import type { Agent } from "#/lib/types";

export const Route = createFileRoute("/")({
	component: MarketplacePage,
});

type Sort = "sharePrice" | "tvl" | "subscribers" | "newest";

const SORTS: { id: Sort; label: string }[] = [
	{ id: "sharePrice", label: "share price" },
	{ id: "tvl", label: "tvl" },
	{ id: "subscribers", label: "subscribers" },
	{ id: "newest", label: "newest" },
];

function subscriberCount(
	agent: Agent,
	positionsByAgent: Map<string, number>,
): number {
	return positionsByAgent.get(agent.id) ?? 0;
}

function compare(
	sort: Sort,
	a: Agent,
	b: Agent,
	positionsByAgent: Map<string, number>,
): number {
	switch (sort) {
		case "sharePrice":
			return b.vault.sharePrice - a.vault.sharePrice;
		case "tvl":
			return b.vault.totalAssets - a.vault.totalAssets;
		case "subscribers":
			return (
				subscriberCount(b, positionsByAgent) -
				subscriberCount(a, positionsByAgent)
			);
		case "newest":
			return b.registeredAt - a.registeredAt;
	}
}

function MarketplacePage() {
	const { agents, agentsLoading, positions } = useStore();
	const [query, setQuery] = useState("");
	const [sort, setSort] = useState<Sort>("tvl");

	const positionsByAgent = useMemo(() => {
		const map = new Map<string, number>();
		for (const p of positions) {
			if (p.shares <= 0) continue;
			map.set(p.agentId, (map.get(p.agentId) ?? 0) + 1);
		}
		return map;
	}, [positions]);

	const visible = useMemo(() => {
		const needle = query.trim().toLowerCase();
		return agents
			.filter((agent) => agent.isPublic)
			.filter(
				(agent) =>
					needle === "" ||
					agent.name.toLowerCase().includes(needle) ||
					agent.description.toLowerCase().includes(needle) ||
					agent.agentAddress.toLowerCase().includes(needle),
			)
			.slice()
			.sort((a, b) => compare(sort, a, b, positionsByAgent));
	}, [agents, query, sort, positionsByAgent]);

	return (
		<div>
			<div className="mb-3 flex flex-wrap items-center gap-2">
				<TextInput
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					placeholder="Search vaults"
					aria-label="Search vaults"
					className="w-full sm:w-[260px]"
				/>
				<div className="flex flex-wrap items-center gap-2">
					<Label>sort</Label>
					{SORTS.map((option) => (
						<Chip
							key={option.id}
							active={sort === option.id}
							onClick={() => setSort(option.id)}
						>
							{option.label}
						</Chip>
					))}
				</div>
				<span className="ml-auto text-[17px] text-dim">
					{visible.length} listed
				</span>
			</div>

			{agentsLoading ? (
				<Empty
					title="Loading agents…"
					hint="Fetching the marketplace from chain."
				/>
			) : visible.length === 0 ? (
				<Empty
					title="No vault matches that"
					hint="Every public agent is listed here. Try a name, a description, or an address."
				/>
			) : (
				<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
					{visible.map((agent) => (
						<Link
							key={agent.id}
							to="/agents/$agentId"
							params={{ agentId: agent.id }}
						>
							<AgentSealBadge
								agent={agent}
								subscriberCount={subscriberCount(agent, positionsByAgent)}
							/>
						</Link>
					))}
				</div>
			)}
		</div>
	);
}
