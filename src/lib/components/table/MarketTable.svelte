<script lang="ts">
	import * as Table from "$shadcn/table";
	import { marketToURL } from "$lib/utils";
	import Icon from "$components/Icon.svelte";
	import exchanges from "$config/exchanges.json";
	import type { ExchangeCfg } from "$lib/types";
	import BaseTable from "$components/table/BaseTable.svelte";
	import { MARKET_TO_ASSET, type DiffedSnapshot } from "$lib/transform";
	import Numeric from "$components/Numeric.svelte";
	import {
		assetMatchesSignalFilter,
		formatSignalValue,
		getPrimaryMarketSignal,
		signalShortLabel
	} from "$lib/intelligence";
	import { createSortState, sortRows, type Column } from "$components/table/table.svelte";

	// Setup sortable table
	type MarketKey = keyof DiffedSnapshot["markets"][0];
	const sort = createSortState<MarketKey>("volume");

	// Minimally-optimized filter
	type Filter = { assetId?: string; venue?: string; namespace?: string; category?: string };

	// Collect snapshot, custom market filters
	let { snapshot, filter }: { snapshot: DiffedSnapshot; filter?: Filter } = $props();

	// Filter over just market ID candidate set
	const marketIds = $derived.by(() => {
		let ids: string[];
		// Collect marketIDs by specific assetID (asset pages)
		if (filter?.assetId) ids = snapshot.assets[filter.assetId]?.marketIds ?? [];
		// Collect marketIDs by {venue, namespace}-filtering over full set
		else if (filter?.venue) {
			ids = snapshot.index.marketsByVenue[filter.venue] ?? [];
			ids = filter.namespace
				? ids.filter((id) => snapshot.markets[id].namespace === filter.namespace)
				: ids;
		}

		// Else, return all market IDs
		else ids = Object.keys(snapshot.markets);

		if (!filter?.category || filter.category === "all") return ids;
		if (filter.category === "new") return ids.filter((id) => snapshot.markets[id]?.isNew);
		if (filter.category === "divergences") {
			return ids.filter((id) => {
				const meta = MARKET_TO_ASSET.get(id);
				return meta ? assetMatchesSignalFilter(snapshot, meta.asset, "divergences") : false;
			});
		}
		return ids.filter((id) => MARKET_TO_ASSET.get(id)?.category === filter.category);
	});

	// Sort IDs via lookup (don't prematurely allocate `MarketRow` via `map`)
	const sortedIds = $derived(
		sortRows(
			marketIds,
			(row, key: MarketKey) => snapshot.markets[row][key] as string | number,
			sort.key,
			sort.direction
		)
	);
	const signalMap = $derived(
		new Map(Object.keys(snapshot.markets).map((id) => [id, getPrimaryMarketSignal(snapshot, id)]))
	);

	// Setup columns/headers
	const columns: Column<MarketKey>[] = [
		{ width: 10, title: "", sortKey: null },
		{ width: null, title: "Market", sortKey: null },
		{ width: 20, title: "Volume", sortKey: "volume" },
		{ width: 24, title: "24h", sortKey: "volumeChange" },
		{ width: 20, title: "OI", sortKey: "oi" },
		{ width: 24, title: "24h", sortKey: "oiChange" },
		{ width: 28, title: "Signal", sortKey: null },
		{ width: 26, title: "Price", sortKey: null },
		{ width: 24, title: "24h", sortKey: "refPxChange" }
	];
</script>

<!-- Triggers scrollable flag a tad early, but that's fine -->
<BaseTable
	{columns}
	sortKey={sort.key}
	sortDirection={sort.direction}
	onSort={sort.toggle}
	minWidth={1040}
	rowCount={sortedIds.length}
>
	<!-- Purposefully leave rank not fixed to volume for market table -->
	{#snippet row(index)}
		{@const id = sortedIds[index]}
		{@const market = snapshot.markets[id]}
		{@const { name, quote, venueQuote } = MARKET_TO_ASSET.get(id)!}
		{@const exchange = (exchanges as ExchangeCfg)[`${market.venue}:${market.namespace}`]}
		{@const signal = signalMap.get(id)}

		<Table.Row
			onclick={() =>
				window.open(marketToURL(market.venue, market.namespace, market.ticker), "_blank")}
			class="h-11 cursor-pointer border-b-gecko-shade text-sm transition-none hover:bg-gecko-black-hover [&_td]:px-0 [&_td]:text-left [&_td]:align-middle"
		>
			<!-- Rank -->
			<Table.Cell class="w-10 text-center!"><Numeric value={index + 1} /></Table.Cell>

			<!-- Market -->
			<Table.Cell>
				<span class="flex items-center">
					<!-- Venue icon -->
					<div class="flex w-7 items-center justify-center">
						<Icon src={exchange.icon} alt={exchange.name} nested />
					</div>

					<!-- Asset name -->
					<span class="ml-2 text-gecko-white">{name}</span>

					<!-- Spacer -->
					<span class="mx-1">/</span>

					<!-- Exchange human name -->
					<span class="font-mono text-gecko-gray">{exchange.name.toUpperCase()}</span>

					<!-- Spacer -->
					<span class="mx-1 hidden text-gecko-gray/50 lg:inline">/</span>

					<!-- Full market identifier -->
					<span class="hidden font-mono text-gecko-gray/50 lg:inline">{id.toUpperCase()}</span>
				</span>
			</Table.Cell>

			<!-- Volume -->
			<Table.Cell class="w-20">
				<Numeric value={market.volume} format="currency" currency="USD" class="text-gecko-white" />
			</Table.Cell>

			<!-- Volume change -->
			<Table.Cell class="w-24">
				<Numeric value={market.volumeChange * 100} format="numeric" change percentage />
			</Table.Cell>

			<!-- OI -->
			<Table.Cell class="w-20">
				<Numeric value={market.oi} format="currency" currency="USD" class="text-gecko-white" />
			</Table.Cell>

			<!-- OI change -->
			<Table.Cell class="w-24">
				<Numeric value={market.oiChange * 100} format="numeric" change percentage />
			</Table.Cell>

			<!-- Signal -->
			<Table.Cell class="w-28">
				{#if signal}
					<span
						class="inline-flex max-w-27 items-center gap-1 rounded-sm border border-gecko-shade/80 bg-gecko-shade/35 px-1.5 py-0.5 font-mono text-[10px] tracking-wide text-gecko-gray/90 uppercase"
						title={signal.label}
					>
						<span class="truncate">{signalShortLabel(signal.kind)}</span>
						{#if formatSignalValue(signal)}
							<span class="shrink-0 text-gecko-white/75">{formatSignalValue(signal)}</span>
						{/if}
					</span>
				{:else}
					<span class="font-mono text-[11px] text-gecko-gray/55">—</span>
				{/if}
			</Table.Cell>

			<!-- Ref price -->
			<Table.Cell class="w-26">
				<Numeric
					value={market.refPx}
					format="numeric"
					currency={venueQuote ? venueQuote : quote ? quote : "USD"}
					class="text-gecko-white"
				/>
			</Table.Cell>

			<!-- Mid price change -->
			<Table.Cell class="w-20">
				<Numeric value={market.refPxChange * 100} format="numeric" change percentage />
			</Table.Cell>
		</Table.Row>
	{/snippet}
</BaseTable>
