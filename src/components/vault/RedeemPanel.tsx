import { useEffect, useRef, useState } from "react";
import { Field, TextInput } from "#/components/ui/fields";
import {
	Button,
	Card,
	CardHeader,
	Empty,
	Label,
} from "#/components/ui/primitives";
import { useStore } from "#/lib/store";

export function RedeemPanel({
	agentId,
	onClose,
}: {
	agentId: string;
	onClose: () => void;
}) {
	const { agents, inFlight, myPositions, redeem } = useStore();
	const agent = agents.find((a) => a.id === agentId);
	const position = myPositions.find((p) => p.agentId === agentId);

	const [shares, setShares] = useState("");
	const [done, setDone] = useState(false);

	const mine = inFlight.filter(
		(e) => e.kind === "redeem" && e.agentId === agentId,
	);
	const flying = mine.some((e) => e.status === "in-progress");
	const filled = mine.some((e) => e.status === "filled");
	const failed = mine.some((e) => e.status === "failed");
	const wasFlying = useRef(false);

	useEffect(() => {
		if (flying) {
			wasFlying.current = true;
			setDone(false);
			return;
		}
		// A failed flight stays "failed" and is not a landing.
		if (filled && wasFlying.current) {
			wasFlying.current = false;
			setDone(true);
		}
		if (failed) wasFlying.current = false;
	}, [flying, filled, failed]);

	useEffect(() => {
		if (!done) return;
		const id = window.setTimeout(() => setDone(false), 3200);
		return () => window.clearTimeout(id);
	}, [done]);

	if (!agent) return null;

	if (!position || position.shares <= 0) {
		return (
			<Card className="animate-enter">
				<CardHeader title={`Redeem · ${agent.name}`}>
					<button
						type="button"
						onClick={onClose}
						aria-label="Close redeem"
						className="ml-auto text-[18px] text-dim hover:text-ink"
					>
						✕
					</button>
				</CardHeader>
				<Empty
					title="No shares to redeem"
					hint="You don't currently hold a position in this vault."
				/>
			</Card>
		);
	}

	const sharesNumber = Number(shares) || 0;
	const overHeld = sharesNumber > position.shares;
	const estimatedAssets = sharesNumber * agent.vault.sharePrice;

	return (
		<Card className="animate-enter">
			<CardHeader title={`Redeem · ${agent.name}`}>
				<button
					type="button"
					onClick={onClose}
					aria-label="Close redeem"
					className="ml-auto text-[18px] text-dim hover:text-ink"
				>
					✕
				</button>
			</CardHeader>

			<div className="space-y-3 p-3">
				{done ? (
					<p
						className="border-2 border-accent px-2 py-1 text-[17px] text-accent"
						style={{ animation: "stamp 220ms steps(3, end) both" }}
					>
						Redeemed.
					</p>
				) : null}

				<Field
					label="Shares"
					hint={`held ${position.shares.toLocaleString("en-US", { maximumFractionDigits: 4 })}`}
					error={overHeld ? "More than you hold" : undefined}
				>
					<TextInput
						inputMode="decimal"
						value={shares}
						onChange={(e) => setShares(e.target.value.replace(/[^0-9.]/g, ""))}
						invalid={overHeld}
						placeholder="0"
						className="tnum"
					/>
				</Field>

				<div>
					<Label>You'll receive</Label>
					<p className="mt-1 text-[17px] text-dim">
						~
						{estimatedAssets.toLocaleString("en-US", {
							maximumFractionDigits: 2,
						})}{" "}
						USDC at the current share price. Redeem always works, even if this
						vault is paused or revoked.
					</p>
				</div>

				<Button
					variant="solid"
					size="lg"
					className="w-full"
					disabled={sharesNumber <= 0 || overHeld}
					onClick={() => {
						redeem({ agentId, shares: sharesNumber, chain: "monad" });
						setShares("");
					}}
				>
					Redeem
				</Button>
			</div>
		</Card>
	);
}
