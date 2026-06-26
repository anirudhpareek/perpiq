<script lang="ts">
	import { page } from "$app/state";
	import { goto } from "$app/navigation";
	import type { PageProps } from "./$types";
	import Meta from "$components/Meta.svelte";
	import Numeric from "$components/Numeric.svelte";
	import DitherHero from "$components/DitherHero.svelte";
	import AssetTable from "$components/table/AssetTable.svelte";
	import FeaturedMovers from "$components/FeaturedMovers.svelte";
	import VenueFilter from "$components/VenueFilter.svelte";
	import { parseCategory, parseVenue, updateFilterParams } from "$lib/filter-url";
	import CategoryPills, { type Category } from "$components/CategoryPills.svelte";
	import HomepageIntelligence from "$components/intelligence/HomepageIntelligence.svelte";

	let { data }: PageProps = $props();
	const snapshot = $derived(data.snapshot);
	const sparklines = $derived(data.sparklines ?? {});

	let category = $state<Category>(parseCategory(page.url.searchParams.get("category")));
	let venue = $state(parseVenue(page.url.searchParams.get("venue")));

	$effect(() => {
		const nextCategory = parseCategory(page.url.searchParams.get("category"));
		const nextVenue = parseVenue(page.url.searchParams.get("venue"));
		if (category !== nextCategory) category = nextCategory;
		if (venue !== nextVenue) venue = nextVenue;
	});

	$effect(() => {
		const next = updateFilterParams(page.url, { category, venue });
		const current = `${page.url.pathname}${page.url.search}${page.url.hash}`;
		if (next !== current) goto(next, { replaceState: true, noScroll: true, keepFocus: true });
	});
</script>

<Meta />

<!-- Hero -->
<div class="flex min-h-56 flex-row justify-center border-b border-b-gecko-shade md:min-h-72">
	<DitherHero class="flex flex-1 flex-col">
		<div class="flex flex-1 items-center justify-center">
			<div class="flex max-w-2xl flex-col items-center justify-center px-8 text-center lg:px-4">
				<h1 class="text-2xl font-semibold text-gecko-white sm:text-4xl">
					Discover on-chain RWA perps before liquidity moves.
				</h1>
				<p class="max-w-lg pt-2 text-sm text-gecko-gray/85">
					<Numeric
						value={data.snapshot.aggregates.volume}
						currency="USD"
						format="currency"
						class="text-gecko-gray!"
					/> traded in the last 24h across real-world asset perps, venue liquidity, and reference price
					ranges.
				</p>
			</div>
		</div>
	</DitherHero>
</div>

<!-- Featured cards (uniswap-style hero strip) -->
<FeaturedMovers {snapshot} {sparklines} />

<!-- Market signals -->
<HomepageIntelligence {snapshot} {sparklines} />

<!-- Category + venue filters -->
<CategoryPills bind:value={category}>
	<VenueFilter {snapshot} bind:value={venue} />
</CategoryPills>

<!-- Tabular data -->
<section class="flex max-w-full flex-1 flex-row justify-center">
	<AssetTable {snapshot} {category} {venue} {sparklines} />
</section>
