// Yahoo Finance quoteSummary provider.
//
// Yahoo's public endpoints now require a `crumb` + cookie flow:
//   1. Hit `fc.yahoo.com` to get the `B` cookie.
//   2. Hit `query2.finance.yahoo.com/v1/test/getcrumb` with that cookie.
//   3. Call quoteSummary with `?crumb=<crumb>` and the cookie.
//
// We cache the (cookie, crumb) pair process-locally and rotate on 401/403.

import type { Fundamentals, FundamentalsProvider, FundamentalsResult } from "./types";

const MODULES = [
	"summaryDetail",
	"defaultKeyStatistics",
	"financialData",
	"price",
	"calendarEvents",
	"assetProfile"
].join(",");

const UA =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

type Creds = { cookie: string; crumb: string };
let creds: Creds | null = null;

async function getCreds(force = false): Promise<Creds | null> {
	if (creds && !force) return creds;
	try {
		// Step 1: cookie
		const r1 = await fetch("https://fc.yahoo.com", {
			headers: { "User-Agent": UA },
			redirect: "manual"
		});
		const setCookie = r1.headers.getSetCookie?.() ?? [];
		const cookie = setCookie
			.map((c) => c.split(";")[0])
			.filter(Boolean)
			.join("; ");
		if (!cookie) return null;

		// Step 2: crumb
		const r2 = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
			headers: {
				"User-Agent": UA,
				Cookie: cookie,
				Accept: "*/*",
				"Accept-Language": "en-US,en;q=0.9",
				Referer: "https://finance.yahoo.com/"
			}
		});
		if (!r2.ok) return null;
		const crumb = (await r2.text()).trim();
		if (!crumb) return null;

		creds = { cookie, crumb };
		return creds;
	} catch {
		return null;
	}
}

type RawNum = { raw?: number } | undefined;
const n = (v: RawNum): number | undefined => (typeof v?.raw === "number" ? v.raw : undefined);

async function callQuoteSummary(ticker: string, c: Creds): Promise<Response> {
	const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(
		ticker
	)}?modules=${MODULES}&crumb=${encodeURIComponent(c.crumb)}`;
	return fetch(url, {
		headers: { "User-Agent": UA, Cookie: c.cookie, Accept: "application/json" }
	});
}

export const yahooProvider: FundamentalsProvider = {
	id: "yahoo",

	async fetch(ticker: string): Promise<FundamentalsResult> {
		let c = await getCreds();
		if (!c) return { ok: false, reason: "provider_error" };

		let res = await callQuoteSummary(ticker, c);
		if (res.status === 401 || res.status === 403) {
			// Refresh creds once and retry
			c = await getCreds(true);
			if (!c) return { ok: false, reason: "provider_error" };
			res = await callQuoteSummary(ticker, c);
		}

		if (res.status === 429) return { ok: false, reason: "rate_limited" };
		if (res.status === 404) return { ok: false, reason: "not_found" };
		if (!res.ok) return { ok: false, reason: "provider_error" };

		const json = (await res.json().catch(() => null)) as {
			quoteSummary?: {
				result?: {
					summaryDetail?: Record<string, RawNum>;
					defaultKeyStatistics?: Record<string, RawNum>;
					financialData?: Record<string, RawNum>;
					price?: Record<string, RawNum | string>;
					calendarEvents?: { earnings?: { earningsDate?: { raw?: number }[] } };
					assetProfile?: { sector?: string; industry?: string };
				}[];
			};
		} | null;

		const r = json?.quoteSummary?.result?.[0];
		if (!r) return { ok: false, reason: "not_found" };

		const sd = r.summaryDetail ?? {};
		const ks = r.defaultKeyStatistics ?? {};
		const fd = r.financialData ?? {};
		const px = r.price ?? {};
		const ap = r.assetProfile ?? {};

		const price = n(px.regularMarketPrice as RawNum);
		const dailyVolumeShares = n(sd.regularMarketVolume as RawNum);
		const avgVol = n(sd.averageVolume as RawNum);

		const currencyField = px.currency;
		const currency = typeof currencyField === "string" ? currencyField : undefined;

		const earningsRaw = r.calendarEvents?.earnings?.earningsDate?.[0]?.raw;
		const nextEarningsDate =
			typeof earningsRaw === "number" ? new Date(earningsRaw * 1000).toISOString() : undefined;

		const data: Fundamentals = {
			ticker,
			source: "yahoo",
			asOf: new Date().toISOString(),
			price,
			currency,
			marketCap: n(sd.marketCap as RawNum) ?? n(px.marketCap as RawNum),
			peTrailing: n(sd.trailingPE as RawNum),
			peForward: n(sd.forwardPE as RawNum) ?? n(ks.forwardPE as RawNum),
			fiftyTwoWeekLow: n(sd.fiftyTwoWeekLow as RawNum),
			fiftyTwoWeekHigh: n(sd.fiftyTwoWeekHigh as RawNum),
			fiftyTwoWeekChange: n(ks["52WeekChange"] as RawNum),
			dailyVolumeShares,
			dailyVolumeUsd:
				dailyVolumeShares !== undefined && price !== undefined
					? dailyVolumeShares * price
					: undefined,
			avgDailyVolumeUsd: avgVol !== undefined && price !== undefined ? avgVol * price : undefined,
			revenueTtm: n(fd.totalRevenue as RawNum),
			earningsTtm: n(ks.netIncomeToCommon as RawNum),
			dividendYield: n(sd.dividendYield as RawNum),
			sector: ap.sector,
			industry: ap.industry,
			nextEarningsDate
		};

		return { ok: true, data };
	}
};
