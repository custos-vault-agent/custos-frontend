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

/** Splits a vault's TVL into what the agent may trade and what must stay
 *  liquid for redemptions — the reserve ratio (spec D24). */
export function ReserveRatioBar({
	utilized,
	reserved,
}: {
	utilized: number;
	reserved: number;
}) {
	const total = utilized + reserved;
	if (total <= 0) return null;

	return (
		<span className="flex h-[13px] gap-[2px]">
			<span
				className="bg-warn"
				style={{ flexGrow: utilized, flexBasis: 0 }}
				aria-hidden
			/>
			<span
				className="bg-accent"
				style={{ flexGrow: reserved, flexBasis: 0 }}
				aria-hidden
			/>
		</span>
	);
}

export function ReserveRatioLegend({
	utilized,
	reserved,
	meta,
}: {
	utilized: number;
	reserved: number;
	meta?: string;
}) {
	return (
		<div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[17px] text-dim">
			<span className="flex items-center gap-2">
				<span className="size-[9px] bg-warn" aria-hidden />
				tradable{" "}
				<b className="tnum font-normal text-ink">{formatAmount(utilized)}</b>
			</span>
			<span className="flex items-center gap-2">
				<span className="size-[9px] bg-accent" aria-hidden />
				reserved{" "}
				<b className="tnum font-normal text-ink">{formatAmount(reserved)}</b>
			</span>
			{meta ? <span className="ml-auto">{meta}</span> : null}
		</div>
	);
}

/**
 * How much drawdown room is left before the circuit breaker trips (D21).
 * Reads like AllowanceMeter but the tone logic is inverted: full green means
 * far from the threshold, and it turns red as the price nears the floor.
 */
export function DrawdownGauge({
	sharePrice,
	highWaterMark,
	maxDrawdownBps,
	tripped,
	segments = 10,
}: {
	sharePrice: number;
	highWaterMark: number;
	maxDrawdownBps: number;
	tripped: boolean;
	segments?: number;
}) {
	if (maxDrawdownBps === 0) {
		return <p className="text-[17px] text-dim">Circuit breaker disabled.</p>;
	}

	const floor = highWaterMark * (1 - maxDrawdownBps / 10_000);
	const room = highWaterMark - floor;
	const used = Math.min(room, Math.max(0, highWaterMark - sharePrice));
	const pct = room > 0 ? (used / room) * 100 : 0;

	return (
		<span
			className="flex gap-[2px]"
			role="img"
			aria-label={
				tripped
					? "circuit breaker tripped"
					: `${Math.round(pct)}% of drawdown budget used`
			}
		>
			{Array.from({ length: segments }, (_, i) => {
				const threshold = ((i + 1) / segments) * 100;
				const filled = tripped || threshold <= pct;
				const tone = tripped ? "sell" : threshold > 70 ? "warn" : "accent";
				return (
					<Segment
						// biome-ignore lint/suspicious/noArrayIndexKey: fixed-length meter
						key={i}
						index={i}
						filled={filled}
						tone={tone}
						tall
						animate={false}
					/>
				);
			})}
		</span>
	);
}

/** A minimal share-price trend line — no chart library, one polyline. Flat
 *  and centered when there's no history yet (a brand new vault). */
export function SharePriceSpark({
	history,
	width = 96,
	height = 28,
}: {
	history: { t: number; price: number }[];
	width?: number;
	height?: number;
}) {
	if (history.length < 2) {
		return (
			<svg width={width} height={height} aria-hidden>
				<title>Share price trend — no history yet</title>
				<line
					x1={0}
					y1={height / 2}
					x2={width}
					y2={height / 2}
					stroke="var(--cx-edge)"
					strokeWidth={2}
				/>
			</svg>
		);
	}

	const prices = history.map((p) => p.price);
	const min = Math.min(...prices);
	const max = Math.max(...prices);
	const span = max - min || 1;
	const rising = prices[prices.length - 1] >= prices[0];

	const points = history
		.map((p, i) => {
			const x = (i / (history.length - 1)) * width;
			const y = height - ((p.price - min) / span) * height;
			return `${x.toFixed(1)},${y.toFixed(1)}`;
		})
		.join(" ");

	return (
		<svg width={width} height={height} aria-hidden>
			<title>{`Share price trend, ${rising ? "rising" : "falling"}`}</title>
			<polyline
				points={points}
				fill="none"
				stroke={rising ? "var(--cx-accent)" : "var(--cx-sell)"}
				strokeWidth={2}
			/>
		</svg>
	);
}
