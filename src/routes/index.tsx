import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { GateSidecar } from "#/components/swap/GateSidecar";
import { SwapCard } from "#/components/swap/SwapCard";
import { useStore } from "#/lib/store";
import type { AssetSymbol, ChainId, SwapMode } from "#/lib/types";
import { ASSETS, quoteFor } from "#/mock/assets";

export const Route = createFileRoute("/")({
	component: SwapPage,
});

/** The first chain that actually holds the asset, used when a flip would
 *  otherwise leave the pay side pointing at a chain with no balance. */
function chainForSymbol(symbol: AssetSymbol, preferred: ChainId): ChainId {
	if (ASSETS.some((a) => a.symbol === symbol && a.chain === preferred)) {
		return preferred;
	}
	return ASSETS.find((a) => a.symbol === symbol)?.chain ?? preferred;
}

function firstSymbolOn(chain: ChainId, avoid: AssetSymbol): AssetSymbol {
	const found = ASSETS.find((a) => a.chain === chain && a.symbol !== avoid);
	return found?.symbol ?? "USDC";
}

function SwapPage() {
	const store = useStore();

	const [mode, setMode] = useState<SwapMode>("market");
	const [sourceChain, setSourceChain] = useState<ChainId>("base");
	const [fromSymbol, setFromSymbol] = useState<AssetSymbol>("USDC");
	const [toSymbol, setToSymbol] = useState<AssetSymbol>("MON");
	const [amount, setAmount] = useState("1000");
	const [limitPrice, setLimitPrice] = useState("");
	const [expiry, setExpiry] = useState("7d");
	const [receipt, setReceipt] = useState<string | null>(null);

	const amountNumber = Number(amount) || 0;
	const quote = quoteFor(amountNumber, fromSymbol, toSymbol, store.tick);

	// The stamped confirmation is a beat, not a state. It clears itself.
	useEffect(() => {
		if (!receipt) return;
		const id = window.setTimeout(() => setReceipt(null), 3200);
		return () => window.clearTimeout(id);
	}, [receipt]);

	function handleSourceChainChange(chain: ChainId) {
		setSourceChain(chain);
		if (!ASSETS.some((a) => a.chain === chain && a.symbol === fromSymbol)) {
			setFromSymbol(ASSETS.find((a) => a.chain === chain)?.symbol ?? "USDC");
		}
	}

	function handleFlip() {
		const nextFrom = toSymbol;
		const nextTo = fromSymbol;
		const nextChain = chainForSymbol(nextFrom, sourceChain);
		setFromSymbol(nextFrom);
		setSourceChain(nextChain);
		// Everything settles on Monad, so a receive side that is not listed there
		// has to give way rather than silently quote a pair that cannot exist.
		setToSymbol(
			ASSETS.some((a) => a.chain === "monad" && a.symbol === nextTo)
				? nextTo
				: firstSymbolOn("monad", nextFrom),
		);
	}

	function handleSubmit() {
		if (mode === "limit") {
			const price = Number(limitPrice) || 0;
			if (price <= 0) return;
			const buying = fromSymbol === "USDC";
			store.placeLimitOrder({
				pair: buying
					? `${toSymbol}/${fromSymbol}`
					: `${fromSymbol}/${toSymbol}`,
				side: buying ? "buy" : "sell",
				price,
				total: buying ? amountNumber / price : amountNumber,
			});
			setReceipt(
				`Order resting on Kuru · ${buying ? "buy" : "sell"} @ ${price} · expires ${expiry}`,
			);
			return;
		}

		store.submitSwap({
			fromSymbol,
			toSymbol,
			sourceChain,
			amount: amountNumber,
			receive: quote.receive,
		});
		setReceipt("Intent signed. Watch it clear the gate →");
	}

	return (
		<div className="space-y-3">
			<div className="flex flex-col gap-4 lg:flex-row lg:items-start">
				<div className="w-full lg:max-w-[470px]">
					<SwapCard
						mode={mode}
						onModeChange={setMode}
						sourceChain={sourceChain}
						onSourceChainChange={handleSourceChainChange}
						fromSymbol={fromSymbol}
						toSymbol={toSymbol}
						onFromSymbolChange={setFromSymbol}
						onToSymbolChange={setToSymbol}
						onFlip={handleFlip}
						amount={amount}
						onAmountChange={setAmount}
						limitPrice={limitPrice}
						onLimitPriceChange={setLimitPrice}
						expiry={expiry}
						onExpiryChange={setExpiry}
						quote={quote}
						connected={store.connected}
						onConnect={store.connect}
						onSubmit={handleSubmit}
					/>

					{receipt ? (
						<p
							className="mt-2 border-2 border-accent px-2 py-1 text-[17px] text-accent"
							style={{ animation: "stamp 220ms steps(3, end) both" }}
						>
							{receipt}
						</p>
					) : null}
				</div>

				<div className="w-full lg:flex-1">
					<GateSidecar
						mode={mode}
						quote={quote}
						amount={amountNumber}
						fromSymbol={fromSymbol}
						toSymbol={toSymbol}
						sourceChain={sourceChain}
					/>
				</div>
			</div>
		</div>
	);
}
