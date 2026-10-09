import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { MarketFlowList } from "#/components/MarketFlowList";
import { NansenBadgeChip } from "#/components/NansenBadge";
import {
	DrawdownGauge,
	ReserveRatioBar,
	ReserveRatioLegend,
} from "#/components/ui/meters";
import {
	Button,
	Card,
	CardHeader,
	cx,
	Empty,
	Label,
	Led,
	StatusPill,
} from "#/components/ui/primitives";
import { Sigil } from "#/components/ui/Sigil";
import { RedeemPanel } from "#/components/vault/RedeemPanel";
import { SharePriceChart } from "#/components/vault/SharePriceChart";
import { SubscribeFlow } from "#/components/vault/SubscribeFlow";
import {
	formatAmount,
	formatClock,
	formatCompactUsd,
	formatDay,
	formatDuration,
	formatPercent,
	livenessPill,
	moneyWeightedReturn,
	shortAddress,
	tradingStyle,
} from "#/lib/format";
import { useStore } from "#/lib/store";

export const Route = createFileRoute("/agents/$agentId")({
	component: VaultDetailPage,
});

function AddressRow({
	label,
	address,
	creator = false,
}: {
	label: string;
	address: string;
	creator?: boolean;
}) {
	return (
		<div className="flex items-center gap-2">
			<Label className="w-[112px] shrink-0">{label}</Label>
			{creator ? (
				<Link
					to="/creators/$address"
					params={{ address }}
					className="truncate text-[17px] underline hover:text-accent"
					title={address}
				>
					{shortAddress(address, 10, 6)}
				</Link>
			) : (
				<span className="truncate text-[17px]" title={address}>
					{shortAddress(address, 10, 6)}
				</span>
			)}
		</div>
	);
}

type Panel = "none" | "subscribe" | "redeem";

