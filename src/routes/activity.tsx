import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ActivityRow } from "#/components/activity/ActivityRow";
import { FillBar } from "#/components/ui/meters";
import {
	Button,
	Card,
	CardHeader,
	Chip,
	Empty,
	StatusPill,
} from "#/components/ui/primitives";
import { Sigil } from "#/components/ui/Sigil";
import { formatAmount, formatDay, formatPrice } from "#/lib/format";
import { useStore } from "#/lib/store";
import type { ActivityEntry, ActivityKind } from "#/lib/types";

export const Route = createFileRoute("/activity")({
	component: ActivityPage,
});

type Filter = "all" | "swap" | "limit" | "funds" | "agent";

const FILTERS: { id: Filter; label: string }[] = [
	{ id: "all", label: "all" },
	{ id: "swap", label: "swap" },
	{ id: "limit", label: "limit" },
	{ id: "funds", label: "funds" },
	{ id: "agent", label: "by agent" },
];

const FUNDS: ActivityKind[] = ["deposit", "withdraw"];

function matches(filter: Filter, entry: ActivityEntry): boolean {
	switch (filter) {
		case "all":
			return true;
		case "swap":
			return entry.kind === "swap";
		case "limit":
			return entry.kind === "limit";
		case "funds":
			return FUNDS.includes(entry.kind);
		case "agent":
			return entry.actor.kind === "agent";
	}
}

function ActivityPage() {
	const { inFlight, openOrders, history, cancelOrder } = useStore();
	const [filter, setFilter] = useState<Filter>("all");

	const rows = useMemo(
		() => history.filter((entry) => matches(filter, entry)),
		[history, filter],
	);

	const attention = inFlight.length + openOrders.length;

	return (
		<div className="space-y-4">
			{/* ------------------------- in flight ------------------------- */}
			<Card>
				<CardHeader
					title="In flight"
					meta={
						attention === 0
							? "nothing pending"
							: `${attention} need${attention === 1 ? "s" : ""} attention`
					}
				/>

				{attention === 0 ? (
					<Empty
						title="Nothing in flight"
						hint="Swaps still resolving and orders still resting show up here."
					/>
				) : (
					<div>
						{inFlight.map((entry) => (
							<ActivityRow key={entry.id} entry={entry} defaultOpen />
						))}

						{openOrders.map((order) => (
							<div
								key={order.id}
								className="animate-enter border-b border-edge px-3 py-2 last:border-b-0"
							>
								<div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
									<span className="tnum shrink-0 text-[17px] text-dim">
										{formatDay(order.createdAt)}
									</span>
									<span className="flex shrink-0 items-center gap-2">
										<Sigil
											address={order.actor.address}
											size="xs"
											tone="owner"
										/>
										<span className="text-[17px]">{order.actor.name}</span>
									</span>
									<span className="min-w-0 flex-1 basis-full text-[18px] lg:basis-auto">
										Limit {order.side} {order.pair} @ {formatPrice(order.price)}
									</span>
									<span className="tnum ml-auto shrink-0 text-[18px]">
										{formatAmount(order.total)} MON
									</span>
									<StatusPill tone={order.filled > 0 ? "progress" : "neutral"}>
										{order.filled > 0
											? `partial ${Math.round((order.filled / order.total) * 100)}%`
											: "resting"}
									</StatusPill>
									<Button size="sm" onClick={() => cancelOrder(order.id)}>
										Cancel
									</Button>
								</div>
								{order.filled > 0 ? (
									<div className="mt-1 max-w-[280px]">
										<FillBar filled={order.filled} total={order.total} />
									</div>
								) : null}
							</div>
						))}
					</div>
				)}
			</Card>

			{/* -------------------------- history -------------------------- */}
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
						hint="Owner actions and agent actions share one stream, so cause and effect stay next to each other."
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
