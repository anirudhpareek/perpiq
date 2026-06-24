<script lang="ts">
	import { page } from "$app/state";
	import type { PageProps } from "./$types";
	import Meta from "$components/Meta.svelte";
	import Grid from "$components/Grid.svelte";
	import tickers from "$config/tickers.json";
	import Icon from "$components/Icon.svelte";
	import metaConfig from "$config/meta.json";
	import Numeric from "$components/Numeric.svelte";
	import type { Meta as MetaT, TickerCfg } from "$lib/types";
	import MarketTable from "$components/table/MarketTable.svelte";
	import AssetIntelligence from "$components/intelligence/AssetIntelligence.svelte";
	import UnderlyingEquity from "$components/intelligence/UnderlyingEquity.svelte";
	import type { WithContext, FinancialProduct } from "schema-dts";

	let { data }: PageProps = $props();
	const { snapshot } = $derived(data);

	// Asset data. Some configured assets (e.g. assets that only ever existed on
	// currently-delisted hyperliquid HIP-3 DEXes) have no rows in the latest
	// batch — render a graceful "no data" state instead of crashing.
	const asset = $derived(snapshot.assets[data.asset]);
	const hasData = $derived(asset !== undefined);
	const tickerMeta = $derived(
		(tickers.perps as TickerCfg)[asset?.category ?? Object.keys(tickers.perps)[0]]?.[data.asset]
	);
	const meta: MetaT = $derived(tickerMeta?.meta ?? findMeta(data.asset));

	function findMeta(id: string): MetaT {
		for (const cat of Object.values(tickers.perps as TickerCfg)) {
			if (cat[id]) return cat[id].meta;
		}
		return {
			name: id.toUpperCase(),
			description: "",
			icon: ["/assets/icons/exchanges/hyperliquid.svg"]
		};
	}

	// Structured schema
	// @dev: Doesn't have to be derived given pageload properties but added
	// 			 for page change posterity
	const title = $derived(`StockGecko | ${meta.name}`);
	const schema: WithContext<FinancialProduct> = $derived({
		"@context": "https://schema.org",
		"@type": "FinancialProduct",
		name: title,
		url: metaConfig.url + page.url.pathname,
		category: asset?.category ?? "stocks",
		offers: {
			"@type": "AggregateOffer",
			priceCurrency: meta.quote,
			price: (asset?.medianRefPx ?? 0).toString(),
			offerCount: asset?.marketIds.length ?? 0
		},
		isRelatedTo: {
			"@type": "FinancialProduct",
			name: meta.name
		},
		provider: {
			"@type": "Organization",
			name: metaConfig.title,
			url: metaConfig.url,
			logo: metaConfig.favicon
		}
	});
</script>

<Meta {title} {schema} />

<!-- Asset header (uniswap-inspired: identity, then large price + stats inline) -->
<div>
	<Grid bottom={false}>
		<div class="flex flex-1 flex-col gap-6 px-4 py-6 md:flex-row md:items-start md:gap-10">
			<!-- Left: identity + description -->
			<div class="flex flex-1 flex-col">
				<div class="flex flex-row items-center gap-3">
					<Icon
						src={meta.icon}
						alt={meta.name}
						class="{meta.icon.length > 1
							? 'size-9.5 md:size-12'
							: ''} [&_img]:size-7 md:[&_img]:size-8"
					/>
					<div class="flex flex-col">
						<h1 class="text-xl text-gecko-white md:text-2xl">{meta.name}</h1>
						<span class="font-mono text-[10px] uppercase tracking-wide text-gecko-gray/70">
							{data.asset}{asset?.category ? ` · ${asset.category}` : ""}
						</span>
					</div>
				</div>
				<p class="mt-4 max-w-2xl text-xs text-gecko-gray/75 md:text-sm">{meta.description}</p>
			</div>

			{#if hasData && asset}
				<!-- Right: hero price + tiny stats grid -->
				<div class="flex flex-col items-start md:min-w-[280px] md:items-end">
					<div class="flex items-baseline gap-2">
						<Numeric
							value={asset.medianRefPx}
							format="numeric"
							currency={meta.quote ?? "USD"}
							class="text-3xl text-gecko-white md:text-4xl"
						/>
					</div>
					<div class="mt-1 flex items-baseline gap-2">
						<Numeric value={asset.medianRefPxChange * 100} format="numeric" change percentage />
						<span class="text-xs text-gecko-gray/60">24h</span>
					</div>

					<div class="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
						<div class="flex flex-col md:items-end">
							<span class="text-[10px] uppercase tracking-wide text-gecko-gray/60">Vol 24h</span>
							<Numeric
								value={asset.volume}
								format="currency"
								currency="USD"
								class="text-gecko-white"
							/>
						</div>
						<div class="flex flex-col md:items-end">
							<span class="text-[10px] uppercase tracking-wide text-gecko-gray/60">OI</span>
							<Numeric
								value={asset.oi}
								format="currency"
								currency="USD"
								class="text-gecko-white"
							/>
						</div>
					</div>
				</div>
			{/if}
		</div>
	</Grid>
</div>

{#if !hasData}
	<div>
		<Grid>
			<div class="flex flex-1 flex-col px-4 py-8">
				<p class="text-sm text-gecko-gray/75">
					No live market data for this asset in the latest snapshot. It may have been delisted on
					all tracked venues.
				</p>
			</div>
		</Grid>
	</div>
{/if}

{#if hasData && asset}
<!-- Intelligence panel -->
<AssetIntelligence {snapshot} assetId={data.asset} />

<!-- Underlying equity context (stocks only) -->
<UnderlyingEquity {snapshot} assetId={data.asset} category={asset.category} />

<!-- Market table -->
<div class="flex flex-1 flex-col md:border-t md:border-t-gecko-shade">
	<MarketTable filter={{ assetId: data.asset }} {snapshot} />
</div>
{/if}
