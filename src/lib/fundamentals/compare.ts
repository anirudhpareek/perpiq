// Derived crypto-native comparison helpers.
//
// Inputs are perp aggregates from the existing snapshot and the optional
// Fundamentals object from the provider. All ratios are decimals; null when
// either side is unavailable.

import type { DiffedSnapshot } from "$lib/transform";
import type { Fundamentals, EquityComparison } from "./types";

/**
 * Map an asset slug + meta to the ticker we'd query on a TradFi feed.
 * Overrides keep us safe for cases where Yahoo uses a different symbol.
 */
const TICKER_OVERRIDES: Record<string, string> = {
	googl: "GOOGL",
	goog: "GOOG",
	brkb: "BRK-B",
	brka: "BRK-A"
};

export function getEquityTicker(assetId: string): string {
	return TICKER_OVERRIDES[assetId] ?? assetId.toUpperCase();
}

export function computeEquityComparison(
	snapshot: DiffedSnapshot,
	assetId: string,
	fundamentals: Fundamentals | null
): EquityComparison {
	const asset = snapshot.assets[assetId];
	const perpVolumeUsd = asset?.volume ?? 0;
	const perpOiUsd = asset?.oi ?? 0;

	const equityVolumeUsd = fundamentals?.dailyVolumeUsd ?? null;
	const marketCapUsd = fundamentals?.marketCap ?? null;

	return {
		perpVolumeUsd,
		equityVolumeUsd,
		perpVolumeShareOfEquity:
			equityVolumeUsd && equityVolumeUsd > 0 ? perpVolumeUsd / equityVolumeUsd : null,
		perpOiUsd,
		marketCapUsd,
		perpOiShareOfMarketCap:
			marketCapUsd && marketCapUsd > 0 ? perpOiUsd / marketCapUsd : null
	};
}
