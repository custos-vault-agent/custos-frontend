const W = 640;
const H = 240;
const PAD = { l: 8, r: 8, t: 22, b: 14 };

/** Share price over time with the high-water mark and breaker floor as dashed
 *  guides. The y-scale follows the series and the high-water mark; a breaker
 *  far below would flatten every real move, so it is pinned to the floor
 *  instead of stretching the scale. */
export function SharePriceChart({
	history,
	highWaterMark,
	maxDrawdownBps,
}: {
	history: { t: number; price: number }[];
	highWaterMark: number;
	maxDrawdownBps: number;
}) {
	const breaker =
		maxDrawdownBps > 0 ? highWaterMark * (1 - maxDrawdownBps / 10_000) : null;
	const values = [highWaterMark, ...history.map((p) => p.price)];
	const lo = Math.min(...values);
	const hi = Math.max(...values);
	// Yield accrual moves the price by a few parts per million, so an empty span
	// still needs a readable window.
	const pad = (hi - lo || Math.max(hi * 1e-5, 1e-6)) * 0.2;
	const min = lo - pad;
	const span = hi + pad - min;
	const innerW = W - PAD.l - PAD.r;
	const innerH = H - PAD.t - PAD.b;
	const clamp = (v: number) => Math.min(Math.max(v, min), min + span);
	const y = (v: number) => PAD.t + innerH - ((clamp(v) - min) / span) * innerH;
	const x = (i: number) => PAD.l + (i / (history.length - 1)) * innerW;

	const hwmY = y(highWaterMark);
	const breakerY = breaker === null ? 0 : y(breaker);
	const breakerBelow = breaker !== null && breaker < min;
	const enough = history.length >= 2;
	const coords = history.map((p, i) => [x(i), y(p.price)] as const);
	const line = coords.map(([cx, cy]) => `${cx.toFixed(1)},${cy.toFixed(1)}`);
	const last = coords[coords.length - 1];
	const rising =
		enough && history[history.length - 1].price >= history[0].price;
	const tone = rising || !enough ? "var(--cx-accent)" : "var(--cx-sell)";
	const label = {
		fontSize: 13,
		textAnchor: "end" as const,
		fill: "var(--cx-dim)",
	};

	return (
		<svg
			viewBox={`0 0 ${W} ${H}`}
			preserveAspectRatio="xMidYMid meet"
			className="block h-auto w-full"
			role="img"
		>
			<title>
				{enough
					? `Share price history, ${history.length} points, ${rising ? "rising" : "falling"}`
					: "Share price history, no data yet"}
			</title>
			<line
				x1={PAD.l}
				x2={W - PAD.r}
				y1={hwmY}
				y2={hwmY}
				stroke="var(--cx-dim)"
				strokeWidth={1.5}
				strokeDasharray="6 4"
			/>
			<text x={W - PAD.r} y={hwmY - 5} {...label}>
				high water mark
			</text>
			{breaker === null ? null : (
				<>
					<line
						x1={PAD.l}
						x2={W - PAD.r}
						y1={breakerY}
						y2={breakerY}
						stroke="var(--cx-sell)"
						strokeWidth={1.5}
						strokeDasharray="6 4"
					/>
					<text x={W - PAD.r} y={breakerY - 5} {...label} fill="var(--cx-sell)">
						{`breaker −${maxDrawdownBps / 100}%${breakerBelow ? " (off scale)" : ""}`}
					</text>
				</>
			)}
			{enough ? (
				<>
					<polygon
						points={`${PAD.l},${H - PAD.b} ${line.join(" ")} ${W - PAD.r},${H - PAD.b}`}
						fill={tone}
						fillOpacity={0.12}
					/>
					<polyline
						points={line.join(" ")}
						fill="none"
						stroke={tone}
						strokeWidth={2}
						strokeLinejoin="round"
					/>
					{coords.slice(0, -1).map(([cx, cy], i) => (
						<circle
							// biome-ignore lint/suspicious/noArrayIndexKey: static series
							key={i}
							cx={cx}
							cy={cy}
							r={3.5}
							fill="var(--cx-surface)"
							stroke={tone}
							strokeWidth={1.5}
						/>
					))}
					<circle cx={last[0]} cy={last[1]} r={4.5} fill={tone} />
				</>
			) : (
				<line
					x1={PAD.l}
					x2={W - PAD.r}
					y1={y(history[0]?.price ?? highWaterMark)}
					y2={y(history[0]?.price ?? highWaterMark)}
					stroke="var(--cx-edge)"
					strokeWidth={2}
				/>
			)}
		</svg>
	);
}
