import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { Field, Select, TextInput } from "#/components/ui/fields";
import {
	Button,
	Card,
	CardHeader,
	Empty,
	Label,
} from "#/components/ui/primitives";
import { RouteStepper } from "#/components/ui/route";
import { MockERC20Abi } from "#/lib/abi/MockERC20";
import { AURORA_ENABLED, chainLabel, fetchAuroraUsdc } from "#/lib/aurora";
import { CONTRACTS, USDC_DECIMALS } from "#/lib/chain";
import { useStore } from "#/lib/store";

/**
 * Reuses the deposit route's RouteStepper on purpose — same underlying
 * cross-chain motion the deposit flow already taught, now landing in one
 * agent's vault instead of a shared balance.
 */
export function SubscribeFlow({
	agentId,
	onClose,
}: {
	agentId: string;
	onClose: () => void;
}) {
	const { agents, subscribe, inFlight, dismissInFlight } = useStore();
	const agent = agents.find((a) => a.id === agentId);

	const { address } = useAccount();
	// Monad is always available (a plain deposit from the connected wallet). Other
	// chains come from Aurora's supported list and only when the integration is on.
	const { data: aurora } = useQuery({
		queryKey: ["aurora-usdc"],
		queryFn: fetchAuroraUsdc,
		enabled: AURORA_ENABLED,
		staleTime: 10 * 60 * 1000,
	});
	const chains = ["monad", ...(aurora?.origins.map((t) => t.blockchain) ?? [])];
	const [chain, setChain] = useState("monad");
	const [amount, setAmount] = useState("500");
	const { data: usdcBalance } = useReadContract({
		address: CONTRACTS.usdc,
		abi: MockERC20Abi,
		functionName: "balanceOf",
		args: address ? [address] : undefined,
		query: { enabled: !!address && chain === "monad", refetchInterval: 10_000 },
	});
	const [landed, setLanded] = useState(false);

	const flight =
		inFlight.find((e) => e.kind === "subscribe" && e.agentId === agentId) ??
		null;
	const wasFlying = useRef(false);

	useEffect(() => {
		if (flight?.status === "in-progress") {
			wasFlying.current = true;
			setLanded(false);
			return;
		}
		// The store removes a successful flight the moment its receipt lands; a
		// failed one stays (status "failed") until dismissed, and is not a landing.
		if (!flight && wasFlying.current) {
			wasFlying.current = false;
			setLanded(true);
		}
		if (flight?.status === "failed") wasFlying.current = false;
	}, [flight]);

	if (!agent) return null;

	const blocked = agent.status !== "active";
	const amountNumber = Number(amount) || 0;
	// Only the Monad balance is readable from here; Aurora reports origin-side
	// shortfalls itself when the transfer is attempted.
	const balance =
		chain === "monad" && usdcBalance !== undefined
			? Number(usdcBalance) / 10 ** USDC_DECIMALS
			: null;
	const insufficient = balance !== null && amountNumber > balance;
	const origin = aurora?.origins.find((t) => t.blockchain === chain);

	return (
		<Card className="animate-enter">
			<CardHeader title={`Subscribe · ${agent.name}`}>
				<button
					type="button"
					onClick={onClose}
					aria-label="Close subscribe"
					className="ml-auto text-[18px] text-dim hover:text-ink"
				>
					✕
				</button>
			</CardHeader>

			{blocked ? (
				<Empty
					title="This vault isn't accepting deposits"
					hint={`Status is ${agent.status}. Redeem stays open for existing subscribers, but new deposits are blocked until the creator resumes it.`}
				/>
			) : flight ? (
				<div className="p-3">
					<div className="flex items-baseline gap-2">
						<span className="text-[18px]">{flight.title}</span>
						<span className="tnum ml-auto text-[17px] text-dim">
							{flight.amount}
						</span>
					</div>
					<div className="mt-2">
						<RouteStepper steps={flight.steps ?? []} />
					</div>
					{flight.status === "failed" ? (
						<>
							<p
								className="mt-2 border-2 border-sell px-2 py-1 text-[17px] text-sell"
								style={{ animation: "stamp 220ms steps(3, end) both" }}
							>
								{flight.reason ?? "Transaction failed."}
							</p>
							<Button
								variant="ghost"
								className="mt-2 w-full"
								onClick={() => dismissInFlight(flight.id)}
							>
								Back
							</Button>
						</>
					) : (
						<p className="mt-2 text-[16px] text-dim">
							Confirm in your wallet. You can leave this panel; it keeps moving.
						</p>
					)}
				</div>
			) : (
				<div className="space-y-3 p-3">
					{landed ? (
						<p
							className="border-2 border-accent px-2 py-1 text-[17px] text-accent"
							style={{ animation: "stamp 220ms steps(3, end) both" }}
						>
							Shares credited to your position.
						</p>
					) : null}

					<Field
						label="Source chain"
						hint={chain === "monad" ? undefined : "via Aurora Intents"}
					>
						<Select value={chain} onChange={(e) => setChain(e.target.value)}>
							{chains.map((option) => (
								<option key={option} value={option}>
									{chainLabel(option)}
								</option>
							))}
						</Select>
					</Field>

					<Field
						label="Amount"
						hint={
							balance === null
								? "USDC"
								: `bal ${balance.toLocaleString("en-US")} USDC`
						}
						error={insufficient ? "Insufficient USDC on Monad" : undefined}
					>
						<TextInput
							inputMode="decimal"
							value={amount}
							onChange={(e) =>
								setAmount(e.target.value.replace(/[^0-9.]/g, ""))
							}
							invalid={insufficient}
							className="tnum"
						/>
					</Field>

					<div>
						<Label>Route</Label>
						<p className="mt-1 text-[17px] text-dim">
							{chain === "monad"
								? `Your wallet → ${agent.name}'s vault. Two transactions: approve, then deposit.`
								: `${chainLabel(chain)} → Aurora → your account on Monad → ${agent.name}'s vault. One signature, one transfer; no manual bridging.`}
						</p>
					</div>

					<Button
						variant="solid"
						size="lg"
						className="w-full"
						disabled={
							amountNumber <= 0 ||
							insufficient ||
							(chain !== "monad" && (!origin || !aurora?.destination))
						}
						onClick={() =>
							subscribe({
								agentId,
								chain,
								symbol: "USDC",
								amount: amountNumber,
								aurora:
									origin && aurora?.destination
										? { origin, destination: aurora.destination }
										: undefined,
							})
						}
					>
						{chain === "monad" ? "Deposit" : "Send intent"}
					</Button>
				</div>
			)}
		</Card>
	);
}
