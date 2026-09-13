import { useEffect, useRef, useState } from "react";
import { Field, LockedValue, Select, TextInput } from "#/components/ui/fields";
import { Button, Card, CardHeader, Label } from "#/components/ui/primitives";
import { Sigil } from "#/components/ui/Sigil";
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
	const { setAllowance, setPublic, pauseAgent, resumeAgent, revokeAgent } =
		useStore();

	const [allowance, setAllowanceInput] = useState(String(agent.allowance));
	const [period, setPeriod] = useState<ResetPeriod>(agent.resetPeriod);
	const [isPublic, setIsPublicInput] = useState(agent.isPublic);
	const [confirm, setConfirm] = useState("");
	const dangerRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (!focusDanger) return;
		dangerRef.current?.scrollIntoView({ block: "center" });
		dangerRef.current?.focus();
	}, [focusDanger]);

	const next = Number(allowance) || 0;
	const changed =
		next !== agent.allowance ||
		period !== agent.resetPeriod ||
		isPublic !== agent.isPublic;
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

				<Field label="Allowance" hint="per-period trading limit">
					<TextInput
						inputMode="decimal"
						value={allowance}
						onChange={(e) =>
							setAllowanceInput(e.target.value.replace(/[^0-9.]/g, ""))
						}
						className="tnum"
					/>
				</Field>

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

				<label className="flex items-center gap-2 text-[17px]">
					<input
						type="checkbox"
						checked={isPublic}
						onChange={(e) => setIsPublicInput(e.target.checked)}
					/>
					Listed publicly on the marketplace
				</label>

				<div className="space-y-2 border-t border-edge pt-2">
					<Label>Locked at registration</Label>
					<LockedValue>
						{(agent.vault.feeRateBps / 100).toFixed(1)}% perf. fee
					</LockedValue>
					<LockedValue>
						{agent.vault.maxDrawdownBps === 0
							? "circuit breaker disabled"
							: `${(agent.vault.maxDrawdownBps / 100).toFixed(0)}% max drawdown`}
					</LockedValue>
					<LockedValue>
						{(agent.vault.maxUtilizationBps / 100).toFixed(0)}% max utilization
					</LockedValue>
					<LockedValue>
						{agent.vault.yieldEnabled
							? "idle yield enabled"
							: "idle yield disabled"}
					</LockedValue>
				</div>

				<div className="flex gap-2">
					<Button
						variant="solid"
						disabled={!changed || next <= 0}
						onClick={() => {
							if (next !== agent.allowance || period !== agent.resetPeriod) {
								setAllowance(agent.id, next, period);
							}
							if (isPublic !== agent.isPublic) setPublic(agent.id, isPublic);
						}}
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
					Pausing stops new deposits and trades immediately. Redeem always stays
					open for existing subscribers.
				</p>

				<div className="mt-4 border-2 border-sell">
					<div className="border-b-2 border-sell px-2 py-1">
						<span className="text-[17px] uppercase tracking-[2px] text-sell">
							Danger zone
						</span>
					</div>
					<div className="space-y-2 p-2">
						<p className="text-[17px] text-dim">
							Revoking removes this agent's ability to trade permanently. Funds
							are never at risk — subscribers can always redeem.
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
