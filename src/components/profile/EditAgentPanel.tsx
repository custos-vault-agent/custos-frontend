import { useEffect, useRef, useState } from "react";
import { Field, Select, TextInput } from "#/components/ui/fields";
import { AllowanceMeter, AllowanceReadout } from "#/components/ui/meters";
import { Button, Card, CardHeader, Label } from "#/components/ui/primitives";
import { Sigil } from "#/components/ui/Sigil";
import { formatAmount } from "#/lib/format";
import { useStore } from "#/lib/store";
import type { Agent, ResetPeriod } from "#/lib/types";

const PERIODS: ResetPeriod[] = ["daily", "weekly", "monthly", "never"];

export function EditAgentPanel({
	agent,
	focusDanger,
	onClose,
}: {
	agent: Agent;
	focusDanger?: boolean;
	onClose: () => void;
}) {
	const { setAllowance, pauseAgent, resumeAgent, revokeAgent, available } =
		useStore();

	// Keyed by agent id at the call site, so selecting a different agent
	// remounts the panel rather than leaving the previous one's numbers behind.
	const [allowance, setAllowanceInput] = useState(String(agent.allowance));
	const [period, setPeriod] = useState<ResetPeriod>(agent.resetPeriod);
	const [confirm, setConfirm] = useState("");
	const dangerRef = useRef<HTMLInputElement>(null);

	// REVOKE on the card scrolls here rather than firing. The destructive action
	// should cost a deliberate second look, not a single misplaced click.
	useEffect(() => {
		if (!focusDanger) return;
		dangerRef.current?.scrollIntoView({ block: "center" });
		dangerRef.current?.focus();
	}, [focusDanger]);

	const next = Number(allowance) || 0;
	// A paused agent's allowance is not counted as delegated, so it must not be
	// added back in here or the vault would appear to hold more than it does.
	const headroom =
		available + (agent.status === "active" ? agent.allowance : 0);
	const belowUsage = next > 0 && next < agent.used;
	const overVault = next > headroom;
	const changed = next !== agent.allowance || period !== agent.resetPeriod;
	const paused = agent.status === "paused";

	return (
		<Card className="animate-enter">
			<CardHeader title="Edit agent">
				<button
					type="button"
					onClick={onClose}
					aria-label="Close editor"
					className="ml-auto text-[18px] text-dim hover:text-ink"
				>
					✕
				</button>
			</CardHeader>

			<div className="space-y-3 p-3">
				<div className="flex items-center gap-3">
					<Sigil address={agent.agentAddress} size="md" />
					<span className="truncate text-[21px]">{agent.name}</span>
				</div>

				<div>
					<Label>Current usage</Label>
					<div className="mt-1">
						<AllowanceMeter
							used={agent.used}
							allowance={next > 0 ? next : agent.allowance}
							tall
							animate={false}
						/>
					</div>
					<div className="mt-1">
						<AllowanceReadout
							used={agent.used}
							allowance={next > 0 ? next : agent.allowance}
						/>
					</div>
				</div>

				<Field
					label="Allowance"
					hint={`up to ${formatAmount(headroom)} USDC`}
					error={overVault ? "Above what the vault can back" : undefined}
				>
					<TextInput
						inputMode="decimal"
						value={allowance}
						onChange={(e) =>
							setAllowanceInput(e.target.value.replace(/[^0-9.]/g, ""))
						}
						invalid={overVault}
						className="tnum"
					/>
				</Field>

				{belowUsage ? (
					<p className="border-2 border-warn px-2 py-1 text-[17px] text-warn">
						New cap is below current usage. This agent cannot open new positions
						until usage falls below {formatAmount(next)}. Open orders are not
						cancelled.
					</p>
				) : null}

				<Field label="Reset period">
					<Select
						value={period}
						onChange={(e) => setPeriod(e.target.value as ResetPeriod)}
					>
						{PERIODS.map((option) => (
							<option key={option} value={option}>
								{option}
							</option>
						))}
					</Select>
				</Field>

				<div className="flex gap-2">
					<Button
						variant="solid"
						disabled={!changed || overVault || next <= 0}
						onClick={() => setAllowance(agent.id, next, period)}
					>
						Save
					</Button>
					<Button
						onClick={() =>
							paused ? resumeAgent(agent.id) : pauseAgent(agent.id)
						}
					>
						{paused ? "Resume" : "Pause"}
					</Button>
				</div>

				<p className="text-[16px] text-dim">
					Pausing stops new actions immediately. The seal stays on the registry.
				</p>

				{/* ----------------------- danger zone ----------------------- */}
				<div className="mt-4 border-2 border-sell">
					<div className="border-b-2 border-sell px-2 py-1">
						<span className="text-[17px] uppercase tracking-[2px] text-sell">
							Danger zone
						</span>
					</div>
					<div className="space-y-2 p-2">
						<p className="text-[17px] text-dim">
							Revoking removes this agent's access to the contract permanently.
							Funds are never at risk; the seal is.
						</p>
						<Field label="Type the agent name to confirm">
							<TextInput
								ref={dangerRef}
								value={confirm}
								onChange={(e) => setConfirm(e.target.value)}
								placeholder={agent.name}
								spellCheck={false}
							/>
						</Field>
						<Button
							variant="danger"
							className="w-full"
							disabled={confirm.trim() !== agent.name}
							onClick={() => {
								revokeAgent(agent.id);
								onClose();
							}}
						>
							Revoke access
						</Button>
					</div>
				</div>
			</div>
		</Card>
	);
}
