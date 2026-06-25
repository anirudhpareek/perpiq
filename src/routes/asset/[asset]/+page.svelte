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
	import RelatedAssets from "$components/RelatedAssets.svelte";
	import AssetPriceChart from "$components/AssetPriceChart.svelte";
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
	const title = $derived(`prepiq | ${meta.name}`);
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

<!-- Breadcrumb -->
<div class="border-b border-b-gecko-shade">
	<div
		class="mx-auto flex max-w-7xl items-center gap-1.5 px-4 py-3 text-xs text-gecko-gray/70 lg:px-8"
	>
		<a href="/" class="hover:text-gecko-white">Markets</a>
		<span class="text-gecko-gray/40">/</span>
		<a href="/?category={asset?.category ?? 'stocks'}" class="capitalize hover:text-gecko-white">
			{asset?.category ?? "Asset"}
		</a>
		<span class="text-gecko-gray/40">/</span>
		<span class="font-mono text-gecko-white uppercase">{data.asset}</span>
	</div>
</div>

<!-- Asset hero (uniswap-style: identity row, then big price, then range pills) -->
<div class="border-b border-b-gecko-shade">
	<div class="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6 lg:px-8 lg:py-8">
		<!-- Identity row -->
		<div class="flex flex-row items-center gap-3">
			<Icon
				src={meta.icon}
				alt={meta.name}
				class="{meta.icon.length > 1 ? 'size-10 md:size-12' : ''} [&_img]:size-7 md:[&_img]:size-9"
			/>
			<div class="flex flex-1 flex-col">
				<div class="flex items-center gap-2">
					<h1 class="text-xl font-semibold text-gecko-white md:text-2xl">{meta.name}</h1>
					<span class="font-mono text-xs text-gecko-gray/80">{data.asset.toUpperCase()}</span>
				</div>
			</div>
		</div>

		{#if hasData && asset}
			<!-- Hero price + 24h change -->
			<div class="flex flex-col gap-1">
				<Numeric
					value={asset.medianRefPx}
					format="numeric"
					currency={meta.quote ?? "USD"}
					class="text-4xl font-medium tracking-tight text-gecko-white md:text-5xl"
				/>
				<div class="flex items-baseline gap-2 text-sm">
					<Numeric value={asset.medianRefPxChange * 100} format="numeric" change percentage />
					<span class="text-xs text-gecko-gray/60">past 24 hours</span>
				</div>
			</div>

			<!-- Real price/volume chart with functional range + mode controls -->
			<AssetPriceChart data={data.series?.[data.asset] ?? null} currency={meta.quote ?? "USD"} />
		{/if}

		{#if meta.description}
			<p class="max-w-3xl text-xs text-gecko-gray/75 md:text-sm">{meta.description}</p>
		{/if}
	</div>
</div>

<!-- Stats grid (uniswap-style compact row) -->
{#if hasData && asset}
	{@const venueCount = new Set(asset.marketIds.map((id) => snapshot.markets[id].venue)).size}
	<div class="border-b border-b-gecko-shade">
		<div
			class="mx-auto grid max-w-7xl grid-cols-2 gap-x-6 gap-y-4 px-4 py-5 sm:grid-cols-3 lg:grid-cols-5 lg:px-8"
		>
			<div class="flex flex-col gap-0.5">
				<span class="text-[10px] font-medium tracking-wide text-gecko-gray/70 uppercase">
					Volume 24h
				</span>
				<Numeric
					value={asset.volume}
					format="currency"
					currency="USD"
					class="text-sm font-medium text-gecko-white"
				/>
				<Numeric value={asset.volumeChange * 100} format="numeric" change percentage />
			</div>
			<div class="flex flex-col gap-0.5">
				<span class="text-[10px] font-medium tracking-wide text-gecko-gray/70 uppercase">
					Open Interest
				</span>
				<Numeric
					value={asset.oi}
					format="currency"
					currency="USD"
					class="text-sm font-medium text-gecko-white"
				/>
				<Numeric value={asset.oiChange * 100} format="numeric" change percentage />
			</div>
			<div class="flex flex-col gap-0.5">
				<span class="text-[10px] font-medium tracking-wide text-gecko-gray/70 uppercase">
					Median price
				</span>
				<Numeric
					value={asset.medianRefPx}
					format="numeric"
					currency={meta.quote ?? "USD"}
					class="text-sm font-medium text-gecko-white"
				/>
				<Numeric value={asset.medianRefPxChange * 100} format="numeric" change percentage />
			</div>
			<div class="flex flex-col gap-0.5">
				<span class="text-[10px] font-medium tracking-wide text-gecko-gray/70 uppercase">
					Markets
				</span>
				<span class="text-sm font-medium text-gecko-white">{asset.marketIds.length}</span>
				<span class="text-[10px] text-gecko-gray/60">across all venues</span>
			</div>
			<div class="flex flex-col gap-0.5">
				<span class="text-[10px] font-medium tracking-wide text-gecko-gray/70 uppercase">
					Venues
				</span>
				<span class="text-sm font-medium text-gecko-white">{venueCount}</span>
				<span class="text-[10px] text-gecko-gray/60">unique exchanges</span>
			</div>
		</div>
	</div>
{/if}

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
	<!-- Market context panel -->
	<AssetIntelligence {snapshot} assetId={data.asset} />

	<!-- Underlying equity context (stocks only) -->
	<UnderlyingEquity {snapshot} assetId={data.asset} category={asset.category} />

	<!-- Market table -->
	<div class="flex flex-1 flex-col md:border-t md:border-t-gecko-shade">
		<MarketTable filter={{ assetId: data.asset }} {snapshot} />
	</div>

	<!-- Related assets in same class -->
	<RelatedAssets
		{snapshot}
		assetId={data.asset}
		category={asset.category}
		sparklines={data.sparklines ?? {}}
	/>
{/if}
