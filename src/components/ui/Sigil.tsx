import { useMemo } from "react";
import { sigilCells } from "#/lib/sigil";
import { cx } from "./primitives";

type SigilSize = "xs" | "sm" | "md" | "lg";

const CELL: Record<SigilSize, string> = {
	xs: "4px",
	sm: "5px",
	md: "7px",
	lg: "11px",
};

/**
 * Owner sigils draw in --ink, agent sigils in --accent. That single colour
 * difference is what lets an activity row answer "was this me or an agent?"
 * before any text is read — which is the one question this product has to
 * answer everywhere.
 */
export function Sigil({
	address,
	size = "sm",
	tone = "agent",
	className,
	interactive = false,
}: {
	address: string;
	size?: SigilSize;
	tone?: "agent" | "owner";
	className?: string;
	interactive?: boolean;
}) {
	const cells = useMemo(() => sigilCells(address), [address]);
	const cell = CELL[size];

	return (
		<span
			aria-hidden
			className={cx("grid shrink-0 gap-px", interactive && "group", className)}
			style={{
				gridTemplateColumns: `repeat(5, ${cell})`,
				gridAutoRows: cell,
			}}
		>
			{cells.map((on, index) => (
				<span
					// Position is the identity here; the grid is fixed at 25 cells.
					// biome-ignore lint/suspicious/noArrayIndexKey: fixed-length grid
					key={index}
					className={cx(
						on ? (tone === "owner" ? "bg-ink" : "bg-accent") : "bg-edge",
						interactive && on && "group-hover:animate-flicker",
					)}
				/>
			))}
		</span>
	);
}
