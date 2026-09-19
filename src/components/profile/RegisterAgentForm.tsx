import { useState } from "react";
import {
	Field,
	LockedValue,
	Select,
	TextArea,
	TextInput,
} from "#/components/ui/fields";
import { Button, Card, CardHeader, Label } from "#/components/ui/primitives";
import { Sigil } from "#/components/ui/Sigil";
import { shortAddress } from "#/lib/format";
import { useStore } from "#/lib/store";
import type { ResetPeriod } from "#/lib/types";
import { MIN_SEED } from "#/lib/chain";

const PERIODS: ResetPeriod[] = ["daily", "weekly", "monthly", "never"];
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export function RegisterAgentForm({ onClose }: { onClose: () => void }) {
	const { registerAgent, connectedAddress } = useStore();

	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [address, setAddress] = useState("");
	const [seedAmount, setSeedAmount] = useState(String(MIN_SEED));
	const [allowance, setAllowance] = useState("");
	const [period, setPeriod] = useState<ResetPeriod>("daily");
	const [feeRatePercent, setFeeRatePercent] = useState("10");
	const [maxDrawdownPercent, setMaxDrawdownPercent] = useState("20");
	const [maxUtilizationPercent, setMaxUtilizationPercent] = useState("70");
	const [yieldEnabled, setYieldEnabled] = useState(true);
	const [isPublic, setIsPublic] = useState(true);
	const [touched, setTouched] = useState(false);

	const addressValid = ADDRESS.test(address.trim());
	const seedNumber = Number(seedAmount) || 0;
	const allowanceNumber = Number(allowance) || 0;
	const feeRateBps = Math.round((Number(feeRatePercent) || 0) * 100);
	const maxDrawdownBps = Math.round((Number(maxDrawdownPercent) || 0) * 100);
	const maxUtilizationBps = Math.round(
		(Number(maxUtilizationPercent) || 0) * 100,
	);

	const seedTooSmall = seedNumber < MIN_SEED;
	const feeOutOfRange = feeRateBps > 5000;
	const drawdownOutOfRange =
		maxDrawdownBps !== 0 && (maxDrawdownBps < 100 || maxDrawdownBps > 5000);
	const utilizationOutOfRange =
		maxUtilizationBps < 1000 || maxUtilizationBps > 9500;

	const valid =
		name.trim().length > 0 &&
		addressValid &&
		allowanceNumber > 0 &&
		!seedTooSmall &&
		!feeOutOfRange &&
		!drawdownOutOfRange &&
		!utilizationOutOfRange;

	return (
		<Card className="animate-enter">
			<CardHeader title="Register agent">
				<button
					type="button"
					onClick={onClose}
					aria-label="Close register form"
					className="ml-auto text-[18px] text-dim hover:text-ink"
				>
					✕
				</button>
			</CardHeader>

			<div className="space-y-3 p-3">
				<div>
					<Label>Creator wallet (locked)</Label>
					<div className="mt-1">
						<LockedValue>
							{connectedAddress ? shortAddress(connectedAddress, 10, 6) : ""}
						</LockedValue>
					</div>
				</div>

				<Field label="Agent name">
					<TextInput
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder="grid-bot-8"
						maxLength={32}
					/>
				</Field>

				<Field label="Description" hint={`${description.length}/140`}>
					<TextArea
						rows={3}
						value={description}
						onChange={(e) => setDescription(e.target.value.slice(0, 140))}
						placeholder="What this agent does, in one line."
					/>
				</Field>

				<Field
					label="Agent wallet address"
					error={
						touched && address.length > 0 && !addressValid
							? "That is not a valid address"
							: undefined
					}
				>
					<div className="flex items-center gap-2">
						<span className="shrink-0 border-2 border-edge bg-surface2 p-1">
							<Sigil address={addressValid ? address.trim() : ""} size="md" />
						</span>
						<TextInput
							value={address}
							onChange={(e) => setAddress(e.target.value)}
							onBlur={() => setTouched(true)}
							invalid={touched && address.length > 0 && !addressValid}
							placeholder="0x…"
							spellCheck={false}
							className="font-pixel"
						/>
					</div>
				</Field>

				<Field
					label="Seed deposit"
					hint="locked permanently — this is your skin in the game"
					error={seedTooSmall ? `Minimum is ${MIN_SEED} USDC` : undefined}
				>
					<TextInput
						inputMode="decimal"
						value={seedAmount}
						onChange={(e) =>
							setSeedAmount(e.target.value.replace(/[^0-9.]/g, ""))
						}
						invalid={seedTooSmall}
						className="tnum"
					/>
				</Field>

				<Field label="Allowance" hint="per-period trading limit">
					<TextInput
						inputMode="decimal"
						value={allowance}
						onChange={(e) =>
							setAllowance(e.target.value.replace(/[^0-9.]/g, ""))
						}
						placeholder="2500"
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

				<Field
					label="Performance fee"
					hint="immutable after this — 0-50%"
					error={feeOutOfRange ? "Max is 50%" : undefined}
				>
					<TextInput
						inputMode="decimal"
						value={feeRatePercent}
						onChange={(e) =>
							setFeeRatePercent(e.target.value.replace(/[^0-9.]/g, ""))
						}
						invalid={feeOutOfRange}
						className="tnum"
					/>
				</Field>

				<Field
					label="Max drawdown (circuit breaker)"
					hint="immutable — 0 disables, else 1-50%"
					error={drawdownOutOfRange ? "1-50%, or 0 to disable" : undefined}
				>
					<TextInput
						inputMode="decimal"
						value={maxDrawdownPercent}
						onChange={(e) =>
							setMaxDrawdownPercent(e.target.value.replace(/[^0-9.]/g, ""))
						}
						invalid={drawdownOutOfRange}
						className="tnum"
					/>
				</Field>

				<Field
					label="Max utilization (reserve ratio)"
					hint="immutable — 10-95%"
					error={utilizationOutOfRange ? "Must be 10-95%" : undefined}
				>
					<TextInput
						inputMode="decimal"
						value={maxUtilizationPercent}
						onChange={(e) =>
							setMaxUtilizationPercent(e.target.value.replace(/[^0-9.]/g, ""))
						}
						invalid={utilizationOutOfRange}
						className="tnum"
					/>
				</Field>

				<label className="flex items-center gap-2 text-[17px]">
					<input
						type="checkbox"
						checked={yieldEnabled}
						onChange={(e) => setYieldEnabled(e.target.checked)}
					/>
					Deploy idle capital to yield (immutable)
				</label>

				<label className="flex items-center gap-2 text-[17px]">
					<input
						type="checkbox"
						checked={isPublic}
						onChange={(e) => setIsPublic(e.target.checked)}
					/>
					List publicly on the marketplace
				</label>

				<p className="border-l-2 border-edge pl-2 text-[16px] text-dim">
					This agent will only ever be able to call executeSwap on its own
					vault, up to its allowance. It cannot withdraw or transfer funds.
				</p>

				<Button
					variant="solid"
					size="lg"
					className="w-full"
					disabled={!valid}
					onClick={() => {
						registerAgent({
							name: name.trim(),
							description: description.trim(),
							agentAddress: address.trim(),
							seedAmount: seedNumber,
							allowance: allowanceNumber,
							resetPeriod: period,
							feeRateBps,
							maxDrawdownBps,
							maxUtilizationBps,
							yieldEnabled,
							isPublic,
						});
						onClose();
					}}
				>
					Issue seal
				</Button>
			</div>
		</Card>
	);
}
