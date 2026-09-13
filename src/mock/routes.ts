import type { ChainId, RouteStep } from "#/lib/types";
import { CHAIN_LABEL } from "./assets";

/**
 * The cross-chain path a swap actually takes. There is deliberately no
 * "bridge" step: with Aurora Intents the solver settles the leg, and the
 * absence of a manual bridge is the product's first differentiator — so the
 * route must read as one continuous motion, not a handoff between systems.
 */
export function swapRouteSteps(source: ChainId): RouteStep[] {
	return [
		{
			id: "intent",
			label: "Intent sent to Aurora",
			detail: CHAIN_LABEL[source],
			state: "pending",
		},
		{ id: "solver", label: "Solver filled", state: "pending" },
		{ id: "gate", label: "Confirmed at Custos gate", state: "pending" },
		{ id: "kuru", label: "Executed on Kuru CLOB", state: "pending" },
	];
}

export function depositRouteSteps(source: ChainId): RouteStep[] {
	return [
		{
			id: "intent",
			label: "Intent sent to Aurora",
			detail: CHAIN_LABEL[source],
			state: "pending",
		},
		{ id: "solver", label: "Solver filled", state: "pending" },
		{ id: "receiver", label: "Aurora Deposit Receiver", state: "pending" },
		{ id: "credited", label: "Credited to Custos Storage", state: "pending" },
	];
}

/** Per-step dwell time in ms. Roughly what these legs cost in practice. */
export const STEP_TIMING = [900, 700, 1400, 1100];

export function advanceSteps(steps: RouteStep[]): {
	steps: RouteStep[];
	done: boolean;
} {
	const index = steps.findIndex((s) => s.state !== "done");
	if (index === -1) return { steps, done: true };

	const next = steps.map((step, i): RouteStep => {
		if (i < index) return step;
		if (i === index) {
			return {
				...step,
				state: "done",
				detail:
					step.id === "solver"
						? `${(STEP_TIMING[i] / 1000).toFixed(1)}s`
						: step.detail,
			};
		}
		if (i === index + 1) return { ...step, state: "active" };
		return step;
	});

	return { steps: next, done: index === steps.length - 1 };
}

export function startSteps(steps: RouteStep[]): RouteStep[] {
	return steps.map((step, i) =>
		i === 0 ? { ...step, state: "active" } : step,
	);
}

export function completedSteps(steps: RouteStep[]): RouteStep[] {
	return steps.map((step, i) => ({
		...step,
		state: "done" as const,
		detail:
			step.id === "solver"
				? `${(STEP_TIMING[i] / 1000).toFixed(1)}s`
				: step.detail,
	}));
}
