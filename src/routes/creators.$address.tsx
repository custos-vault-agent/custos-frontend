import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { NansenBadgeChip } from "#/components/NansenBadge";
import {
	Card,
	CardHeader,
	cx,
	Empty,
	Label,
	StatusPill,
} from "#/components/ui/primitives";
import { Sigil } from "#/components/ui/Sigil";
import { monadChain } from "#/lib/chain";
import {
	formatAmount,
	formatCompactUsd,
	formatDay,
	formatPercent,
	shortAddress,
} from "#/lib/format";
import { fetchIndexedAttestations } from "#/lib/indexer";
import { useStore } from "#/lib/store";

export const Route = createFileRoute("/creators/$address")({
	component: CreatorPage,
});

function CreatorPage() {
	const { address } = Route.useParams();
	const { agents, agentsLoading } = useStore();
	const { data: attestations } = useQuery({
		queryKey: ["attestations", monadChain.id, address.toLowerCase()],
		queryFn: () => fetchIndexedAttestations(monadChain.id, address),
		retry: false,
	});

	const mine = agents.filter(
		(a) => a.creatorAddress.toLowerCase() === address.toLowerCase(),
	);
	const back = (
		<Link
			to="/"
			className="inline-block text-[17px] uppercase tracking-[1px] text-dim hover:text-ink"
		>
			← Marketplace
		</Link>
	);
	if (mine.length === 0) {
		return (
			<div className="space-y-4">
				{back}
				<Card>
					<Empty
						title={agentsLoading ? "Loading creator…" : "No agents"}
						hint={
							agentsLoading
								? undefined
								: "This address has registered no agents."
						}
					/>
				</Card>
			</div>
		);
	}

	const indexed = mine.every((a) => a.stats.indexed);
	const revoked = mine.filter((a) => a.status === "revoked").length;
	const tripped = mine.filter(
		(a) => (a.behaviour?.breakerCount ?? 0) > 0,
	).length;
	const idle = mine.filter((a) => a.behaviour?.swapCount === 0).length;
	const tvl = mine.reduce((s, a) => s + a.vault.totalAssets, 0);
	const pnl = mine.reduce((s, a) => s + a.stats.realizedPnl, 0);
	const subs = mine.reduce((s, a) => s + a.stats.subscribers, 0);
	const since = Math.min(...mine.map((a) => a.registeredAt));
	const days = Math.floor((Date.now() - since) / 86_400_000);
	const stat = (value: string, label: string, tone?: string) => (
		<div>
			<div className={cx("tnum text-[20px]", tone)}>{value}</div>
			<Label className="text-[14px] tracking-[1px]">{label}</Label>
		</div>
	);

	return (
		<div className="max-w-[760px] space-y-4">
			{back}
			<Card>
				<div className="space-y-3 p-3">
					<div className="flex items-center gap-3">
						<Sigil address={address} size="lg" tone="owner" />
						<div className="min-w-0">
							<div className="truncate text-[23px]" title={address}>
								{shortAddress(address, 10, 6)}
							</div>
							<Label>creator · {days}d since first agent</Label>
						</div>
					</div>
					<div className="grid grid-cols-2 gap-3 border-t border-edge pt-2 sm:grid-cols-4">
						{stat(String(mine.length), "agents")}
						{stat(String(revoked), "revoked")}
						{stat(indexed ? String(tripped) : "—", "breaker trips")}
						{stat(indexed ? String(idle) : "—", "never traded")}
					</div>
					<div className="grid grid-cols-2 gap-3 border-t border-edge pt-2 sm:grid-cols-4">
						{stat(formatCompactUsd(tvl), "combined tvl")}
						{indexed
							? stat(
									`${pnl >= 0 ? "+" : "-"}$${formatAmount(Math.abs(pnl))}`,
									"realized p/l",
									pnl < 0 ? "text-sell" : "text-accent",
								)
							: stat("—", "realized p/l")}
						{indexed
							? stat(String(subs), "subscribers")
							: stat("—", "subscribers")}
					</div>
					<div className="border-t border-edge pt-2">
						<NansenBadgeChip nansen={mine[0].nansen} size="lg" />
					</div>
				</div>
			</Card>

			<Card>
				<CardHeader title="Agents" meta={`${mine.length}`} />
				<div className="divide-y divide-edge">
					{mine.map((a) => (
						<Link
							key={a.id}
							to="/agents/$agentId"
							params={{ agentId: a.id }}
							className="flex items-center gap-3 p-3 text-[17px] hover:bg-surface2"
						>
							<Sigil address={a.agentAddress} size="sm" />
							<span className="min-w-0 flex-1 truncate">{a.name}</span>
							{!a.isPublic ? <StatusPill>unlisted</StatusPill> : null}
							<StatusPill
								tone={
									a.status === "revoked"
										? "fail"
										: a.status === "paused"
											? "neutral"
											: "ok"
								}
							>
								{a.status}
							</StatusPill>
							<span className="tnum w-[64px] text-right">
								{a.vault.sharePrice.toFixed(4)}
							</span>
							<span className="tnum w-[64px] text-right text-dim">
								{formatCompactUsd(a.vault.totalAssets)}
							</span>
						</Link>
					))}
				</div>
			</Card>

			<Card>
				<CardHeader title="Attestation history" />
				{!attestations || attestations.length === 0 ? (
					<Empty
						title={attestations ? "No attestations" : "History unavailable"}
						hint={
							attestations
								? undefined
								: "Attestation history needs the indexer."
						}
					/>
				) : (
					<div className="divide-y divide-edge">
						{attestations.map((t) => (
							<div
								key={t.timestamp}
								className="tnum flex items-center gap-3 p-3 text-[17px]"
							>
								<span className="w-[64px] shrink-0 text-dim">
									{formatDay(t.timestamp * 1000)}
								</span>
								<span className="min-w-0 flex-1 truncate">{t.label}</span>
								<span className={t.pnl < 0 ? "text-sell" : "text-accent"}>
									{formatCompactUsd(t.pnl)}
								</span>
								<span className="w-[56px] text-right">
									{formatPercent(t.winRate, 0)}
								</span>
							</div>
						))}
					</div>
				)}
			</Card>
		</div>
	);
}
