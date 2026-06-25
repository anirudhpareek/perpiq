import { env } from "$env/dynamic/private";
import { plainifyEntries } from "$lib/serialize";
import { buildFixtureSnapshot } from "$lib/fixture";
import {
	buildSnapshot,
	buildDiffedSnapshot,
	MARKET_TO_ASSET,
	type DiffedSnapshot
} from "$lib/transform";

// One day in milliseconds
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// P0 venues — force fail build if missing in latest batch.
// Binance is geo-blocked from default Vercel egress; we no longer hard-require
// it since the seed endpoint can produce a valid batch without it.
const P0_VENUES: readonly string[] = ["hyperliquid", "lighter"];

// How many recent batches to pull into per-asset sparklines.
const SPARKLINE_BATCHES = 12;

export type AssetSeries = {
	price: number[]; // median refPx per batch (NaN where unavailable)
	volume: number[]; // summed market volume per batch
	timestamps: number[]; // ms since epoch, batch createdAt
};

export type LoadResult = {
	snapshot: DiffedSnapshot;
	// assetId -> chronologically ordered series, oldest first
	sparklines: Record<string, number[]>; // back-compat: price-only
	series: Record<string, AssetSeries>;
};

/**
 * Loads and returns `DiffedSnapshot` w/ 24h change + short price history per asset.
 */
export async function loadSnapshot(): Promise<LoadResult> {
	// Dev fallback: when no DATABASE_URL is configured, serve a synthetic fixture
	// so the UI can be exercised locally without Postgres + collectors.
	if (!env.DATABASE_URL) {
		return { ...buildFixtureSnapshot(), sparklines: {}, series: {} };
	}

	const { default: db } = await import("$lib/db");

	const { prevEntries, currEntries, sparklineRows, batchOrder } = await db.$transaction(
		async (tx) => {
			const { batchId: currBatchId, createdAt: currCreatedAt } =
				await tx.marketEntry.findFirstOrThrow({
					orderBy: { createdAt: "desc" },
					select: { batchId: true, createdAt: true }
				});

			// Validate P0 venue coverage
			const venuesInBatch = await tx.marketEntry.groupBy({
				by: ["venue"],
				where: { batchId: currBatchId }
			});
			const venueSet = new Set(venuesInBatch.map((r) => r.venue));
			const missing = P0_VENUES.filter((v) => !venueSet.has(v));
			if (missing.length > 0) {
				throw new Error(`Latest batch ${currBatchId} missing P0 venues: ${missing.join(", ")}`);
			}

			// Collect batch ID closest to 24 hours ago
			const lte = new Date(currCreatedAt.getTime() - ONE_DAY_MS);
			const prev = await tx.marketEntry.findFirst({
				where: { createdAt: { lte } },
				orderBy: { createdAt: "desc" },
				select: { batchId: true }
			});

			const currEntries = await tx.marketEntry.findMany({ where: { batchId: currBatchId } });
			const prevEntries = prev
				? await tx.marketEntry.findMany({ where: { batchId: prev.batchId } })
				: currEntries;

			// Find the last N distinct batches (latest -> oldest) for sparklines.
			const recentBatches = await tx.marketEntry.groupBy({
				by: ["batchId"],
				_max: { createdAt: true },
				orderBy: { _max: { createdAt: "desc" } },
				take: SPARKLINE_BATCHES
			});
			// Order oldest-first for chart x-axis
			const batchOrder = recentBatches.slice().reverse();
			const batchIds = batchOrder.map((r) => r.batchId);

			// Need refPx + volume — keep projection light, but include both
			const sparklineRows = await tx.marketEntry.findMany({
				where: { batchId: { in: batchIds } },
				select: {
					batchId: true,
					venue: true,
					namespace: true,
					ticker: true,
					refPx: true,
					volume: true
				}
			});

			return { prevEntries, currEntries, sparklineRows, batchOrder };
		},
		{ maxWait: 20_000, timeout: 20_000 }
	);

	const snapshot = buildDiffedSnapshot(
		buildSnapshot(plainifyEntries(prevEntries)),
		buildSnapshot(plainifyEntries(currEntries))
	);

	// Build per-asset median refPx + summed volume series across the recent batches.
	const batchIndex = new Map(batchOrder.map((r, i) => [r.batchId, i]));
	const timestamps = batchOrder.map((r) => r._max.createdAt?.getTime() ?? 0);

	// assetId -> { prices[batchIdx][], volume[batchIdx] }
	type Bucket = { priceArrs: Map<number, number[]>; volumes: Map<number, number> };
	const buckets = new Map<string, Bucket>();

	function bucketFor(assetId: string): Bucket {
		let b = buckets.get(assetId);
		if (!b) {
			b = { priceArrs: new Map(), volumes: new Map() };
			buckets.set(assetId, b);
		}
		return b;
	}

	for (const r of sparklineRows) {
		const key = `${r.venue}${r.namespace ? ":" + r.namespace : ""}:${r.ticker}`;
		const meta = MARKET_TO_ASSET.get(key);
		if (!meta) continue;
		const bi = batchIndex.get(r.batchId)!;
		const b = bucketFor(meta.asset);

		// Price: only count venues that quote in the asset's preferred currency
		if (meta.quote === meta.venueQuote) {
			const px = Number(r.refPx);
			if (px > 0) {
				let arr = b.priceArrs.get(bi);
				if (!arr) {
					arr = [];
					b.priceArrs.set(bi, arr);
				}
				arr.push(px);
			}
		}

		// Volume: sum across all venues (USD notional already normalized upstream)
		const vol = Number(r.volume);
		if (vol > 0) {
			b.volumes.set(bi, (b.volumes.get(bi) ?? 0) + vol);
		}
	}

	const sparklines: Record<string, number[]> = {};
	const series: Record<string, AssetSeries> = {};

	for (const [assetId, b] of buckets) {
		const price: number[] = [];
		const volume: number[] = [];
		for (let i = 0; i < batchOrder.length; i++) {
			const arr = b.priceArrs.get(i);
			if (!arr || arr.length === 0) {
				price.push(NaN);
			} else {
				arr.sort((a, b) => a - b);
				const mid = arr.length >> 1;
				price.push(arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2);
			}
			volume.push(b.volumes.get(i) ?? NaN);
		}
		sparklines[assetId] = price;
		series[assetId] = { price, volume, timestamps };
	}

	return { snapshot, sparklines, series };
}
