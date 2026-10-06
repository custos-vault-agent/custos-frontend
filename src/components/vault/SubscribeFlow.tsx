import { EVM_CHAIN_IDS } from "@aurora-is-near/intents-connect";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { formatUnits } from "viem";
import { useAccount, useReadContract, useSwitchChain } from "wagmi";
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
import { CONTRACTS, monadChain, USDC_DECIMALS } from "#/lib/chain";
import { useStore } from "#/lib/store";
import { txErrorMessage } from "#/lib/txErrors";

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

	const { address, chainId: walletChainId } = useAccount();
	const { switchChainAsync } = useSwitchChain();
	const [switching, setSwitching] = useState(false);
	const [switchError, setSwitchError] = useState<string | null>(null);
	// Monad is always available (a plain deposit from the connected wallet). Other
	// chains come from Aurora's supported list and only when the integration is on.
	const {
		data: aurora,
		isPending: auroraPending,
		isError: auroraError,
	} = useQuery({
		queryKey: ["aurora-usdc"],
		queryFn: fetchAuroraUsdc,
		enabled: AURORA_ENABLED,
		staleTime: 10 * 60 * 1000,
	});
	// Cross-chain needs the integration switched on AND both ends of the route
	// (an origin USDC and USDC on Monad). Without it the vault's own chain is the
	// only source, and the picker says so rather than offering one dead option.
	const crossChain =
		AURORA_ENABLED &&
		!!aurora?.destination &&
		(aurora?.origins.length ?? 0) > 0;
	// A disabled query stays pending forever, so gate on AURORA_ENABLED.
	const auroraLoading = AURORA_ENABLED && auroraPending;
	const chains = crossChain
		? ["monad", ...(aurora?.origins ?? []).map((t) => t.blockchain)]
		: ["monad"];
	const [chain, setChain] = useState("monad");
	const [amount, setAmount] = useState("500");
	const origin = aurora?.origins.find((t) => t.blockchain === chain);
	const token =
		chain === "monad"
			? {
					address: CONTRACTS.usdc,
					decimals: USDC_DECIMALS,
					chainId: monadChain.id,
				}
			: origin && {
					address: origin.contractAddress as `0x${string}`,
					decimals: origin.decimals,
					chainId: EVM_CHAIN_IDS[chain as keyof typeof EVM_CHAIN_IDS],
				};
	const targetChainId = token?.chainId;
	const { data: usdcBalance, isLoading: balanceLoading } = useReadContract({
		address: token?.address,
		abi: MockERC20Abi,
		functionName: "balanceOf",
		args: address ? [address] : undefined,
		chainId: token?.chainId,
		query: { enabled: !!address && !!token, refetchInterval: 10_000 },
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

	// The deposit is signed on the origin chain (or Monad), so put the wallet there first.
	async function start() {
		if (!targetChainId) return;
		setSwitchError(null);
		if (walletChainId !== targetChainId) {
			setSwitching(true);
			try {
				await switchChainAsync({ chainId: targetChainId });
			} catch (err) {
				setSwitchError(txErrorMessage(err));
				return;
			} finally {
				setSwitching(false);
			}
		}
		subscribe({
			agentId,
			chain,
			symbol: "USDC",
			amount: amountNumber,
			aurora:
				origin && aurora?.destination
					? { origin, destination: aurora.destination }
					: undefined,
		});
	}

	if (!agent) return null;

	const blocked = agent.status !== "active";
	const amountNumber = Number(amount) || 0;
	const balance =
		token && usdcBalance !== undefined
			? Number(formatUnits(usdcBalance, token.decimals))
			: null;
	const insufficient = balance !== null && amountNumber > balance;
	const depositSent = flight?.steps?.some(
		(s) => s.id === "deposit" && s.state === "done",
	);

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
							{depositSent ? (
								<p className="mt-2 text-[17px] text-dim">
									The transfer already left your wallet and Aurora is still
									settling it. Don't send it again.
								</p>
							) : null}
							<div className="mt-2 flex gap-2">
								<Button
									variant="ghost"
									className="w-full"
									onClick={() => dismissInFlight(flight.id)}
								>
									Back
								</Button>
								{depositSent ? null : (
									<Button
										variant="solid"
										className="w-full"
										disabled={switching}
										onClick={() => {
											dismissInFlight(flight.id);
											void start();
										}}
									>
										Try again
									</Button>
								)}
							</div>
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
						hint={
							auroraLoading ? (
								<>
									loading chains
									<span className="ml-1 inline-block animate-blink text-accent">
										█
									</span>
								</>
							) : crossChain ? (
								chain === "monad" ? undefined : (
									"via Aurora Intents"
								)
							) : auroraError ? (
								"cross-chain unavailable"
							) : (
								"Monad only"
							)
						}
					>
						<Select
							value={chain}
							disabled={!crossChain || auroraLoading}
							onChange={(e) => setChain(e.target.value)}
						>
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
							balance !== null ? (
								`bal ${balance.toLocaleString("en-US")} USDC`
							) : balanceLoading ? (
								<>
									checking balance
									<span className="ml-1 inline-block animate-blink text-accent">
										█
									</span>
								</>
							) : (
								"USDC"
							)
						}
						error={
							insufficient
								? `Insufficient USDC on ${chainLabel(chain)}`
								: undefined
						}
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
							{chain !== "monad"
								? `${chainLabel(chain)} → Aurora → your account on Monad → ${agent.name}'s vault. One signature, one transfer; no manual bridging.`
								: crossChain
									? `Your wallet → ${agent.name}'s vault. Two transactions: approve, then deposit.`
									: `Your wallet → ${agent.name}'s vault. Two transactions: approve, then deposit. Cross-chain deposits are off, so USDC has to be on Monad already.`}
						</p>
					</div>

					<Button
						variant="solid"
						size="lg"
						className="w-full"
						disabled={
							amountNumber <= 0 ||
							insufficient ||
							switching ||
							(chain !== "monad" && (!origin || !aurora?.destination))
						}
						onClick={start}
					>
						{chain === "monad" ? "Deposit" : "Send intent"}
					</Button>
					{switchError ? (
						<p className="border-2 border-sell px-2 py-1 text-[17px] text-sell">
							{switchError}
						</p>
					) : null}
				</div>
			)}
		</Card>
	);
}
