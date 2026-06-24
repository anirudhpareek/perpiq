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

export type LoadResult = {
	snapshot: DiffedSnapshot;
	// assetId -> chronologically ordered median refPx series, oldest first
	sparklines: Record<string, number[]>;
};

/**
 * Loads and returns `DiffedSnapshot` w/ 24h change + short price history per asset.
 */
export async function loadSnapshot(): Promise<LoadResult> {
	// Dev fallback: when no DATABASE_URL is configured, serve a synthetic fixture
	// so the UI can be exercised locally without Postgres + collectors.
	if (!env.DATABASE_URL) {
		return { ...buildFixtureSnapshot(), sparklines: {} };
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
			const batchOrder = recentBatches
				.slice()
				.reverse()
				.map((r) => r.batchId);

			// Light projection — only need venue/namespace/ticker/refPx to compute medians
			const sparklineRows = await tx.marketEntry.findMany({
				where: { batchId: { in: batchOrder } },
				select: { batchId: true, venue: true, namespace: true, ticker: true, refPx: true }
			});

			return { prevEntries, currEntries, sparklineRows, batchOrder };
		}
	);

	const snapshot = buildDiffedSnapshot(
		buildSnapshot(plainifyEntries(prevEntries)),
		buildSnapshot(plainifyEntries(currEntries))
	);

	// Build per-asset median refPx series across the recent batches.
	// For each batch: bucket prices by asset (filtering to matching-quote venues
	// the same way buildSnapshot does), take the median, append to the series.
	const batchIndex = new Map(batchOrder.map((id, i) => [id, i]));
	// assetId -> Map<batchIdx, number[]>
	const buckets = new Map<string, Map<number, number[]>>();
	for (const r of sparklineRows) {
		const key = `${r.venue}${r.namespace ? ":" + r.namespace : ""}:${r.ticker}`;
		const meta = MARKET_TO_ASSET.get(key);
		if (!meta) continue;
		if (meta.quote !== meta.venueQuote) continue;
		const px = Number(r.refPx);
		if (!(px > 0)) continue;
		const bi = batchIndex.get(r.batchId)!;
		let assetMap = buckets.get(meta.asset);
		if (!assetMap) {
			assetMap = new Map();
			buckets.set(meta.asset, assetMap);
		}
		let arr = assetMap.get(bi);
		if (!arr) {
			arr = [];
			assetMap.set(bi, arr);
		}
		arr.push(px);
	}

	const sparklines: Record<string, number[]> = {};
	for (const [assetId, assetMap] of buckets) {
		const series: number[] = [];
		for (let i = 0; i < batchOrder.length; i++) {
			const arr = assetMap.get(i);
			if (!arr || arr.length === 0) {
				series.push(NaN);
				continue;
			}
			arr.sort((a, b) => a - b);
			const mid = arr.length >> 1;
			series.push(arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2);
		}
		sparklines[assetId] = series;
	}

	return { snapshot, sparklines };
}
