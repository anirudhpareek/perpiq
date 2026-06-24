import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/lib/generated/prisma/client";

const db = new PrismaClient({
	adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! })
});

// List all batches with venue presence
const all = await db.marketEntry.groupBy({
	by: ["batchId", "venue"],
	_count: { _all: true }
});

const byBatch = new Map<string, Set<string>>();
for (const r of all) {
	if (!byBatch.has(r.batchId)) byBatch.set(r.batchId, new Set());
	byBatch.get(r.batchId)!.add(r.venue);
}

const P0 = ["hyperliquid", "binance", "lighter"];
const bad: string[] = [];
for (const [batchId, venues] of byBatch) {
	const missing = P0.filter((v) => !venues.has(v));
	if (missing.length > 0) bad.push(batchId);
	console.log(batchId, "venues:", [...venues].sort().join(","), missing.length ? "MISSING " + missing.join(",") : "ok");
}

if (bad.length) {
	console.log(`deleting ${bad.length} bad batches…`);
	const r = await db.marketEntry.deleteMany({ where: { batchId: { in: bad } } });
	console.log("deleted rows:", r.count);
}

await db.$disconnect();
