import { createFileRoute } from "@tanstack/react-router";
// Loads the module augmentation that adds `server.handlers` to file routes.
import "@tanstack/react-start";

// Server-side proxy for the Intents Connect API. The SDK's `apiKeyProxyUrl`
// sends create calls here; we add `x-api-key` and forward, so the key never
// ships to the browser. Only POSTs to /executions/* need the key; everything
// else the SDK calls the public API directly.
const UPSTREAM = "https://intents-connect-api.aurora.dev";

async function forward({
	request,
	params,
}: {
	request: Request;
	params: { _splat?: string };
}) {
	const key = process.env.AURORA_API_KEY;
	if (!key)
		return new Response("AURORA_API_KEY not configured", { status: 503 });

	const url = new URL(request.url);
	// The splat already carries the api/v1 prefix the SDK adds.
	const upstream = `${UPSTREAM}/${params._splat ?? ""}${url.search}`;
	const res = await fetch(upstream, {
		method: request.method,
		headers: { "content-type": "application/json", "x-api-key": key },
		body:
			request.method === "GET" || request.method === "HEAD"
				? undefined
				: await request.text(),
	});
	return new Response(await res.text(), {
		status: res.status,
		headers: {
			"content-type": res.headers.get("content-type") ?? "application/json",
		},
	});
}

export const Route = createFileRoute("/api/aurora/$")({
	server: { handlers: { GET: forward, POST: forward, DELETE: forward } },
});
