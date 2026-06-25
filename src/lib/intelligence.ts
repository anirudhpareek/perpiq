// Intelligence layer over `DiffedSnapshot`.
//
// All inputs are real fields already present in the existing pipeline
// (volume, oi, refPx, refPxChange, volumeChange, oiChange, venue OI share,
// isNew flag added in transform.ts). Nothing here invents fee, funding,
// spread, depth, or execution data.
//
// Thresholds are intentionally simple and centralised at the top of the file
// so they are easy to tune and easy to inspect in code review.

import type { DiffedSnapshot } from "$lib/transform";
import { MARKET_TO_ASSET } from "$lib/transform";

// --- Thresholds (tune here) ---
export const THRESHOLDS = {
	// 24h asset/market volume change magnitudes
	volumeSpike: 0.5, // +50%
	volumeDrop: -0.5, // -50%
	// 24h asset/market OI change magnitudes
	oiSpike: 0.25, // +25%
	oiDrop: -0.25, // -25%
	// Cross-venue price divergence (basis points of median)
	priceDivergenceBps: 50,
	// Venue OI share absolute delta (percentage points / 100)
	venueDominanceShift: 0.05,
	// Minimum asset 24h volume to qualify for movers / signals to suppress noise
	moverMinVolumeUsd: 100_000
} as const;

export type SignalKind =
	| "volume_spike"
	| "volume_drop"
	| "oi_spike"
	| "oi_drop"
	| "price_divergence"
	| "new_market"
	| "high_concentration"
	| "venue_dominance_shift"
	| "stale_market";

export type SignalSeverity = "info" | "watch" | "alert";

export type Signal = {
	kind: SignalKind;
	severity: SignalSeverity;
	// Scoping (any subset can be present)
	assetId?: string;
	marketKey?: string;
	venue?: string;
	// Primary numeric magnitude. Interpretation depends on kind:
	//   volume_*/oi_*           -> decimal change (e.g. 0.52 = +52%)
	//   price_divergence        -> basis points
	//   venue_dominance_shift   -> absolute oi share delta
	//   new_market              -> 1
	//   stale_market            -> last-known OI
	value: number;
	label: string;
};

export type VenueBreakdown = {
	venue: string;
	namespace: string;
	marketKey: string;
	volume: number;
	oi: number;
	volumeShare: number;
	oiShare: number;
	refPx: number;
	isNew: boolean;
};

export type AssetIntelligence = {
	assetId: string;
	summary: string;
	signals: Signal[];
	venueConcentration: {
		venues: VenueBreakdown[];
		topVenueKey: string | null;
		topVolumeShare: number;
		hhi: number; // Herfindahl-Hirschman over volume share, 0..1
		venueCount: number;
	};
	priceDivergence: {
		bps: number;
		lowMarketKey: string;
		highMarketKey: string;
		low: number;
		high: number;
	} | null;
};

export type VenueContext = {
	marketIds: string[];
	marketCount: number;
	volume: number;
	oi: number;
	volumeChange: number;
	oiChange: number;
	oiShare: number;
	oiShareChange: number;
	dominantClasses: { category: string; volume: number; share: number }[];
	topByVolume: { marketKey: string; assetId: string; value: number }[];
	topByOi: { marketKey: string; assetId: string; value: number }[];
	biggestMovers: { marketKey: string; assetId: string; value: number }[];
	newMarkets: { marketKey: string; assetId: string; volume: number }[];
};

// --- Helpers ---

function pct(x: number): string {
	const sign = x > 0 ? "+" : "";
	return `${sign}${(x * 100).toFixed(1)}%`;
}

function absPct(x: number): string {
	return `${Math.abs(x * 100).toFixed(1)}%`;
}

function bps(x: number): string {
	return `${x.toFixed(0)} bps`;
}

export function formatSignalValue(signal: Signal): string {
	switch (signal.kind) {
		case "volume_spike":
		case "volume_drop":
		case "oi_spike":
		case "oi_drop":
		case "venue_dominance_shift":
			return pct(signal.value);
		case "high_concentration":
			return `${(signal.value * 100).toFixed(1)}%`;
		case "price_divergence":
			return bps(signal.value);
		case "stale_market":
			return `$${formatCompact(signal.value)}`;
		case "new_market":
			return "";
	}
}

