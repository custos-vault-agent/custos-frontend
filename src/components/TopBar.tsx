import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { shortAddress } from "#/lib/format";
import { useStore } from "#/lib/store";
import type { ThemeChoice } from "#/lib/theme";
import { applyTheme, nextTheme, readTheme, themeLabel } from "#/lib/theme";
import { Logo } from "./Logo";
import { Button, cx } from "./ui/primitives";
import { Sigil } from "./ui/Sigil";

const NAV = [
	{ to: "/", label: "agents" },
	{ to: "/activity", label: "activity" },
	{ to: "/profile", label: "profile" },
] as const;

function ThemeToggle() {
	const [choice, setChoice] = useState<ThemeChoice>("system");

	// Read after mount: the pre-hydration script has already set the attribute,
	// so this only syncs the label, never re-applies the theme.
	useEffect(() => setChoice(readTheme()), []);

	return (
		<Button
			size="sm"
			onClick={() => {
				const next = nextTheme(choice);
				setChoice(next);
				applyTheme(next);
			}}
			aria-label={`Theme: ${themeLabel(choice)}`}
			title="Toggle theme"
		>
			{themeLabel(choice)}
		</Button>
	);
}

export function TopBar() {
	const { connected, connect, disconnect, inFlight, connectedAddress } = useStore();

	return (
		<header className="sticky top-0 z-40 border-b-2 border-edge bg-bg/95 backdrop-blur-[1px]">
			<div className="mx-auto flex h-[58px] max-w-[1280px] items-center gap-4 px-4">
				<Link to="/" className="shrink-0">
					<Logo />
				</Link>

				<nav className="flex items-center gap-1 sm:gap-3" aria-label="Main">
					{NAV.map((item) => (
						<Link
							key={item.to}
							to={item.to}
							className="px-1 text-[20px] lowercase text-dim hover:text-ink"
							activeProps={{
								className:
									"text-accent underline decoration-2 underline-offset-4",
							}}
							activeOptions={{ exact: item.to === "/" }}
						>
							{item.label}
						</Link>
					))}
				</nav>

				<div className="ml-auto flex items-center gap-2">
					{inFlight.length > 0 ? (
						<Link
							to="/activity"
							className="hidden items-center gap-2 border border-warn px-2 text-[16px] uppercase tracking-[1px] text-warn sm:flex"
						>
							<span
								className="size-[7px] animate-pulse-led bg-warn"
								aria-hidden
							/>
							{inFlight.length} in flight
						</Link>
					) : null}

					<ThemeToggle />

					{connected && connectedAddress ? (
						<button
							type="button"
							onClick={disconnect}
							title="Disconnect"
							className={cx(
								"flex items-center gap-2 border-2 border-edge px-2 py-[1px]",
								"hover:border-sell hover:text-sell",
							)}
						>
							<Sigil address={connectedAddress} size="xs" tone="owner" />
							<span className="hidden text-[17px] sm:inline">
								{shortAddress(connectedAddress, 6, 4)}
							</span>
							<span className="text-[17px] sm:hidden">
								{connectedAddress.slice(-4)}
							</span>
						</button>
					) : (
						<Button variant="primary" size="sm" onClick={connect}>
							Connect wallet
						</Button>
					)}
				</div>
			</div>
		</header>
	);
}
