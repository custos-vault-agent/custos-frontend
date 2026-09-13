import type { ReactNode } from "react";
import { formatCompactUsd, formatPercent, shortAddress } from "#/lib/format";
import type { Agent } from "#/lib/types";
import { AllowanceMeter, AllowanceReadout } from "./ui/meters";
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
 * One component, three homes: the public directory, the owner's profile, and
 * (as a sigil alone) the actor cell in activity rows. Reusing it is what makes
 * an agent feel like the same entity wherever it turns up, rather than three
 * different records that happen to share a name.
 */
export function AgentSealBadge({
	agent,
	onSelect,
	selected,
	actions,
	showStats = true,
}: {
	agent: Agent;
	onSelect?: () => void;
	selected?: boolean;
	actions?: ReactNode;
	showStats?: boolean;
}) {
	const paused = agent.status === "paused";
	const over = agent.used > agent.allowance;
	const fresh = agent.stats.trades30d === 0;

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

			<div className="mt-2">
				<AllowanceMeter used={agent.used} allowance={agent.allowance} />
				<div className="mt-1 flex items-center gap-2">
					<AllowanceReadout used={agent.used} allowance={agent.allowance} />
					{paused ? (
						<span className="ml-auto">
							<StatusPill>paused</StatusPill>
						</span>
					) : over ? (
						<span className="ml-auto">
							<StatusPill tone="fail">blocked</StatusPill>
						</span>
					) : null}
				</div>
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
								label="30d vol"
								value={formatCompactUsd(agent.stats.volume30d)}
							/>
							<Stat
								label="trades"
								value={agent.stats.trades30d.toLocaleString("en-US")}
							/>
							<Stat
								label="30d pnl"
								value={formatPercent(agent.stats.pnl30d, 1)}
								tone={agent.stats.pnl30d < 0 ? "text-sell" : "text-accent"}
							/>
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
		return <Card className={shell}>{body}</Card>;
	}

	return (
		<Card className={cx(shell, "hover:border-accent")}>
			{/* The card is clickable, but the action row inside it must not be
			    swallowed by that click — so the button is an overlay, not a wrapper. */}
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