function VaultDetailPage() {
	const { agentId } = Route.useParams();
	const { agents, agentsLoading, myPositions, history, marketFlow } =
		useStore();
	const [panel, setPanel] = useState<Panel>("none");

	const agent = agents.find((a) => a.id === agentId);
	if (!agent) {
		if (agentsLoading) {
			return (
				<Card>
					<Empty
						title="Loading vault…"
						hint="Fetching the latest on-chain state."
					/>
				</Card>
			);
		}
		return (
			<Card>
				<Empty title="Vault not found" hint="It may have been revoked." />
			</Card>
		);
	}

	const position = myPositions.find((p) => p.agentId === agentId);
	const trades = history
		.filter((e) => e.agentId === agentId && e.kind === "agent-trade")
		.sort((a, b) => b.timestamp - a.timestamp);

	const reserved =
		agent.vault.totalAssets * (agent.vault.maxUtilizationBps / 10_000);
	const utilized = agent.vault.totalAssets - reserved;
	const paused = agent.status === "paused";
	const revoked = agent.status === "revoked";

	const yourValue = position ? position.shares * agent.vault.sharePrice : 0;
	const { sharePriceHistory: series, highWaterMark: hwm } = agent.vault;
	const change =
		series.length >= 2 && series[0].price > 0
			? (agent.vault.sharePrice / series[0].price - 1) * 100
			: null;
	const drawdown =
		hwm > 0 ? Math.max(0, (1 - agent.vault.sharePrice / hwm) * 100) : 0;
	const signals = marketFlow.filter((f) => agent.markets.includes(f.market));
	const liveness = livenessPill(agent);
	const b = agent.behaviour;
	const style = tradingStyle(agent);
	const weeks = Math.max(
		(Date.now() - agent.registeredAt) / (7 * 86_400_000),
		1 / 7,
	);
	const maxHour = b ? Math.max(...b.tradeHours, 1) : 1;
	const dollarReturn = agent.stats.dollarReturn;
	const shareReturn = (agent.vault.sharePrice - 1) * 100;
	const yourReturn =
		position?.assetsIn === undefined || position.assetsOut === undefined
			? null
			: moneyWeightedReturn(yourValue, position.assetsOut, position.assetsIn);
	const yourPnl =
		position?.depositedAssets === undefined
			? null
			: yourValue - position.depositedAssets;

	return (
		<div className="flex flex-col gap-4 lg:flex-row lg:items-start">
			<div className="min-w-0 space-y-4 lg:flex-1">
				<Link
					to="/"
					className="inline-block text-[17px] uppercase tracking-[1px] text-dim hover:text-ink"
				>
					← Marketplace
				</Link>

				<Card>
					<div className="space-y-3 p-3">
						<div className="flex items-start gap-3">
							<Sigil address={agent.agentAddress} size="lg" />
							<div className="min-w-0">
								<div className="flex items-center gap-2">
									<span className="truncate text-[23px]">{agent.name}</span>
									<Led on={!paused && !revoked} />
								</div>
								<div className="mt-1 flex flex-wrap gap-2">
									<StatusPill
										tone={revoked ? "fail" : paused ? "neutral" : "ok"}
									>
										{agent.status}
									</StatusPill>
									{!agent.isPublic ? <StatusPill>unlisted</StatusPill> : null}
									{liveness ? (
										<StatusPill tone={liveness.tone}>
											{liveness.label}
										</StatusPill>
									) : null}
									{agent.vault.circuitBreakerTripped ? (
										<StatusPill tone="fail">
											breaker tripped ·{" "}
											{(agent.vault.maxDrawdownBps / 100).toFixed(0)}% drawdown
										</StatusPill>
									) : null}
								</div>
							</div>
						</div>

						<p className="text-[17px] text-dim">{agent.description}</p>

						<div className="space-y-1 border-t border-edge pt-2">
							<AddressRow label="Agent" address={agent.agentAddress} />
							<AddressRow
								label="Creator"
								address={agent.creatorAddress}
								creator
							/>
							<div className="flex items-center gap-2">
								<Label className="w-[112px] shrink-0">Registered</Label>
								<span className="text-[17px]">
									{formatDay(agent.registeredAt)}
								</span>
							</div>
						</div>

						<div className="border-t border-edge pt-2">
							<NansenBadgeChip nansen={agent.nansen} size="lg" />
						</div>
					</div>
				</Card>

				<Card>
					<div className="flex items-center gap-3 border-b-2 border-edge px-3 py-2">
						<Sigil address={agent.agentAddress} size="sm" />
						<Label className="truncate">{agent.name} · share price</Label>
						<div className="ml-auto">
							<StatusPill tone={revoked ? "fail" : paused ? "neutral" : "ok"}>
								{agent.status}
							</StatusPill>
						</div>
					</div>
					<div className="space-y-3 p-3">
						<div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
							<div className="flex items-baseline gap-3">
								<span className="tnum text-[32px]">
									{agent.vault.sharePrice.toFixed(4)}
								</span>
								{change === null ? null : (
									<span
										className={cx(
											"tnum text-[17px]",
											change < 0 ? "text-sell" : "text-accent",
										)}
									>
										{change >= 0 ? "+" : ""}
										{change.toFixed(2)}%
									</span>
								)}
							</div>
							<div className="flex gap-5">
								<div>
									<Label className="text-[14px] tracking-[1px]">
										high water mark
									</Label>
									<div className="tnum text-[20px]">{hwm.toFixed(4)}</div>
								</div>
								<div>
									<Label className="text-[14px] tracking-[1px]">drawdown</Label>
									<div className="tnum text-[20px]">{drawdown.toFixed(1)}%</div>
								</div>
								<div>
									<Label className="text-[14px] tracking-[1px]">TVL</Label>
									<div className="tnum text-[20px]">
										{formatCompactUsd(agent.vault.totalAssets)}
									</div>
								</div>
							</div>
						</div>

						<SharePriceChart
							history={series}
							highWaterMark={hwm}
							maxDrawdownBps={agent.vault.maxDrawdownBps}
						/>

						<div className="border-t border-edge pt-2">
							<div className="grid grid-cols-2 gap-3">
								<div>
									<div
										className={cx(
											"tnum text-[20px]",
											shareReturn < 0 ? "text-sell" : "text-accent",
										)}
									>
										{formatPercent(shareReturn)}
									</div>
									<Label className="text-[14px] tracking-[1px]">
										share-price return
									</Label>
								</div>
								<div>
									<div
										className={cx(
											"tnum text-[20px]",
											dollarReturn !== null && dollarReturn < 0
												? "text-sell"
												: "text-accent",
										)}
									>
										{dollarReturn === null
											? "—"
											: formatPercent(dollarReturn * 100)}
									</div>
									<Label className="text-[14px] tracking-[1px]">
										dollar-weighted return
									</Label>
								</div>
							</div>
							<p className="mt-1 text-[16px] text-dim">
								Share price is time-weighted. The dollar-weighted number follows
								when capital actually arrived, so a gap either way is timing.
							</p>
						</div>

						<div className="grid grid-cols-2 gap-3 border-t border-edge pt-2">
							<div>
								<div className="tnum text-[20px]">
									{(agent.vault.feeRateBps / 100).toFixed(1)}%
								</div>
								<Label className="text-[14px] tracking-[1px]">perf. fee</Label>
							</div>
							<div>
								<div className="tnum text-[20px]">
									{formatCompactUsd(agent.vault.seedAssets)}
								</div>
								<Label className="text-[14px] tracking-[1px]">
									seed (locked)
								</Label>
							</div>
						</div>

						<div className="grid grid-cols-2 gap-3 border-t border-edge pt-2 sm:grid-cols-4">
							<div>
								<div
									className={cx(
										"tnum text-[20px]",
										agent.stats.realizedPnl < 0 ? "text-sell" : "text-accent",
									)}
								>
									{agent.stats.realizedPnl >= 0 ? "+" : "-"}$
									{formatAmount(Math.abs(agent.stats.realizedPnl))}
								</div>
								<Label className="text-[14px] tracking-[1px]">
									realized p/l
								</Label>
							</div>
							<div>
								<div className="tnum text-[20px]">
									{agent.stats.winRatePct === null
										? "—"
										: `${agent.stats.winRatePct.toFixed(0)}%`}
								</div>
								<Label className="text-[14px] tracking-[1px]">win rate</Label>
							</div>
							<div>
								<div className="tnum text-[20px]">
									{agent.stats.closedTrades}
								</div>
								<Label className="text-[14px] tracking-[1px]">
									closed trades
								</Label>
							</div>
							<div>
								<div className="tnum text-[20px]">
									{agent.stats.subscribers}
								</div>
								<Label className="text-[14px] tracking-[1px]">
									subscribers
								</Label>
							</div>
						</div>
					</div>
				</Card>

				<Card>
					<CardHeader title="Behaviour" meta={style ?? undefined} />
					{!b || b.swapCount === 0 ? (
						<Empty
							title={b ? "Never traded" : "No behaviour data"}
							hint={
								b
									? "Habits appear after the first swap."
									: "Behaviour needs the indexer, which is unreachable."
							}
						/>
					) : (
						<div className="space-y-3 p-3">
							<div>
								<svg
									viewBox="0 0 240 64"
									className="block h-auto w-full"
									role="img"
								>
									<title>Swaps by UTC hour</title>
									{b.tradeHours.map((n, h) => (
										<rect
											// biome-ignore lint/suspicious/noArrayIndexKey: fixed 24 buckets
											key={h}
											x={h * 10 + 1}
											y={58 - (n / maxHour) * 56}
											width={8}
											height={(n / maxHour) * 56}
											fill="var(--cx-accent)"
										>
											<title>{`${String(h).padStart(2, "0")}:00 UTC · ${n}`}</title>
										</rect>
									))}
									<line
										x1={0}
										x2={240}
										y1={58.5}
										y2={58.5}
										stroke="var(--cx-edge)"
									/>
								</svg>
								<Label className="text-[14px] tracking-[1px]">
									swaps by hour, UTC · 00 to 23
								</Label>
							</div>
							<div className="grid grid-cols-2 gap-3 border-t border-edge pt-2 sm:grid-cols-4">
								<div>
									<div className="tnum text-[20px]">
										{b.avgHoldSeconds === null
											? "—"
											: formatDuration(b.avgHoldSeconds)}
									</div>
									<Label className="text-[14px] tracking-[1px]">avg hold</Label>
								</div>
								<div>
									<div className="tnum text-[20px]">
										{(b.swapCount / weeks).toFixed(1)}
									</div>
									<Label className="text-[14px] tracking-[1px]">
										swaps / week
									</Label>
								</div>
								<div>
									<div className="tnum text-[20px]">
										{b.avgSize === null
											? "—"
											: agent.allowance > 0
												? `${((b.avgSize / agent.allowance) * 100).toFixed(0)}%`
												: formatCompactUsd(b.avgSize)}
									</div>
									<Label className="text-[14px] tracking-[1px]">
										typical size / budget
									</Label>
								</div>
								<div>
									<div className="tnum text-[20px]">
										{formatCompactUsd(b.maxNotional)}
									</div>
									<Label className="text-[14px] tracking-[1px]">
										largest swap
									</Label>
								</div>
							</div>
							<div className="tnum border-t border-edge pt-2 text-[17px] text-dim">
								{b.buyCount} buys · {b.swapCount - b.buyCount} sells
							</div>
						</div>
					)}
				</Card>

				<Card>
					<CardHeader title="Reserve ratio" />
					<div className="p-3">
						<ReserveRatioBar utilized={utilized} reserved={reserved} />
						<ReserveRatioLegend
							utilized={utilized}
							reserved={reserved}
							meta={`${(100 - agent.vault.maxUtilizationBps / 100).toFixed(0)}% always liquid`}
						/>
					</div>
				</Card>

				<Card>
					<CardHeader title="Idle yield" />
					<div className="p-3 text-[17px] text-dim">
						{agent.vault.yieldEnabled ? (
							<p>
								Enabled — idle capital earns ~
								{(agent.vault.yieldApyBps / 100).toFixed(1)}% APY while not
								deployed to trading.
							</p>
						) : (
							<p>Disabled for this vault — idle capital does not earn yield.</p>
						)}
					</div>
				</Card>

				<Card>
					<CardHeader title="Circuit breaker" />
					<div className="p-3">
						<DrawdownGauge
							sharePrice={agent.vault.sharePrice}
							highWaterMark={agent.vault.highWaterMark}
							maxDrawdownBps={agent.vault.maxDrawdownBps}
							tripped={agent.vault.circuitBreakerTripped}
						/>
						<p className="mt-2 text-[16px] text-dim">
							{agent.vault.maxDrawdownBps === 0
								? "This vault has no auto-pause on drawdown."
								: `Auto-pauses if share price falls more than ${(agent.vault.maxDrawdownBps / 100).toFixed(0)}% from its high-water mark.`}
						</p>
					</div>
				</Card>

				<Card>
					<CardHeader title="Agent consensus" meta="Custos agents · 24h / 7d" />
					{signals.length === 0 ? (
						<Empty
							title="No flow data yet"
							hint="Flow appears once this vault has traded a market."
						/>
					) : (
						<MarketFlowList flows={signals} />
					)}
				</Card>
			</div>

			<aside className="w-full space-y-3 lg:sticky lg:top-[70px] lg:w-[390px] lg:shrink-0">
				{panel === "subscribe" ? (
					<SubscribeFlow agentId={agent.id} onClose={() => setPanel("none")} />
				) : panel === "redeem" ? (
					<RedeemPanel agentId={agent.id} onClose={() => setPanel("none")} />
				) : (
					<>
						<Card>
							<CardHeader title="Your position" />
							{position && position.shares > 0 ? (
								<div className="space-y-1 p-3">
									<div className="flex items-baseline gap-3">
										<span className="tnum text-[21px]">
											{formatAmount(yourValue)} USDC
										</span>
										{yourPnl === null ? null : (
											<span
												className={cx(
													"tnum text-[17px]",
													yourPnl < 0 ? "text-sell" : "text-accent",
												)}
											>
												{yourPnl >= 0 ? "+" : ""}
												{formatAmount(yourPnl)} P/L
											</span>
										)}
									</div>
									<div className="tnum text-[17px] text-dim">
										{formatAmount(position.shares)} shares
									</div>
									{yourReturn === null ? null : (
										<div className="tnum text-[17px] text-dim">
											{formatPercent(yourReturn * 100)} money-weighted return
										</div>
									)}
								</div>
							) : (
								<Empty
									title="No position yet"
									hint="Subscribe to start earning with this agent."
								/>
							)}
						</Card>

						<Card>
							<div className="flex gap-2 p-3">
								<Button
									variant="solid"
									size="lg"
									className="flex-1"
									onClick={() => setPanel("subscribe")}
								>
									Subscribe
								</Button>
								<Button
									size="lg"
									className="flex-1"
									onClick={() => setPanel("redeem")}
								>
									Redeem
								</Button>
							</div>
						</Card>

						<Card>
							<CardHeader title="Agent trades" />
							{trades.length === 0 ? (
								<Empty
									title="No trades yet"
									hint="Swaps this agent makes will show up here."
								/>
							) : (
								// Fixed height: a long trade log must not stretch the page.
								<div className="max-h-[320px] divide-y divide-edge overflow-y-auto">
									{trades.map((t) => (
										<div key={t.id} className="flex gap-3 p-3 text-[17px]">
											<span className="tnum w-[52px] shrink-0 text-dim">
												{formatClock(t.timestamp)}
											</span>
											<div className="min-w-0">
												<div className="truncate">
													{t.title.split(" · ")[0]} · {t.amount}
												</div>
												{t.amountSub ? (
													<div className="tnum text-[16px] text-dim">
														{t.amountSub}
													</div>
												) : null}
											</div>
										</div>
									))}
								</div>
							)}
						</Card>
					</>
				)}
			</aside>
		</div>
	);
}
