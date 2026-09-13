import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AgentSealBadge } from "#/components/AgentSealBadge";
import { DepositFlow } from "#/components/profile/DepositFlow";
import { EditAgentPanel } from "#/components/profile/EditAgentPanel";
import { RegisterAgentForm } from "#/components/profile/RegisterAgentForm";
import { VaultStrip } from "#/components/profile/VaultStrip";
import { WithdrawPanel } from "#/components/profile/WithdrawPanel";
import { Button, Card, Empty, Label } from "#/components/ui/primitives";
import { Sigil } from "#/components/ui/Sigil";
import { shortAddress } from "#/lib/format";
import { OWNER_ADDRESS, useStore } from "#/lib/store";

export const Route = createFileRoute("/profile")({
	component: ProfilePage,
});

type Panel =
	| { kind: "none" }
	| { kind: "deposit" }
	| { kind: "withdraw" }
	| { kind: "register" }
	| { kind: "edit"; id: string; danger: boolean };

function ProfilePage() {
	const { connected, connect, myAgents, pauseAgent, resumeAgent } = useStore();
	const [panel, setPanel] = useState<Panel>({ kind: "none" });

	const editing =
		panel.kind === "edit"
			? (myAgents.find((a) => a.id === panel.id) ?? null)
			: null;

	if (!connected) {
		return (
			<Card>
				<Empty
					title="Wallet not connected"
					hint="Your vault, your agents and their allowances live behind your wallet. Nothing here is readable without it."
					action={
						<Button variant="solid" size="lg" onClick={connect}>
							Connect wallet
						</Button>
					}
				/>
			</Card>
		);
	}

	return (
		<div className="flex flex-col gap-4 lg:flex-row lg:items-start">
			<div className="min-w-0 space-y-4 lg:flex-1">
				<div className="flex items-center gap-3">
					<Sigil address={OWNER_ADDRESS} size="md" tone="owner" />
					<div>
						<div className="text-[21px]">
							{shortAddress(OWNER_ADDRESS, 10, 6)}
						</div>
						<Label>Owner wallet</Label>
					</div>
				</div>

				<VaultStrip
					onDeposit={() => setPanel({ kind: "deposit" })}
					onWithdraw={() => setPanel({ kind: "withdraw" })}
				/>

				<div>
					<div className="mb-2 flex items-center gap-3">
						<Label>My agents</Label>
						<span className="text-[17px] text-dim">{myAgents.length}</span>
					</div>

					<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
						{myAgents.map((agent) => (
							<AgentSealBadge
								key={agent.id}
								agent={agent}
								selected={panel.kind === "edit" && panel.id === agent.id}
								actions={
									<>
										<Button
											size="sm"
											onClick={() =>
												setPanel({ kind: "edit", id: agent.id, danger: false })
											}
										>
											Edit
										</Button>
										<Button
											size="sm"
											onClick={() =>
												agent.status === "paused"
													? resumeAgent(agent.id)
													: pauseAgent(agent.id)
											}
										>
											{agent.status === "paused" ? "Resume" : "Pause"}
										</Button>
										<Button
											size="sm"
											variant="danger"
											className="ml-auto"
											onClick={() =>
												setPanel({ kind: "edit", id: agent.id, danger: true })
											}
										>
											Revoke
										</Button>
									</>
								}
							/>
						))}

						{/* The empty slot is a control, not decoration: registering is the
						    action this page exists to make routine. */}
						<button
							type="button"
							onClick={() => setPanel({ kind: "register" })}
							className="flex min-h-[180px] items-center justify-center border-2 border-dashed border-edge p-3 text-dim hover:border-accent hover:text-accent"
						>
							<span className="uppercase tracking-[1px]">
								+ Register new agent
							</span>
						</button>
					</div>
				</div>
			</div>

			<aside className="w-full lg:sticky lg:top-[70px] lg:w-[390px] lg:shrink-0">
				{panel.kind === "deposit" ? (
					<DepositFlow onClose={() => setPanel({ kind: "none" })} />
				) : panel.kind === "withdraw" ? (
					<WithdrawPanel onClose={() => setPanel({ kind: "none" })} />
				) : panel.kind === "register" ? (
					<RegisterAgentForm onClose={() => setPanel({ kind: "none" })} />
				) : editing ? (
					<EditAgentPanel
						key={editing.id}
						agent={editing}
						focusDanger={panel.kind === "edit" && panel.danger}
						onClose={() => setPanel({ kind: "none" })}
					/>
				) : (
					<Card>
						<Empty
							title="Nothing selected"
							hint="Pick an agent to change its allowance, or register a new one."
						/>
					</Card>
				)}
			</aside>
		</div>
	);
}
