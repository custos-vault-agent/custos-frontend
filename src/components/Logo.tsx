import { useEffect, useState } from "react";
import { cx } from "./ui/primitives";

const SEEN_KEY = "custos-seal-seen";

/**
 * The mark: a monogram "C" as an open ring with the gap on the right, framed
 * in a thin seal circle. One ink colour, so it inverts cleanly between modes.
 *
 * shapeRendering="crispEdges" is deliberate — it aliases the curves into hard
 * pixel steps so the brand mark belongs to the same world as the rest of the
 * interface instead of floating above it as smooth vector art.
 */
export function SealMark({
	size = 26,
	drawn = false,
	className,
}: {
	size?: number;
	drawn?: boolean;
	className?: string;
}) {
	const radius = 9;
	const circumference = 2 * Math.PI * radius;
	const gap = circumference * (80 / 360);

	return (
		<svg
			viewBox="0 0 32 32"
			width={size}
			height={size}
			role="img"
			aria-label="Custos"
			shapeRendering="crispEdges"
			className={cx("shrink-0", className)}
			style={
				drawn ? { animation: "draw-seal 700ms steps(12, end) both" } : undefined
			}
		>
			<title>Custos</title>
			<circle
				cx="16"
				cy="16"
				r="14"
				fill="none"
				stroke="currentColor"
				strokeWidth="1"
				opacity="0.55"
			/>
			<circle
				cx="16"
				cy="16"
				r={radius}
				fill="none"
				stroke="currentColor"
				strokeWidth="3"
				strokeDasharray={`${circumference - gap} ${gap}`}
				transform="rotate(-40 16 16)"
			/>
		</svg>
	);
}

export function Logo() {
	const [drawn, setDrawn] = useState(false);

	// Once per session, under a second, skipped entirely under reduced motion.
	// A full boot sequence is charming once and an obstacle every time after.
	useEffect(() => {
		try {
			if (sessionStorage.getItem(SEEN_KEY)) return;
			sessionStorage.setItem(SEEN_KEY, "1");
			setDrawn(true);
		} catch {
			// No session storage — simply never play it.
		}
	}, []);

	return (
		<span className="flex items-center gap-2 text-ink">
			<SealMark drawn={drawn} />
			<span className="text-[25px] uppercase tracking-[3px]">Custos</span>
		</span>
	);
}
