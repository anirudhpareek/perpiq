<script lang="ts">
	import * as Table from "$shadcn/table";
	import tickers from "$config/tickers.json";
	import Icon from "$components/Icon.svelte";
	import exchanges from "$config/exchanges.json";
	import Numeric from "$components/Numeric.svelte";
	import Sparkline from "$components/Sparkline.svelte";
	import type { DiffedSnapshot } from "$lib/transform";
	import IconScroll from "$components/IconScroll.svelte";
	import type { ExchangeCfg, TickerCfg } from "$lib/types";
	import BaseTable from "$components/table/BaseTable.svelte";
	import { goto, preloadCode, preloadData } from "$app/navigation";
	import {
		assetMatchesSignalFilter,
		formatSignalValue,
		getPrimaryAssetSignal,
		signalShortLabel
	} from "$lib/intelligence";
	import { createSortState, sortRows, type Column } from "$components/table/table.svelte";

	let {
		snapshot,
		category = "all",
		sparklines = {}
	}: {
		snapshot: DiffedSnapshot;
		category?: string;
		sparklines?: Record<string, number[]>;
	} = $props();

	// Setup sortable table
	type AssetKey = keyof DiffedSnapshot["assets"][0];
	const sort = createSortState<AssetKey>("volume");

	// Filter by category before sorting
	const filtered = $derived(
		snapshot.index.assetsByVolume.filter((r) => {
			if (category === "all") return true;
			if (category === "new" || category === "divergences") {
				return assetMatchesSignalFilter(snapshot, r.asset, category);
			}
			return snapshot.assets[r.asset]?.category === category;
		})
	);

	// Sorted rows
	const rows = $derived(
		sortRows(
			[...filtered],
			(row, key: AssetKey) => snapshot.assets[row.asset][key!] as string | number,
			sort.key,
			sort.direction
		)
	);

	// O(n) volume rank lookup
	const rankMap = $derived(new Map(snapshot.index.assetsByVolume.map((r, i) => [r.asset, i])));
	const signalMap = $derived(
		new Map(Object.keys(snapshot.assets).map((id) => [id, getPrimaryAssetSignal(snapshot, id)]))
	);

	// Approximate 1H change from the sparkline tail. Series is `SPARKLINE_BATCHES`
	// (~12) points over ~3 hours (cron is 15 min); the last ~4 points cover ~1h.
	// Returns null if we don't have at least two finite samples in that window.
	function computeHourChange(series: number[] | undefined): number | null {
		if (!series || series.length < 2) return null;
		const tail = series.slice(Math.max(0, series.length - 4));
		const finite = tail.filter((v) => Number.isFinite(v));
		if (finite.length < 2) return null;
		const first = finite[0];
		const last = finite[finite.length - 1];
		if (first === 0) return null;
		return (last - first) / first;
	}

	// Setup columns/headers
	const columns: Column<AssetKey>[] = [
		{ width: 10, title: "", sortKey: null },
		{ width: 6, title: "", sortKey: null },
		{ width: null, title: "Asset", sortKey: null },
		{ width: 26, title: "Price", sortKey: null },
		{ width: 16, title: "1H", sortKey: null },
		{ width: 20, title: "24h", sortKey: "medianRefPxChange" },
		{ width: 22, title: "Volume", sortKey: "volume" },
		{ width: 22, title: "OI", sortKey: "oi" },
		{ width: 28, title: "Signal", sortKey: null },
		{ width: 28, title: "Class", sortKey: "category" },
		{ width: 22, title: "Chart", sortKey: null },
		{ width: 25, title: "Venues", sortKey: null },
		{ width: 3, title: "", sortKey: null }
	];
</script>

<BaseTable
	{columns}
	sortKey={sort.key}
	sortDirection={sort.direction}
	onSort={sort.toggle}
	minWidth={1220}
	rowCount={rows.length}
