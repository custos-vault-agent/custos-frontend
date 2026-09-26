// Pull side of NanSigil (repo custos-attestation). The service reads the wallet's
// Nansen profile, signs it, and returns the plaintext plus the signature. It never
// sends a transaction: whoever holds the payload relays it to NanSigil.submit and
// pays the gas, in the same way as Pyth Hermes or Chainlink Data Streams.

const BASE = (
	import.meta.env.VITE_ATTESTATION_URL as string | undefined
)?.replace(/\/$/, "");

/** Whether the badge can be claimed from the UI at all. */
export const ATTESTATION_ENABLED = !!BASE;

/** Exactly the arguments of `NanSigil.submit`. */
export type SignedAttestation = {
	wallet: `0x${string}`;
	label: string;
	pnl: bigint;
	winRate: number;
	timestamp: number;
	signature: `0x${string}`;
};

export async function pullAttestation(
	wallet: string,
): Promise<SignedAttestation> {
	if (!BASE) throw new Error("VITE_ATTESTATION_URL is not set");
	const res = await fetch(`${BASE}/attestation/${wallet}`);
	if (!res.ok) throw new Error(`attestation service returned ${res.status}`);
	// `pnl` travels as a decimal string, because JSON has no int256.
	const json = (await res.json()) as {
		wallet: `0x${string}`;
		label: string;
		pnl: string;
		winRate: number;
		timestamp: number;
		signature: `0x${string}`;
	};
	return {
		wallet: json.wallet,
		label: json.label,
		pnl: BigInt(json.pnl),
		winRate: Number(json.winRate),
		timestamp: Number(json.timestamp),
		signature: json.signature,
	};
}
