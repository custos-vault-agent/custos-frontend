import { Link } from "@tanstack/react-router";
import { FillBar, ImpactMeter } from "#/components/ui/meters";
import {
	Button,
	Card,
	CardHeader,
	cx,
	Empty,
	Label,
} from "#/components/ui/primitives";
import { RouteRail, RouteStepper } from "#/components/ui/route";
import { Sigil } from "#/components/ui/Sigil";
import { formatAmount, formatNumber, formatPrice } from "#/lib/format";
import { useStore } from "#/lib/store";
import type {
	ActivityEntry,
	AssetSymbol,
	ChainId,
	LimitOrder,
	Quote,
	SwapMode,
} from "#/lib/types";
import { CHAIN_LABEL } from "#/mock/assets";

function Row({
	label,
	value,
	tone,
}: {
	label: string;
	value: string;
	tone?: string;
}) {
	return (
		<div className="flex items-baseline gap-3 text-[17px]">
			<span className="text-dim">{label}</span>
			<span className={cx("tnum ml-auto", tone ?? "text-ink")}>{value}</span>
		</div>
	);
}

/* -------------------------------------------------------------------------- */

function QuotePanel({
	quote,
	amount,
	fromSymbol,
	toSymbol,
	sourceChain,
}: {
	quote: Quote;
	amount: number;
	fromSymbol: AssetSymbol;
	toSymbol: AssetSymbol;
	sourceChain: ChainId;
}) {
	if (amount <= 0) {
		return (
			<Empty
				title="Enter an amount"
				hint="The route and its costs appear here before you sign anything."
			/>
		);
	}

	return (
		<div className="space-y-3 p-3">
			<div>
				<Label>Route</Label>
				<div className="mt-1">
					<RouteRail
						nodes={[CHAIN_LABEL[sourceChain], "Aurora", "Custos", "Kuru"]}
					/>
				</div>
				<p className="mt-1 text-[16px] text-dim">
					No manual bridging. The solver settles the leg.
				</p>
			</div>

			<div className="space-y-1 border-t border-edge pt-2">
				<Row
					label="rate"
					value={`${formatPrice(quote.rate)} ${toSymbol}/${fromSymbol}`}
				/>
				<Row
					label="min received"
					value={`${formatAmount(quote.minimumReceived)} ${toSymbol}`}
				/>
				<Row label="network fee" value={`$${formatNumber(quote.networkFee)}`} />
				<Row
					label="protocol fee"
					value={`$${formatNumber(quote.protocolFee)}`}
				/>
			</div>

			<div className="border-t border-edge pt-2">
				<div className="flex items-baseline gap-3 text-[17px]">
					<span className="text-dim">price impact</span>
					<span
						className={cx(
							"tnum ml-auto",
							quote.priceImpact >= 1.5
								? "text-sell"
								: quote.priceImpact >= 0.6
									? "text-warn"
									: "text-accent",
						)}
					>
						{quote.priceImpact.toFixed(2)}%
					</span>
				</div>
				<div className="mt-1">
					<ImpactMeter impact={quote.priceImpact} />
				</div>
			</div>
		</div>
	);
}

/* -------------------------------------------------------------------------- */

function OrderRow({
	order,
	onCancel,
}: {
	order: LimitOrder;
	onCancel: () => void;
}) {
	const partial = order.filled > 0;

	return (
		<div className="animate-enter border-b border-edge px-3 py-2 last:border-b-0">
			<div className="flex items-baseline gap-2">
				<span
					className={cx(
						"uppercase tracking-[1px]",
						order.side === "buy" ? "text-accent" : "text-sell",
					)}
				>
					{order.side}
				</span>
				<span className="text-[18px]">{order.pair}</span>
				<span className="tnum ml-auto text-[18px]">
					@ {formatPrice(order.price)}
				</span>
			</div>

			<FillBar filled={order.filled} total={order.total} />

			<div className="mt-1 flex items-baseline gap-2 text-[16px] text-dim">
				<span className="tnum">
					{partial
						? `${formatAmount(order.filled)} / ${formatAmount(order.total)} filled`
						: `${formatAmount(order.total)} MON · unfilled`}
				</span>
				<Button
					size="sm"
					variant="ghost"
					className="ml-auto"
					onClick={onCancel}
				>
					Cancel
				</Button>
			</div>
		</div>
	);
}

