// Typed shape for "underlying equity" data shown next to an RWA perp asset.
//
// All fields are optional — the UI must render gracefully if any subset is
// missing. No part of the intelligence layer fakes a field that wasn't
// returned by the provider.

export type Fundamentals = {
	ticker: string;
	// Which provider returned this snapshot
	source: "yahoo" | "manual";
	// Provider's reported "as of" timestamp (ISO). Falls back to fetch time.
	asOf: string;

	// Price & valuation
	price?: number;
	currency?: string;
	marketCap?: number;
	peTrailing?: number;
	peForward?: number;

	// 52-week performance
	fiftyTwoWeekLow?: number;
	fiftyTwoWeekHigh?: number;
	fiftyTwoWeekChange?: number; // decimal

	// Equity-side volume (shares; provider-agnostic notional via price * volume)
	dailyVolumeShares?: number;
	dailyVolumeUsd?: number;
	avgDailyVolumeUsd?: number;

	// Fundamentals
	revenueTtm?: number;
	earningsTtm?: number;
	dividendYield?: number; // decimal (0.02 = 2%)
	sector?: string;
	industry?: string;

	// Calendar
	nextEarningsDate?: string; // ISO
};

export type FundamentalsResult =
	| { ok: true; data: Fundamentals }
	| { ok: false; reason: "not_supported" | "not_found" | "rate_limited" | "provider_error" };

export interface FundamentalsProvider {
	readonly id: Fundamentals["source"];
	fetch(ticker: string): Promise<FundamentalsResult>;
}

// Derived crypto-native comparison metrics. All ratios are decimals.
export type EquityComparison = {
	perpVolumeUsd: number;
	equityVolumeUsd: number | null;
	perpVolumeShareOfEquity: number | null; // perp / equity

	perpOiUsd: number;
	marketCapUsd: number | null;
	perpOiShareOfMarketCap: number | null;
};
