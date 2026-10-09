import type { CSSProperties, ReactNode } from "react";
import {
	formatCompactUsd,
	formatPercent,
	formatPrice,
	livenessPill,
	shortAddress,
} from "#/lib/format";
import type { Agent } from "#/lib/types";
import { NansenBadgeChip } from "./NansenBadge";
import { ReserveRatioBar, SharePriceSpark } from "./ui/meters";
import { Card, cx, Label, Led, StatusPill } from "./ui/primitives";
import { Sigil } from "./ui/Sigil";

function Stat({
	label,
	value,
	tone,
}: {
	label: string;
	value: string;
	tone?: string;
}) {
	return (
		<div className="flex-1">
			<div className={cx("tnum text-[20px]", tone)}>{value}</div>
			<Label className="text-[14px] tracking-[1px]">{label}</Label>
		</div>
	);
}

/**
 * One component, three homes: the marketplace, the owner's profile, and (as
 * a sigil alone) the actor cell in activity rows. Reusing it is what makes
 * an agent feel like the same entity wherever it turns up.
 */
export function AgentSealBadge({
	agent,
	onSelect,
	selected,
	actions,
	showStats = true,
	subscriberCount,
	style,
}: {
	agent: Agent;
	onSelect?: () => void;
	selected?: boolean;
	actions?: ReactNode;
	showStats?: boolean;
	/** Lets a list stagger `animate-enter` via animationDelay. */
	style?: CSSProperties;
	/** Omit on the profile page (not meaningful there) — only the marketplace
	 *  card passes this. */
	subscriberCount?: number;
}) {
	const paused = agent.status === "paused";
	const liveness = livenessPill(agent);
	const fresh = agent.vault.sharePriceHistory.length < 2;
	const sharePriceChangePct =
		((agent.vault.sharePrice - agent.vault.sharePriceHistory[0].price) /
			agent.vault.sharePriceHistory[0].price) *
		100;
	const reserved =
		agent.vault.totalAssets * (agent.vault.maxUtilizationBps / 10_000);
	const utilized = agent.vault.totalAssets - reserved;

	const body = (
		<>
			<span
				aria-hidden
				className="absolute right-2 top-1 text-[21px] text-edge"
				title="Custos seal"
			>
				⊂
			</span>

			<div className="flex items-start gap-3">
				<Sigil address={agent.agentAddress} size="lg" interactive />
				<div className="min-w-0">
					<div className="flex items-center gap-2">
						<span className="truncate text-[21px]">{agent.name}</span>
						<Led on={!paused} />
					</div>
					<div className="truncate text-[16px] text-dim">
						{shortAddress(agent.agentAddress)}
					</div>
				</div>
			</div>

			<p className="mt-2 line-clamp-2 min-h-[2.5em] text-[17px] text-dim">
				{agent.description}
			</p>

			<div className="mt-2 flex items-center gap-2">
				<NansenBadgeChip nansen={agent.nansen} />
				{agent.vault.circuitBreakerTripped ? (
					<StatusPill tone="fail">breaker tripped</StatusPill>
				) : paused ? (
					<StatusPill>paused</StatusPill>
				) : liveness ? (
					<StatusPill tone={liveness.tone}>{liveness.label}</StatusPill>
				) : null}
			</div>

			<div className="mt-2 flex items-end justify-between gap-3">
				<div>
					<div
						className={cx(
							"tnum text-[21px]",
							sharePriceChangePct < 0 ? "text-sell" : "text-accent",
						)}
					>
						{formatPrice(agent.vault.sharePrice)}
					</div>
					<Label className="text-[14px] tracking-[1px]">
						share price {fresh ? "" : formatPercent(sharePriceChangePct, 1)}
					</Label>
				</div>
				<SharePriceSpark history={agent.vault.sharePriceHistory} />
			</div>

			<div className="mt-2">
				<ReserveRatioBar utilized={utilized} reserved={reserved} />
				<Label className="mt-1 text-[14px] tracking-[1px]">
					{(100 - agent.vault.maxUtilizationBps / 100).toFixed(0)}% reserved
				</Label>
			</div>

			{showStats ? (
				<div className="mt-2 flex gap-3 border-t border-edge pt-2">
					{fresh ? (
						<div className="text-[17px] text-dim">
							No track record yet · registered just now
						</div>
					) : (
						<>
							<Stat
								label="TVL"
								value={formatCompactUsd(agent.vault.totalAssets)}
							/>
							<Stat
								label="fee"
								value={`${(agent.vault.feeRateBps / 100).toFixed(1)}%`}
							/>
							{subscriberCount !== undefined ? (
								<Stat label="subscribers" value={String(subscriberCount)} />
							) : (
								<Stat
									label="30d vol"
									value={formatCompactUsd(agent.stats.volume30d)}
								/>
							)}
						</>
					)}
				</div>
			) : null}

			{actions ? <div className="mt-2 flex gap-2">{actions}</div> : null}
		</>
	);

	const shell = cx(
		"relative block w-full animate-enter p-3 text-left",
		selected && "border-accent",
		paused && "opacity-70",
	);

	if (!onSelect) {
		return (
			<Card className={shell} style={style}>
				{body}
			</Card>
		);
	}

	return (
		<Card className={cx(shell, "hover:border-accent")} style={style}>
			<button
				type="button"
				onClick={onSelect}
				aria-label={`Open ${agent.name}`}
				className="absolute inset-0 z-0 cursor-pointer"
			/>
			<div className="pointer-events-none relative z-10 [&_a]:pointer-events-auto [&_button]:pointer-events-auto">
				{body}
			</div>
		</Card>
	);
}
