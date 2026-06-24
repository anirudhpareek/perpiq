import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/lib/generated/prisma/client";
import tickers from "../src/config/tickers.json";

const db = new PrismaClient({
	adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! })
});

const latest = await db.marketEntry.findFirst({
	orderBy: { createdAt: "desc" },
	select: { batchId: true }
});
const rows = await db.marketEntry.findMany({
	where: { batchId: latest!.batchId },
	select: { venue: true, namespace: true, ticker: true }
});

const seededKeys = new Set(
	rows.map((r) => `${r.venue}${r.namespace ? ":" + r.namespace : ""}:${r.ticker}`)
);

// Build expected ref → asset map
const expected = new Map<string, string>();
for (const [, group] of Object.entries(tickers.perps as Record<string, Record<string, { ref: string[] }>>)) {
	for (const [assetId, def] of Object.entries(group)) {
		for (const ref of def.ref) expected.set(ref, assetId);
	}
}

const matched: string[] = [];
const missing: string[] = [];
for (const [ref, assetId] of expected) {
	if (seededKeys.has(ref)) matched.push(ref);
	else missing.push(`${ref}  (${assetId})`);
}
console.log(`expected refs: ${expected.size}`);
console.log(`matched (in DB): ${matched.length}`);
console.log(`missing: ${missing.length}`);

const missingByVenue: Record<string, number> = {};
for (const m of missing) {
	const v = m.split(":")[0];
	missingByVenue[v] = (missingByVenue[v] ?? 0) + 1;
}
console.log("missing by venue:", missingByVenue);

// Which assets have ZERO matched refs?
const assetsWithMatch = new Set<string>();
for (const ref of matched) assetsWithMatch.add(expected.get(ref)!);
const allAssets = new Set(expected.values());
const fullyMissingAssets = [...allAssets].filter((a) => !assetsWithMatch.has(a));
console.log(`assets with at least one venue: ${assetsWithMatch.size} / ${allAssets.size}`);
console.log(`assets with zero venues:`, fullyMissingAssets);

await db.$disconnect();
