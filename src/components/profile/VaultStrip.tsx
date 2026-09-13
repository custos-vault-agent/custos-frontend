import { CountUp } from "#/components/ui/CountUp";
import { VaultLegend, VaultSplitBar } from "#/components/ui/meters";
import { Button, Card, Label } from "#/components/ui/primitives";
import { useStore } from "#/lib/store";

export function VaultStrip({
	onDeposit,
	onWithdraw,
}: {
	onDeposit: () => void;
	onWithdraw: () => void;
}) {
	const { balance, delegated, available, myAgents } = useStore();

	const active = myAgents.filter((a) => a.status === "active").length;
	const paused = myAgents.filter((a) => a.status === "paused").length;

	return (
		<Card className="p-3">
			<div className="flex flex-wrap items-end gap-4">
				<div>
					<Label>Balance in Custos Storage</Label>
					<div className="mt-1 flex items-baseline gap-2">
						<span className="text-[48px] leading-none">
							<CountUp value={balance} />
						</span>
						<span className="text-[21px] text-dim">USDC</span>
					</div>
				</div>

				<div className="ml-auto flex gap-2">
					<Button variant="primary" onClick={onDeposit}>
						+ Deposit
					</Button>
					<Button onClick={onWithdraw}>Withdraw</Button>
				</div>
			</div>

			<div className="mt-3">
				<VaultSplitBar delegated={delegated} available={available} />
				<VaultLegend
					delegated={delegated}
					available={available}
					meta={`${active} agent${active === 1 ? "" : "s"} active · ${paused} paused`}
				/>
			</div>
		</Card>
	);
}
