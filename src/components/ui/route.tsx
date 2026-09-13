import type { RouteStep } from "#/lib/types";
import { cx } from "./primitives";

const MARKER: Record<RouteStep["state"], string> = {
	done: "border-accent bg-accent",
	active: "border-warn bg-warn animate-pulse-led",
	pending: "border-edge",
	failed: "border-sell bg-sell",
};

const TEXT: Record<RouteStep["state"], string> = {
	done: "text-ink",
	active: "text-warn",
	pending: "text-dim",
	failed: "text-sell",
};

/**
 * The vertical route. Used in three places — the swap sidecar, the deposit
 * flow and in-flight activity rows — deliberately unchanged in each, so the
 * shape itself comes to mean "a cross-chain leg is resolving".
 */
export function RouteStepper({
	steps,
	className,
}: {
	steps: RouteStep[];
	className?: string;
}) {
	return (
		<ol className={cx("flex flex-col", className)}>
			{steps.map((step, index) => {
				const next = steps[index + 1];
				// Only the connector leading into the active step marches. A route
				// that is finished, or not yet started, should be perfectly still.
				const marching = step.state === "done" && next?.state === "active";

				return (
					<li key={step.id}>
						<div className="flex items-center gap-2">
							<span
								aria-hidden
								className={cx(
									"size-[11px] shrink-0 border-2",
									MARKER[step.state],
								)}
							/>
							<span className={cx("text-[17px]", TEXT[step.state])}>
								{step.label}
							</span>
							{step.detail ? (
								<span className="text-[16px] text-dim">· {step.detail}</span>
							) : null}
						</div>
						{next ? (
							<span
								aria-hidden
								className={cx(
									"ml-[4px] block h-[9px] w-[2px] dash-v",
									marching && "animate-march",
								)}
							/>
						) : null}
					</li>
				);
			})}
		</ol>
	);
}

/**
 * Horizontal variant for the idle quote panel, where the route is context
 * rather than progress and should take one line, not five.
 */
export function RouteRail({ nodes }: { nodes: string[] }) {
	return (
		<div className="flex items-center gap-2 overflow-x-auto">
			{nodes.map((node, index) => (
				<div key={node} className="flex shrink-0 items-center gap-2">
					<span className="border border-edge bg-surface2 px-2 text-[16px] text-dim">
						{node}
					</span>
					{index < nodes.length - 1 ? (
						<span aria-hidden className="block h-[2px] w-[14px] dash-h" />
					) : null}
				</div>
			))}
		</div>
	);
}
