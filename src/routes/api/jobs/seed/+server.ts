// Inline collector that runs all venue fetches in a single serverless invoke.
// Used as a fallback when the Vercel Workflow runtime isn't available
// (Hobby tier, missing config, etc.). The original `collect` endpoint still
// uses the workflow path for production fanout.

import { randomUUID } from "crypto";
import { Decimal } from "decimal.js";
import type { Config } from "@sveltejs/adapter-vercel";
import { json, error, type RequestHandler } from "@sveltejs/kit";
import { CRON_SECRET } from "$env/static/private";
import { strTimingSafeEqual } from "$lib/utils.server";
import db from "$lib/db";

// Pin to London region — same trick the existing /api/proxy route uses so
// Binance fapi (US geoblocked) and Ostium's metadata backend (Comodo CA)
// can be reached directly without going back through /api/proxy.
export const config: Config = {
	regions: ["lhr1"],
	maxDuration: 60
};

const UA =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

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

async function safeJson<T>(url: string, init?: RequestInit): Promise<T | null> {
	try {
		const r = await fetch(url, { ...init, headers: { "User-Agent": UA, ...(init?.headers ?? {}) } });
		if (!r.ok) return null;
		return (await r.json()) as T;
	} catch {
		return null;
	}
}

async function collectHyperliquid(batchId: string, rows: Row[]) {
	const url = "https://api.hyperliquid.xyz/info";
	const meta = await safeJson<{ universe: { name: string }[] }[]>(url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ type: "allPerpMetas" })
	});
	if (!meta) return 0;
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
			safeJson<
				[
					{ universe: { name: string; maxLeverage: number }[] },
					{ openInterest: string; dayNtlVlm: string; midPx: string | null }[]
				]
			>(url, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ type: "metaAndAssetCtxs", dex })
			})
		)
	);
	let count = 0;
	for (const ctx of ctxs) {
		if (!ctx) continue;
		const [{ universe }, metrics] = ctx;
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
	return count;
}

async function collectBinanceLike(
	batchId: string,
	venue: string,
	apiBase: string,
	subTypes: ReadonlySet<string>,
	rows: Row[]
) {
	const info = await safeJson<{
		symbols: {
			symbol: string;
			status: string;
			requiredMarginPercent: string;
			underlyingSubType: string[];
		}[];
	}>(`${apiBase}/exchangeInfo`);
	if (!info) return 0;
	const filtered = info.symbols.filter(
		(s) => s.status === "TRADING" && s.underlyingSubType?.some((t) => subTypes.has(t))
	);
	const hist = await safeJson<{ symbol: string; lastPrice: string; quoteVolume: string }[]>(
		`${apiBase}/ticker/24hr`
	);
	const histMap = new Map(
		(hist ?? []).map((h) => [h.symbol, { px: Number(h.lastPrice), vol: Number(h.quoteVolume) }])
	);
	const oiResults = await Promise.all(
		filtered.map((s) =>
			safeJson<{ symbol: string; openInterest: string }>(
				`${apiBase}/openInterest?symbol=${s.symbol}`
			)
		)
	);
	const oiMap = new Map(
		oiResults
			.filter((r): r is { symbol: string; openInterest: string } => !!r)
			.map((r) => [r.symbol, r.openInterest])
	);
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
	return count;
}

async function collectLighter(batchId: string, rows: Row[]) {
	const base = "https://mainnet.zklighter.elliot.ai/api/v1";
	const stats = await safeJson<{
		order_book_stats: {
			symbol: string;
			last_trade_price: number;
			daily_quote_token_volume: number;
		}[];
	}>(`${base}/exchangeStats`);
	const obd = await safeJson<{
		order_book_details: {
			symbol: string;
			open_interest: number;
			min_initial_margin_fraction: string;
		}[];
	}>(`${base}/orderBookDetails`);
	if (!stats || !obd) return 0;
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
	return count;
}

async function collectExtended(batchId: string, rows: Row[]) {
	const r = await safeJson<{
		data: {
			uiName: string;
			category: string;
			active: boolean;
			marketStats: { dailyVolume: string; lastPrice: string; openInterest: string };
			tradingConfig: { maxLeverage: string };
		}[];
	}>("https://api.starknet.extended.exchange/api/v1/info/markets");
	if (!r) return 0;
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
	return count;
}

