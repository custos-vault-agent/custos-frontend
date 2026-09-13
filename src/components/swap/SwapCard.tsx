import { useState } from "react";
import {
	Field,
	Select,
	SelectChip,
	Tabs,
	TextInput,
} from "#/components/ui/fields";
import { Button, Card, cx, Label } from "#/components/ui/primitives";
import { formatAmount, formatPrice } from "#/lib/format";
import type { AssetSymbol, ChainId, Quote, SwapMode } from "#/lib/types";
import { ASSETS, assetsForChain, balanceOf, CHAIN_LABEL } from "#/mock/assets";

const CHAINS: ChainId[] = ["solana", "base", "arbitrum", "ethereum", "monad"];

const EXPIRY = [
	{ value: "1d", label: "1 day" },
	{ value: "7d", label: "7 days" },
	{ value: "30d", label: "30 days" },
	{ value: "never", label: "Never" },
];

export type SwapCardProps = {
	mode: SwapMode;
	onModeChange: (mode: SwapMode) => void;
	sourceChain: ChainId;
	onSourceChainChange: (chain: ChainId) => void;
	fromSymbol: AssetSymbol;
	toSymbol: AssetSymbol;
	onFromSymbolChange: (symbol: AssetSymbol) => void;
	onToSymbolChange: (symbol: AssetSymbol) => void;
	onFlip: () => void;
	amount: string;
	onAmountChange: (value: string) => void;
	limitPrice: string;
	onLimitPriceChange: (value: string) => void;
	expiry: string;
	onExpiryChange: (value: string) => void;
	quote: Quote;
	connected: boolean;
	onConnect: () => void;
	onSubmit: () => void;
};

