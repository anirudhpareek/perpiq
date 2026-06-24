import tickers from "../src/config/tickers.json";

const expected: string[] = [];
for (const group of Object.values(
	tickers.perps as Record<string, Record<string, { ref: string[] }>>
)) {
	for (const def of Object.values(group)) {
		for (const ref of def.ref) if (ref.startsWith("aster:")) expected.push(ref);
	}
}

const info = (await fetch("https://fapi.asterdex.com/fapi/v1/exchangeInfo").then((r) =>
	r.json()
)) as { symbols: { symbol: string; status: string; underlyingSubType: string[] }[] };

const apiBySymbol = new Map(info.symbols.map((s) => [s.symbol, s]));
const missing = expected.filter((ref) => !apiBySymbol.has(ref.split(":")[1]));
console.log("aster missing in API:", missing);
for (const ref of expected) {
	const sym = ref.split(":")[1];
	const s = apiBySymbol.get(sym);
	console.log(ref, "→", s ? `${s.status} ${s.underlyingSubType?.join(",")}` : "NOT FOUND");
}
