# Custos web

This is the Custos marketplace frontend. Subscribers browse trading agents, deposit USDC into the vault of an agent, and redeem later. Creators register an agent and manage its vault. The app is TanStack Start on Bun. Wallets connect through Privy and wagmi, and the chain is Monad.

## Pages

| Route | What it does |
|---|---|
| `/` | The marketplace list. Search the public vaults and open one. |
| `/leaderboard` | Public agents ranked by a sort chip: TVL, realized P/L, win rate, trades, 30d volume, subscribers, share price, or dollar-weighted return. It also has a platform-wide Agent consensus card. |
| `/agents/:agentId` | The vault detail page. Share price history next to a dollar-weighted return (the gap between them is entry timing), reserve ratio, idle yield, circuit breaker, a Behaviour card, an Agent consensus card, recent activity, the agent and creator addresses, and the deposit and redeem panels. A funded vault that has never traded, or has been idle for 14 days, carries a liveness pill. A creator also sees the edit panel here. |
| `/creators/:address` | The track record of a creator, reached from the Creator row on an agent page. Agents registered, revoked, breaker trips, agents that never traded, combined TVL and realized P/L, tenure, every agent including unlisted ones, the NanSigil attestation history, and the seed burns. |
| `/profile` | The profile of the connected wallet. A creator registers an agent, edits it, and claims the Nansen badge. A subscriber sees positions and can redeem. |
| `/activity` | Transactions in flight, then the history of the wallet with a filter (subscribe, redeem, agent trade, vault config). |

The Behaviour card shows a 24-bar histogram of swaps by UTC hour, average hold, swaps per week, typical size against budget, the largest swap, the buy and sell split, and a one-word style label. The Agent consensus card replaced the old Smart Money signals mock.

## What the app writes on chain

| Action | Who | Contract call |
|---|---|---|
| Register an agent | Creator | `registerAgent` on `CustosCore`, with the seed deposit and the first markets in the same transaction |
| Deposit | Subscriber | Approve USDC, then `deposit` on the vault |
| Redeem | Subscriber | Redeem shares on the vault |
| Pause, resume, revoke | Creator | `pauseAgent`, `resumeAgent`, `revokeAgent` |
| Change allowance and period | Creator | `setAllowance`, `setPeriod` |
| Change marketplace visibility | Creator | `setPublic` |
| Allow or block a market | Creator | `setAgentMarket` |
| Burn or release the seed | Creator | `burnSeed`, `releaseSeed` |
| Claim a Nansen badge | Creator | Fetch a signed payload from the attestation service, then submit it to `NanSigil` |

The register form needs at least one market, so one transaction leaves the agent able to trade. Edit agent has a Markets section with a toggle per curated market. A market whose base token the vault still holds cannot be switched off. Its Seed section lets the creator burn a percentage of the locked seed, or release it after a revoke.

A creator action that changes two values sends one transaction per value, one after the other.

Every write is tracked as a flight. A flight survives a reload. It is kept per wallet in local storage for 24 hours. The Activity page can continue a flight when its last step has not landed. That covers a registration, a Monad deposit, and a badge claim.

An Aurora deposit is never resumable. The transfer may already have left the wallet, and a second run could spend the funds twice.

## Where data comes from

| Data | Source |
|---|---|
| Agent list, descriptions | Envio indexer |
| Share price history | Envio indexer |
| Badge plaintext (label, PnL, win rate) | Envio indexer |
| Activity history | Envio indexer |
| Subscriber counts, position P/L, realized P/L, win rate | Envio indexer |
| Behaviour card, Agent consensus, dollar-weighted return | Envio indexer |
| Creator page | Envio indexer |
| Yield sources the register form offers | Envio indexer (`YieldSourceAllowedChanged`), then `CustosCore.isYieldSourceAllowed` on chain |
| Live share price, TVL, high-water mark, reserve ratio, share balances | Chain, through Multicall3 |
| Badge verification | Chain, `NanSigil.verify` |

The badge is shown as verified only when `NanSigil.verify` says so on chain. The indexer supplies the text next to it.

Without the indexer the app still works from the registry on chain. The indexed numbers then read zero, "—" or an empty state, and the badge has no text. The register form offers no yield option at all, because the allowlist is a mapping and the chain cannot enumerate it.

## Environment variables

Copy `.env.example` to `.env`.

| Name | What it does | Public |
|---|---|---|
| `VITE_CHAIN_ID` | `10143` for Monad testnet, `143` for Monad mainnet. Default `10143`. | Yes |
| `VITE_RPC_URL` | RPC endpoint of the chain. Required. | Yes |
| `VITE_CUSTOS_CORE` | Address of the `CustosCore` proxy. Required. | Yes |
| `VITE_USDC` | Address of the USDC token. Required. | Yes |
| `VITE_NANSIGIL` | Address of `NanSigil`. Empty disables the badge. | Yes |
| `VITE_MULTICALL3` | Multicall3 address. Defaults to the canonical `0xcA11bde05977b3631167028862bE2a173976CA11`. | Yes |
| `VITE_ATTESTATION_URL` | Base URL of the `custos-attestation` service. Empty disables the badge button. | Yes |
| `VITE_ENVIO_GRAPHQL_URL` | GraphQL endpoint of the Envio indexer. Empty or unreachable means no indexed data. | Yes |
| `VITE_PRIVY_APP_ID` | Privy app id, needed for wallet login. | Yes |
| `VITE_AURORA_ENABLED` | `true` turns on cross-chain deposits through Aurora. Default `false`. | Yes |
| `AURORA_API_KEY` | Aurora API key. Read at runtime by the `/api/aurora` proxy route. | No |

Every `VITE_*` value is compiled into the bundle. A change needs a rebuild, and nothing secret may go in one. `AURORA_API_KEY` has no prefix. The server reads it at runtime, and it never reaches the browser.

## Aurora

Cross-chain deposits use Aurora Intents Connect. The SDK sends its create calls to `/api/aurora`. The route adds the `x-api-key` header and forwards the request to the Aurora API. Without `AURORA_API_KEY` it answers `503`.

CAUTION: THE `/api/aurora` ROUTE HAS NO AUTHENTICATION AND NO RATE LIMIT OF ITS OWN. ANYONE WHO KNOWS THE SITE CAN SPEND THE AURORA QUOTA THROUGH IT. PUT A RATE LIMIT OR AN ACCESS RULE IN FRONT OF IT BEFORE YOU SET THE KEY ON A PUBLIC HOST.

## Commands

```bash
cp .env.example .env
sfw bun install      # in this project the install goes through Socket firewall
bun run dev          # http://localhost:3000
bun run build
bunx tsc --noEmit
bunx biome check
```

There is no test runner in this repository. The type check, Biome, and the build are the checks.

## Docker

The image has a Bun build stage and a distroless Bun runtime, and it serves on port 3000.
Every `VITE_*` value is a build argument, because they are compiled in. `AURORA_API_KEY` is set at run time. The root `compose.yaml` passes both.

## What is missing

- There is no interface for the upgrade authority. Allowing a market for an agent still needs `cast`.
- Cross-chain deposits stay off. Aurora has no quotable route into or out of Monad, which was checked with dry quotes against its API.

## Related repositories

| Repository | Role |
|---|---|
| `custos-contract` | CustosCore, AgentVault, VaultFactory |
| `custos-attestation` | Signing service for the Nansen badge |
| `custos-indexer` | Envio indexer behind the list, history and badge text |
