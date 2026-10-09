import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AgentSealBadge } from "#/components/AgentSealBadge";
import { TextInput } from "#/components/ui/fields";
import { Chip, Empty, Label, SkeletonCard } from "#/components/ui/primitives";
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

function compare(sort: Sort, a: Agent, b: Agent): number {
	switch (sort) {
		case "sharePrice":
			return b.vault.sharePrice - a.vault.sharePrice;
		case "tvl":
			return b.vault.totalAssets - a.vault.totalAssets;
		case "subscribers":
			return b.stats.subscribers - a.stats.subscribers;
		case "newest":
			return b.registeredAt - a.registeredAt;
	}
}

function MarketplacePage() {
	const { agents, agentsLoading } = useStore();
	const [query, setQuery] = useState("");
	const [sort, setSort] = useState<Sort>("tvl");

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
			.sort((a, b) => compare(sort, a, b));
	}, [agents, query, sort]);

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
				<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
					{[0, 1, 2].map((i) => (
						<SkeletonCard key={i} style={{ animationDelay: `${i * 40}ms` }} />
					))}
				</div>
			) : visible.length === 0 ? (
				<Empty
					title="No vault matches that"
					hint="Every public agent is listed here. Try a name, a description, or an address."
				/>
			) : (
				<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
					{visible.map((agent, i) => (
						<Link
							key={agent.id}
							to="/agents/$agentId"
							params={{ agentId: agent.id }}
						>
							<AgentSealBadge
								agent={agent}
								subscriberCount={agent.stats.subscribers}
								// 40ms per card, capped: past the first screen it would only delay.
								style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
							/>
						</Link>
					))}
				</div>
			)}
		</div>
	);
}
