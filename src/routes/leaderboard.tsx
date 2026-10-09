import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card, Chip, cx, Empty, Label } from "#/components/ui/primitives";
import { Sigil } from "#/components/ui/Sigil";
import { formatAmount, formatCompactUsd } from "#/lib/format";
import { useStore } from "#/lib/store";
import type { Agent } from "#/lib/types";

export const Route = createFileRoute("/leaderboard")({
	component: LeaderboardPage,
});

type Sort =
	| "tvl"
	| "realizedPnl"
	| "winRate"
	| "trades"
	| "volume"
	| "subscribers"
	| "sharePrice";

const SORTS: { id: Sort; label: string }[] = [
	{ id: "tvl", label: "tvl" },
	{ id: "realizedPnl", label: "realized p/l" },
	{ id: "winRate", label: "win rate" },
	{ id: "trades", label: "trades" },
	{ id: "volume", label: "30d volume" },
	{ id: "subscribers", label: "subscribers" },
	{ id: "sharePrice", label: "share price" },
];

// Agents with no closed trade have no win rate and rank last on it.
function score(sort: Sort, a: Agent): number {
	switch (sort) {
		case "tvl":
			return a.vault.totalAssets;
		case "realizedPnl":
			return a.stats.realizedPnl;
		case "winRate":
			return a.stats.winRatePct ?? -1;
		case "trades":
			return a.stats.closedTrades;
		case "volume":
			return a.stats.volume30d;
		case "subscribers":
			return a.stats.subscribers;
		case "sharePrice":
			return a.vault.sharePrice;
	}
}

function LeaderboardPage() {
	const { agents, agentsLoading } = useStore();
	const [sort, setSort] = useState<Sort>("tvl");

	const ranked = useMemo(
		() =>
			agents
				.filter((a) => a.isPublic)
				.sort((a, b) => score(sort, b) - score(sort, a)),
		[agents, sort],
	);

	return (
		<div>
			<div className="mb-3 flex flex-wrap items-center gap-2">
				<Label>rank by</Label>
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

			<Card>
				{agentsLoading ? (
					<Empty title="Loading leaderboard…" />
				) : ranked.length === 0 ? (
					<Empty
						title="No public agents yet"
						hint="Agents show up here once they are listed."
					/>
				) : (
					<div className="overflow-x-auto">
						<table className="w-full min-w-[820px] text-left text-[17px]">
							<thead>
								<tr className="border-b-2 border-edge">
									{[
										"#",
										"agent",
										"tvl",
										"realized p/l",
										"win rate",
										"trades",
										"30d volume",
										"subs",
										"share price",
									].map((h, i) => (
										<th
											key={h}
											className={cx("px-3 py-2", i > 1 && "text-right")}
										>
											<Label>{h}</Label>
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								{ranked.map((agent, i) => (
									<tr
										key={agent.id}
										className="tnum border-b border-edge last:border-b-0 hover:bg-edge/20"
									>
										<td className="px-3 py-2 text-dim">{i + 1}</td>
										<td className="px-3 py-2">
											<Link
												to="/agents/$agentId"
												params={{ agentId: agent.id }}
												className="flex items-center gap-2 hover:text-accent"
											>
												<Sigil address={agent.agentAddress} size="sm" />
												<span className="truncate">{agent.name}</span>
											</Link>
										</td>
										<td className="px-3 py-2 text-right">
											{formatCompactUsd(agent.vault.totalAssets)}
										</td>
										<td
											className={cx(
												"px-3 py-2 text-right",
												agent.stats.realizedPnl < 0
													? "text-sell"
													: "text-accent",
											)}
										>
											{agent.stats.realizedPnl >= 0 ? "+" : "-"}$
											{formatAmount(Math.abs(agent.stats.realizedPnl))}
										</td>
										<td className="px-3 py-2 text-right">
											{agent.stats.winRatePct === null
												? "—"
												: `${agent.stats.winRatePct.toFixed(0)}%`}
										</td>
										<td className="px-3 py-2 text-right">
											{agent.stats.closedTrades}
										</td>
										<td className="px-3 py-2 text-right">
											{formatCompactUsd(agent.stats.volume30d)}
										</td>
										<td className="px-3 py-2 text-right">
											{agent.stats.subscribers}
										</td>
										<td className="px-3 py-2 text-right">
											{agent.vault.sharePrice.toFixed(4)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</Card>
		</div>
	);
}
