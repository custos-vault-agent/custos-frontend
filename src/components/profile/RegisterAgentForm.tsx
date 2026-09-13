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
import { formatAmount, shortAddress } from "#/lib/format";
import { OWNER_ADDRESS, useStore } from "#/lib/store";
import type { ResetPeriod } from "#/lib/types";

const PERIODS: ResetPeriod[] = ["daily", "weekly", "monthly", "never"];

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/**
 * Exactly the four fields the contract stores, plus the reset period and the
 * owner wallet — and the owner wallet is locked, because registration is
 * always signed by the owner and never by the agent. Making that visible is
 * the point of the row, not a detail of it.
 */
export function RegisterAgentForm({ onClose }: { onClose: () => void }) {
	const { registerAgent, available } = useStore();

	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [address, setAddress] = useState("");
	const [allowance, setAllowance] = useState("");
	const [period, setPeriod] = useState<ResetPeriod>("daily");
	const [touched, setTouched] = useState(false);

	const allowanceNumber = Number(allowance) || 0;
	const addressValid = ADDRESS.test(address.trim());
	const overAvailable = allowanceNumber > available;
	const valid =
		name.trim().length > 0 &&
		addressValid &&
		allowanceNumber > 0 &&
		!overAvailable;

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
					<Label>Owner wallet (locked)</Label>
					<div className="mt-1">
						<LockedValue>{shortAddress(OWNER_ADDRESS, 10, 6)}</LockedValue>
					</div>
					<p className="mt-1 text-[16px] text-dim">
						Registration is signed by you. The agent never signs its own entry.
					</p>
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
						{/* The sigil resolves as the address is typed: the agent's
						    identity appears while you are creating it. */}
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
					label="Allowance"
					hint={`available ${formatAmount(available)} USDC`}
					error={
						overAvailable ? "Above what is available in the vault" : undefined
					}
				>
					<TextInput
						inputMode="decimal"
						value={allowance}
						onChange={(e) =>
							setAllowance(e.target.value.replace(/[^0-9.]/g, ""))
						}
						invalid={overAvailable}
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

				<p className="border-l-2 border-edge pl-2 text-[16px] text-dim">
					This agent will only ever be able to call the Custos contract, and
					only up to its allowance. It cannot move funds anywhere else.
				</p>

				<Button
					variant="solid"
					size="lg"
					className="w-full"
					disabled={!valid}
					onClick={() => {
						registerAgent({
							name: name.trim(),
							description:
								description.trim() || "No description provided by the owner.",
							agentAddress: address.trim(),
							allowance: allowanceNumber,
							resetPeriod: period,
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