function OrdersPanel() {
	const { openOrders, cancelOrder } = useStore();

	if (openOrders.length === 0) {
		return (
			<Empty
				title="No open orders"
				hint="A limit order rests on Kuru until it fills, or until you cancel it."
			/>
		);
	}

	return (
		<div>
			{openOrders.map((order) => (
				<OrderRow
					key={order.id}
					order={order}
					onCancel={() => cancelOrder(order.id)}
				/>
			))}
		</div>
	);
}

/* -------------------------------------------------------------------------- */

function FlightPanel({ entries }: { entries: ActivityEntry[] }) {
	return (
		<div className="divide-y divide-edge">
			{entries.map((entry) => (
				<div key={entry.id} className="animate-enter p-3">
					<div className="flex items-baseline gap-2">
						<span className="text-[18px]">{entry.title}</span>
						<span className="tnum ml-auto text-[17px] text-dim">
							{entry.amount}
						</span>
					</div>
					{entry.steps ? (
						<div className="mt-2">
							<RouteStepper steps={entry.steps} />
						</div>
					) : null}
				</div>
			))}
		</div>
	);
}

/* -------------------------------------------------------------------------- */

/**
 * The sidecar is one panel that changes what it is watching. It always answers
 * the same question — "what is passing through the gate right now?" — so a
 * single frame is more honest than three separate boxes stacked down the page.
 */
export function GateSidecar({
	mode,
	quote,
	amount,
	fromSymbol,
	toSymbol,
	sourceChain,
}: {
	mode: SwapMode;
	quote: Quote;
	amount: number;
	fromSymbol: AssetSymbol;
	toSymbol: AssetSymbol;
	sourceChain: ChainId;
}) {
	const { inFlight, myAgents, delegated, openOrders } = useStore();
	const active = myAgents.filter((a) => a.status === "active");

	const view =
		inFlight.length > 0 ? "flight" : mode === "limit" ? "orders" : "quote";

	const meta =
		view === "flight"
			? `${inFlight.length} moving`
			: view === "orders"
				? `${openOrders.length} open`
				: "quote";

	return (
		<div className="space-y-3">
			<Card>
				<CardHeader title="⊂ Gate" meta={meta} />
				{view === "flight" ? (
					<FlightPanel entries={inFlight} />
				) : view === "orders" ? (
					<OrdersPanel />
				) : (
					<QuotePanel
						quote={quote}
						amount={amount}
						fromSymbol={fromSymbol}
						toSymbol={toSymbol}
						sourceChain={sourceChain}
					/>
				)}
			</Card>

			<Card>
				<CardHeader
					title="At this gate"
					meta={`${formatAmount(delegated)} USDC`}
				/>
				<div className="p-3">
					<p className="text-[17px] text-dim">
						{active.length === 0
							? "No agent may act through this contract."
							: `${active.length} agent${active.length > 1 ? "s" : ""} may trade through this contract, never beyond their allowance.`}
					</p>
					{active.length > 0 ? (
						<div className="mt-2 flex flex-wrap items-center gap-2">
							{active.map((agent) => (
								<span
									key={agent.id}
									className="flex items-center gap-2 border border-edge px-2 py-[1px] text-[16px] text-dim"
									title={agent.name}
								>
									<Sigil address={agent.agentAddress} size="xs" />
									{agent.name}
								</span>
							))}
						</div>
					) : null}
					<Link
						to="/agents"
						className="mt-2 inline-block text-[17px] uppercase tracking-[1px] text-accent hover:underline"
					>
						Manage agents →
					</Link>
				</div>
			</Card>
		</div>
	);
}
