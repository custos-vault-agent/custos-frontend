import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ActivityRow } from "#/components/activity/ActivityRow";
import { NansenBadgeChip } from "#/components/NansenBadge";
import {
	DrawdownGauge,
	ReserveRatioBar,
	ReserveRatioLegend,
	SharePriceSpark,
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
import { SubscribeFlow } from "#/components/vault/SubscribeFlow";
import {
	formatAmount,
	formatCompactUsd,
	formatDay,
	shortAddress,
} from "#/lib/format";
import { useStore } from "#/lib/store";
import { smartMoneyFor } from "#/mock/smartMoney";

export const Route = createFileRoute("/agents/$agentId")({
	component: VaultDetailPage,
});

function AddressRow({ label, address }: { label: string; address: string }) {
	return (
		<div className="flex items-center gap-2">
			<Label className="w-[112px] shrink-0">{label}</Label>
			<span className="truncate text-[17px]" title={address}>
				{shortAddress(address, 10, 6)}
			</span>
		</div>
	);
}

type Panel = "none" | "subscribe" | "redeem";

function VaultDetailPage() {
	const { agentId } = Route.useParams();
	const { agents, agentsLoading, myPositions, history } = useStore();
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
	const vaultActivity = history
		.filter((e) => e.agentId === agentId)
		.slice(0, 10);
	const signals = smartMoneyFor(agentId);

	const reserved =
		agent.vault.totalAssets * (agent.vault.maxUtilizationBps / 10_000);
	const utilized = agent.vault.totalAssets - reserved;
	const paused = agent.status === "paused";
	const revoked = agent.status === "revoked";

	const yourValue = position ? position.shares * agent.vault.sharePrice : 0;
	const yourPnl = position ? yourValue - position.depositedAssets : 0;

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
							<AddressRow label="Creator" address={agent.creatorAddress} />
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
					<CardHeader title="Vault" meta={agent.vault.address.slice(0, 10)} />
					<div className="space-y-3 p-3">
						<div className="flex items-end justify-between gap-3">
							<div>
								<div className="tnum text-[32px]">
									{agent.vault.sharePrice.toFixed(4)}
								</div>
								<Label>share price</Label>
							</div>
							<SharePriceSpark
								history={agent.vault.sharePriceHistory}
								width={160}
								height={44}
							/>
						</div>

						<div className="grid grid-cols-2 gap-3 border-t border-edge pt-2 sm:grid-cols-4">
							<div>
								<div className="tnum text-[20px]">
									{formatCompactUsd(agent.vault.totalAssets)}
								</div>
								<Label className="text-[14px] tracking-[1px]">TVL</Label>
							</div>
							<div>
								<div className="tnum text-[20px]">
									{agent.vault.highWaterMark.toFixed(4)}
								</div>
								<Label className="text-[14px] tracking-[1px]">
									high water mark
								</Label>
							</div>
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

						{position ? (
							<div className="border-t border-edge pt-2">
								<Label>Your position</Label>
								<div className="mt-1 flex items-baseline gap-3">
									<span className="tnum text-[21px]">
										{formatAmount(yourValue)} USDC
									</span>
									<span
										className={cx(
											"tnum text-[17px]",
											yourPnl < 0 ? "text-sell" : "text-accent",
										)}
									>
										{yourPnl >= 0 ? "+" : ""}
										{formatAmount(yourPnl)} P/L
									</span>
								</div>
							</div>
						) : null}
					</div>
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
					<CardHeader title="Smart Money signals" />
					{signals.length === 0 ? (
						<Empty
							title="No Smart Money data yet"
							hint="Signals appear once this vault has traded a token Nansen tracks."
						/>
					) : (
						<div className="divide-y divide-edge">
							{signals.map((signal) => (
								<div
									key={signal.tokenSymbol}
									className="flex items-center gap-3 p-3 text-[17px]"
								>
									<span className="w-[64px] shrink-0">
										{signal.tokenSymbol}
									</span>
									<StatusPill
										tone={
											signal.trend === "accumulating"
												? "ok"
												: signal.trend === "distributing"
													? "fail"
													: "neutral"
										}
									>
										{signal.trend}
									</StatusPill>
									<span className="tnum ml-auto text-dim">
										24h {signal.netFlow24h >= 0 ? "+" : ""}
										{formatCompactUsd(signal.netFlow24h)}
									</span>
								</div>
							))}
						</div>
					)}
				</Card>

				<Card>
					<CardHeader title="Recent activity" />
					{vaultActivity.length === 0 ? (
						<Empty
							title="Nothing recorded on this vault yet"
							hint="Trades, subscribes and redeems will show up here."
						/>
					) : (
						<div>
							{vaultActivity.map((entry) => (
								<ActivityRow key={entry.id} entry={entry} />
							))}
						</div>
					)}
				</Card>
			</div>

			<aside className="w-full space-y-3 lg:sticky lg:top-[70px] lg:w-[390px] lg:shrink-0">
				{panel === "subscribe" ? (
					<SubscribeFlow agentId={agent.id} onClose={() => setPanel("none")} />
				) : panel === "redeem" ? (
					<RedeemPanel agentId={agent.id} onClose={() => setPanel("none")} />
				) : (
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
				)}
			</aside>
		</div>
	);
}