>
	{#snippet row(index)}
		<!-- Collect asset data + metadata -->
		{@const { asset: assetId, previousIndex } = rows[index]}
		{@const asset = snapshot.assets[assetId]}
		{@const { name, icon, quote } = (tickers.perps as TickerCfg)[asset.category][assetId].meta}
		{@const volumeRank = rankMap.get(assetId)!}
		{@const rankDelta = previousIndex != null ? previousIndex - volumeRank : 0}
		{@const signal = signalMap.get(assetId)}

		<Table.Row
			onmouseenter={() => {
				// Warm page w/o relying on `data-sveltekit-preload-data="hover"` via a-href
				preloadCode(`/asset/${assetId}`);
				preloadData(`/asset/${assetId}`);
			}}
			onclick={() => goto(`/asset/${assetId}`)}
			class="h-10 cursor-pointer border-b-gecko-shade text-xs transition-none hover:bg-gecko-black-hover [&_td]:px-0 [&_td]:text-left [&_td]:align-middle"
		>
			<!-- Ranking change -->
			<Table.Cell class="w-10 text-center!"><Numeric value={rankDelta} change /></Table.Cell>

			<!-- Current ranking -->
			<Table.Cell class="w-6">
				{@const rank = volumeRank + 1}

				{#if rank <= 3}
					<img
						src={`/assets/icons/medals/medal-${rank}.svg`}
						alt={`#${rank} place medal`}
						height="16px"
						width="16px"
						class="-translate-x-1"
					/>
				{:else}
					<Numeric value={rank} />
				{/if}
			</Table.Cell>

			<!-- Asset -->
			<Table.Cell class="py-0 pr-0">
				<span class="flex items-center">
					<div class="flex w-7 items-center justify-center">
						<Icon src={icon} alt={name} />
					</div>
					<span class="ml-2 font-medium text-gecko-white">{name}</span>
					<span class="ml-1 font-mono text-[11px] text-gecko-gray/70">{assetId.toUpperCase()}</span>
				</span>
			</Table.Cell>

			<!-- Ref price -->
			<Table.Cell class="w-26">
				<Numeric
					value={asset.medianRefPx}
					format="numeric"
					currency={quote ?? "USD"}
					class="font-medium text-gecko-white"
				/>
			</Table.Cell>

			<!-- 1H change -->
			{@const sp = sparklines[assetId]}
			{@const hourChange = computeHourChange(sp)}
			<Table.Cell class="w-16">
				{#if hourChange === null}
					<span class="font-mono text-[10px] text-gecko-gray/30">—</span>
				{:else}
					<Numeric value={hourChange * 100} format="numeric" change percentage />
				{/if}
			</Table.Cell>

			<!-- 24h price change -->
			<Table.Cell class="w-20">
				<Numeric value={asset.medianRefPxChange * 100} format="numeric" change percentage />
			</Table.Cell>

			<!-- Volume -->
			<Table.Cell class="w-22">
				<Numeric value={asset.volume} format="currency" currency="USD" class="text-gecko-white" />
				<Numeric
					value={asset.volumeChange * 100}
					format="numeric"
					change
					percentage
					class="ml-1 text-[10px]"
				/>
			</Table.Cell>

			<!-- OI -->
			<Table.Cell class="w-22">
				<Numeric value={asset.oi} format="currency" currency="USD" class="text-gecko-white" />
				<Numeric
					value={asset.oiChange * 100}
					format="numeric"
					change
					percentage
					class="ml-1 text-[10px]"
				/>
			</Table.Cell>

			<!-- Signal -->
			<Table.Cell class="w-28">
				{#if signal}
					<span
						class="inline-flex max-w-27 items-center gap-1 rounded-sm border border-gecko-shade/80 bg-gecko-shade/30 px-1.5 py-0.5 font-mono text-[9px] tracking-wide text-gecko-gray uppercase"
						title={signal.label}
					>
						<span class="truncate">{signalShortLabel(signal.kind)}</span>
						{#if formatSignalValue(signal)}
							<span class="shrink-0 text-gecko-white/75">{formatSignalValue(signal)}</span>
						{/if}
					</span>
				{:else}
					<span class="font-mono text-[10px] text-gecko-gray/30">—</span>
				{/if}
			</Table.Cell>

			<!-- Class -->
			<Table.Cell class="w-28">
				<span class="font-mono text-[11px] tracking-wide text-gecko-gray/80 uppercase"
					>{asset.category}</span
				>
			</Table.Cell>

			<!-- Mini chart -->
			<Table.Cell class="w-22">
				{#if sparklines[assetId]?.length}
					<Sparkline series={sparklines[assetId]} width={70} height={22} />
				{:else}
					<span class="font-mono text-[10px] text-gecko-gray/30">—</span>
				{/if}
			</Table.Cell>

			<!-- Venues -->
			<Table.Cell class="w-25">
				<IconScroll>
					{#each asset.marketIds as marketId (marketId)}
						{@const { venue, namespace } = snapshot.markets[marketId]}
						{@const { name, icon } = (exchanges as ExchangeCfg)[`${venue}:${namespace}`]}

						<Icon src={icon} alt={name} nested />
					{/each}
				</IconScroll>
			</Table.Cell>

			<!-- Empty sizer -->
			<Table.Cell class="w-3"></Table.Cell>
		</Table.Row>
	{/snippet}
</BaseTable>
