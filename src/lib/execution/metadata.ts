import type { DiffedSnapshot } from "$lib/transform";
import { marketToURL } from "$lib/utils";
import type { ExecutionChain, ExecutionMarket, ExecutionMarketMetadata } from "./types";

const VENUE_CHAINS: Record<string, ExecutionChain> = {
	hyperliquid: "hyperliquid",
	lighter: "unknown",
	ostium: "arbitrum",
	qfex: "unknown",
	binance: "unknown",
	aster: "bnb",
	edgex: "unknown",
	extended: "starknet",
	vest: "unknown"
};

export function executionMetadataForMarket(
	venue: string,
	namespace: string
): ExecutionMarketMetadata {
	const isHyperliquid = venue === "hyperliquid";
	return {
		executionKind: "perp",
		chain: isHyperliquid ? "hyperliquid" : (VENUE_CHAINS[venue] ?? "unknown"),
		collateral: "USDC",
		supportsNativeExecution: isHyperliquid && namespace.length > 0,
		supportsExternalOpen: true
	};
}

export type ExecutionVenueRow = {
	marketKey: string;
	market: DiffedSnapshot["markets"][string];
	externalUrl: string | null;
	isBest: boolean;
};

export function marketExecutionUrl(market: {
	venue: string;
	namespace: string;
	ticker: string;
}): string | null {
	try {
		return marketToURL(market.venue, market.namespace, market.ticker);
	} catch {
		return null;
	}
}

export function executionVenueRows(snapshot: DiffedSnapshot, assetId: string): ExecutionVenueRow[] {
	const marketIds = snapshot.assets[assetId]?.marketIds ?? [];
	const rows = marketIds
		.map((marketKey) => {
			const market = snapshot.markets[marketKey];
			return {
				marketKey,
				market,
				externalUrl: marketExecutionUrl(market),
				isBest: false
			};
		})
		.sort((a, b) => b.market.volume - a.market.volume || b.market.oi - a.market.oi);

	if (rows[0]) rows[0].isBest = true;

	return rows;
}

export function selectBestExecutionMarket(
	snapshot: DiffedSnapshot,
	assetId: string,
	preferredMarketKey?: string | null
): string | null {
	const rows = executionVenueRows(snapshot, assetId);
	if (preferredMarketKey && rows.some((row) => row.marketKey === preferredMarketKey)) {
		return preferredMarketKey;
	}
	return rows.find((row) => row.isBest)?.marketKey ?? null;
}

export function asExecutionMarket(market: DiffedSnapshot["markets"][string]): ExecutionMarket {
	return market;
}
