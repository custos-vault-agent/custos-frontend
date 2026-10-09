import type { PublicClient } from "viem";
import { hexToString, zeroAddress } from "viem";
import { AgentVaultAbi } from "./abi/AgentVault";
import { CustosCoreAbi } from "./abi/CustosCore";
import { MockERC20Abi } from "./abi/MockERC20";
import { NanSigilAbi } from "./abi/NanSigil";
import {
	CONTRACTS,
	fromSharePriceUnits,
	fromTokenUnits,
	monadChain,
	secondsToResetPeriod,
} from "./chain";
import { moneyWeightedReturn } from "./format";
import { fetchIndexedAgents, type MarketMeta } from "./indexer";
import type {
	Agent,
	AgentStatus,
	MarketFlow,
	NansenBadge,
	Position,
} from "./types";

const DEAD_ADDRESS = "0x0000000000000000000000000000000000000001" as const;

/** The registry stores a name as bytes32, right-padded with zero bytes. Both the
 *  chain and the indexer serve that raw value, so decode it here, once. */
function decodeName(name: `0x${string}`): string {
	return hexToString(name, { size: 32 }).replace(/\0+$/, "");
}

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

const BASE_TOKEN_ABI = [
	{
		type: "function",
		name: "baseToken",
		stateMutability: "view",
		inputs: [],
		outputs: [{ type: "address" }],
	},
] as const;

export type BaseToken = {
	address: `0x${string}`;
	symbol: string;
	decimals: number;
};

/** The Kuru market's base token, read once per refresh. Null when any read
 *  fails, so one bad market never blanks the marketplace. */
async function fetchBaseToken(
	publicClient: PublicClient,
): Promise<BaseToken | null> {
	try {
		const adapter = await publicClient.readContract({
			address: CONTRACTS.custosCore,
			abi: CustosCoreAbi,
			functionName: "marketAdapter",
		});
		if (adapter === zeroAddress) return null;
		const address = await publicClient.readContract({
			address: adapter,
			abi: BASE_TOKEN_ABI,
			functionName: "baseToken",
		});
		if (address === zeroAddress) return null;
		const [symbol, decimals] = await Promise.all([
			publicClient.readContract({
				address,
				abi: MockERC20Abi,
				functionName: "symbol",
			}),
			publicClient.readContract({
				address,
				abi: MockERC20Abi,
				functionName: "decimals",
			}),
		]);
		return { address, symbol, decimals };
	} catch (err) {
		console.warn("base token metadata unavailable:", err);
		return null;
	}
}

type RegistryRecord = {
	name: `0x${string}`;
	wallet: `0x${string}`;
	creator: `0x${string}`;
	vault: `0x${string}`;
	feeRate: number;
	isPublic: boolean;
	registeredAt: bigint;
};

/** Agent list straight from the registry: three multicall rounds (count, ids,
 *  records). Used when the indexer is unreachable. */
async function listFromChain(publicClient: PublicClient) {
	const count = await publicClient.readContract({
		address: CONTRACTS.custosCore,
		abi: CustosCoreAbi,
		functionName: "agentCount",
	});
	if (count === 0n)
		return { ids: [] as `0x${string}`[], records: [] as RegistryRecord[] };

	const ids = (await publicClient.multicall({
		contracts: Array.from({ length: Number(count) }, (_, i) => ({
			address: CONTRACTS.custosCore,
			abi: CustosCoreAbi,
			functionName: "agentAt",
			args: [BigInt(i)],
		})),
		allowFailure: false,
	})) as readonly `0x${string}`[];

	const records = (await publicClient.multicall({
		contracts: ids.map((id) => ({
			address: CONTRACTS.custosCore,
			abi: CustosCoreAbi,
			functionName: "getAgent",
			args: [id],
		})),
		allowFailure: false,
	})) as unknown as readonly RegistryRecord[];
	return { ids: [...ids], records: [...records] };
}

const THIRTY_DAYS = 30 * 24 * 60 * 60;

/** The agent list, description and price history come from the indexer; the
 *  vault's current numbers (totalAssets, supply, HWM, allowance used, status)
 *  are read live so a user's own action never looks stale. If the indexer is
 *  unreachable the list falls back to the registry and history to a two-point
 *  baseline. */
