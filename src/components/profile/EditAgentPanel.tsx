import { useEffect, useRef, useState } from "react";
import { Field, LockedValue, Select, TextInput } from "#/components/ui/fields";
import {
	Button,
	Card,
	CardHeader,
	Empty,
	Label,
} from "#/components/ui/primitives";
import { Sigil } from "#/components/ui/Sigil";
import { formatCompactUsd, marketLabel } from "#/lib/format";
import { useStore } from "#/lib/store";
import type { Agent, ResetPeriod } from "#/lib/types";

const BURN_CHOICES = [2500, 5000, 10000];

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
	const {
		setAllowance,
		setPublic,
		setAgentMarket,
		pauseAgent,
		resumeAgent,
		revokeAgent,
		burnSeed,
		releaseSeed,
	} = useStore();

	const [allowance, setAllowanceInput] = useState(String(agent.allowance));
	const [period, setPeriod] = useState<ResetPeriod>(agent.resetPeriod);
	const [isPublic, setIsPublicInput] = useState(agent.isPublic);
	const [confirm, setConfirm] = useState("");
	const [burnBps, setBurnBps] = useState(BURN_CHOICES[0]);
	const [burnArmed, setBurnArmed] = useState(false);
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
	// Revoke is permanent, so the registry rejects every creator write afterwards.
	const revoked = agent.status === "revoked";

	const baseHeld = agent.marketAccess.some((m) => m.heldByVault);
	const canRelease = revoked && !baseHeld;
	const releaseBlock = !revoked
		? "Revoke the agent first."
		: baseHeld
			? "The vault still holds a market's token."
			: null;

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
					<Label>Markets</Label>
					{agent.marketAccess.length === 0 ? (
						<Empty
							title="No markets yet"
							hint="The protocol has not curated any market yet."
						/>
					) : (
						agent.marketAccess.map((m) => (
							<label
								key={m.market}
								className="flex items-center gap-2 text-[17px]"
							>
								<input
									type="checkbox"
									checked={m.allowed}
									disabled={revoked || (m.allowed && m.heldByVault)}
									onChange={(e) =>
										setAgentMarket(agent.id, m.market, e.target.checked)
									}
								/>
								{marketLabel(m.baseSymbol, m.market)}
								{m.allowed && m.heldByVault ? (
									<span className="ml-auto text-[16px] text-dim">
										vault still holds {m.baseSymbol}
									</span>
								) : null}
							</label>
						))
					)}
				</div>

				<div className="space-y-2 border-t border-edge pt-2">
					<Label>Seed</Label>
					<p className="text-[17px]">
						{formatCompactUsd(agent.vault.seedAssets)} locked
					</p>
					<p className="text-[16px] text-dim">
						This is your own capital. It stays locked while the agent lives.
					</p>
					<div className="flex gap-2">
						{BURN_CHOICES.map((bps) => (
							<Button
								key={bps}
								variant={burnBps === bps ? "solid" : "ghost"}
								disabled={agent.vault.seedAssets <= 0}
								onClick={() => {
									setBurnBps(bps);
									setBurnArmed(false);
								}}
							>
								{bps / 100}%
							</Button>
						))}
					</div>
					<p className="text-[16px] text-dim">
						A burn raises the share price for holders in the vault right now. It
						cannot reach anyone who already redeemed, and it cannot be undone.
					</p>
					{burnArmed ? (
						<div className="flex gap-2">
							<Button
								variant="danger"
								onClick={() => {
									burnSeed(agent.id, burnBps);
									setBurnArmed(false);
								}}
							>
								Confirm burn {burnBps / 100}%
							</Button>
							<Button variant="ghost" onClick={() => setBurnArmed(false)}>
								Cancel
							</Button>
						</div>
					) : (
						<Button
							variant="danger"
							disabled={agent.vault.seedAssets <= 0}
							onClick={() => setBurnArmed(true)}
						>
							Burn {burnBps / 100}% of seed
						</Button>
					)}
					<Button
						variant="ghost"
						disabled={!canRelease}
						onClick={() => releaseSeed(agent.id)}
					>
						Release seed
					</Button>
					{releaseBlock ? (
						<p className="text-[16px] text-dim">{releaseBlock}</p>
					) : null}
				</div>

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
						variant={agent.vault.circuitBreakerTripped ? "danger" : "ghost"}
						onClick={() =>
							paused ? resumeAgent(agent.id) : pauseAgent(agent.id)
						}
					>
						{paused ? "Resume" : "Pause"}
					</Button>
				</div>

				{agent.vault.circuitBreakerTripped ? (
					<p className="border-2 border-sell px-2 py-1 text-[16px] text-sell">
						The vault paused itself: share price fell more than{" "}
						{(agent.vault.maxDrawdownBps / 100).toFixed(0)}% below its high
						water mark. Resuming resets the high water mark to the current
						price, so fees start again from here.
					</p>
				) : null}

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
