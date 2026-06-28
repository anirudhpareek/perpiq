<script lang="ts">
	import { onMount } from "svelte";
	import { ArrowUpRight, Check, ChevronDown } from "@lucide/svelte";
	import Icon from "$components/Icon.svelte";
	import exchanges from "$config/exchanges.json";
	import type { ExchangeCfg } from "$lib/types";
	import type { DiffedSnapshot } from "$lib/transform";
	import { truncateCurrency } from "$lib/number-format";
	import {
		executionVenueRows,
		marketExecutionUrl,
		selectBestExecutionMarket
	} from "$lib/execution/metadata";

	let {
		snapshot,
		assetId,
		value = $bindable("")
	}: { snapshot: DiffedSnapshot; assetId: string; value: string } = $props();

	let hydrated = $state(false);
	const storageKey = $derived(`perpiq.action.${assetId}.market`);
	const rows = $derived(executionVenueRows(snapshot, assetId));
	const selectedRow = $derived(rows.find((row) => row.marketKey === value) ?? rows[0]);
	const selectedMarket = $derived(selectedRow?.market);
	const selectedExchange = $derived(
		selectedMarket
			? (exchanges as ExchangeCfg)[`${selectedMarket.venue}:${selectedMarket.namespace}`]
			: null
	);
	const selectedUrl = $derived(selectedMarket ? marketExecutionUrl(selectedMarket) : null);

	onMount(() => {
		const storedMarket = localStorage.getItem(storageKey);
		value = selectBestExecutionMarket(snapshot, assetId, storedMarket) ?? "";
		hydrated = true;
	});

	$effect(() => {
		if (!value && rows[0]) value = rows[0].marketKey;
		if (hydrated && value) localStorage.setItem(storageKey, value);
	});

	function onChange(event: Event) {
		value = (event.currentTarget as HTMLSelectElement).value;
	}
</script>

{#if selectedMarket && selectedRow}
	<div class="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
		<div
			class="press flex min-w-0 items-center gap-2 rounded-full bg-gecko-shade/25 py-1 pr-3 pl-2 shadow-[0_0_0_1px_rgba(255,255,255,0.06)] hover:bg-gecko-shade/40"
		>
			{#if selectedExchange}
				<Icon src={selectedExchange.icon} alt={selectedExchange.name} nested />
			{/if}
			<div class="relative flex min-w-0 items-center">
				<select
					aria-label="Venue"
					{value}
					onchange={onChange}
					class="max-w-60 appearance-none bg-transparent pr-5 font-mono text-sm text-gecko-white outline-none"
				>
					{#each rows as row}
						{@const rowExchange = (exchanges as ExchangeCfg)[
							`${row.market.venue}:${row.market.namespace}`
						]}
						<option value={row.marketKey}>
							{rowExchange?.name ?? row.market.venue} · {truncateCurrency(row.market.volume)}
						</option>
					{/each}
				</select>
				<ChevronDown class="pointer-events-none absolute right-0 size-3.5 text-gecko-gray/70" />
			</div>
		</div>

		<span class="font-mono text-[11px] tracking-wide text-gecko-gray/75 uppercase">
			{rows.length} venue{rows.length === 1 ? "" : "s"}
		</span>
		{#if selectedRow.isBest}
			<span
				class="inline-flex items-center gap-1 font-mono text-[11px] text-gecko-gray/75 uppercase"
			>
				<Check class="size-3" />
				best venue
			</span>
		{/if}
		{#if selectedUrl}
			<a
				href={selectedUrl}
				target="_blank"
				rel="noreferrer"
				class="inline-flex items-center gap-1 font-mono text-[11px] text-gecko-gray/75 uppercase hover:text-gecko-white"
			>
				open
				<ArrowUpRight class="size-3" />
			</a>
		{/if}
	</div>
{/if}
