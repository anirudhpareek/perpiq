// Standalone local seeder for P0 venues (Hyperliquid + Binance + Lighter).
// Uses plain `fetch` + a Prisma client built from process.env.DATABASE_URL,
// bypassing the Vercel workflow runtime that production collectors depend on.
//
// Usage:
//   set -a && source .env && set +a
//   pnpm tsx scripts/seed.ts

import { randomUUID } from "crypto";
import { Decimal } from "decimal.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/lib/generated/prisma/client";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is required");

const adapter = new PrismaPg({ connectionString: DATABASE_URL });
const db = new PrismaClient({ adapter });

type Row = {
	batchId: string;
	venue: string;
	namespace: string;
	ticker: string;
	refPx: number;
	volume: number;
	oi: number;
	maxLeverage?: number | null;
};

const batchId = randomUUID();
const rows: Row[] = [];

async function collectHyperliquid() {
	const url = "https://api.hyperliquid.xyz/info";
	const meta = await fetch(url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ type: "allPerpMetas" })
	}).then((r) => r.json() as Promise<{ universe: { name: string }[] }[]>);

	const dexs = [
		...new Set(
			meta
				.flatMap(({ universe }) => universe.map((m) => m.name))
				.filter((n) => n.includes(":"))
				.map((n) => n.split(":")[0])
		)
	];

	const ctxs = await Promise.all(
		dexs.map((dex) =>
			fetch(url, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ type: "metaAndAssetCtxs", dex })
			}).then(
				(r) =>
					r.json() as Promise<
						[
							{ universe: { name: string; maxLeverage: number }[] },
							{ openInterest: string; dayNtlVlm: string; midPx: string | null }[]
						]
					>
			)
		)
	);

	let count = 0;
	for (const [{ universe }, metrics] of ctxs) {
		if (universe.length === 0) continue;
		const dex = universe[0].name.split(":")[0];
		for (let i = 0; i < universe.length; i++) {
			const refPx = Number(metrics[i].midPx ?? 0);
			if (refPx === 0) continue;
			rows.push({
				batchId,
				venue: "hyperliquid",
				namespace: dex,
				ticker: universe[i].name.split(":")[1],
				refPx,
				volume: Number(metrics[i].dayNtlVlm),
				oi: new Decimal(metrics[i].openInterest).mul(refPx).toNumber(),
				maxLeverage: universe[i].maxLeverage
			});
			count++;
		}
	}
	console.log(`[hyperliquid] ${count} rows`);
}

async function collectBinance() {
	const base = "https://fapi.binance.com/fapi/v1";
	const info = (await fetch(`${base}/exchangeInfo`).then((r) => r.json())) as {
		symbols: {
			symbol: string;
			status: string;
			requiredMarginPercent: string;
			underlyingSubType: string[];
		}[];
	};
	const filtered = info.symbols.filter(
		(s) => s.status === "TRADING" && s.underlyingSubType.includes("TradFi")
	);
	const hist = (await fetch(`${base}/ticker/24hr`).then((r) => r.json())) as {
		symbol: string;
		lastPrice: string;
		quoteVolume: string;
	}[];
	const histMap = new Map(
		hist.map((h) => [h.symbol, { px: Number(h.lastPrice), vol: Number(h.quoteVolume) }])
	);
	const oiResults = await Promise.all(
		filtered.map((s) =>
			fetch(`${base}/openInterest?symbol=${s.symbol}`).then(
				(r) => r.json() as Promise<{ symbol: string; openInterest: string }>
			)
		)
	);
	const oiMap = new Map(oiResults.map((r) => [r.symbol, r.openInterest]));

	let count = 0;
	for (const s of filtered) {
		const h = histMap.get(s.symbol);
		const px = h?.px ?? 0;
		rows.push({
			batchId,
			venue: "binance",
			namespace: "",
			ticker: s.symbol,
			refPx: px,
			volume: h?.vol ?? 0,
			oi: new Decimal(oiMap.get(s.symbol) ?? 0).mul(new Decimal(px)).toNumber(),
			maxLeverage: new Decimal(100).div(new Decimal(s.requiredMarginPercent)).toNumber()
		});
		count++;
	}
	console.log(`[binance] ${count} rows`);
}

