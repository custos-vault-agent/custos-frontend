import { Empty, StatusPill } from "#/components/ui/primitives";
import { formatCompactUsd } from "#/lib/format";
import type { MarketFlow } from "#/lib/types";

const signed = (v: number) => `${v >= 0 ? "+" : ""}${formatCompactUsd(v)}`;

export function MarketFlowList({ flows }: { flows: MarketFlow[] }) {
	if (flows.length === 0)
		return (
			<Empty
				title="No flow data yet"
				hint="Flow appears once agents trade a market."
			/>
		);
	return (
		<div className="divide-y divide-edge">
			{flows.map((f) => (
				<div key={f.market} className="flex items-center gap-3 p-3 text-[17px]">
					<span className="w-[64px] shrink-0 truncate" title={f.market}>
						{`${f.symbol}/USDC`}
					</span>
					<StatusPill
						tone={
							f.trend === "accumulating"
								? "ok"
								: f.trend === "distributing"
									? "fail"
									: "neutral"
						}
					>
						{f.trend}
					</StatusPill>
					<span className="tnum ml-auto text-right text-dim">
						24h {signed(f.netFlow24h)} · 7d {signed(f.netFlow7d)}
					</span>
				</div>
			))}
		</div>
	);
}
