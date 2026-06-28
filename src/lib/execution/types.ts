export type ExecutionKind = "perp" | "spot" | "bridge" | "external";
export type ExecutionChain =
	| "hyperliquid"
	| "arbitrum"
	| "ethereum"
	| "starknet"
	| "bnb"
	| "solana"
	| "unknown";
export type ExecutionSide = "buy" | "sell";
export type ExecutionOrderType = "market";

export type ExecutionMarketMetadata = {
	executionKind: ExecutionKind;
	chain: ExecutionChain;
	collateral: string;
	supportsNativeExecution: boolean;
	supportsExternalOpen: boolean;
};

export type ExecutionMarket = ExecutionMarketMetadata & {
	venue: string;
	namespace: string;
	ticker: string;
	refPx: number;
	volume: number;
	oi: number;
	maxLeverage: number | null;
};

export type ExecutionQuoteRequest = {
	marketKey: string;
	market: ExecutionMarket;
	side: ExecutionSide;
	sizeUsd: number;
};

export type ExecutionQuote = {
	marketKey: string;
	venue: string;
	namespace: string;
	ticker: string;
	side: ExecutionSide;
	sizeUsd: number;
	refPx: number;
	estimatedSize: number;
	estimatedNotional: number;
	maxLeverage: number | null;
	collateral: string;
	native: boolean;
	reason?: string;
};

export type PreparedExecutionOrder = {
	quote: ExecutionQuote;
	orderType: ExecutionOrderType;
	reduceOnly: boolean;
};

export type ExecutionSubmissionResult = {
	status: "submitted" | "rejected";
	orderId?: string;
	message: string;
	raw?: unknown;
};

export type ExecutionWalletProvider = {
	request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};

export type ExecutionWallet = {
	address: string;
	provider?: ExecutionWalletProvider;
};

export interface ExecutionVenueAdapter {
	id: string;
	label: string;
	supports(market: ExecutionMarket): boolean;
	getQuote(request: ExecutionQuoteRequest): ExecutionQuote;
	prepareOrder(quote: ExecutionQuote): PreparedExecutionOrder;
	submitOrder(
		order: PreparedExecutionOrder,
		wallet: ExecutionWallet
	): Promise<ExecutionSubmissionResult>;
	getOrderStatus?(orderId: string): Promise<ExecutionSubmissionResult>;
	getAccountState?(wallet: ExecutionWallet): Promise<unknown>;
}