async function collectLighter() {
	const base = "https://mainnet.zklighter.elliot.ai/api/v1";
	const stats = (await fetch(`${base}/exchangeStats`).then((r) => r.json())) as {
		code: number;
		order_book_stats: {
			symbol: string;
			last_trade_price: number;
			daily_quote_token_volume: number;
		}[];
	};
	const obd = (await fetch(`${base}/orderBookDetails`).then((r) => r.json())) as {
		code: number;
		order_book_details: {
			symbol: string;
			open_interest: number;
			min_initial_margin_fraction: string;
		}[];
	};
	const m = new Map(
		obd.order_book_details.map((d) => [
			d.symbol,
			{ oi: d.open_interest, mar: d.min_initial_margin_fraction }
		])
	);
	let count = 0;
	for (const s of stats.order_book_stats) {
		const e = m.get(s.symbol);
		rows.push({
			batchId,
			venue: "lighter",
			namespace: "",
			ticker: s.symbol,
			refPx: s.last_trade_price,
			oi: new Decimal(e?.oi ?? 0).mul(2).mul(new Decimal(s.last_trade_price)).toNumber(),
			volume: Number(s.daily_quote_token_volume),
			maxLeverage:
				e && e.mar !== "0" ? new Decimal(10000).div(new Decimal(e.mar)).toNumber() : undefined
		});
		count++;
	}
	console.log(`[lighter] ${count} rows`);
}

async function collectBinanceLike(
	venue: string,
	apiBase: string,
	subTypes: ReadonlySet<string>
) {
	const info = (await fetch(`${apiBase}/exchangeInfo`).then((r) => r.json())) as {
		symbols: {
			symbol: string;
			status: string;
			requiredMarginPercent: string;
			underlyingSubType: string[];
		}[];
	};
	const filtered = info.symbols.filter(
		(s) => s.status === "TRADING" && s.underlyingSubType.some((t) => subTypes.has(t))
	);
	const hist = (await fetch(`${apiBase}/ticker/24hr`).then((r) => r.json())) as {
		symbol: string;
		lastPrice: string;
		quoteVolume: string;
	}[];
	const histMap = new Map(
		hist.map((h) => [h.symbol, { px: Number(h.lastPrice), vol: Number(h.quoteVolume) }])
	);
	const oiResults = await Promise.all(
		filtered.map((s) =>
			fetch(`${apiBase}/openInterest?symbol=${s.symbol}`).then(
				(r) => r.json() as Promise<{ symbol: string; openInterest: string }>
			)
		)
	);
	const oiMap = new Map(oiResults.map((r) => [r.symbol, r.openInterest]));

	let count = 0;
	for (const s of filtered) {
		const h = histMap.get(s.symbol);
		const px = h?.px ?? 0;
		rows.push({
			batchId,
			venue,
			namespace: "",
			ticker: s.symbol,
			refPx: px,
			volume: h?.vol ?? 0,
			oi: new Decimal(oiMap.get(s.symbol) ?? 0).mul(new Decimal(px)).toNumber(),
			maxLeverage: new Decimal(100).div(new Decimal(s.requiredMarginPercent)).toNumber()
		});
		count++;
	}
	console.log(`[${venue}] ${count} rows`);
}

async function collectAster() {
	await collectBinanceLike(
		"aster",
		"https://fapi.asterdex.com/fapi/v1",
		new Set(["STOCK", "RWA", "Metals"])
	);
}

