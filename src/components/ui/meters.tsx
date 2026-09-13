import { formatAmount } from "#/lib/format";
import { cx } from "./primitives";

const SEGMENT_STAGGER_MS = 40;

function Segment({
	filled,
	tone,
	index,
	tall,
	animate,
}: {
	filled: boolean;
	tone: "accent" | "warn" | "sell";
	index: number;
	tall?: boolean;
	animate?: boolean;
}) {
	const fill =
		tone === "sell" ? "bg-sell" : tone === "warn" ? "bg-warn" : "bg-accent";
	return (
		<span
			className={cx(
				"flex-1 origin-left",
				tall ? "h-[13px]" : "h-[9px]",
				filled ? fill : "bg-edge",
			)}
			style={
				animate && filled
					? {
							animation: "segment-in 120ms steps(2, end) both",
							animationDelay: `${index * SEGMENT_STAGGER_MS}ms`,
						}
					: undefined
			}
		/>
	);
}

/**
 * The allowance meter is the product's core promise rendered as a shape: the
 * bar has an end, and the agent cannot cross it.
 *
 * Three states matter and each is visually distinct:
 *   normal      accent segments
 *   near cap    segments past 85% turn warn, so "about to be blocked" is
 *               visible before it happens rather than after
 *   over cap    entirely sell — the owner lowered the cap below current usage,
 *               so the agent is already blocked from opening new positions
 */
export function AllowanceMeter({
	used,
	allowance,
	segments = 10,
	tall = false,
	animate = true,
}: {
	used: number;
	allowance: number;
	segments?: number;
	tall?: boolean;
	animate?: boolean;
}) {
	const over = used > allowance;
	const pct = allowance > 0 ? Math.min(100, (used / allowance) * 100) : 0;

	return (
		<span
			className="flex gap-[2px]"
			role="img"
			aria-label={`${Math.round(pct)}% of allowance used`}
		>
			{Array.from({ length: segments }, (_, i) => {
				const threshold = ((i + 1) / segments) * 100;
				const filled = over || threshold <= pct;
				const tone = over ? "sell" : threshold > 85 ? "warn" : "accent";
				return (
					<Segment
						// biome-ignore lint/suspicious/noArrayIndexKey: fixed-length meter
						key={i}
						index={i}
						filled={filled}
						tone={tone}
						tall={tall}
						animate={animate}
					/>
				);
			})}
		</span>
	);
}

export function AllowanceReadout({
	used,
	allowance,
	symbol = "USDC",
}: {
	used: number;
	allowance: number;
	symbol?: string;
}) {
	const over = used > allowance;
	return (
		<span className={cx("tnum text-[17px]", over ? "text-sell" : "text-dim")}>
			{formatAmount(used)} / {formatAmount(allowance)} {symbol}
			{over ? " · over cap" : ""}
		</span>
	);
}

/* -------------------------------------------------------------------------- */

/** Splits the vault into what agents may touch and what only the owner may. */
export function VaultSplitBar({
	delegated,
	available,
}: {
	delegated: number;
	available: number;
}) {
	const total = delegated + available;
	if (total <= 0) return null;

	return (
		<span className="flex h-[13px] gap-[2px]">
			<span
				className="bg-warn"
				style={{ flexGrow: delegated, flexBasis: 0 }}
				aria-hidden
			/>
			<span
				className="bg-accent"
				style={{ flexGrow: available, flexBasis: 0 }}
				aria-hidden
			/>
		</span>
	);
}

export function VaultLegend({
	delegated,
	available,
	meta,
}: {
	delegated: number;
	available: number;
	meta?: string;
}) {
	return (
		<div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[17px] text-dim">
			<span className="flex items-center gap-2">
				<span className="size-[9px] bg-warn" aria-hidden />
				delegated to agents{" "}
				<b className="tnum font-normal text-ink">{formatAmount(delegated)}</b>
			</span>
			<span className="flex items-center gap-2">
				<span className="size-[9px] bg-accent" aria-hidden />
				available{" "}
				<b className="tnum font-normal text-ink">{formatAmount(available)}</b>
			</span>
			{meta ? <span className="ml-auto">{meta}</span> : null}
		</div>
	);
}

/* -------------------------------------------------------------------------- */

export function FillBar({
	filled,
	total,
	segments = 10,
}: {
	filled: number;
	total: number;
	segments?: number;
}) {
	const pct = total > 0 ? (filled / total) * 100 : 0;
	return (
		<span className="mt-1 flex gap-[2px]">
			{Array.from({ length: segments }, (_, i) => (
				<span
					// biome-ignore lint/suspicious/noArrayIndexKey: fixed-length meter
					key={i}
					className={cx(
						"h-[7px] flex-1",
						((i + 1) / segments) * 100 <= pct ? "bg-accent" : "bg-edge",
					)}
				/>
			))}
		</span>
	);
}

/** Price impact, as severity rather than as a number to interpret. */
export function ImpactMeter({ impact }: { impact: number }) {
	const segments = 12;
	const active = Math.max(1, Math.ceil((impact / 3) * segments));
	const tone =
		impact >= 1.5 ? "bg-sell" : impact >= 0.6 ? "bg-warn" : "bg-accent";

	return (
		<span className="flex gap-[2px]">
			{Array.from({ length: segments }, (_, i) => (
				<span
					// biome-ignore lint/suspicious/noArrayIndexKey: fixed-length meter
					key={i}
					className={cx("h-[7px] flex-1", i < active ? tone : "bg-edge")}
				/>
			))}
		</span>
	);
}
