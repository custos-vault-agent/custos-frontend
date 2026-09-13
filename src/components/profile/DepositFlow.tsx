import { useEffect, useRef, useState } from "react";
import { Field, Select, TextInput } from "#/components/ui/fields";
import { Button, Card, CardHeader, Label } from "#/components/ui/primitives";
import { RouteStepper } from "#/components/ui/route";
import { useStore } from "#/lib/store";
import type { AssetSymbol, ChainId } from "#/lib/types";
import { ASSETS, assetsForChain, balanceOf, CHAIN_LABEL } from "#/mock/assets";

const CHAINS: ChainId[] = ["solana", "base", "arbitrum", "ethereum"];

/**
 * Deposit reuses the swap's RouteStepper on purpose. Two progress idioms for
 * the same underlying motion would teach the user that Custos has two kinds
 * of cross-chain leg, and it does not.
 */
export function DepositFlow({ onClose }: { onClose: () => void }) {
	const { submitDeposit, inFlight } = useStore();

	const [chain, setChain] = useState<ChainId>("base");
	const [symbol, setSymbol] = useState<AssetSymbol>("USDC");
	const [amount, setAmount] = useState("5000");
	const [landed, setLanded] = useState(false);

	const flight = inFlight.find((e) => e.kind === "deposit") ?? null;
	const wasFlying = useRef(false);

	useEffect(() => {
		if (flight) {
			wasFlying.current = true;
			setLanded(false);
			return;
		}
		if (wasFlying.current) {
			wasFlying.current = false;
			setLanded(true);
		}
	}, [flight]);

	const amountNumber = Number(amount) || 0;
	const balance = balanceOf(symbol, chain);
	const insufficient = amountNumber > balance;
	const symbols = Array.from(
		new Set(assetsForChain(chain).map((a) => a.symbol)),
	);

	return (
		<Card className="animate-enter">
			<CardHeader title="Deposit">
				<button
					type="button"
					onClick={onClose}
					aria-label="Close deposit"
					className="ml-auto text-[18px] text-dim hover:text-ink"
				>
					✕
				</button>
			</CardHeader>

			{flight ? (
				<div className="p-3">
					<div className="flex items-baseline gap-2">
						<span className="text-[18px]">{flight.title}</span>
						<span className="tnum ml-auto text-[17px] text-dim">
							{flight.amount}
						</span>
					</div>
					<div className="mt-2">
						<RouteStepper steps={flight.steps ?? []} />
					</div>
					<p className="mt-2 text-[16px] text-dim">
						You can leave this panel. It keeps moving.
					</p>
				</div>
			) : (
				<div className="space-y-3 p-3">
					{landed ? (
						<p
							className="border-2 border-accent px-2 py-1 text-[17px] text-accent"
							style={{ animation: "stamp 220ms steps(3, end) both" }}
						>
							Credited to Custos Storage.
						</p>
					) : null}

					<Field label="Source chain">
						<Select
							value={chain}
							onChange={(e) => {
								const next = e.target.value as ChainId;
								setChain(next);
								if (
									!ASSETS.some((a) => a.chain === next && a.symbol === symbol)
								) {
									setSymbol(
										ASSETS.find((a) => a.chain === next)?.symbol ?? "USDC",
									);
								}
							}}
						>
							{CHAINS.map((option) => (
								<option key={option} value={option}>
									{CHAIN_LABEL[option]}
								</option>
							))}
						</Select>
					</Field>

					<Field label="Asset">
						<Select
							value={symbol}
							onChange={(e) => setSymbol(e.target.value as AssetSymbol)}
						>
							{symbols.map((option) => (
								<option key={option} value={option}>
									{option}
								</option>
							))}
						</Select>
					</Field>

					<Field
						label="Amount"
						hint={`bal ${balance.toLocaleString("en-US")}`}
						error={
							insufficient ? "Insufficient balance on that chain" : undefined
						}
					>
						<TextInput
							inputMode="decimal"
							value={amount}
							onChange={(e) =>
								setAmount(e.target.value.replace(/[^0-9.]/g, ""))
							}
							invalid={insufficient}
							className="tnum"
						/>
					</Field>

					<div>
						<Label>Route</Label>
						<p className="mt-1 text-[17px] text-dim">
							{CHAIN_LABEL[chain]} → Aurora solver → Deposit Receiver → Custos
							Storage. No manual bridging.
						</p>
					</div>

					<Button
						variant="solid"
						size="lg"
						className="w-full"
						disabled={amountNumber <= 0 || insufficient}
						onClick={() =>
							submitDeposit({ chain, symbol, amount: amountNumber })
						}
					>
						Send intent
					</Button>
				</div>
			)}
		</Card>
	);
}