async function collectEdgeX() {
	const base = "https://pro.edgex.exchange/api/v1/public";
	const meta = (await fetch(`${base}/meta/getMetaData`).then((r) => r.json())) as {
		data: {
			contractList: {
				contractId: string;
				contractName: string;
				riskTierList: { maxLeverage: string }[];
			}[];
		};
	};
	const contracts = meta.data.contractList;
	const ids = contracts.map((c) => ({
		id: c.contractId,
		name: c.contractName,
		lev: Number(c.riskTierList?.[0]?.maxLeverage ?? 0)
	}));
	const tickers = await Promise.all(
		ids.map((c) =>
			fetch(`${base}/quote/getTicker?period=LAST_DAY_1&contractId=${c.id}`).then(
				(r) =>
					r.json() as Promise<{
						data: {
							contractName: string;
							value: string;
							lastPrice: string;
							openInterest: string;
						}[];
					}>
			)
		)
	);
	let count = 0;
	tickers.forEach((resp, i) => {
		const m = resp.data?.[0];
		if (!m) return;
		const px = Number(m.lastPrice);
		rows.push({
			batchId,
			venue: "edgex",
			namespace: "",
			ticker: m.contractName,
			refPx: px,
			volume: Number(m.value),
			oi: new Decimal(m.openInterest).mul(new Decimal(px)).toNumber(),
			maxLeverage: ids[i].lev
		});
		count++;
	});
	console.log(`[edgex] ${count} rows`);
}

async function collectExtended() {
	const r = (await fetch("https://api.starknet.extended.exchange/api/v1/info/markets").then((r) =>
		r.json()
	)) as {
		data: {
			uiName: string;
			category: string;
			active: boolean;
			marketStats: {
				dailyVolume: string;
				lastPrice: string;
				openInterest: string;
			};
			tradingConfig: { maxLeverage: string };
		}[];
	};
	let count = 0;
	for (const m of r.data.filter((m) => m.active && m.category === "TradFi")) {
		rows.push({
			batchId,
			venue: "extended",
			namespace: "",
			ticker: m.uiName,
			refPx: Number(m.marketStats.lastPrice),
			volume: Number(m.marketStats.dailyVolume),
			oi: Number(m.marketStats.openInterest),
			maxLeverage: Number(m.tradingConfig.maxLeverage)
		});
		count++;
	}
	console.log(`[extended] ${count} rows`);
}

async function collectOstium() {
	const pairs = (await fetch("https://app.ostium.com/api/pairs").then((r) => r.json())) as {
		id: string;
		from: string;
		to: string;
		feed: string;
		longOI: string;
		shortOI: string;
		group: { maxLeverage: string };
		lastTradePrice: string;
	}[];
	const meta = "https://metadata-backend.ostium.io";
	const vol = (await fetch(`${meta}/volume/all`).then((r) => r.json())) as {
		data: { pair_id: string; last_24h_volume: number }[];
	};
	const px = (await fetch(`${meta}/PricePublish/latest-prices`).then((r) => r.json())) as {
		feed_id: string;
		mid: number;
	}[];
	const volMap = new Map(vol.data.map((v) => [v.pair_id, v.last_24h_volume]));
	const pxMap = new Map(px.map((p) => [p.feed_id, p.mid]));
	let count = 0;
	for (const p of pairs) {
		rows.push({
			batchId,
			venue: "ostium",
			namespace: "",
			ticker: `${p.from}-${p.to}`,
			refPx: pxMap.get(p.feed) ?? 0,
			oi: new Decimal(p.longOI)
				.add(new Decimal(p.shortOI))
				.mul(new Decimal(p.lastTradePrice))
				.div(1e36)
				.toNumber(),
			volume: volMap.get(p.id) ?? 0,
			maxLeverage: new Decimal(p.group.maxLeverage).div(100).toNumber()
		});
		count++;
	}
	console.log(`[ostium] ${count} rows`);
}

