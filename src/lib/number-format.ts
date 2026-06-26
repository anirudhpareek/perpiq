const [BILLION, MILLION, THOUSAND] = [1e9, 1e6, 1e3];

const numericFmt = new Intl.NumberFormat("en-us", {
	minimumFractionDigits: 2,
	maximumFractionDigits: 2
});

export function formatNumeric(n: number) {
	return numericFmt.format(n);
}

export function truncateCurrency(n: number) {
	const abs = Math.abs(n);
	if (abs >= BILLION) return formatNumeric(n / BILLION) + "B";
	if (abs >= MILLION) return formatNumeric(n / MILLION) + "M";
	if (abs >= THOUSAND) return formatNumeric(n / THOUSAND) + "K";
	return formatNumeric(n);
}

export function getNormalizedCurrency(
	exchange: string,
	quote?: string | null,
	quotes?: Record<string, string>
) {
	if (quotes && Object.keys(quotes).includes(exchange)) {
		return quotes[exchange];
	}
	if (quote) return quote;
	return "USD";
}
