import type { Address } from "viem";

type DemoNansenEntry = {
	wallet: Address;
	label: string;
	pnl: number;
	winRate: number;
	timestamp: number;
};

// Plaintext backing the two seeded on-chain Nansen attestations — only the
// hash is on-chain (NansenModule.verifyAttestation needs the plaintext to
// recompute and check it). Copied from
// custos-contract/deployments/demo-nansen.json. Live Nansen querying is out
// of scope for now (confirmed this session) — this stands in until then.
export const DEMO_NANSEN: Record<string, DemoNansenEntry> = {
	"0x052c86206eb9a0beaf727a38ad805ac37a4daf8b97aa3aa1cbe6f64507cb4e68": {
		wallet: "0xc29F0F519433DcbB98f71aB45a8C90170b3F2F48",
		label: "Smart Trader",
		pnl: 42_000,
		winRate: 61,
		timestamp: 1789416891,
	},
	"0x85aa2b9e4220d0464d74f792c04cad164f71263ef09ed2c4f21c4d0d2190645a": {
		wallet: "0xc29F0F519433DcbB98f71aB45a8C90170b3F2F48",
		label: "Fund",
		pnl: 310_000,
		winRate: 58,
		timestamp: 1789416891,
	},
};