export function signalShortLabel(kind: SignalKind): string {
	switch (kind) {
		case "volume_spike":
			return "Volume spike";
		case "volume_drop":
			return "Volume drop";
		case "oi_spike":
			return "OI build";
		case "oi_drop":
			return "OI unwind";
		case "price_divergence":
			return "Price range";
		case "new_market":
			return "New market";
		case "high_concentration":
			return "High concentration";
		case "venue_dominance_shift":
			return "Venue shift";
		case "stale_market":
			return "No volume";
	}
}

function assetDisplayName(snapshot: DiffedSnapshot, assetId: string): string {
	const firstMarket = snapshot.assets[assetId]?.marketIds[0];
	return (firstMarket && MARKET_TO_ASSET.get(firstMarket)?.name) || assetId.toUpperCase();
}

function humanVenueName(venue: string, namespace = ""): string {
	return namespace ? `${venue}:${namespace}` : venue;
}

function directionWord(x: number): string {
	if (x > 0.005) return "rose";
	if (x < -0.005) return "fell";
	return "was flat";
}

function changePhrase(metric: string, value: number): string {
	if (Math.abs(value) <= 0.005) return `${metric} was flat over 24h`;
	return `${metric} ${directionWord(value)} ${absPct(value)} over 24h`;
}

// --- Asset-level computations ---

/**
 * Compute cross-venue price divergence for an asset, in basis points of median.
 *
 * Only includes markets where the venue quote currency matches the asset's
 * preferred quote — mirrors the same filter `buildSnapshot` uses for medianRefPx,
 * so this never compares e.g. KRW-quoted to USD-quoted prices.
 */
export function computePriceDivergence(
	snapshot: DiffedSnapshot,
	assetId: string
): AssetIntelligence["priceDivergence"] {
	const asset = snapshot.assets[assetId];
	if (!asset) return null;

	let lowKey: string | null = null;
	let highKey: string | null = null;
	let low = Infinity;
	let high = -Infinity;
	const prices: number[] = [];

	for (const marketKey of asset.marketIds) {
		const meta = MARKET_TO_ASSET.get(marketKey);
		if (!meta) continue;
		if (meta.quote !== meta.venueQuote) continue;
		const px = snapshot.markets[marketKey].refPx;
		if (px <= 0) continue;
		prices.push(px);
		if (px < low) {
			low = px;
			lowKey = marketKey;
		}
		if (px > high) {
			high = px;
			highKey = marketKey;
		}
	}

	if (!lowKey || !highKey || prices.length < 2 || asset.medianRefPx <= 0) return null;

	return {
		bps: ((high - low) / asset.medianRefPx) * 10_000,
		lowMarketKey: lowKey,
		highMarketKey: highKey,
		low,
		high
	};
}

/**
 * Per-asset venue concentration: per-market volume/oi share + HHI.
 *
 * HHI is computed over volume share (sum of squared shares, range 0..1).
 * 1.0 = single venue dominates; lower = more distributed.
 */
export function computeVenueConcentration(
	snapshot: DiffedSnapshot,
	assetId: string
): AssetIntelligence["venueConcentration"] {
	const asset = snapshot.assets[assetId];
	if (!asset) {
		return { venues: [], topVenueKey: null, topVolumeShare: 0, hhi: 0, venueCount: 0 };
	}

	const venues: VenueBreakdown[] = asset.marketIds.map((marketKey) => {
		const m = snapshot.markets[marketKey];
		return {
			venue: m.venue,
			namespace: m.namespace,
			marketKey,
			volume: m.volume,
			oi: m.oi,
			volumeShare: asset.volume > 0 ? m.volume / asset.volume : 0,
			oiShare: asset.oi > 0 ? m.oi / asset.oi : 0,
			refPx: m.refPx,
			isNew: m.isNew
		};
	});
	venues.sort((a, b) => b.volume - a.volume);

	const hhi = venues.reduce((acc, v) => acc + v.volumeShare * v.volumeShare, 0);
	const top = venues[0];

	return {
		venues,
		topVenueKey: top?.marketKey ?? null,
		topVolumeShare: top?.volumeShare ?? 0,
		hhi,
		venueCount: venues.length
	};
}

/**
 * Asset-scoped signals.
 *
 * Only fires signals that are derivable from real fields. We do NOT fire
 * funding/fee/spread/depth signals because that data is not collected.
 */
