import { formatCompactUsd, formatDay, formatPercent } from "#/lib/format";
import type { NansenBadge as NansenBadgeData } from "#/lib/types";
import { cx, Label, StatusPill } from "./ui/primitives";

export function NansenBadgeChip({
	nansen,
	size = "sm",
}: {
	nansen: NansenBadgeData | null;
	size?: "sm" | "lg";
}) {
	if (!nansen || !nansen.verified) {
		return size === "lg" ? (
			<p className="text-[17px] text-dim">
				No Nansen attestation yet for this creator.
			</p>
		) : null;
	}

	const chip = (
		<StatusPill tone={nansen.stale ? "neutral" : "ok"}>
			{nansen.stale ? "Nansen-verified · stale" : "Nansen-verified"}
			{nansen.label ? ` · ${nansen.label}` : ""}
		</StatusPill>
	);

	if (size === "sm") return chip;

	return (
		<div className="space-y-1">
			{chip}
			<div className="grid grid-cols-2 gap-2 pt-1">
				<div>
					<div
						className={cx(
							"tnum text-[19px]",
							nansen.pnlUsd < 0 ? "text-sell" : "text-accent",
						)}
					>
						{formatCompactUsd(nansen.pnlUsd)}
					</div>
					<Label className="text-[14px] tracking-[1px]">realized pnl</Label>
				</div>
				<div>
					<div className="tnum text-[19px]">
						{formatPercent(nansen.winRatePct, 0)}
					</div>
					<Label className="text-[14px] tracking-[1px]">win rate</Label>
				</div>
			</div>
			<p className="text-[16px] text-dim">
				Attested {formatDay(nansen.attestedAt)}
				{nansen.stale ? " — over 30 days old, due for refresh." : "."}
			</p>
		</div>
	);
}
