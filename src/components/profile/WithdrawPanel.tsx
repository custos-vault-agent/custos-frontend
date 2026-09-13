import { useEffect, useState } from "react";
import { Field, Select, TextInput } from "#/components/ui/fields";
import { Button, Card, CardHeader, Label } from "#/components/ui/primitives";
import { formatAmount } from "#/lib/format";
import { useStore } from "#/lib/store";
import type { ChainId } from "#/lib/types";
import { CHAIN_LABEL } from "#/mock/assets";

const CHAINS: ChainId[] = ["monad", "base", "arbitrum", "ethereum", "solana"];

/**
 * Withdrawals are capped at what is *available*, not at the balance. Delegated
 * funds are spoken for, and refusing to let the owner accidentally pull the
 * ground out from under a running agent is the same guarantee read backwards.
 */
export function WithdrawPanel({ onClose }: { onClose: () => void }) {
	const { available, delegated, submitWithdraw } = useStore();

	const [chain, setChain] = useState<ChainId>("base");
	const [amount, setAmount] = useState("");
	const [done, setDone] = useState(false);

	useEffect(() => {
		if (!done) return;
		const id = window.setTimeout(() => setDone(false), 3200);
		return () => window.clearTimeout(id);
	}, [done]);

	const amountNumber = Number(amount) || 0;
	const overAvailable = amountNumber > available;

	return (
		<Card className="animate-enter">
			<CardHeader title="Withdraw">
				<button
					type="button"
					onClick={onClose}
					aria-label="Close withdraw"
					className="ml-auto text-[18px] text-dim hover:text-ink"
				>
					✕
				</button>
			</CardHeader>

			<div className="space-y-3 p-3">
				{done ? (
					<p
						className="border-2 border-accent px-2 py-1 text-[17px] text-accent"
						style={{ animation: "stamp 220ms steps(3, end) both" }}
					>
						Withdrawal recorded.
					</p>
				) : null}

				<Field label="Destination chain">
					<Select
						value={chain}
						onChange={(e) => setChain(e.target.value as ChainId)}
					>
						{CHAINS.map((option) => (
							<option key={option} value={option}>
								{CHAIN_LABEL[option]}
							</option>
						))}
					</Select>
				</Field>

				<Field
					label="Amount"
					hint={`available ${formatAmount(available)} USDC`}
					error={
						overAvailable
							? `Only ${formatAmount(available)} is free — the rest is delegated`
							: undefined
					}
				>
					<TextInput
						inputMode="decimal"
						value={amount}
						onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
						invalid={overAvailable}
						placeholder="0"
						className="tnum"
					/>
				</Field>

				<div>
					<Label>Held for agents</Label>
					<p className="mt-1 text-[17px] text-dim">
						{formatAmount(delegated)} USDC is covering active allowances and
						cannot be withdrawn. Pause or lower an agent to free it.
					</p>
				</div>

				<Button
					variant="solid"
					size="lg"
					className="w-full"
					disabled={amountNumber <= 0 || overAvailable}
					onClick={() => {
						submitWithdraw({ chain, amount: amountNumber });
						setAmount("");
						setDone(true);
					}}
				>
					Withdraw
				</Button>
			</div>
		</Card>
	);
}