export function detectAssetSignals(snapshot: DiffedSnapshot, assetId: string): Signal[] {
	const asset = snapshot.assets[assetId];
	if (!asset) return [];

	const signals: Signal[] = [];

	// Asset-level volume / OI moves (skip dust)
	if (asset.volume >= THRESHOLDS.moverMinVolumeUsd) {
		if (!asset.isNew && asset.volumeChange >= THRESHOLDS.volumeSpike) {
			signals.push({
				kind: "volume_spike",
				severity: asset.volumeChange >= 2 ? "alert" : "watch",
				assetId,
				value: asset.volumeChange,
				label: `Volume ${pct(asset.volumeChange)} vs 24h ago`
			});
		} else if (!asset.isNew && asset.volumeChange <= THRESHOLDS.volumeDrop) {
			signals.push({
				kind: "volume_drop",
				severity: "watch",
				assetId,
				value: asset.volumeChange,
				label: `Volume ${pct(asset.volumeChange)} vs 24h ago`
			});
		}
		if (!asset.isNew && asset.oiChange >= THRESHOLDS.oiSpike) {
			signals.push({
				kind: "oi_spike",
				severity: asset.oiChange >= 1 ? "alert" : "watch",
				assetId,
				value: asset.oiChange,
				label: `Open interest ${pct(asset.oiChange)} vs 24h ago`
			});
		} else if (!asset.isNew && asset.oiChange <= THRESHOLDS.oiDrop) {
			signals.push({
				kind: "oi_drop",
				severity: "watch",
				assetId,
				value: asset.oiChange,
				label: `Open interest ${pct(asset.oiChange)} vs 24h ago`
			});
		}
	}

	// New-market signals (per market, not per asset — different venues list at
	// different times). Suppress for brand-new assets (every market would fire).
	if (!asset.isNew) {
		for (const marketKey of asset.marketIds) {
			const m = snapshot.markets[marketKey];
			if (m.isNew) {
				signals.push({
					kind: "new_market",
					severity: "info",
					assetId,
					marketKey,
					venue: m.venue,
					value: 1,
					label: `New listing on ${m.venue}${m.namespace ? `:${m.namespace}` : ""}`
				});
			}
			// Stale market: holds OI but recorded zero volume in latest batch
			if (m.volume === 0 && m.oi > 0) {
				signals.push({
					kind: "stale_market",
					severity: "info",
					assetId,
					marketKey,
					venue: m.venue,
					value: m.oi,
					label: `No 24h volume on ${m.venue}${m.namespace ? `:${m.namespace}` : ""} (OI still open)`
				});
			}
		}
	}

	// Price divergence (cross-venue, same quote currency)
	const div = computePriceDivergence(snapshot, assetId);
	if (div && div.bps >= THRESHOLDS.priceDivergenceBps) {
		signals.push({
			kind: "price_divergence",
			severity: div.bps >= 200 ? "alert" : "watch",
			assetId,
			value: div.bps,
			label: `Cross-venue reference price range ${bps(div.bps)}`
		});
	}

	const conc = computeVenueConcentration(snapshot, assetId);
	if (conc.venueCount > 1 && conc.topVolumeShare >= 0.75) {
		const top = conc.venues[0];
		signals.push({
			kind: "high_concentration",
			severity: conc.topVolumeShare >= 0.9 ? "watch" : "info",
			assetId,
			marketKey: top.marketKey,
			venue: top.venue,
			value: conc.topVolumeShare,
			label: `${humanVenueName(top.venue, top.namespace)} accounts for ${(conc.topVolumeShare * 100).toFixed(1)}% of volume`
		});
	}

	return signals;
}

// --- Summary text ---

function signalPriority(kind: SignalKind): number {
	const order: Record<SignalKind, number> = {
		price_divergence: 0,
		oi_spike: 1,
		volume_spike: 2,
		oi_drop: 3,
		volume_drop: 4,
		new_market: 5,
		high_concentration: 6,
		venue_dominance_shift: 7,
		stale_market: 8
	};
	return order[kind];
}

function topSignal(signals: Signal[]): Signal | null {
	return [...signals].sort((a, b) => signalPriority(a.kind) - signalPriority(b.kind))[0] ?? null;
}

