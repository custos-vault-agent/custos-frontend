import { useState } from "react";
import { zeroAddress } from "viem";
import { useReadContract } from "wagmi";
import {
	Field,
	LockedValue,
	Select,
	TextArea,
	TextInput,
} from "#/components/ui/fields";
import { Button, Card, CardHeader, Label } from "#/components/ui/primitives";
import { Sigil } from "#/components/ui/Sigil";
import { CustosCoreAbi } from "#/lib/abi/CustosCore";
import {
	CONTRACTS,
	fromTokenUnits,
	monadChain,
	USDC_DECIMALS,
} from "#/lib/chain";
import { shortAddress } from "#/lib/format";
import { useStore } from "#/lib/store";
import type { ResetPeriod } from "#/lib/types";

const PERIODS: ResetPeriod[] = ["daily", "weekly", "monthly", "never"];
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export function RegisterAgentForm({ onClose }: { onClose: () => void }) {
	const { registerAgent, connectedAddress, yieldSources, curatedMarkets } =
		useStore();

	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [address, setAddress] = useState("");
	const [seedAmount, setSeedAmount] = useState("");
	const [allowance, setAllowance] = useState("");
	const [period, setPeriod] = useState<ResetPeriod>("daily");
	const [feeRatePercent, setFeeRatePercent] = useState("10");
	const [maxDrawdownPercent, setMaxDrawdownPercent] = useState("20");
	const [maxUtilizationPercent, setMaxUtilizationPercent] = useState("70");
	// Index into the offered sources; -1 = keep USDC idle.
	const [yieldIndex, setYieldIndex] = useState(0);
	const [pickedMarkets, setPickedMarkets] = useState<string[]>([]);
	const [isPublic, setIsPublic] = useState(true);
	const [touched, setTouched] = useState(false);

	// The floor lives in CustosCore.minSeed and the upgrade authority can move it,
	// so read it instead of shipping a copy in the bundle. `null` = not read yet.
	const { data: minSeedRaw } = useReadContract({
		address: CONTRACTS.custosCore,
		abi: CustosCoreAbi,
		functionName: "minSeed",
		chainId: monadChain.id,
	});
	const minSeed = minSeedRaw === undefined ? null : fromTokenUnits(minSeedRaw);

	const addressValid = ADDRESS.test(address.trim());
	// The registry stores the name as bytes32, so the limit is 32 bytes and not
	// 32 characters.
	const nameTooLong = new TextEncoder().encode(name.trim()).length > 32;
	const pickedYield = yieldSources[yieldIndex];
	const seedNumber = Number(seedAmount) || 0;
	const allowanceNumber = Number(allowance) || 0;
	const feeRateBps = Math.round((Number(feeRatePercent) || 0) * 100);
	const maxDrawdownBps = Math.round((Number(maxDrawdownPercent) || 0) * 100);
	const maxUtilizationBps = Math.round(
		(Number(maxUtilizationPercent) || 0) * 100,
	);

	// Compare in raw units, the way the contract does. A seed below one raw unit
	// rounds to zero on the way out, and registerAgent rejects a zero seed
	// whatever minSeed is (AgentRegistry L1).
	const seedRaw = BigInt(Math.round(seedNumber * 10 ** USDC_DECIMALS));
	const seedTooSmall =
		seedRaw < 1n || (minSeedRaw !== undefined && seedRaw < minSeedRaw);
	const seedError = seedAmount !== "" && seedTooSmall;
	const feeOutOfRange = feeRateBps > 5000;
	const drawdownOutOfRange =
		maxDrawdownBps !== 0 && (maxDrawdownBps < 100 || maxDrawdownBps > 5000);
	const utilizationOutOfRange =
		maxUtilizationBps < 1000 || maxUtilizationBps > 9500;

	const valid =
		name.trim().length > 0 &&
		!nameTooLong &&
		addressValid &&
		(curatedMarkets.length === 0 || pickedMarkets.length > 0) &&
		allowanceNumber > 0 &&
		!seedTooSmall &&
		!feeOutOfRange &&
		!drawdownOutOfRange &&
		!utilizationOutOfRange;

	return (
		<Card className="animate-enter">
			<CardHeader title="Register agent">
				<button
					type="button"
					onClick={onClose}
					aria-label="Close register form"
					className="ml-auto text-[18px] text-dim hover:text-ink"
				>
					✕
				</button>
			</CardHeader>

			<div className="space-y-3 p-3">
				<div>
					<Label>Creator wallet (locked)</Label>
					<div className="mt-1">
						<LockedValue>
							{connectedAddress ? shortAddress(connectedAddress, 10, 6) : ""}
						</LockedValue>
					</div>
				</div>

				<Field
					label="Agent name"
					error={nameTooLong ? "Maximum is 32 bytes" : undefined}
				>
					<TextInput
						value={name}
						onChange={(e) => setName(e.target.value)}
						invalid={nameTooLong}
						placeholder="grid-bot-8"
						maxLength={32}
					/>
				</Field>

				<Field label="Description" hint={`${description.length}/140`}>
					<TextArea
						rows={3}
						value={description}
						onChange={(e) => setDescription(e.target.value.slice(0, 140))}
						placeholder="What this agent does, in one line."
					/>
				</Field>

				<Field
					label="Agent wallet address"
					error={
						touched && address.length > 0 && !addressValid
							? "That is not a valid address"
							: undefined
					}
				>
					<div className="flex items-center gap-2">
						<span className="shrink-0 border-2 border-edge bg-surface2 p-1">
							<Sigil address={addressValid ? address.trim() : ""} size="md" />
						</span>
						<TextInput
							value={address}
							onChange={(e) => setAddress(e.target.value)}
							onBlur={() => setTouched(true)}
							invalid={touched && address.length > 0 && !addressValid}
							placeholder="0x…"
							spellCheck={false}
							className="font-pixel"
						/>
					</div>
				</Field>

				<Field
					label="Seed deposit"
					hint="locked permanently — this is your skin in the game"
					error={
						seedError
							? minSeed
								? `Minimum is ${minSeed} USDC`
								: "Enter at least 0.000001 USDC"
							: undefined
					}
				>
					<TextInput
						inputMode="decimal"
						value={seedAmount}
						onChange={(e) =>
							setSeedAmount(e.target.value.replace(/[^0-9.]/g, ""))
						}
						invalid={seedError}
						className="tnum"
					/>
				</Field>

				<Field label="Allowance" hint="per-period trading limit">
					<TextInput
						inputMode="decimal"
						value={allowance}
						onChange={(e) =>
							setAllowance(e.target.value.replace(/[^0-9.]/g, ""))
						}
						placeholder="2500"
						className="tnum"
					/>
				</Field>

				<Field label="Reset period">
					<Select
						value={period}
						onChange={(e) => setPeriod(e.target.value as ResetPeriod)}
					>
						{PERIODS.map((option) => (
							<option key={option} value={option}>
								{option}
							</option>
						))}
					</Select>
				</Field>

				<Field
					label="Performance fee"
					hint="immutable after this — 0-50%"
					error={feeOutOfRange ? "Max is 50%" : undefined}
				>
					<TextInput
						inputMode="decimal"
						value={feeRatePercent}
						onChange={(e) =>
							setFeeRatePercent(e.target.value.replace(/[^0-9.]/g, ""))
						}
						invalid={feeOutOfRange}
						className="tnum"
					/>
				</Field>

				<Field
					label="Max drawdown (circuit breaker)"
					hint="immutable — 0 disables, else 1-50%"
					error={drawdownOutOfRange ? "1-50%, or 0 to disable" : undefined}
				>
					<TextInput
						inputMode="decimal"
						value={maxDrawdownPercent}
						onChange={(e) =>
							setMaxDrawdownPercent(e.target.value.replace(/[^0-9.]/g, ""))
						}
						invalid={drawdownOutOfRange}
						className="tnum"
					/>
				</Field>

				<Field
					label="Max utilization (reserve ratio)"
					hint="immutable — 10-95%"
					error={utilizationOutOfRange ? "Must be 10-95%" : undefined}
				>
					<TextInput
						inputMode="decimal"
						value={maxUtilizationPercent}
						onChange={(e) =>
							setMaxUtilizationPercent(e.target.value.replace(/[^0-9.]/g, ""))
						}
						invalid={utilizationOutOfRange}
						className="tnum"
					/>
				</Field>

				{yieldSources.length === 1 ? (
					<label className="flex items-center gap-2 text-[17px]">
						<input
							type="checkbox"
							checked={!!pickedYield}
							onChange={(e) => setYieldIndex(e.target.checked ? 0 : -1)}
						/>
						Deploy idle capital to yield (immutable) ·{" "}
						{(yieldSources[0].apyBps / 100).toFixed(2)}% APY
					</label>
				) : yieldSources.length > 1 ? (
					<Field label="Yield source" hint="immutable after this">
						<Select
							value={yieldIndex}
							onChange={(e) => setYieldIndex(Number(e.target.value))}
						>
							<option value={-1}>none (keep USDC idle)</option>
							{yieldSources.map((y, i) => (
								<option key={y.address} value={i}>
									{shortAddress(y.address)} · {(y.apyBps / 100).toFixed(2)}% APY
								</option>
							))}
						</Select>
					</Field>
				) : null}

				<label className="flex items-center gap-2 text-[17px]">
					<input
						type="checkbox"
						checked={isPublic}
						onChange={(e) => setIsPublic(e.target.checked)}
					/>
					List publicly on the marketplace
				</label>

				<p className="border-l-2 border-edge pl-2 text-[16px] text-dim">
					This agent will only ever be able to call executeSwap on its own
					vault, up to its allowance. It cannot withdraw or transfer funds.
				</p>

				<div className="space-y-2 border-t border-edge pt-2">
					<Label>Markets</Label>
					{curatedMarkets.length === 0 ? (
						<p className="border-l-2 border-edge pl-2 text-[16px] text-dim">
							The protocol has not curated any market yet. Enable them in Edit
							agent once they exist.
						</p>
					) : (
						<>
							{curatedMarkets.map((m) => (
								<label
									key={m.market}
									className="flex items-center gap-2 text-[17px]"
								>
									<input
										type="checkbox"
										checked={pickedMarkets.includes(m.market)}
										onChange={(e) =>
											setPickedMarkets((list) =>
												e.target.checked
													? [...list, m.market]
													: list.filter((x) => x !== m.market),
											)
										}
									/>
									{m.baseSymbol}
								</label>
							))}
							<p className="border-l-2 border-edge pl-2 text-[16px] text-dim">
								Pick at least one. Each is enabled with its own transaction
								after registration.
							</p>
						</>
					)}
				</div>

				<Button
					variant="solid"
					size="lg"
					className="w-full"
					disabled={!valid}
					onClick={() => {
						registerAgent({
							name: name.trim(),
							description: description.trim(),
							agentAddress: address.trim(),
							seedAmount: seedNumber,
							allowance: allowanceNumber,
							resetPeriod: period,
							feeRateBps,
							maxDrawdownBps,
							maxUtilizationBps,
							yieldSource: pickedYield?.address ?? zeroAddress,
							markets: pickedMarkets,
							isPublic,
						});
						onClose();
					}}
				>
					Issue seal
				</Button>
			</div>
		</Card>
	);
}
