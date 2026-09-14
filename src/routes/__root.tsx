import { TanStackDevtools } from "@tanstack/react-devtools";
import {
	createRootRoute,
	HeadContent,
	Outlet,
	Scripts,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";

import { TopBar } from "#/components/TopBar";
import { Web3Provider } from "#/lib/web3Provider";
import { StoreProvider } from "#/lib/store";
import { themeInitScript } from "#/lib/theme";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ title: "Custos" },
			{
				name: "description",
				content:
					"Cross-chain trading on Kuru, with an agent registry where an agent never holds full control.",
			},
		],
		links: [
			{ rel: "stylesheet", href: appCss },
			{ rel: "preconnect", href: "https://fonts.googleapis.com" },
			{
				rel: "preconnect",
				href: "https://fonts.gstatic.com",
				crossOrigin: "anonymous",
			},
			{
				rel: "stylesheet",
				href: "https://fonts.googleapis.com/css2?family=VT323&display=swap",
			},
		],
	}),
	shellComponent: RootDocument,
	component: RootLayout,
});

function RootLayout() {
	return (
		<Web3Provider>
			<StoreProvider>
				<TopBar />
				<main className="mx-auto max-w-[1280px] px-4 py-6">
					<Outlet />
				</main>
				{/* Sits above everything, catches no clicks. */}
				<div aria-hidden className="scanlines-overlay" />
			</StoreProvider>
		</Web3Provider>
	);
}

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<head>
				{/* Runs before paint so a toggled theme does not flash the wrong
				    palette on reload. The two modes invert the entire surface, so
				    a flash here is far more jarring than usual. */}
				{/* biome-ignore lint/security/noDangerouslySetInnerHtml: pre-hydration theme guard */}
				<script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
				<HeadContent />
			</head>
			<body>
				{children}
				<TanStackDevtools
					config={{ position: "bottom-right" }}
					plugins={[
						{
							name: "Tanstack Router",
							render: <TanStackRouterDevtoolsPanel />,
						},
					]}
				/>
				<Scripts />
			</body>
		</html>
	);
}