function buildAssetSummary(
	snapshot: DiffedSnapshot,
	assetId: string,
	conc: AssetIntelligence["venueConcentration"],
	signals: Signal[],
	priceDivergence: AssetIntelligence["priceDivergence"]
): string {
	const asset = snapshot.assets[assetId];
	if (!asset) return "";

	const parts: string[] = [];
	const name = assetDisplayName(snapshot, assetId);

	if (conc.venues.length > 0 && conc.topVolumeShare > 0) {
		const top = conc.venues[0];
		const concentration = conc.topVolumeShare >= 0.75 ? "is concentrated on" : "is led by";
		parts.push(
			`${name} activity ${concentration} ${humanVenueName(top.venue, top.namespace)}, which accounts for ${(conc.topVolumeShare * 100).toFixed(1)}% of volume${top.oiShare > 0 ? ` and ${(top.oiShare * 100).toFixed(1)}% of OI` : ""}.`
		);
	} else {
		parts.push(`${name} has no active venue concentration in the latest batch.`);
	}

	parts.push(
		`${changePhrase("Total perp volume", asset.volumeChange)}, while OI ${directionWord(asset.oiChange)} ${absPct(asset.oiChange)}.`
	);

	if (priceDivergence) {
		const rangeTone =
			priceDivergence.bps < THRESHOLDS.priceDivergenceBps ? "remain tight" : "are wide";
		parts.push(`Comparable-quote reference prices ${rangeTone} at ${bps(priceDivergence.bps)}.`);
	}

	const top = signals.find((signal) => signal.kind === "new_market");
	if (top) parts.push(top.label + ".");

	return parts.join(" ");
}

function formatCompact(n: number): string {
	if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
	if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
	if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
	return n.toFixed(0);
}

// --- Public entrypoints ---

export function buildAssetIntelligence(
	snapshot: DiffedSnapshot,
	assetId: string
): AssetIntelligence | null {
	const asset = snapshot.assets[assetId];
	if (!asset) return null;

	const venueConcentration = computeVenueConcentration(snapshot, assetId);
	const signals = detectAssetSignals(snapshot, assetId);
	const priceDivergence = computePriceDivergence(snapshot, assetId);
	const summary = buildAssetSummary(
		snapshot,
		assetId,
		venueConcentration,
		signals,
		priceDivergence
	);

	return { assetId, summary, signals, venueConcentration, priceDivergence };
}

export function getPrimaryAssetSignal(snapshot: DiffedSnapshot, assetId: string): Signal | null {
	return topSignal(detectAssetSignals(snapshot, assetId));
}

export function getPrimaryMarketSignal(snapshot: DiffedSnapshot, marketKey: string): Signal | null {
	const market = snapshot.markets[marketKey];
	const meta = MARKET_TO_ASSET.get(marketKey);
	if (!market || !meta) return null;

	if (market.isNew) {
		return {
			kind: "new_market",
			severity: "info",
			assetId: meta.asset,
			marketKey,
			venue: market.venue,
			value: 1,
			label: `New listing on ${humanVenueName(market.venue, market.namespace)}`
		};
	}

	if (market.volume === 0 && market.oi > 0) {
		return {
			kind: "stale_market",
			severity: "info",
			assetId: meta.asset,
			marketKey,
			venue: market.venue,
			value: market.oi,
			label: `No 24h volume while OI remains open`
		};
	}

	const asset = snapshot.assets[meta.asset];
	const priceDivergence = computePriceDivergence(snapshot, meta.asset);
	const marketIsRangeEdge =
		priceDivergence &&
		(priceDivergence.lowMarketKey === marketKey || priceDivergence.highMarketKey === marketKey);
	if (marketIsRangeEdge && priceDivergence.bps >= THRESHOLDS.priceDivergenceBps) {
		return {
			kind: "price_divergence",
			severity: priceDivergence.bps >= 200 ? "alert" : "watch",
			assetId: meta.asset,
			marketKey,
			venue: market.venue,
			value: priceDivergence.bps,
			label: `Reference price range edge at ${bps(priceDivergence.bps)}`
		};
	}

	if (asset?.volume >= THRESHOLDS.moverMinVolumeUsd) {
		if (market.volumeChange >= THRESHOLDS.volumeSpike) {
			return {
				kind: "volume_spike",
				severity: market.volumeChange >= 2 ? "alert" : "watch",
				assetId: meta.asset,
				marketKey,
				venue: market.venue,
				value: market.volumeChange,
				label: `Market volume ${pct(market.volumeChange)} vs 24h ago`
			};
		}
		if (market.oiChange >= THRESHOLDS.oiSpike) {
			return {
				kind: "oi_spike",
				severity: market.oiChange >= 1 ? "alert" : "watch",
				assetId: meta.asset,
				marketKey,
				venue: market.venue,
				value: market.oiChange,
				label: `Market OI ${pct(market.oiChange)} vs 24h ago`
			};
		}
	}

	return null;
}

