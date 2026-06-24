import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/lib/generated/prisma/client";
import tickers from "../src/config/tickers.json";

const db = new PrismaClient({
	adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! })
});

const latest = await db.marketEntry.findFirst({
	orderBy: { createdAt: "desc" },
	select: { batchId: true, createdAt: true }
});
console.log("batchId:", latest!.batchId, "at", latest!.createdAt.toISOString());

// Build asset → refs map
const assetRefs = new Map<string, string[]>();
for (const group of Object.values(tickers.perps as Record<string, Record<string, { ref: string[] }>>)) {
	for (const [assetId, def] of Object.entries(group)) {
		assetRefs.set(assetId, def.ref);
	}
}

const rows = await db.marketEntry.findMany({
	where: { batchId: latest!.batchId },
	select: { venue: true, namespace: true, ticker: true, refPx: true, volume: true, oi: true }
});

const keyToRow = new Map(
	rows.map((r) => [`${r.venue}${r.namespace ? ":" + r.namespace : ""}:${r.ticker}`, r])
);

function asset(name: string) {
	const refs = assetRefs.get(name);
	if (!refs) return;
	console.log(`\n=== ${name.toUpperCase()} ===`);
	let totalVol = 0;
	let totalOi = 0;
	for (const ref of refs) {
		const r = keyToRow.get(ref);
		if (!r) {
			console.log(`  ${ref.padEnd(40)} (missing)`);
			continue;
		}
		const v = Number(r.volume);
		const o = Number(r.oi);
		totalVol += v;
		totalOi += o;
		console.log(
			`  ${ref.padEnd(40)} vol=$${v.toLocaleString(undefined, { maximumFractionDigits: 0 }).padStart(15)} oi=$${o.toLocaleString(undefined, { maximumFractionDigits: 0 }).padStart(15)} px=${Number(r.refPx)}`
		);
	}
	console.log(`  TOTAL vol=$${totalVol.toLocaleString(undefined, { maximumFractionDigits: 0 })}  oi=$${totalOi.toLocaleString(undefined, { maximumFractionDigits: 0 })}`);
}

for (const a of ["silver", "gold", "wti", "intc", "skhynix"]) asset(a);
await db.$disconnect();
