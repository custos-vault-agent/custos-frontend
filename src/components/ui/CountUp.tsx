import { useEffect, useRef, useState } from "react";
import { formatAmount } from "#/lib/format";

const DURATION = 400;

function prefersReducedMotion(): boolean {
	if (typeof window === "undefined") return false;
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Counts to a new value rather than swapping it. Money that changes silently
 * is money the user did not notice changing — and after a deposit lands, the
 * balance moving is the confirmation.
 *
 * Rendered with tabular numerals so the width never shifts mid-count.
 */
export function CountUp({ value }: { value: number }) {
	const [display, setDisplay] = useState(value);
	const fromRef = useRef(value);
	const frameRef = useRef(0);

	useEffect(() => {
		const from = fromRef.current;
		if (from === value) return;

		if (prefersReducedMotion()) {
			fromRef.current = value;
			setDisplay(value);
			return;
		}

		const start = performance.now();
		const step = (now: number) => {
			const t = Math.min(1, (now - start) / DURATION);
			// Stepped rather than eased — a smooth ease reads as a modern
			// dashboard; this should feel like a counter clicking over.
			const stepped = Math.round(t * 8) / 8;
			setDisplay(from + (value - from) * stepped);
			if (t < 1) frameRef.current = requestAnimationFrame(step);
			else fromRef.current = value;
		};

		frameRef.current = requestAnimationFrame(step);
		return () => cancelAnimationFrame(frameRef.current);
	}, [value]);

	return <span className="tnum">{formatAmount(Math.round(display))}</span>;
}