async function collectOstium(batchId: string, rows: Row[]) {
	const pairs = await safeJson<
		{
			id: string;
			from: string;
			to: string;
			feed: string;
			longOI: string;
			shortOI: string;
			group: { maxLeverage: string };
			lastTradePrice: string;
		}[]
	>("https://app.ostium.com/api/pairs");
	if (!pairs) return 0;
	const meta = "https://metadata-backend.ostium.io";
	const vol = await safeJson<{ data: { pair_id: string; last_24h_volume: number }[] }>(
		`${meta}/volume/all`
	);
	const px = await safeJson<{ feed_id: string; mid: number }[]>(
		`${meta}/PricePublish/latest-prices`
	);
	const volMap = new Map((vol?.data ?? []).map((v) => [v.pair_id, v.last_24h_volume]));
	const pxMap = new Map((px ?? []).map((p) => [p.feed_id, p.mid]));
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
	return count;
}

async function collectVest(batchId: string, rows: Row[]) {
	const base = "https://server-prod.hz.vestmarkets.com/v2";
	const info = await safeJson<{
		symbols: { symbol: string; initMarginRatio: string; tradingStatus: string }[];
	}>(`${base}/exchangeInfo`);
	if (!info) return 0;
	const trading = info.symbols.filter((s) => s.tradingStatus === "TRADING");
	const hist = await safeJson<{ tickers: { symbol: string; quoteVolume: string }[] }>(
		`${base}/ticker/24hr`
	);
	const latest = await safeJson<{ tickers: { symbol: string; markPrice: string }[] }>(
		`${base}/ticker/latest`
	);
	const oi = await safeJson<{ ois: { symbol: string; longOi: string; shortOi: string }[] }>(
		`${base}/oi`
	);
	const v = new Map((hist?.tickers ?? []).map((t) => [t.symbol, Number(t.quoteVolume)]));
	const p = new Map((latest?.tickers ?? []).map((t) => [t.symbol, Number(t.markPrice)]));
	const o = new Map((oi?.ois ?? []).map((x) => [x.symbol, { long: x.longOi, short: x.shortOi }]));
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
	return count;
}

async function collectEdgeX(batchId: string, rows: Row[]) {
	const base = "https://pro.edgex.exchange/api/v1/public";
	const meta = await safeJson<{
		data: {
			contractList: {
				contractId: string;
				contractName: string;
				riskTierList: { maxLeverage: string }[];
			}[];
		};
	}>(`${base}/meta/getMetaData`);
	if (!meta) return 0;
	const ids = meta.data.contractList.map((c) => ({
		id: c.contractId,
		name: c.contractName,
		lev: Number(c.riskTierList?.[0]?.maxLeverage ?? 0)
	}));
	const tickers = await Promise.all(
		ids.map((c) =>
			safeJson<{
				data: { contractName: string; value: string; lastPrice: string; openInterest: string }[];
			}>(`${base}/quote/getTicker?period=LAST_DAY_1&contractId=${c.id}`)
		)
	);
	let count = 0;
	tickers.forEach((resp, i) => {
		const m = resp?.data?.[0];
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
	return count;
}

export const GET: RequestHandler = async ({ request }) => {
	const authHeader = request.headers.get("Authorization") ?? "";
	if (!strTimingSafeEqual(authHeader, `Bearer ${CRON_SECRET}`)) {
		throw error(401, "Missing `Authorization` header");
	}

	const batchId = randomUUID();
	const rows: Row[] = [];
	const summary: Record<string, number> = {};

	const tasks = [
		["hyperliquid", () => collectHyperliquid(batchId, rows)],
		[
			"binance",
			() =>
				collectBinanceLike(
					batchId,
					"binance",
					"https://fapi.binance.com/fapi/v1",
					new Set(["TradFi"]),
					rows
				)
		],
		["lighter", () => collectLighter(batchId, rows)],
		[
			"aster",
			() =>
				collectBinanceLike(
					batchId,
					"aster",
					"https://fapi.asterdex.com/fapi/v1",
					new Set(["STOCK", "RWA", "Metals", "Commodities", "ETF"]),
					rows
				)
		],
		["edgex", () => collectEdgeX(batchId, rows)],
		["extended", () => collectExtended(batchId, rows)],
		["ostium", () => collectOstium(batchId, rows)],
		["vest", () => collectVest(batchId, rows)]
	] as const;

	for (const [name, fn] of tasks) {
		try {
			summary[name] = await fn();
		} catch (e) {
			summary[name] = -1;
			console.error(`[seed] ${name} failed:`, (e as Error).message);
		}
	}

	if (rows.length === 0) {
		return json({ ok: false, summary, inserted: 0, batchId });
	}

	const CHUNK = 500;
	let inserted = 0;
	for (let i = 0; i < rows.length; i += CHUNK) {
		const r = await db.marketEntry.createMany({ data: rows.slice(i, i + CHUNK) });
		inserted += r.count;
	}

	return json({ ok: true, summary, inserted, batchId });
};
