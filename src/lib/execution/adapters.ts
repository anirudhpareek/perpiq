import type {
	ExecutionQuote,
	ExecutionQuoteRequest,
	ExecutionSubmissionResult,
	ExecutionVenueAdapter,
	ExecutionWallet,
	PreparedExecutionOrder
} from "./types";

function normalizeSizeUsd(sizeUsd: number): number {
	return Number.isFinite(sizeUsd) && sizeUsd > 0 ? sizeUsd : 0;
}

function buildQuote(
	request: ExecutionQuoteRequest,
	native: boolean,
	reason?: string
): ExecutionQuote {
	const sizeUsd = normalizeSizeUsd(request.sizeUsd);
	const refPx = request.market.refPx > 0 ? request.market.refPx : 0;
	return {
		marketKey: request.marketKey,
		venue: request.market.venue,
		namespace: request.market.namespace,
		ticker: request.market.ticker,
		side: request.side,
		sizeUsd,
		refPx,
		estimatedSize: refPx > 0 ? sizeUsd / refPx : 0,
		estimatedNotional: sizeUsd,
		maxLeverage: request.market.maxLeverage,
		collateral: request.market.collateral,
		native,
		reason
	};
}

function prepareOrder(quote: ExecutionQuote): PreparedExecutionOrder {
	return {
		quote,
		orderType: "market",
		reduceOnly: false
	};
}

function trimNumericString(value: string): string {
	return value.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

function formatSize(value: number, decimals: number): string {
	const scale = 10 ** decimals;
	const rounded = Math.floor(value * scale) / scale;
	return trimNumericString(rounded.toFixed(decimals));
}

function formatPrice(value: number): string {
	const decimals = value >= 1000 ? 2 : value >= 1 ? 4 : 6;
	return trimNumericString(value.toFixed(decimals));
}

function createJsonRpcWallet(wallet: ExecutionWallet) {
	if (!wallet.provider) {
		throw new Error("Missing wallet provider for typed-data signing.");
	}

	return {
		address: wallet.address as `0x${string}`,
		signTypedData: async (params: unknown) =>
			(await wallet.provider!.request({
				method: "eth_signTypedData_v4",
				params: [wallet.address, JSON.stringify(params)]
			})) as `0x${string}`,
		getAddresses: async () => [wallet.address as `0x${string}`],
		getChainId: async () => {
			const chainId = (await wallet.provider!.request({ method: "eth_chainId" })) as string;
			return Number.parseInt(chainId, 16);
		}
	};
}

function summarizeOrderResponse(response: unknown): ExecutionSubmissionResult {
	const firstStatus = (
		response as {
			response?: {
				data?: {
					statuses?: unknown[];
				};
			};
		}
	).response?.data?.statuses?.[0];

	if (typeof firstStatus === "object" && firstStatus) {
		if ("error" in firstStatus) {
			return {
				status: "rejected",
				message: String(firstStatus.error),
				raw: response
			};
		}
		if ("filled" in firstStatus) {
			const filled = firstStatus.filled as { oid?: number; totalSz?: string; avgPx?: string };
			return {
				status: "submitted",
				orderId: filled.oid?.toString(),
				message: `Filled ${filled.totalSz ?? "order"} at ${filled.avgPx ?? "market"}.`,
				raw: response
			};
		}
		if ("resting" in firstStatus) {
			const resting = firstStatus.resting as { oid?: number };
			return {
				status: "submitted",
				orderId: resting.oid?.toString(),
				message: "Order submitted and resting on Hyperliquid.",
				raw: response
			};
		}
	}

	return {
		status: "submitted",
		message: "Order submitted to Hyperliquid.",
		raw: response
	};
}

export const hyperliquidAdapter: ExecutionVenueAdapter = {
	id: "hyperliquid",
	label: "Hyperliquid",
	supports: (market) => market.venue === "hyperliquid" && market.supportsNativeExecution,
	getQuote: (request) => buildQuote(request, true),
	prepareOrder,
	submitOrder: async (order, wallet) => {
		try {
			const [{ ExchangeClient, HttpTransport }, { SymbolConverter }] = await Promise.all([
				import("@nktkas/hyperliquid"),
				import("@nktkas/hyperliquid/utils")
			]);

			const transport = new HttpTransport();
			const converter = await SymbolConverter.create({
				transport,
				dexs: order.quote.namespace ? [order.quote.namespace] : false
			});
			const symbol = order.quote.namespace
				? `${order.quote.namespace}:${order.quote.ticker}`
				: order.quote.ticker;
			const assetId = converter.getAssetId(symbol);
			const sizeDecimals = converter.getSzDecimals(symbol);

			if (assetId === undefined || sizeDecimals === undefined) {
				return {
					status: "rejected",
					message: `Hyperliquid could not resolve ${symbol} for execution. Open the venue directly.`
				};
			}

			const size = formatSize(order.quote.estimatedSize, sizeDecimals);
			if (!Number(size)) {
				return {
					status: "rejected",
					message: "Order size is below the venue precision for this market."
				};
			}

			const aggressivePrice =
				order.quote.side === "buy" ? order.quote.refPx * 1.01 : order.quote.refPx * 0.99;
			const client = new ExchangeClient({
				transport,
				wallet: createJsonRpcWallet(wallet)
			});
			const response = await client.order({
				orders: [
					{
						a: assetId,
						b: order.quote.side === "buy",
						p: formatPrice(aggressivePrice),
						s: size,
						r: order.reduceOnly,
						t: { limit: { tif: "FrontendMarket" } }
					}
				],
				grouping: "na"
			});

			return summarizeOrderResponse(response);
		} catch (error) {
			return {
				status: "rejected",
				message: error instanceof Error ? error.message : "Hyperliquid order submission failed.",
				raw: error
			};
		}
	}
};

export const externalVenueAdapter: ExecutionVenueAdapter = {
	id: "external",
	label: "External venue",
	supports: () => true,
	getQuote: (request) =>
		buildQuote(
			request,
			false,
			"This venue is available as an external open, not native execution."
		),
	prepareOrder,
	submitOrder: async () => ({
		status: "rejected",
		message: "This venue does not have a native Perpiq execution adapter yet."
	})
};

export function getExecutionAdapter(
	market: ExecutionQuoteRequest["market"]
): ExecutionVenueAdapter {
	return hyperliquidAdapter.supports(market) ? hyperliquidAdapter : externalVenueAdapter;
}
