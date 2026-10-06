import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { zeroAddress } from "viem";
import { useReadContract } from "wagmi";
import { AgentSealBadge } from "#/components/AgentSealBadge";
import { EditAgentPanel } from "#/components/profile/EditAgentPanel";
import { RegisterAgentForm } from "#/components/profile/RegisterAgentForm";
import { Button, Card, Empty, Label } from "#/components/ui/primitives";
import { Sigil } from "#/components/ui/Sigil";
import { RedeemPanel } from "#/components/vault/RedeemPanel";
import { NanSigilAbi } from "#/lib/abi/NanSigil";
import { CONTRACTS, monadChain } from "#/lib/chain";
import { formatAmount, formatDay, shortAddress } from "#/lib/format";
import { ATTESTATION_ENABLED } from "#/lib/nansigil";
import { useStore } from "#/lib/store";

export const Route = createFileRoute("/profile")({
	component: ProfilePage,
});

type Panel =
	| { kind: "none" }
	| { kind: "register" }
	| { kind: "edit"; id: string; danger: boolean }
	| { kind: "redeem"; agentId: string };

function ProfilePage() {
	const {
		connected,
		connect,
		connectedAddress,
		myAgents,
		myPositions,
		agents,
		pauseAgent,
		resumeAgent,
		claimNansenBadge,
		inFlight,
	} = useStore();
	const [panel, setPanel] = useState<Panel>({ kind: "none" });

	// The badge belongs to the wallet, not to an agent, so it is readable before
	// the first agent exists. `latest` gives the time; the label comes from the
	// indexer with the rest of the agent data.
	const { data: latestAttestation } = useReadContract({
		address: CONTRACTS.nansigil,
		abi: NanSigilAbi,
		functionName: "latest",
		chainId: monadChain.id,
		args: connectedAddress ? [connectedAddress as `0x${string}`] : undefined,
		query: {
			enabled: !!connectedAddress && CONTRACTS.nansigil !== zeroAddress,
		},
	});
	const attestedAt = latestAttestation ? Number(latestAttestation[1]) : 0;
	// `vault-config` is this action's kind and nothing else uses it yet.
	const claiming = inFlight.some((e) => e.kind === "vault-config");
	const badgeLabel =
		myAgents.find((a) => a.nansen?.verified)?.nansen?.label ?? null;

	const editing =
		panel.kind === "edit"
			? (myAgents.find((a) => a.id === panel.id) ?? null)
			: null;

	if (!connected || !connectedAddress) {
		return (
			<Card>
				<Empty
					title="Wallet not connected"
					hint="Your agents and vault positions live behind your wallet. Nothing here is readable without it."
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
			<div className="min-w-0 space-y-6 lg:flex-1">
				<div className="flex flex-wrap items-center gap-3">
					<Sigil address={connectedAddress ?? "0x0"} size="md" tone="owner" />
					<div>
						<div className="text-[21px]">
							{connectedAddress ? shortAddress(connectedAddress, 10, 6) : ""}
						</div>
						<Label>Connected wallet</Label>
					</div>

					{CONTRACTS.nansigil === zeroAddress ? null : (
						<div className="ml-auto text-right">
							<div className="text-[17px] text-dim">
								{attestedAt === 0
									? "No Nansen badge yet"
									: `Nansen badge · ${badgeLabel ?? "attested"} ${formatDay(attestedAt * 1000)}`}
							</div>
							<Button
								size="sm"
								className="mt-1"
								disabled={!ATTESTATION_ENABLED || claiming}
								onClick={claimNansenBadge}
							>
								{claiming
									? "Claiming…"
									: attestedAt === 0
										? "Get Nansen badge"
										: "Refresh badge"}
							</Button>
							{ATTESTATION_ENABLED ? null : (
								<div className="mt-1 text-[16px] text-dim">
									attestation service not configured
								</div>
							)}
						</div>
					)}
				</div>

				<div>
					<div className="mb-2 flex items-center gap-3">
						<Label>Agents I created</Label>
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

				<div>
					<div className="mb-2 flex items-center gap-3">
						<Label>Vaults I'm subscribed to</Label>
						<span className="text-[17px] text-dim">{myPositions.length}</span>
					</div>

					{myPositions.length === 0 ? (
						<Empty
							title="No positions yet"
							hint="Subscribe to a vault from the marketplace to see it here."
						/>
					) : (
						<Card>
							<div className="divide-y divide-edge">
								{myPositions.map((position) => {
									const agent = agents.find((a) => a.id === position.agentId);
									if (!agent) return null;
									const value = position.shares * agent.vault.sharePrice;
									const pnl = value - position.depositedAssets;
									return (
										<div
											key={position.agentId}
											className="flex items-center gap-3 p-3"
										>
											<Sigil address={agent.agentAddress} size="sm" />
											<Link
												to="/agents/$agentId"
												params={{ agentId: agent.id }}
												className="text-[18px] hover:text-accent"
											>
												{agent.name}
											</Link>
											<div className="ml-auto text-right">
												<div className="tnum text-[18px]">
													{formatAmount(value)} USDC
												</div>
												<div
													className={`tnum text-[16px] ${pnl < 0 ? "text-sell" : "text-accent"}`}
												>
													{pnl >= 0 ? "+" : ""}
													{formatAmount(pnl)}
												</div>
											</div>
											<Button
												size="sm"
												onClick={() =>
													setPanel({ kind: "redeem", agentId: agent.id })
												}
											>
												Redeem
											</Button>
										</div>
									);
								})}
							</div>
						</Card>
					)}
				</div>
			</div>

			<aside className="w-full lg:sticky lg:top-[70px] lg:w-[390px] lg:shrink-0">
				{panel.kind === "register" ? (
					<RegisterAgentForm onClose={() => setPanel({ kind: "none" })} />
				) : editing ? (
					<EditAgentPanel
						key={editing.id}
						agent={editing}
						focusDanger={panel.kind === "edit" && panel.danger}
						onClose={() => setPanel({ kind: "none" })}
					/>
				) : panel.kind === "redeem" ? (
					<RedeemPanel
						agentId={panel.agentId}
						onClose={() => setPanel({ kind: "none" })}
					/>
				) : (
					<Card>
						<Empty
							title="Nothing selected"
							hint="Pick an agent to edit, or register a new one."
						/>
					</Card>
				)}
			</aside>
		</div>
	);
}