async function collectQFEX() {
	const m = (await fetch("https://api.qfex.com/symbols/metrics").then((r) => r.json())) as {
		data: {
			symbol: string;
			current_mark_price: number;
			volume_24h_usd_notional: number;
			open_interest: number;
		}[];
	};
	const refdata = (await fetch("https://api.qfex.com/refdata").then((r) => r.json())) as {
		data: { symbol: string; default_max_leverage: number }[];
	};
	const lev = new Map(refdata.data.map((r) => [r.symbol, r.default_max_leverage]));
	let count = 0;
	for (const mkt of m.data) {
		rows.push({
			batchId,
			venue: "qfex",
			namespace: "",
			ticker: mkt.symbol,
			refPx: mkt.current_mark_price,
			volume: mkt.volume_24h_usd_notional,
			oi: mkt.current_mark_price * mkt.open_interest,
			maxLeverage: lev.get(mkt.symbol) ?? 0
		});
		count++;
	}
	console.log(`[qfex] ${count} rows`);
}

async function collectVest() {
	const base = "https://server-prod.hz.vestmarkets.com/v2";
	const info = (await fetch(`${base}/exchangeInfo`).then((r) => r.json())) as {
		symbols: { symbol: string; initMarginRatio: string; tradingStatus: string }[];
	};
	const trading = info.symbols.filter((s) => s.tradingStatus === "TRADING");
	const [hist, latest, oi] = await Promise.all([
		fetch(`${base}/ticker/24hr`).then(
			(r) => r.json() as Promise<{ tickers: { symbol: string; quoteVolume: string }[] }>
		),
		fetch(`${base}/ticker/latest`).then(
			(r) => r.json() as Promise<{ tickers: { symbol: string; markPrice: string }[] }>
		),
		fetch(`${base}/oi`).then(
			(r) =>
				r.json() as Promise<{ ois: { symbol: string; longOi: string; shortOi: string }[] }>
		)
	]);
	const v = new Map(hist.tickers.map((t) => [t.symbol, Number(t.quoteVolume)]));
	const p = new Map(latest.tickers.map((t) => [t.symbol, Number(t.markPrice)]));
	const o = new Map(oi.ois.map((x) => [x.symbol, { long: x.longOi, short: x.shortOi }]));
	let count = 0;
	for (const m of trading) {
		const px = p.get(m.symbol) ?? 0;
		rows.push({
			batchId,
			venue: "vest",
			namespace: "",
			ticker: m.symbol,
			refPx: px,
			volume: v.get(m.symbol) ?? 0,
			oi: new Decimal(o.get(m.symbol)?.long ?? 0)
				.add(new Decimal(o.get(m.symbol)?.short ?? 0))
				.mul(new Decimal(px))
				.toNumber(),
			maxLeverage: new Decimal(1).div(new Decimal(m.initMarginRatio)).toNumber()
		});
		count++;
	}
	console.log(`[vest] ${count} rows`);
}

async function main() {
	console.log(`[seed] batchId=${batchId}`);
	for (const [name, fn] of [
		["hyperliquid", collectHyperliquid],
		["binance", collectBinance],
		["lighter", collectLighter],
		["aster", collectAster],
		["edgex", collectEdgeX],
		["extended", collectExtended],
		["ostium", collectOstium],
		["qfex", collectQFEX],
		["vest", collectVest]
	] as const) {
		try {
			await fn();
		} catch (e) {
			console.error(`[${name}] failed:`, (e as Error).message);
		}
	}

	console.log(`[seed] inserting ${rows.length} rows`);
	// Chunked insert to keep payloads reasonable
	const CHUNK = 500;
	for (let i = 0; i < rows.length; i += CHUNK) {
		await db.marketEntry.createMany({ data: rows.slice(i, i + CHUNK) });
	}
	console.log("[seed] done");
	await db.$disconnect();
}

main().catch(async (e) => {
	console.error("[seed] fatal:", e);
	await db.$disconnect();
	process.exit(1);
});