export function assetMatchesSignalFilter(
	snapshot: DiffedSnapshot,
	assetId: string,
	filter: "new" | "divergences"
): boolean {
	const asset = snapshot.assets[assetId];
	if (!asset) return false;
	if (filter === "new")
		return asset.isNew || asset.marketIds.some((id) => snapshot.markets[id]?.isNew);
	return (computePriceDivergence(snapshot, assetId)?.bps ?? 0) >= THRESHOLDS.priceDivergenceBps;
}

export function buildVenueContext(
	snapshot: DiffedSnapshot,
	venue: string,
	namespace?: string
): VenueContext {
	const marketIds = (snapshot.index.marketsByVenue[venue] ?? []).filter((id) =>
		namespace ? snapshot.markets[id].namespace === namespace : true
	);

	let volume = 0;
	let oi = 0;
	let volumeWeightedChange = 0;
	let oiWeightedChange = 0;
	const classVolumes = new Map<string, number>();

	const rows: {
		marketKey: string;
		assetId: string;
		market: DiffedSnapshot["markets"][string];
	}[] = [];

	for (const marketKey of marketIds) {
		const market = snapshot.markets[marketKey];
		const meta = MARKET_TO_ASSET.get(marketKey);
		if (!market || !meta) continue;
		volume += market.volume;
		oi += market.oi;
		volumeWeightedChange += market.volume * market.volumeChange;
		oiWeightedChange += market.oi * market.oiChange;
		classVolumes.set(meta.category, (classVolumes.get(meta.category) ?? 0) + market.volume);
		rows.push({ marketKey, assetId: meta.asset, market });
	}

	const dominantClasses = [...classVolumes.entries()]
		.map(([category, classVolume]) => ({
			category,
			volume: classVolume,
			share: volume > 0 ? classVolume / volume : 0
		}))
		.sort((a, b) => b.volume - a.volume)
		.slice(0, 4);

	const oiVenue = snapshot.aggregates.oiByVenue.find((v) => v.venue === venue);

	return {
		marketIds,
		marketCount: marketIds.length,
		volume,
		oi,
		volumeChange: volume > 0 ? volumeWeightedChange / volume : 0,
		oiChange: oi > 0 ? oiWeightedChange / oi : 0,
		oiShare: oiVenue?.oiShare ?? 0,
		oiShareChange: oiVenue?.oiShareChange ?? 0,
		dominantClasses,
		topByVolume: [...rows]
			.sort((a, b) => b.market.volume - a.market.volume)
			.slice(0, 5)
			.map((row) => ({ marketKey: row.marketKey, assetId: row.assetId, value: row.market.volume })),
		topByOi: [...rows]
			.sort((a, b) => b.market.oi - a.market.oi)
			.slice(0, 5)
			.map((row) => ({ marketKey: row.marketKey, assetId: row.assetId, value: row.market.oi })),
		biggestMovers: [...rows]
			.filter((row) => !row.market.isNew)
			.sort((a, b) => Math.abs(b.market.volumeChange) - Math.abs(a.market.volumeChange))
			.slice(0, 5)
			.map((row) => ({
				marketKey: row.marketKey,
				assetId: row.assetId,
				value: row.market.volumeChange
			})),
		newMarkets: rows
			.filter((row) => row.market.isNew)
			.sort((a, b) => b.market.volume - a.market.volume)
			.slice(0, 5)
			.map((row) => ({ marketKey: row.marketKey, assetId: row.assetId, volume: row.market.volume }))
	};
}

// --- Global / homepage ---

export type GlobalMover = {
	assetId: string;
	value: number; // signed decimal change (volume / OI)
	volume: number;
};

export type GlobalDivergence = {
	assetId: string;
	bps: number;
	low: number;
	high: number;
	lowMarketKey: string;
	highMarketKey: string;
};

export type GlobalNewMarket = {
	marketKey: string;
	assetId: string;
	venue: string;
	namespace: string;
	volume: number;
};

