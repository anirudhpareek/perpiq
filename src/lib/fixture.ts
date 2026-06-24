// Dev-only synthetic snapshot used when DATABASE_URL is not set.
// Lets the UI render without a Postgres/collector environment.
//
// Generates deterministic `PlainMarketEntry[]` rows for every market in
// `tickers.perps`, then runs them through the real `buildSnapshot` +
// `buildDiffedSnapshot` pipeline so the resulting `DiffedSnapshot` matches
// production shape exactly. A few assets are engineered to demonstrate each
// intelligence signal.

import tickers from "$config/tickers.json";
import type { PlainMarketEntry } from "$lib/serialize";
import type { TickerCfg } from "$lib/types";
import { buildSnapshot, buildDiffedSnapshot, type DiffedSnapshot } from "$lib/transform";

// Deterministic hash → [0,1)
function rand(s: string): number {
	let h = 2166136261;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return ((h >>> 0) % 100000) / 100000;
}

const CURR_BATCH = "fixture-curr";
const PREV_BATCH = "fixture-prev";
const NOW = new Date();
const YESTERDAY = new Date(NOW.getTime() - 24 * 60 * 60 * 1000);

type ScenarioFn = (
	assetId: string,
	marketKey: string,
	base: { volume: number; oi: number; refPx: number }
) => {
	curr?: { volume: number; oi: number; refPx: number };
	prev?: { volume: number; oi: number; refPx: number };
	dropFromPrev?: boolean;
	dropFromCurr?: boolean;
};

// Engineered demo scenarios per asset
const SCENARIOS: Record<string, ScenarioFn> = {
	nvda: (_id, marketKey, base) => {
		// Huge volume spike on hyperliquid:xyz, price divergence on vest
		if (marketKey === "hyperliquid:xyz:NVDA") {
			return {
				curr: { volume: base.volume * 4.2, oi: base.oi * 1.6, refPx: base.refPx },
				prev: { volume: base.volume, oi: base.oi, refPx: base.refPx }
			};
		}
		if (marketKey === "vest:NVDA-USD-PERP") {
			return {
				curr: { volume: base.volume * 0.4, oi: base.oi, refPx: base.refPx * 1.03 },
				prev: { volume: base.volume * 0.4, oi: base.oi, refPx: base.refPx * 0.999 }
			};
		}
		return {};
	},
	tsla: (_id, marketKey, _base) => {
		// New listing on lighter (omit from prev), big OI growth
		if (marketKey === "lighter:TSLA") return { dropFromPrev: true };
		if (marketKey === "hyperliquid:xyz:TSLA") {
			return {
				curr: { volume: _base.volume * 1.2, oi: _base.oi * 1.8, refPx: _base.refPx },
				prev: { volume: _base.volume, oi: _base.oi, refPx: _base.refPx * 0.98 }
			};
		}
		return {};
	},
	intc: (_id, marketKey, base) => {
		// Asset-wide volume drop
		return {
			curr: { volume: base.volume * 0.35, oi: base.oi, refPx: base.refPx },
			prev: { volume: base.volume, oi: base.oi, refPx: base.refPx }
		};
	},
	hood: (_id, marketKey, base) => {
		// Stale market on qfex: OI present, zero volume
		if (marketKey === "qfex:HOOD-USD") {
			return {
				curr: { volume: 0, oi: base.oi * 1.2, refPx: base.refPx },
				prev: { volume: base.volume, oi: base.oi, refPx: base.refPx }
			};
		}
		return {};
	},
	mstr: (_id, marketKey, base) => {
		// Drive venue dominance shift: binance way up vs prev
		if (marketKey === "binance:MSTRUSDT") {
			return {
				curr: { volume: base.volume * 5, oi: base.oi * 4, refPx: base.refPx },
				prev: { volume: base.volume, oi: base.oi * 0.4, refPx: base.refPx }
			};
		}
		return {};
	}
};

const BASE_PRICE: Record<string, number> = {
	nvda: 178,
	tsla: 412,
	hood: 118,
	intc: 24,
	mstr: 432,
	pltr: 64,
	coin: 295,
	googl: 195,
	msft: 422,
	amzn: 215,
	mu: 105,
	sndk: 32
};

/**
 * Build a deterministic dev DiffedSnapshot, with engineered signal scenarios.
 */
export function buildFixtureSnapshot(): { snapshot: DiffedSnapshot } {
	const currEntries: PlainMarketEntry[] = [];
	const prevEntries: PlainMarketEntry[] = [];

	const cfg = tickers.perps as TickerCfg;

	for (const [category, assets] of Object.entries(cfg)) {
		for (const [assetId, def] of Object.entries(assets)) {
			const refs = (def as unknown as { ref: string[] }).ref ?? [];
			const basePx = BASE_PRICE[assetId] ?? 50 + rand(assetId) * 200;
			const baseVolPerMarket = 250_000 + rand(assetId + "v") * 5_000_000;
			const baseOiPerMarket = 100_000 + rand(assetId + "o") * 8_000_000;
			const scenario = SCENARIOS[assetId];

			for (const marketKey of refs) {
				const venueWeight = 0.4 + rand(marketKey + "w") * 1.4;
				const noise = 0.85 + rand(marketKey + "n") * 0.3; // 0.85..1.15

				const baseCurr = {
					volume: Math.round(baseVolPerMarket * venueWeight),
					oi: Math.round(baseOiPerMarket * venueWeight),
					refPx: basePx * (0.998 + rand(marketKey + "p") * 0.004)
				};
				const basePrev = {
					volume: Math.round(baseCurr.volume * noise),
					oi: Math.round(baseCurr.oi * noise),
					refPx: baseCurr.refPx * (0.97 + rand(marketKey + "pp") * 0.06)
				};

				const s = scenario?.(assetId, marketKey, baseCurr) ?? {};
				const curr = s.curr ?? baseCurr;
				const prev = s.prev ?? basePrev;

				const parts = marketKey.split(":");
				const venue = parts[0];
				const ticker = parts[parts.length - 1];
				const namespace = parts.length === 3 ? parts[1] : "";

				if (!s.dropFromCurr) {
					currEntries.push({
						id: `${CURR_BATCH}:${marketKey}`,
						batchId: CURR_BATCH,
						venue,
						namespace,
						ticker,
						refPx: curr.refPx,
						oi: curr.oi,
						volume: curr.volume,
						maxLeverage: 20,
						createdAt: NOW
					});
				}
				if (!s.dropFromPrev) {
					prevEntries.push({
						id: `${PREV_BATCH}:${marketKey}`,
						batchId: PREV_BATCH,
						venue,
						namespace,
						ticker,
						refPx: prev.refPx,
						oi: prev.oi,
						volume: prev.volume,
						maxLeverage: 20,
						createdAt: YESTERDAY
					});
				}
			}

			// Silence unused param warning
			void category;
		}
	}

	const snapshot = buildDiffedSnapshot(buildSnapshot(prevEntries), buildSnapshot(currEntries));
	return { snapshot };
}
