import { json, error, type RequestHandler } from "@sveltejs/kit";
import { yahooProvider } from "$lib/fundamentals/yahoo";
import { finnhubProvider } from "$lib/fundamentals/finnhub";
import type { Fundamentals, FundamentalsProvider } from "$lib/fundamentals/types";

// Process-local TTL cache. Keeps the upstream from being hammered when many
// users land on the same asset page in a short window.
const TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; data: Fundamentals }>();

const TICKER_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;

// Provider chain: best free option first, Yahoo as a typed fallback. Each
// provider reports `not_supported` when its config (e.g. API key) is missing,
// so the chain naturally degrades.
const providers: FundamentalsProvider[] = [finnhubProvider, yahooProvider];

export const GET: RequestHandler = async ({ params, setHeaders }) => {
	const ticker = params.ticker?.toUpperCase() ?? "";
	if (!TICKER_RE.test(ticker)) throw error(400, "Invalid ticker");

	const hit = cache.get(ticker);
	if (hit && Date.now() - hit.at < TTL_MS) {
		setHeaders({ "cache-control": "public, max-age=300" });
		return json({ ok: true, data: hit.data });
	}

	let lastReason: string = "not_found";
	for (const p of providers) {
		const r = await p.fetch(ticker);
		if (r.ok) {
			cache.set(ticker, { at: Date.now(), data: r.data });
			setHeaders({ "cache-control": "public, max-age=300" });
			return json({ ok: true, data: r.data });
		}
		lastReason = r.reason;
		// `not_supported` means provider can't run (e.g. no API key) — try the next.
		// Other reasons are upstream failures; we still try the next provider but
		// preserve the last reason for the response.
	}

	const status = lastReason === "rate_limited" ? 429 : 404;
	return json({ ok: false, reason: lastReason }, { status });
};
