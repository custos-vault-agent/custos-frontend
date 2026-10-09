import {
	BaseError,
	ContractFunctionRevertedError,
	UserRejectedRequestError,
} from "viem";

// Custom errors from AgentVault / CustosCore that a subscriber can actually
// hit, in words. Anything else falls back to the error name or message.
const REASONS: Record<string, string> = {
	VaultNotActive: "This vault isn't accepting deposits right now.",
	Paused: "Custos is paused by the protocol. Try again later.",
	AgentCannotCallThis: "The agent wallet can't hold or move shares.",
	UnknownAgent: "That agent doesn't exist on this chain.",
	NotCreator: "Only the wallet that registered this agent can do that.",
	AgentAlreadyRevoked: "This agent is revoked and can't be changed.",
	WalletAlreadyBound: "That agent wallet is already bound to another agent.",
	SelfDelegation: "The agent wallet must differ from your own wallet.",
	SeedTooSmall: "The seed deposit is below the minimum.",
	YieldSourceNotAllowed: "That yield source isn't approved by the protocol.",
	FeeRateOutOfRange: "The performance fee is outside the allowed range.",
	DrawdownOutOfRange: "The max drawdown is outside the allowed range.",
	UtilizationOutOfRange: "The max utilization is outside the allowed range.",
	MarketNotCurated: "The protocol hasn't curated that market.",
	MarketStillHeld:
		"The vault still holds this market's token. Wait for the agent to sell it.",
	MarketNotAllowed: "This agent isn't allowed to trade that market.",
	NoPriceFeed:
		"That market's token has no price feed, so the vault cannot value it.",
	MarketQuoteMismatch: "That market doesn't quote in USDC.",
	StalePrice:
		"The price feed for this vault's position is stale. Try again in a few minutes.",
	ERC20InsufficientBalance: "Not enough USDC in this wallet.",
	ERC20InsufficientAllowance: "USDC approval didn't cover the amount.",
	ERC4626ExceededMaxRedeem: "You don't hold that many shares.",
	ERC4626ExceededMaxWithdraw: "You don't hold enough shares for that amount.",
};

export function txErrorMessage(err: unknown): string {
	if (err instanceof BaseError) {
		if (err.walk((e) => e instanceof UserRejectedRequestError)) {
			return "Rejected in your wallet.";
		}
		const reverted = err.walk(
			(e) => e instanceof ContractFunctionRevertedError,
		) as ContractFunctionRevertedError | null;
		const name = reverted?.data?.errorName ?? reverted?.reason;
		if (name) return REASONS[name] ?? `Reverted: ${name}`;
		return err.shortMessage;
	}
	return err instanceof Error ? err.message : String(err);
}
