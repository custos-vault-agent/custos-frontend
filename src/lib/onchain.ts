import type { PublicClient } from "viem";
import { zeroAddress } from "viem";
import { AgentVaultAbi } from "./abi/AgentVault";
import { CustosCoreAbi } from "./abi/CustosCore";
import { NansenModuleAbi } from "./abi/NansenModule";
import { CONTRACTS, fromSharePriceUnits, fromTokenUnits, secondsToResetPeriod } from "./chain";
import { DEMO_NANSEN } from "./demoNansen";
import type { Agent, AgentStatus, NansenBadge } from "./types";

const DEAD_ADDRESS = "0x0000000000000000000000000000000000000001" as const;

const STATUS_BY_CODE: Record<number, AgentStatus> = {
	1: "active",
	2: "paused",
	3: "revoked",
};

const YIELD_SOURCE_ABI = [
	{
		type: "function",
		name: "apyBps",
		stateMutability: "view",
		inputs: [],
		outputs: [{ type: "uint256" }],
	},
] as const;

/** Fetches every registered agent and its vault's current on-chain state in
 *  four sequential multicall rounds — id count, ids, per-id records, then
 *  everything each record's vault/yieldSource address needs. No data comes
 *  from the indexer here: this is the "must never look stale after your own
 *  action" state, read live every time. */