export type GlobalVenueShift = {
	venue: string;
	oiShare: number;
	oiShareChange: number; // absolute pp/100 delta
};

export type HomepageIntelligence = {
	volumeSpikes: GlobalMover[];
	volumeDrops: GlobalMover[];
	oiSpikes: GlobalMover[];
	oiDrops: GlobalMover[];
	largestDivergences: GlobalDivergence[];
	newMarkets: GlobalNewMarket[];
	venueShifts: GlobalVenueShift[];
};

const MAX_PER_LIST = 6;

export function buildHomepageIntelligence(snapshot: DiffedSnapshot): HomepageIntelligence {
	// Asset moves (filter dust; exclude brand-new assets where change=0 by definition)
	const movers: { id: string; asset: DiffedSnapshot["assets"][string] }[] = [];
	for (const id of Object.keys(snapshot.assets)) {
		const a = snapshot.assets[id];
		if (a.isNew) continue;
		if (a.volume < THRESHOLDS.moverMinVolumeUsd) continue;
		movers.push({ id, asset: a });
	}

	const volSorted = [...movers].sort((a, b) => b.asset.volumeChange - a.asset.volumeChange);
	const volumeSpikes = volSorted
		.filter((m) => m.asset.volumeChange >= THRESHOLDS.volumeSpike)
		.slice(0, MAX_PER_LIST)
		.map<GlobalMover>((m) => ({
			assetId: m.id,
			value: m.asset.volumeChange,
			volume: m.asset.volume
		}));
	const volumeDrops = [...volSorted]
		.reverse()
		.filter((m) => m.asset.volumeChange <= THRESHOLDS.volumeDrop)
		.slice(0, MAX_PER_LIST)
		.map<GlobalMover>((m) => ({
			assetId: m.id,
			value: m.asset.volumeChange,
			volume: m.asset.volume
		}));

	const oiSorted = [...movers].sort((a, b) => b.asset.oiChange - a.asset.oiChange);
	const oiSpikes = oiSorted
		.filter((m) => m.asset.oiChange >= THRESHOLDS.oiSpike)
		.slice(0, MAX_PER_LIST)
		.map<GlobalMover>((m) => ({ assetId: m.id, value: m.asset.oiChange, volume: m.asset.volume }));
	const oiDrops = [...oiSorted]
		.reverse()
		.filter((m) => m.asset.oiChange <= THRESHOLDS.oiDrop)
		.slice(0, MAX_PER_LIST)
		.map<GlobalMover>((m) => ({ assetId: m.id, value: m.asset.oiChange, volume: m.asset.volume }));

	// Largest cross-venue reference price ranges
	const divergences: GlobalDivergence[] = [];
	for (const id of Object.keys(snapshot.assets)) {
		const d = computePriceDivergence(snapshot, id);
		if (!d) continue;
		if (d.bps < THRESHOLDS.priceDivergenceBps) continue;
		divergences.push({ assetId: id, ...d });
	}
	divergences.sort((a, b) => b.bps - a.bps);
	const largestDivergences = divergences.slice(0, MAX_PER_LIST);

	// New markets in the latest batch
	const newMarkets: GlobalNewMarket[] = [];
	for (const [marketKey, m] of Object.entries(snapshot.markets)) {
		if (!m.isNew) continue;
		const meta = MARKET_TO_ASSET.get(marketKey);
		if (!meta) continue;
		newMarkets.push({
			marketKey,
			assetId: meta.asset,
			venue: m.venue,
			namespace: m.namespace,
			volume: m.volume
		});
	}
	newMarkets.sort((a, b) => b.volume - a.volume);

	// Venue dominance shifts
	const venueShifts = snapshot.aggregates.oiByVenue
		.filter((v) => Math.abs(v.oiShareChange) >= THRESHOLDS.venueDominanceShift)
		.sort((a, b) => Math.abs(b.oiShareChange) - Math.abs(a.oiShareChange))
		.slice(0, MAX_PER_LIST)
		.map<GlobalVenueShift>((v) => ({
			venue: v.venue,
			oiShare: v.oiShare,
			oiShareChange: v.oiShareChange
		}));

	return {
		volumeSpikes,
		volumeDrops,
		oiSpikes,
		oiDrops,
		largestDivergences,
		newMarkets: newMarkets.slice(0, MAX_PER_LIST),
		venueShifts
	};
}
