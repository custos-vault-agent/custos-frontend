import { useEffect, useRef, useState } from "react";
import { Field, Select, TextInput } from "#/components/ui/fields";
import {
	Button,
	Card,
	CardHeader,
	Empty,
	Label,
} from "#/components/ui/primitives";
import { RouteStepper } from "#/components/ui/route";
import { useStore } from "#/lib/store";
import type { AssetSymbol, ChainId } from "#/lib/types";
import { ASSETS, assetsForChain, balanceOf, CHAIN_LABEL } from "#/mock/assets";

const CHAINS: ChainId[] = ["solana", "base", "arbitrum", "ethereum"];

/**
 * Reuses the deposit route's RouteStepper on purpose — same underlying
 * cross-chain motion the deposit flow already taught, now landing in one
 * agent's vault instead of a shared balance.
 */
export function SubscribeFlow({
	agentId,
	onClose,
}: {
	agentId: string;
	onClose: () => void;
}) {
	const { agents, subscribe, inFlight, dismissInFlight } = useStore();
	const agent = agents.find((a) => a.id === agentId);

	const [chain, setChain] = useState<ChainId>("base");
	const [symbol, setSymbol] = useState<AssetSymbol>("USDC");
	const [amount, setAmount] = useState("500");
	const [landed, setLanded] = useState(false);

	const flight =
		inFlight.find((e) => e.kind === "subscribe" && e.agentId === agentId) ??
		null;
	const wasFlying = useRef(false);

	useEffect(() => {
		if (flight?.status === "in-progress") {
			wasFlying.current = true;
			setLanded(false);
			return;
		}
		// The store removes a successful flight the moment its receipt lands; a
		// failed one stays (status "failed") until dismissed, and is not a landing.
		if (!flight && wasFlying.current) {
			wasFlying.current = false;
			setLanded(true);
		}
		if (flight?.status === "failed") wasFlying.current = false;
	}, [flight]);

	if (!agent) return null;

	const blocked = agent.status !== "active";
	const amountNumber = Number(amount) || 0;
	const balance = balanceOf(symbol, chain);
	const insufficient = amountNumber > balance;
	const symbols = Array.from(
		new Set(assetsForChain(chain).map((a) => a.symbol)),
	);

	return (
		<Card className="animate-enter">
			<CardHeader title={`Subscribe · ${agent.name}`}>
				<button
					type="button"
					onClick={onClose}
					aria-label="Close subscribe"
					className="ml-auto text-[18px] text-dim hover:text-ink"
				>
					✕
				</button>
			</CardHeader>

			{blocked ? (
				<Empty
					title="This vault isn't accepting deposits"
					hint={`Status is ${agent.status}. Redeem stays open for existing subscribers, but new deposits are blocked until the creator resumes it.`}
				/>
			) : flight ? (
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
					{flight.status === "failed" ? (
						<>
							<p
								className="mt-2 border-2 border-sell px-2 py-1 text-[17px] text-sell"
								style={{ animation: "stamp 220ms steps(3, end) both" }}
							>
								{flight.reason ?? "Transaction failed."}
							</p>
							<Button
								variant="ghost"
								className="mt-2 w-full"
								onClick={() => dismissInFlight(flight.id)}
							>
								Back
							</Button>
						</>
					) : (
						<p className="mt-2 text-[16px] text-dim">
							Confirm in your wallet. You can leave this panel; it keeps moving.
						</p>
					)}
				</div>
			) : (
				<div className="space-y-3 p-3">
					{landed ? (
						<p
							className="border-2 border-accent px-2 py-1 text-[17px] text-accent"
							style={{ animation: "stamp 220ms steps(3, end) both" }}
						>
							Shares credited to your position.
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
							{CHAIN_LABEL[chain]} → Aurora solver → Deposit Receiver →{" "}
							{agent.name}
							's vault. No manual bridging.
						</p>
					</div>

					<Button
						variant="solid"
						size="lg"
						className="w-full"
						disabled={amountNumber <= 0 || insufficient}
						onClick={() =>
							subscribe({ agentId, chain, symbol, amount: amountNumber })
						}
					>
						Send intent
					</Button>
				</div>
			)}
		</Card>
	);
}