export async function fetchAgents(publicClient: PublicClient): Promise<Agent[]> {
	const count = await publicClient.readContract({
		address: CONTRACTS.custosCore,
		abi: CustosCoreAbi,
		functionName: "agentCount",
	});

	if (count === 0n) return [];

	const idResults = await publicClient.multicall({
		contracts: Array.from({ length: Number(count) }, (_, i) => ({
			address: CONTRACTS.custosCore,
			abi: CustosCoreAbi,
			functionName: "agentAt",
			args: [BigInt(i)],
		})),
		allowFailure: false,
	});
	const ids = idResults as readonly `0x${string}`[];

	const records = (await publicClient.multicall({
		contracts: ids.map((id) => ({
			address: CONTRACTS.custosCore,
			abi: CustosCoreAbi,
			functionName: "getAgent",
			args: [id],
		})),
		allowFailure: false,
	})) as unknown as readonly {
		name: `0x${string}`;
		wallet: `0x${string}`;
		status: number;
		creator: `0x${string}`;
		vault: `0x${string}`;
		descriptionHash: `0x${string}`;
		feeRate: number;
		isPublic: boolean;
		registeredAt: bigint;
	}[];

	const vaultCalls = records.flatMap((r) => [
		{ address: r.vault, abi: AgentVaultAbi, functionName: "totalAssets" },
		{ address: r.vault, abi: AgentVaultAbi, functionName: "totalSupply" },
		{ address: r.vault, abi: AgentVaultAbi, functionName: "highWaterMark" },
		{ address: r.vault, abi: AgentVaultAbi, functionName: "status" },
		{ address: r.vault, abi: AgentVaultAbi, functionName: "allowance" },
		{ address: r.vault, abi: AgentVaultAbi, functionName: "usedInPeriod" },
		{ address: r.vault, abi: AgentVaultAbi, functionName: "periodLength" },
		{ address: r.vault, abi: AgentVaultAbi, functionName: "maxDrawdownBps" },
		{ address: r.vault, abi: AgentVaultAbi, functionName: "maxUtilizationBps" },
		{ address: r.vault, abi: AgentVaultAbi, functionName: "yieldSource" },
		{ address: r.vault, abi: AgentVaultAbi, functionName: "balanceOf", args: [DEAD_ADDRESS] },
	] as const);
	const vaultResults = (await publicClient.multicall({
		contracts: vaultCalls,
		allowFailure: false,
	})) as readonly unknown[];

	const FIELDS_PER_VAULT = 11;
	const vaultDataByIndex = records.map((_, i) => {
		const base = i * FIELDS_PER_VAULT;
		return {
			totalAssets: vaultResults[base] as bigint,
			totalSupply: vaultResults[base + 1] as bigint,
			highWaterMark: vaultResults[base + 2] as bigint,
			status: vaultResults[base + 3] as number,
			allowance: vaultResults[base + 4] as bigint,
			usedInPeriod: vaultResults[base + 5] as bigint,
			periodLength: vaultResults[base + 6] as number,
			maxDrawdownBps: vaultResults[base + 7] as number,
			maxUtilizationBps: vaultResults[base + 8] as number,
			yieldSource: vaultResults[base + 9] as `0x${string}`,
			seedShares: vaultResults[base + 10] as bigint,
		};
	});

	// yieldApyBps needs a second-hop read against each distinct yieldSource —
	// skipped entirely for disabled (zero-address) vaults.
	const yieldSourceAddrs = vaultDataByIndex
		.map((v) => v.yieldSource)
		.filter((addr) => addr !== zeroAddress);
	const apyResults =
		yieldSourceAddrs.length === 0
			? []
			: ((await publicClient.multicall({
					contracts: yieldSourceAddrs.map((addr) => ({
						address: addr,
						abi: YIELD_SOURCE_ABI,
						functionName: "apyBps",
					})),
					allowFailure: false,
				})) as readonly bigint[]);
	const apyByYieldSource = new Map(yieldSourceAddrs.map((addr, i) => [addr, apyResults[i]]));

	// Nansen badge: only ever "verified" if the on-chain hash actually checks
	// out against our known plaintext — never trusted from the plaintext alone.
	const nansenEntries = records
		.map((_, i) => ({ id: ids[i], entry: DEMO_NANSEN[ids[i].toLowerCase()] }))
		.filter((x): x is { id: `0x${string}`; entry: NonNullable<(typeof x)["entry"]> } => !!x.entry);
	const nansenResults =
		nansenEntries.length === 0
			? []
			: ((await publicClient.multicall({
					contracts: nansenEntries.map(({ id, entry }) => ({
						address: CONTRACTS.nansenModule,
						abi: NansenModuleAbi,
						functionName: "verifyAttestation",
						args: [id, entry.wallet, entry.label, BigInt(entry.pnl), entry.winRate, BigInt(entry.timestamp)],
					})),
					allowFailure: false,
				})) as unknown as readonly [boolean, `0x${string}`][]);
	const nansenById = new Map(
		nansenEntries.map(({ id, entry }, i) => {
			const [valid] = nansenResults[i];
			const badge: NansenBadge = {
				verified: valid,
				label: entry.label === "Smart Trader" || entry.label === "Fund" || entry.label === "Whale" ? entry.label : null,
				pnlUsd: entry.pnl,
				winRatePct: entry.winRate,
				attestedAt: entry.timestamp * 1000,
				stale: Date.now() - entry.timestamp * 1000 > 30 * 24 * 60 * 60 * 1000,
			};
			return [id.toLowerCase(), badge];
		}),
	);

	return records.map((r, i) => {
		const v = vaultDataByIndex[i];
		const totalAssets = fromTokenUnits(v.totalAssets);
		const totalShares = fromTokenUnits(v.totalSupply);
		const sharePrice = v.totalSupply > 0n ? totalAssets / totalShares : 1;
		const registeredAtMs = Number(r.registeredAt) * 1000;

		const agent: Agent = {
			id: ids[i],
			name: r.name, // bytes32 — decoded by callers that need display text; see Task 7 note
			description: "", // descriptionHash only — plaintext isn't on-chain (D9); left blank until an off-chain source exists
			agentAddress: r.wallet,
			creatorAddress: r.creator,
			isPublic: r.isPublic,
			allowance: fromTokenUnits(v.allowance),
			used: fromTokenUnits(v.usedInPeriod),
			resetPeriod: secondsToResetPeriod(v.periodLength),
			status: STATUS_BY_CODE[r.status] ?? "revoked",
			registeredAt: registeredAtMs,
			vault: {
				address: r.vault,
				asset: "USDC",
				totalAssets,
				totalShares,
				sharePrice,
				// Real history (from indexed SwapExecuted points) lands in a later
				// plan — this single synthetic baseline keeps every chart-rendering
				// component (which indexes sharePriceHistory[0]) safe in the
				// meantime, and is itself real: every vault starts at 1.0 exactly.
				sharePriceHistory: [
					{ t: registeredAtMs, price: 1 },
					{ t: Date.now(), price: sharePrice },
				],
				highWaterMark: fromSharePriceUnits(v.highWaterMark),
				feeRateBps: r.feeRate,
				maxDrawdownBps: v.maxDrawdownBps,
				maxUtilizationBps: v.maxUtilizationBps,
				yieldEnabled: v.yieldSource !== zeroAddress,
				yieldApyBps: v.yieldSource === zeroAddress ? 0 : Number(apyByYieldSource.get(v.yieldSource) ?? 0n),
				seedAssets: fromTokenUnits(v.seedShares),
				circuitBreakerTripped: v.status === 2 /* Paused */,
			},
			nansen: nansenById.get(ids[i].toLowerCase()) ?? null,
			// Real 30d aggregates (from indexed SwapExecuted) land in a later
			// plan — zero is the honest default for a vault with no history yet,
			// same philosophy the old mock data used for brand-new agents.
			stats: { volume30d: 0, trades30d: 0, pnl30d: 0 },
		};
		return agent;
	});
}
