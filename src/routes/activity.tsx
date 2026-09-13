import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ActivityRow } from "#/components/activity/ActivityRow";
import { Card, CardHeader, Chip, Empty } from "#/components/ui/primitives";
import { useStore } from "#/lib/store";
import type { ActivityEntry, ActivityKind } from "#/lib/types";

export const Route = createFileRoute("/activity")({
	component: ActivityPage,
});

type Filter = "all" | "subscribe" | "redeem" | "agent-trade" | "vault-config";

const FILTERS: { id: Filter; label: string }[] = [
	{ id: "all", label: "all" },
	{ id: "subscribe", label: "subscribe" },
	{ id: "redeem", label: "redeem" },
	{ id: "agent-trade", label: "agent trade" },
	{ id: "vault-config", label: "vault config" },
];

const VAULT_CONFIG_KINDS: ActivityKind[] = [
	"vault-config",
	"seed-deposit",
	"fee-mint",
	"circuit-breaker",
];

function matches(filter: Filter, entry: ActivityEntry): boolean {
	switch (filter) {
		case "all":
			return true;
		case "subscribe":
			return entry.kind === "subscribe";
		case "redeem":
			return entry.kind === "redeem";
		case "agent-trade":
			return entry.kind === "agent-trade";
		case "vault-config":
			return VAULT_CONFIG_KINDS.includes(entry.kind);
	}
}

function ActivityPage() {
	const { inFlight, history } = useStore();
	const [filter, setFilter] = useState<Filter>("all");

	const rows = useMemo(
		() => history.filter((entry) => matches(filter, entry)),
		[history, filter],
	);

	return (
		<div className="space-y-4">
			<Card>
				<CardHeader
					title="In flight"
					meta={
						inFlight.length === 0
							? "nothing pending"
							: `${inFlight.length} moving`
					}
				/>
				{inFlight.length === 0 ? (
					<Empty
						title="Nothing in flight"
						hint="Cross-chain subscribes still resolving show up here."
					/>
				) : (
					<div>
						{inFlight.map((entry) => (
							<ActivityRow key={entry.id} entry={entry} defaultOpen />
						))}
					</div>
				)}
			</Card>

			<Card>
				<CardHeader title="History" meta={`${rows.length} records`}>
					<div className="flex flex-wrap items-center gap-2">
						{FILTERS.map((option) => (
							<Chip
								key={option.id}
								active={filter === option.id}
								onClick={() => setFilter(option.id)}
							>
								{option.label}
							</Chip>
						))}
					</div>
				</CardHeader>

				{rows.length === 0 ? (
					<Empty
						title="No records under this filter"
						hint="Creator actions and agent actions share one stream, so cause and effect stay next to each other."
					/>
				) : (
					<div>
						{rows.map((entry) => (
							<ActivityRow key={entry.id} entry={entry} />
						))}
					</div>
				)}
			</Card>
		</div>
	);
}