export function SwapCard(props: SwapCardProps) {
	const [spin, setSpin] = useState(0);

	const amountNumber = Number(props.amount) || 0;
	const balance = balanceOf(props.fromSymbol, props.sourceChain);
	const insufficient = amountNumber > balance;
	const empty = amountNumber <= 0;

	const receiveSymbols = Array.from(
		new Set(ASSETS.filter((a) => a.chain === "monad").map((a) => a.symbol)),
	);
	const paySymbols = Array.from(
		new Set(assetsForChain(props.sourceChain).map((a) => a.symbol)),
	);

	const limitNumber = Number(props.limitPrice) || 0;
	const limitReceive =
		props.mode === "limit" && limitNumber > 0
			? amountNumber / limitNumber
			: props.quote.receive;

	// Limit orders ship in v1.1: the contracts have no resting-order state yet, so
	// the tab stays visible as a preview but cannot submit anything. A button that
	// looks live and quietly does nothing is worse than one that says why.
	const limitSoon = props.mode === "limit";
	const disabled = limitSoon || empty || insufficient;

	return (
		<Card className="w-full">
			<Tabs
				items={[
					{ id: "market" as const, label: "Market" },
					{ id: "limit" as const, label: "Limit", hint: "soon" },
				]}
				value={props.mode}
				onChange={props.onModeChange}
			/>

			<div className="p-3">
				{/* ---------------- you pay ---------------- */}
				<div className="mb-1 flex flex-wrap items-center gap-2">
					<Label>You pay</Label>
					<Label className="text-[15px]">from</Label>
					<SelectChip
						value={props.sourceChain}
						onChange={(e) =>
							props.onSourceChainChange(e.target.value as ChainId)
						}
						aria-label="Source chain"
						className="text-[17px]"
					>
						{CHAINS.map((chain) => (
							<option key={chain} value={chain}>
								{CHAIN_LABEL[chain]}
							</option>
						))}
					</SelectChip>
					<span className="ml-auto text-[16px] text-dim">
						bal {formatAmount(balance)}
						<button
							type="button"
							onClick={() => props.onAmountChange(String(balance))}
							className="ml-2 uppercase tracking-[1px] text-accent hover:underline"
						>
							max
						</button>
					</span>
				</div>

				<div
					className={cx(
						"flex items-center gap-2 border-2 bg-surface2 px-2 py-1",
						insufficient ? "border-sell" : "border-edge",
					)}
				>
					<input
						inputMode="decimal"
						value={props.amount}
						onChange={(e) =>
							props.onAmountChange(e.target.value.replace(/[^0-9.]/g, ""))
						}
						placeholder="0"
						aria-label="Amount to pay"
						className="tnum min-w-0 flex-1 bg-transparent text-[35px] leading-none focus:outline-none"
					/>
					<SelectChip
						bare
						value={props.fromSymbol}
						onChange={(e) =>
							props.onFromSymbolChange(e.target.value as AssetSymbol)
						}
						aria-label="Asset to pay"
						className="text-[21px] text-accent"
					>
						{paySymbols.map((symbol) => (
							<option key={symbol} value={symbol}>
								{symbol}
							</option>
						))}
					</SelectChip>
				</div>

				{insufficient ? (
					<p className="mt-1 text-[16px] text-sell">Insufficient balance</p>
				) : null}

				{/* ---------------- flip ---------------- */}
				<div className="my-1 flex justify-center">
					<button
						type="button"
						onClick={() => {
							setSpin((s) => s + 1);
							props.onFlip();
						}}
						aria-label="Swap direction"
						className="border-2 border-edge px-2 text-accent hover:border-accent"
						style={{
							transform: `rotate(${spin * 180}deg)`,
							transition: "transform 180ms steps(4, end)",
						}}
					>
						⇅
					</button>
				</div>

				{/* ---------------- you receive ---------------- */}
				<div className="mb-1 flex flex-wrap items-center gap-2">
					<Label>You receive</Label>
					<Label className="text-[15px]">on</Label>
					{/* Not a select: everything settles on Kuru, and offering a
					    choice that has exactly one option would be a lie. */}
					<span className="border-2 border-edge bg-surface2 px-2 text-[17px] text-dim">
						Monad · Kuru CLOB
					</span>
				</div>
				<div className="flex items-center gap-2 border-2 border-edge bg-surface2 px-2 py-1">
					<span className="tnum min-w-0 flex-1 truncate text-[35px] leading-none text-dim">
						{empty ? "0" : formatAmount(limitReceive)}
					</span>
					<SelectChip
						bare
						value={props.toSymbol}
						onChange={(e) =>
							props.onToSymbolChange(e.target.value as AssetSymbol)
						}
						aria-label="Asset to receive"
						className="text-[21px] text-accent"
					>
						{receiveSymbols.map((symbol) => (
							<option key={symbol} value={symbol}>
								{symbol}
							</option>
						))}
					</SelectChip>
				</div>

				{/* ---------------- limit extras ---------------- */}
				{limitSoon ? (
					<>
						<p className="mt-3 border-2 border-dashed border-edge bg-surface2 px-2 py-1 text-[17px] text-dim">
							<span className="uppercase tracking-[1px] text-accent">
								Coming soon
							</span>{" "}
							— limit orders rest on Kuru until they fill, which needs order
							state Custos does not keep yet. Market swaps are live today.
						</p>

						<div className="mt-2 grid grid-cols-2 gap-2 opacity-50">
							<Field label="Limit price">
								<TextInput
									disabled
									inputMode="decimal"
									value={props.limitPrice}
									onChange={(e) =>
										props.onLimitPriceChange(
											e.target.value.replace(/[^0-9.]/g, ""),
										)
									}
									placeholder={formatPrice(1 / props.quote.rate)}
									className="tnum mt-1"
								/>
							</Field>
							<Field label="Expires">
								<Select
									disabled
									value={props.expiry}
									onChange={(e) => props.onExpiryChange(e.target.value)}
									className="mt-1"
								>
									{EXPIRY.map((option) => (
										<option key={option.value} value={option.value}>
											{option.label}
										</option>
									))}
								</Select>
							</Field>
						</div>
					</>
				) : null}

				{/* ---------------- rate ---------------- */}
				<div className="mt-3 flex items-center border-t border-edge pt-2 text-[17px] text-dim">
					<span>rate</span>
					<span className="tnum ml-auto text-accent">
						1 {props.fromSymbol} = {formatPrice(props.quote.rate)}{" "}
						{props.toSymbol}
					</span>
				</div>

				{/* ---------------- cta ---------------- */}
				{props.connected ? (
					<Button
						variant="primary"
						size="lg"
						disabled={disabled}
						onClick={props.onSubmit}
						className="mt-3 w-full"
					>
						{limitSoon ? "Limit orders coming soon" : "Swap via Custos"}
					</Button>
				) : (
					<Button
						variant="primary"
						size="lg"
						onClick={props.onConnect}
						className="mt-3 w-full"
					>
						Connect wallet
					</Button>
				)}
			</div>
		</Card>
	);
}
