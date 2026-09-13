import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AgentSealBadge } from "#/components/AgentSealBadge";
import { AgentProfilePanel } from "#/components/agents/AgentProfilePanel";
import { TextInput } from "#/components/ui/fields";
import { Chip, Empty, Label } from "#/components/ui/primitives";
import { useStore } from "#/lib/store";
import type { Agent } from "#/lib/types";

export const Route = createFileRoute("/agents")({
	component: AgentsPage,
});

type Sort = "volume" | "trades" | "allowance" | "newest";

const SORTS: { id: Sort; label: string }[] = [
	{ id: "volume", label: "volume" },
	{ id: "trades", label: "trades" },
	{ id: "allowance", label: "allowance" },
	{ id: "newest", label: "newest" },
];

function compare(sort: Sort, a: Agent, b: Agent): number {
	switch (sort) {
		case "volume":
			return b.stats.volume30d - a.stats.volume30d;
		case "trades":
			return b.stats.trades30d - a.stats.trades30d;
		case "allowance":
			return b.allowance - a.allowance;
		case "newest":
			return b.registeredAt - a.registeredAt;
	}
}

function AgentsPage() {
	const { agents } = useStore();
	const [query, setQuery] = useState("");
	const [sort, setSort] = useState<Sort>("volume");
	const [selectedId, setSelectedId] = useState<string | null>(null);

	const visible = useMemo(() => {
		const needle = query.trim().toLowerCase();
		return agents
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

	const selected = agents.find((a) => a.id === selectedId) ?? null;

	return (
		<div className="flex flex-col gap-4 lg:flex-row lg:items-start">
			<div className="min-w-0 lg:flex-1">
				<div className="mb-3 flex flex-wrap items-center gap-2">
					<TextInput
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="Search agents"
						aria-label="Search agents"
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
						{visible.length} registered
					</span>
				</div>

				{visible.length === 0 ? (
					<Empty
						title="No agent matches that"
						hint="Every registered agent is public. Try a name, a description, or an address."
					/>
				) : (
					<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
						{visible.map((agent) => (
							<AgentSealBadge
								key={agent.id}
								agent={agent}
								selected={agent.id === selectedId}
								onSelect={() =>
									setSelectedId((id) => (id === agent.id ? null : agent.id))
								}
							/>
						))}
					</div>
				)}
			</div>

			{selected ? (
				<aside className="w-full lg:sticky lg:top-[70px] lg:w-[370px] lg:shrink-0">
					<AgentProfilePanel
						agent={selected}
						onClose={() => setSelectedId(null)}
					/>
				</aside>
			) : null}
		</div>
	);
}
