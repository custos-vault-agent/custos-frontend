import { useState } from "react";
import { FillBar } from "#/components/ui/meters";
import type { PillTone } from "#/components/ui/primitives";
import { cx, StatusPill } from "#/components/ui/primitives";
import { RouteStepper } from "#/components/ui/route";
import { Sigil } from "#/components/ui/Sigil";
import { formatClock, formatDay, isToday } from "#/lib/format";
import type { ActivityEntry } from "#/lib/types";

function statusPill(entry: ActivityEntry): { tone: PillTone; label: string } {
	if (entry.status === "in-progress") {
		const steps = entry.steps ?? [];
		const done = steps.filter((s) => s.state === "done").length;
		return {
			tone: "progress",
			label: steps.length ? `step ${done + 1}/${steps.length}` : "in progress",
		};
	}
	if (entry.status === "failed") return { tone: "fail", label: "failed" };
	if (entry.status === "cancelled")
		return { tone: "neutral", label: "cancelled" };
	if (entry.status === "recorded")
		return { tone: "neutral", label: "recorded" };
	if (entry.fill && entry.fill.filled < entry.fill.total) {
		return {
			tone: "progress",
			label: `partial ${Math.round((entry.fill.filled / entry.fill.total) * 100)}%`,
		};
	}
	return { tone: "ok", label: "filled" };
}

function Time({ timestamp }: { timestamp: number }) {
	return (
		<span className="tnum shrink-0 text-[17px] text-dim">
			{isToday(timestamp) ? formatClock(timestamp) : formatDay(timestamp)}
		</span>
	);
}

/**
 * Every row carries an actor sigil — owner in ink, agent in accent. This route
 * is the only place the product's core claim can actually be audited, so
 * "who did this" is never left to be inferred from context.
 */
export function ActivityRow({
	entry,
	defaultOpen = false,
}: {
	entry: ActivityEntry;
	defaultOpen?: boolean;
}) {
	const [open, setOpen] = useState(defaultOpen);

	const pill = statusPill(entry);
	const isAgent = entry.actor.kind === "agent";
	const grouped = (entry.groupCount ?? 0) > 1;
	const expandable = grouped || (entry.steps?.length ?? 0) > 0;

	return (
		<div
			className={cx(
				"animate-enter border-b border-edge px-3 py-2 last:border-b-0",
				entry.status === "failed" && "bg-sell/5",
			)}
		>
			{/* Below lg this reflows to two lines rather than shrinking to
			    unreadable columns — a phone gets fewer rows, not smaller ones. */}
			<div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 lg:flex-nowrap">
				<Time timestamp={entry.timestamp} />

				<span className="flex min-w-0 shrink-0 items-center gap-2 lg:w-[172px]">
					<Sigil
						address={entry.actor.address}
						size="xs"
						tone={isAgent ? "agent" : "owner"}
					/>
					<span
						className={cx(
							"truncate text-[17px]",
							isAgent ? "text-accent" : "text-ink",
						)}
					>
						{entry.actor.name}
					</span>
				</span>

				<span className="min-w-0 flex-1 basis-full lg:basis-auto">
					<span className="block truncate text-[18px]">
						{entry.title}
						{grouped ? (
							<span className="ml-2 text-dim">· {entry.groupCount} trades</span>
						) : null}
					</span>
					{entry.subtitle ? (
						<span className="block truncate text-[16px] text-dim">
							{entry.subtitle}
						</span>
					) : null}
					{entry.reason ? (
						<span className="block truncate text-[16px] text-sell">
							rejected · {entry.reason}
						</span>
					) : null}
				</span>

				<span className="ml-auto shrink-0 text-right">
					<span className="tnum block text-[18px]">{entry.amount}</span>
					{entry.amountSub ? (
						<span className="tnum block text-[16px] text-dim">
							{entry.amountSub}
						</span>
					) : null}
				</span>

				<span className="shrink-0">
					<StatusPill tone={pill.tone}>{pill.label}</StatusPill>
				</span>

				{expandable ? (
					<button
						type="button"
						onClick={() => setOpen((v) => !v)}
						aria-expanded={open}
						className="shrink-0 px-1 text-[17px] text-dim hover:text-ink"
					>
						{open ? "▾" : "▸"}
					</button>
				) : (
					<span className="w-[18px] shrink-0" aria-hidden />
				)}
			</div>

			{entry.fill && entry.fill.filled < entry.fill.total ? (
				<div className="mt-1 max-w-[280px]">
					<FillBar filled={entry.fill.filled} total={entry.fill.total} />
				</div>
			) : null}

			{open && entry.steps?.length ? (
				<div className="mt-2 border-l-2 border-edge pl-3">
					<RouteStepper steps={entry.steps} />
				</div>
			) : null}

			{open && entry.groupChildren?.length ? (
				<ul className="mt-2 space-y-1 border-l-2 border-edge pl-3">
					{entry.groupChildren.map((child) => (
						<li
							key={child.id}
							className="flex items-baseline gap-3 text-[17px]"
						>
							<Time timestamp={child.timestamp} />
							<span className="truncate">{child.title}</span>
							<span className="tnum ml-auto shrink-0 text-dim">
								{child.amount}
							</span>
						</li>
					))}
				</ul>
			) : null}
		</div>
	);
}