export async function fetchAgents(
	publicClient: PublicClient,
	account?: `0x${string}`,
): Promise<{
	agents: Agent[];
	positions: Position[];
	base: BaseToken | null;
	markets: Map<string, MarketMeta>;
	marketFlow: MarketFlow[];
}> {
	// The RPC decides which chain this really is. A VITE_RPC_URL that points at a
	// different network than VITE_CHAIN_ID makes the wallet ask for the wrong chain
	// and every address read return nothing, so say that instead of showing an
	// empty marketplace.
	const chainId = await publicClient.getChainId();
	if (chainId !== monadChain.id) {
		throw new Error(
			`VITE_RPC_URL serves chain ${chainId}, but VITE_CHAIN_ID is ${monadChain.id}. Point both at the same network and rebuild.`,
		);
	}

	const base = await fetchBaseToken(publicClient);

	const indexed = await fetchIndexedAgents(chainId, account).catch((err) => {
		console.warn("indexer unavailable, listing from chain:", err);
		return null;
	});

	const { ids, records } = indexed
		? {
				ids: indexed.agents.map((a) => a.id),
				records: indexed.agents.map<RegistryRecord>((a) => ({
					name: a.name,
					wallet: a.wallet,
					creator: a.creator,
					vault: a.vault,
					feeRate: a.feeRate,
					isPublic: a.isPublic,
					registeredAt: BigInt(a.registeredAt),
				})),
			}
		: await listFromChain(publicClient);
	const markets = indexed?.markets ?? new Map<string, MarketMeta>();
	const marketFlow = indexed?.marketFlow ?? [];
	if (ids.length === 0)
		return { agents: [], positions: [], base, markets, marketFlow };
	const descriptionById = new Map(
		indexed?.agents.map((a) => [a.id.toLowerCase(), a.description]) ?? [],
	);
	const indexedById = new Map(
		indexed?.agents.map((a) => [a.id.toLowerCase(), a]) ?? [],
	);

	const vaultCalls = records.flatMap(
		(r) =>
			[
				{ address: r.vault, abi: AgentVaultAbi, functionName: "totalAssets" },
				{ address: r.vault, abi: AgentVaultAbi, functionName: "totalSupply" },
				{ address: r.vault, abi: AgentVaultAbi, functionName: "highWaterMark" },
				{ address: r.vault, abi: AgentVaultAbi, functionName: "status" },
				{ address: r.vault, abi: AgentVaultAbi, functionName: "allowance" },
				{ address: r.vault, abi: AgentVaultAbi, functionName: "usedInPeriod" },
				{ address: r.vault, abi: AgentVaultAbi, functionName: "periodLength" },
				{
					address: r.vault,
					abi: AgentVaultAbi,
					functionName: "maxDrawdownBps",
				},
				{
					address: r.vault,
					abi: AgentVaultAbi,
					functionName: "maxUtilizationBps",
				},
				{ address: r.vault, abi: AgentVaultAbi, functionName: "yieldSource" },
				{
					address: r.vault,
					abi: AgentVaultAbi,
					functionName: "balanceOf",
					args: [DEAD_ADDRESS],
				},
				{
					address: r.vault,
					abi: AgentVaultAbi,
					functionName: "breakerTripped",
				},
				{
					address: r.vault,
					abi: AgentVaultAbi,
					functionName: "balanceOf",
					args: [account ?? zeroAddress],
				},
			] as const,
	);
	const vaultResults = (await publicClient.multicall({
		contracts: vaultCalls,
		allowFailure: false,
	})) as readonly unknown[];

	const FIELDS_PER_VAULT = 13;
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
			breakerTripped: vaultResults[base + 11] as boolean,
			shares: vaultResults[base + 12] as bigint,
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
	const apyByYieldSource = new Map(
		yieldSourceAddrs.map((addr, i) => [addr, apyResults[i]]),
	);

	// Nansen badge: the plaintext comes from the indexer (NanSigil's event carries
	// it), but "verified" is only ever what NanSigil.verify says on-chain for the
	// creator wallet — never trusted from the plaintext alone. Keyed by creator:
	// one attestation covers every agent that wallet made.
	const attested = new Map(
		(indexed?.agents ?? [])
			.filter((a) => a.nansenAttestedAt != null && a.nansenLabel != null)
			.map((a) => [a.creator.toLowerCase(), a]),
	);
	const attestedList = [...attested.values()];
	const verifyResults =
		attestedList.length === 0 || CONTRACTS.nansigil === zeroAddress
			? []
			: ((await publicClient.multicall({
					contracts: attestedList.map((a) => {
						return {
							address: CONTRACTS.nansigil,
							abi: NanSigilAbi,
							functionName: "verify",
							args: [
								a.creator,
								a.nansenLabel ?? "",
								a.nansenPnl ?? 0n,
								a.nansenWinRate ?? 0,
								BigInt(a.nansenAttestedAt ?? 0),
							],
						};
					}),
					allowFailure: false,
				})) as unknown as readonly [boolean, `0x${string}`][]);
	const nansenByCreator = new Map(
		attestedList.map((a, i) => {
			const attestedAtMs = (a.nansenAttestedAt ?? 0) * 1000;
			const badge: NansenBadge = {
				verified: verifyResults[i]?.[0] ?? false,
				label:
					a.nansenLabel === "Smart Trader" ||
					a.nansenLabel === "Fund" ||
					a.nansenLabel === "Whale"
						? a.nansenLabel
						: null,
				pnlUsd: Number(a.nansenPnl ?? 0n),
				winRatePct: a.nansenWinRate ?? 0,
				attestedAt: attestedAtMs,
				stale: Date.now() - attestedAtMs > 30 * 24 * 60 * 60 * 1000,
			};
			return [a.creator.toLowerCase(), badge];
		}),
	);

	const agents = records.map((r, i) => {
		const v = vaultDataByIndex[i];
		const totalAssets = fromTokenUnits(v.totalAssets);
		const totalShares = fromTokenUnits(v.totalSupply);
		const sharePrice = v.totalSupply > 0n ? totalAssets / totalShares : 1;
		const registeredAtMs = Number(r.registeredAt) * 1000;
		const points = indexed?.pointsByAgent.get(ids[i].toLowerCase()) ?? [];
		const snapshots = indexed?.snapshotsByAgent.get(ids[i].toLowerCase()) ?? [];
		const row = indexedById.get(ids[i].toLowerCase());
		const since = Math.floor(Date.now() / 1000) - THIRTY_DAYS;
		const recent = points.filter((p) => p.timestamp >= since);
		const swapTimes = points
			.filter((p) => p.source === "swap")
			.map((p) => p.timestamp);
		const swaps30d = recent.filter((p) => p.source === "swap");
		// Price at the start of the window: last point before it, else the first one.
		const priceThen = fromSharePriceUnits(
			(points.filter((p) => p.timestamp < since).at(-1) ?? points[0])
				?.sharePrice ?? 10n ** 18n,
		);

		const agent: Agent = {
			id: ids[i],
			name: decodeName(r.name),
			// Plaintext lives only in the AgentRegistered log (D9); the indexer keeps it.
			description: descriptionById.get(ids[i].toLowerCase()) ?? "",
			agentAddress: r.wallet,
			creatorAddress: r.creator,
			isPublic: r.isPublic,
			allowance: fromTokenUnits(v.allowance),
			used: fromTokenUnits(v.usedInPeriod),
			resetPeriod: secondsToResetPeriod(v.periodLength),
			// Vault status, not the registry copy: a circuit-breaker pause only exists on the vault.
			status: STATUS_BY_CODE[v.status] ?? "revoked",
			registeredAt: registeredAtMs,
			vault: {
				address: r.vault,
				asset: "USDC",
				totalAssets,
				totalShares,
				sharePrice,
				// Indexed observations (seed, every swap, breaker trips) plus the live
				// price as the last point. Without the indexer: 1.0 at registration
				// and the live price now.
				sharePriceHistory: [
					...(points.length > 0 || snapshots.length > 0
						? [...points, ...snapshots]
								.map((p) => ({
									t: p.timestamp * 1000,
									price: fromSharePriceUnits(p.sharePrice),
								}))
								.sort((x, y) => x.t - y.t)
						: [{ t: registeredAtMs, price: 1 }]),
					{ t: Date.now(), price: sharePrice },
				],
				highWaterMark: fromSharePriceUnits(v.highWaterMark),
				feeRateBps: r.feeRate,
				maxDrawdownBps: v.maxDrawdownBps,
				maxUtilizationBps: v.maxUtilizationBps,
				yieldEnabled: v.yieldSource !== zeroAddress,
				yieldApyBps:
					v.yieldSource === zeroAddress
						? 0
						: Number(apyByYieldSource.get(v.yieldSource) ?? 0n),
				seedAssets: fromTokenUnits(v.seedShares) * sharePrice,
				// The vault's own flag: a manual creator pause is also status 2 but
				// leaves this false. Cleared again when the creator resumes.
				circuitBreakerTripped: v.breakerTripped,
			},
			markets: row?.markets ?? [],
			nansen: nansenByCreator.get(r.creator.toLowerCase()) ?? null,
			// pnl30d approximates the vault's USDC change over the window from the
			// share price move applied to today's assets.
			stats: {
				volume30d: fromTokenUnits(
					swaps30d.reduce((s, p) => s + p.notional, 0n),
				),
				trades30d: swaps30d.length,
				pnl30d: priceThen > 0 ? totalAssets * (1 - priceThen / sharePrice) : 0,
				subscribers: row?.subscriberCount ?? 0,
				realizedPnl: row ? fromTokenUnits(row.realizedPnl) : 0,
				closedTrades: row?.closedCount ?? 0,
				winRatePct:
					row && row.closedCount > 0
						? (row.winCount / row.closedCount) * 100
						: null,
				dollarReturn: row
					? moneyWeightedReturn(
							totalAssets,
							fromTokenUnits(row.assetsOutTotal),
							fromTokenUnits(row.assetsInTotal),
						)
					: null,
				lastTradeAt:
					swapTimes.length > 0 ? Math.max(...swapTimes) * 1000 : null,
				indexed: !!indexed,
			},
		};
		return agent;
	});

	const positions = vaultDataByIndex.flatMap((v, i) => {
		if (v.shares <= 0n || !account) return [];
		const row = indexed?.positionsByAgent.get(ids[i].toLowerCase());
		return [
			{
				agentId: ids[i],
				subscriberAddress: account,
				shares: fromTokenUnits(v.shares),
				assetsIn: row ? fromTokenUnits(row.assetsIn) : undefined,
				assetsOut: row ? fromTokenUnits(row.assetsOut) : undefined,
				depositedAssets: row
					? fromTokenUnits(row.assetsIn - row.assetsOut)
					: undefined,
			},
		];
	});
	return { agents, positions, base, markets, marketFlow };
}
