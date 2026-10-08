# Custos web

This is the Custos marketplace frontend. Subscribers browse trading agents, deposit USDC into the vault of an agent, and redeem later. Creators register an agent and manage its vault. The app is TanStack Start on Bun. Wallets connect through Privy and wagmi, and the chain is Monad.

## Pages

| Route | What it does |
|---|---|
| `/` | The marketplace list. Search the public vaults and open one. |
| `/agents/:agentId` | The vault detail page. Share price history, reserve ratio, idle yield, circuit breaker, recent activity, the agent and creator addresses, and the deposit and redeem panels. A creator also sees the edit panel here. |
| `/profile` | The profile of the connected wallet. A creator registers an agent, edits it, and claims the Nansen badge. A subscriber sees positions and can redeem. |
| `/activity` | Transactions in flight, then the history of the wallet with a filter (subscribe, redeem, agent trade, vault config). |

## What the app writes on chain

| Action | Who | Contract call |
|---|---|---|
| Register an agent | Creator | `CustosCore` register, with the first deposit |
| Deposit | Subscriber | Approve USDC, then `deposit` on the vault |
| Redeem | Subscriber | Redeem shares on the vault |
| Pause, resume, revoke | Creator | `pauseAgent`, `resumeAgent`, `revokeAgent` |
| Change allowance and period | Creator | `setAllowance`, `setPeriod` |
| Change marketplace visibility | Creator | `setPublic` |
| Claim a Nansen badge | Creator | Fetch a signed payload from the attestation service, then submit it to `NanSigil` |

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
| Live vault numbers, share balances | Chain, through Multicall3 |
| Badge verification | Chain, `NanSigil.verify` |

The badge is shown as verified only when `NanSigil.verify` says so on chain. The indexer supplies the text next to it.

Without the indexer the app still works from the registry on chain. It then has no history and no badge text.

## Environment variables

Copy `.env.example` to `.env`.

| Name | What it does | Public |
|---|---|---|
| `VITE_CHAIN_ID` | `10143` for Monad testnet, `143` for Monad mainnet. Default `10143`. | Yes |
| `VITE_RPC_URL` | RPC endpoint of the chain. Required. | Yes |
| `VITE_CUSTOS_CORE` | Address of the `CustosCore` proxy. Required. | Yes |
| `VITE_USDC` | Address of the USDC token. Required. | Yes |
| `VITE_NANSIGIL` | Address of `NanSigil`. Empty disables the badge. | Yes |
| `VITE_YIELD_SOURCE` | Yield source allowed by the protocol. Empty means the register form offers no yield option and a vault keeps its USDC idle. | Yes |
| `VITE_MULTICALL3` | Multicall3 address. Defaults to the canonical `0xcA11bde05977b3631167028862bE2a173976CA11`. | Yes |
| `VITE_ATTESTATION_URL` | Base URL of the `custos-attestation` service. Empty disables the badge button. | Yes |
| `VITE_ENVIO_GRAPHQL_URL` | GraphQL endpoint of the Envio indexer. | Yes |
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

- The subscriber count on a marketplace card is always 0, and a position shows no profit and loss. Both need a cost basis, which needs an indexer query that does not exist yet.
- The "Smart Money signals" card is placeholder data from `src/mock/smartMoney.ts`.
- There is no interface for the upgrade authority. Allowing a market for an agent still needs `cast`.
- Cross-chain deposits stay off. Aurora has no quotable route into or out of Monad, which was checked with dry quotes against its API.

## Related repositories

| Repository | Role |
|---|---|
| `custos-contract` | CustosCore, AgentVault, VaultFactory |
| `custos-attestation` | Signing service for the Nansen badge |
| `custos-indexer` | Envio indexer behind the list, history and badge text |
