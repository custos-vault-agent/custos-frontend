import { AllowanceMeter, AllowanceReadout } from "#/components/ui/meters";
import {
	Card,
	CardHeader,
	cx,
	Label,
	Led,
	StatusPill,
} from "#/components/ui/primitives";
import { Sigil } from "#/components/ui/Sigil";
import {
	formatAmount,
	formatCompactUsd,
	formatDay,
	formatPercent,
	shortAddress,
} from "#/lib/format";
import { useStore } from "#/lib/store";
import type { Agent } from "#/lib/types";

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

/**
 * The read-only view of an agent. Deliberately carries no owner controls even
 * when the viewer happens to be the owner — those live on /profile, so this
 * route can never be the place a mistake is made.
 */
export function AgentProfilePanel({
	agent,
	onClose,
}: {
	agent: Agent;
	onClose: () => void;
}) {
	const { history } = useStore();

	const trades = history
		.filter((e) => e.actor.kind === "agent" && e.actor.agentId === agent.id)
		.slice(0, 5);

	const paused = agent.status === "paused";
	const over = agent.used > agent.allowance;

	return (
		<Card className="animate-enter">
			<CardHeader title="Agent">
				<button
					type="button"
					onClick={onClose}
					aria-label="Close agent profile"
					className="ml-auto text-[18px] text-dim hover:text-ink"
				>
					✕
				</button>
			</CardHeader>

			<div className="space-y-3 p-3">
				<div className="flex items-start gap-3">
					<Sigil address={agent.agentAddress} size="lg" />
					<div className="min-w-0">
						<div className="flex items-center gap-2">
							<span className="truncate text-[23px]">{agent.name}</span>
							<Led on={!paused} />
						</div>
						<div className="mt-1 flex flex-wrap gap-2">
							<StatusPill tone={paused ? "neutral" : over ? "fail" : "ok"}>
								{paused ? "paused" : over ? "blocked" : "live"}
							</StatusPill>
							<StatusPill>{agent.resetPeriod}</StatusPill>
						</div>
					</div>
				</div>

				<p className="text-[17px] text-dim">{agent.description}</p>

				<div className="space-y-1 border-t border-edge pt-2">
					<AddressRow label="Agent" address={agent.agentAddress} />
					<AddressRow label="Owner" address={agent.ownerAddress} />
					<div className="flex items-center gap-2">
						<Label className="w-[112px] shrink-0">Registered</Label>
						<span className="text-[17px]">{formatDay(agent.registeredAt)}</span>
					</div>
				</div>

				<div className="border-t border-edge pt-2">
					<Label>Allowance</Label>
					<div className="mt-1">
						<AllowanceMeter
							used={agent.used}
							allowance={agent.allowance}
							tall
						/>
					</div>
					<div className="mt-1">
						<AllowanceReadout used={agent.used} allowance={agent.allowance} />
					</div>
					<p className="mt-1 text-[16px] text-dim">
						{over
							? "The owner lowered the cap below current usage. No new positions."
							: `Headroom ${formatAmount(agent.allowance - agent.used)} USDC · resets ${agent.resetPeriod}`}
					</p>
				</div>

				<div className="grid grid-cols-3 gap-2 border-t border-edge pt-2">
					<div>
						<div className="tnum text-[21px]">
							{formatCompactUsd(agent.stats.volume30d)}
						</div>
						<Label className="text-[14px] tracking-[1px]">30d vol</Label>
					</div>
					<div>
						<div className="tnum text-[21px]">
							{agent.stats.trades30d.toLocaleString("en-US")}
						</div>
						<Label className="text-[14px] tracking-[1px]">trades</Label>
					</div>
					<div>
						<div
							className={cx(
								"tnum text-[21px]",
								agent.stats.pnl30d < 0 ? "text-sell" : "text-accent",
							)}
						>
							{formatPercent(agent.stats.pnl30d, 1)}
						</div>
						<Label className="text-[14px] tracking-[1px]">30d pnl</Label>
					</div>
				</div>

				<div className="border-t border-edge pt-2">
					<Label>Recent trades</Label>
					{trades.length === 0 ? (
						<p className="mt-1 text-[17px] text-dim">
							Nothing recorded on this account yet.
						</p>
					) : (
						<ul className="mt-1 space-y-1">
							{trades.map((entry) => (
								<li
									key={entry.id}
									className="flex items-baseline gap-2 text-[17px]"
								>
									<span className="truncate">{entry.title}</span>
									<span className="tnum ml-auto shrink-0 text-dim">
										{entry.amount}
									</span>
								</li>
							))}
						</ul>
					)}
				</div>
			</div>
		</Card>
	);
}
