// Finnhub provider.
//
// Free tier at https://finnhub.io covers everything we surface: quote,
// company profile (sector, market cap), basic metrics (P/E, 52w, revenue,
// net income, dividend yield), and earnings calendar. Requires an API key
// in env as FINNHUB_API_KEY.
//
// We treat the key as optional: when missing, this provider reports
// `not_supported` and the caller can fall back to another provider or hide
// the UI section.

import { env } from "$env/dynamic/private";
import type { Fundamentals, FundamentalsProvider, FundamentalsResult } from "./types";

const BASE = "https://finnhub.io/api/v1";

type QuoteResp = { c?: number; pc?: number; t?: number };
type ProfileResp = {
	marketCapitalization?: number; // millions USD
	currency?: string;
	finnhubIndustry?: string;
	exchange?: string;
};
type MetricResp = {
	metric?: {
		peBasicExclExtraTTM?: number;
		peNormalizedAnnual?: number;
		peTTM?: number;
		"52WeekHigh"?: number;
		"52WeekLow"?: number;
		"52WeekPriceReturnDaily"?: number;
		dividendYieldIndicatedAnnual?: number;
		revenueTTM?: number;
		netIncomeTTM?: number;
		"10DayAverageTradingVolume"?: number;
		"3MonthAverageTradingVolume"?: number;
	};
};
type EarningsCalendarResp = {
	earningsCalendar?: { date?: string; symbol?: string }[];
};

async function call<T>(path: string, key: string): Promise<T | null> {
	try {
		const sep = path.includes("?") ? "&" : "?";
		const r = await fetch(`${BASE}${path}${sep}token=${encodeURIComponent(key)}`);
		if (!r.ok) return null;
		return (await r.json()) as T;
	} catch {
		return null;
	}
}

export const finnhubProvider: FundamentalsProvider = {
	id: "yahoo", // reusing the source tag — UI doesn't care which feed it came from

	async fetch(ticker: string): Promise<FundamentalsResult> {
		const key = env.FINNHUB_API_KEY;
		if (!key) return { ok: false, reason: "not_supported" };

		// Run in parallel; tolerate individual failures
		const today = new Date().toISOString().slice(0, 10);
		const in90d = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

		const [quote, profile, metric, earnings] = await Promise.all([
			call<QuoteResp>(`/quote?symbol=${encodeURIComponent(ticker)}`, key),
			call<ProfileResp>(`/stock/profile2?symbol=${encodeURIComponent(ticker)}`, key),
			call<MetricResp>(`/stock/metric?symbol=${encodeURIComponent(ticker)}&metric=all`, key),
			call<EarningsCalendarResp>(
				`/calendar/earnings?from=${today}&to=${in90d}&symbol=${encodeURIComponent(ticker)}`,
				key
			)
		]);

		// Treat "no profile and no quote" as not_found
		if (!profile?.marketCapitalization && !quote?.c) {
			return { ok: false, reason: "not_found" };
		}

		const price = quote?.c;
		const marketCap =
			profile?.marketCapitalization !== undefined
				? profile.marketCapitalization * 1_000_000
				: undefined;
		const avgDailyShares =
			metric?.metric?.["3MonthAverageTradingVolume"] ??
			metric?.metric?.["10DayAverageTradingVolume"];
		const avgDailyVolumeUsd =
			avgDailyShares !== undefined && price !== undefined ? avgDailyShares * price : undefined;
		const fiftyTwoWeekChange = metric?.metric?.["52WeekPriceReturnDaily"];
		const nextDateStr = earnings?.earningsCalendar?.[0]?.date;

		const data: Fundamentals = {
			ticker,
			source: "yahoo",
			asOf: new Date().toISOString(),
			price,
			currency: profile?.currency,
			marketCap,
			peTrailing: metric?.metric?.peTTM ?? metric?.metric?.peBasicExclExtraTTM,
			fiftyTwoWeekLow: metric?.metric?.["52WeekLow"],
			fiftyTwoWeekHigh: metric?.metric?.["52WeekHigh"],
			fiftyTwoWeekChange:
				fiftyTwoWeekChange !== undefined ? fiftyTwoWeekChange / 100 : undefined,
			avgDailyVolumeUsd,
			dailyVolumeUsd: avgDailyVolumeUsd, // best available proxy on the free tier
			revenueTtm: metric?.metric?.revenueTTM,
			earningsTtm: metric?.metric?.netIncomeTTM,
			dividendYield:
				metric?.metric?.dividendYieldIndicatedAnnual !== undefined
					? metric.metric.dividendYieldIndicatedAnnual / 100
					: undefined,
			sector: profile?.finnhubIndustry,
			nextEarningsDate: nextDateStr ? new Date(nextDateStr).toISOString() : undefined
		};

		return { ok: true, data };
	}
};
