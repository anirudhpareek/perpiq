<script lang="ts">
	import { page } from "$app/state";
	import { goto } from "$app/navigation";
	import { untrack } from "svelte";
	import type { PageProps } from "../$types";
	import tickers from "$config/tickers.json";
	import Meta from "$components/Meta.svelte";
	import Icon from "$components/Icon.svelte";
	import Grid from "$components/Grid.svelte";
	import Card from "$components/Card.svelte";
	import type { TickerCfg } from "$lib/types";
	import type { EChartsOption } from "echarts";
	import exchanges from "$config/exchanges.json";
	import LazyChart from "$components/LazyChart.svelte";
	import VenueFilter from "$components/VenueFilter.svelte";
	import MarketTable from "$components/table/MarketTable.svelte";
	import { parseCategory, parseVenue, updateFilterParams } from "$lib/filter-url";
	import { truncateCurrency } from "$lib/number-format";
	import { MARKET_TO_ASSET, type DiffedSnapshot } from "$lib/transform";
	import CategoryPills, { type Category } from "$components/CategoryPills.svelte";
	import Numeric from "$components/Numeric.svelte";

	let { data }: PageProps = $props();
	const snapshot = $derived(data.snapshot as DiffedSnapshot);
	let category = $state<Category>(parseCategory(page.url.searchParams.get("category")));
	let venue = $state(parseVenue(page.url.searchParams.get("venue")));

	$effect(() => {
		const nextCategory = parseCategory(page.url.searchParams.get("category"));
		const nextVenue = parseVenue(page.url.searchParams.get("venue"));
		if (untrack(() => category) !== nextCategory) category = nextCategory;
		if (untrack(() => venue) !== nextVenue) venue = nextVenue;
	});

	$effect(() => {
		const next = updateFilterParams(page.url, { category, venue });
		const current = `${page.url.pathname}${page.url.search}${page.url.hash}`;
		if (next !== current) goto(next, { replaceState: true, noScroll: true, keepFocus: true });
	});

	// Stats
	const venueCount = $derived(snapshot.aggregates.exchangeStats.length);
	const marketCount = $derived(Object.keys(snapshot.markets).length);

	// Scatter plot setup
	const scatter: EChartsOption = $derived.by(() => {
		// Setup data
		const data: { name: string; value: [number, number]; symbol: string; symbolSize: number }[] =
			[];

		// Generate data from markets
		for (const [id, market] of Object.entries(snapshot.markets)) {
			// Resolve asset icon
			const { asset, category } = MARKET_TO_ASSET.get(id)!;
			const { icon } = (tickers.perps as TickerCfg)[category][asset].meta;

			// Populate scatter plot data
			data.push({
				name: id.toUpperCase(),
				value: [market.oi || 1, market.volume || 1],
				symbol: icon
					? // Rough icon handling: if FX, get non-US icon
						`image://${icon.length > 1 ? (icon[0].includes("USD") ? icon[1] : icon[0]) : icon[0]}`
					: "circle",
				symbolSize: 12
			});
		}

		// Setup X/Y axis
		const AXIS_SETUP: EChartsOption["xAxis"] & EChartsOption["yAxis"] = {
			type: "log",
			min: (value) => value.min * 0.8,
			max: (value) => value.max * 3,
			nameLocation: "center",
			nameTextStyle: { color: "#f3f3f3", fontSize: 12 },
			axisLabel: { color: "#b4b4b6", fontSize: 10, formatter: truncateCurrency, margin: 15 },
			splitLine: { lineStyle: { color: "#1f1f24" } },
			axisLine: { lineStyle: { color: "#2b2b30" } }
		};

		return {
			series: [{ type: "scatter", data }],
			grid: { left: 0, right: 0, top: 0, bottom: 0 },
			xAxis: {
				name: "Open Interest",
				...AXIS_SETUP
			},
			yAxis: {
				name: "Volume",
				...AXIS_SETUP
			},
			tooltip: {
				trigger: "item",
				backgroundColor: "#121218",
				borderColor: "#1f1f24",
				textStyle: { color: "#f3f3f3", fontSize: 11 },
				formatter: (params) => {
					const point = Array.isArray(params) ? params[0] : params;
					const value = Array.isArray(point.value) ? point.value : [0, 0];
					const oi = Number(value[0] ?? 0);
					const vol = Number(value[1] ?? 0);
					return `<b>${String(point.name ?? "")}</b><br/>OI: $${truncateCurrency(oi)}<br/>Volume: $${truncateCurrency(vol)}`;
				}
			},
			legend: { show: false }
		} satisfies EChartsOption;
	});
</script>

<Meta title="prepiq | Markets" />

<!-- Landing header (title, description) -->
<Grid bottom={false}>
	<div class="flex flex-1 flex-col gap-0.5 px-4 py-6">
		<h1 class="text-lg text-gecko-white md:text-xl">Markets</h1>
		<p class="text-sm text-gecko-gray/75">
			Aggregating {marketCount} markets across {venueCount} venues.
		</p>
	</div>
</Grid>

<!-- Statistics row -->
<Grid>
	<Card title="Volume vs. Open Interest" class="md:flex-6 lg:flex-9">
		<!-- Scrollable handler on mobile (defaults to `lg` breakpoint) -->
		<div
			class="flex items-center justify-end border-b border-b-gecko-shade bg-gecko-black px-2 py-0.5 font-mono text-xs text-gecko-gray/50 uppercase lg:hidden"
		>
			<span>Scrollable</span>
			<span class="ml-1 -translate-y-px text-lg">↔</span>
		</div>

		<div class="relative flex min-h-80 flex-1 flex-col overflow-x-scroll">
			<div class="absolute inset-0 w-full min-w-200 px-4 py-2">
				<LazyChart options={scatter} />
			</div>
		</div>
	</Card>

	<!-- Exchange dominance by OI -->
	<Card title="Open Interest Dominance" class="md:flex-3">
		<!-- Table content -->
		<div class="flex flex-col">
			{#each snapshot.aggregates.oiByVenue as { venue, oiShare }, i (venue)}
				{@const { name, icon } = exchanges[`${venue}:` as keyof typeof exchanges]}

				<a
					href="/venue/{venue}"
					class="flex h-10 items-center justify-between border-b border-b-gecko-shade text-xs last:border-b-0 hover:bg-gecko-black-hover"
				>
					<div class="flex items-center">
						<!-- Rank -->
						<span class="w-10 text-center"><Numeric value={i + 1} /></span>

						<!-- Exchange -->
						<div class="flex items-center">
							<div class="flex w-7 items-center justify-center">
								<Icon src={icon} alt={name} />
							</div>
							<span class="ml-2 text-gecko-white">{name}</span>
						</div>
					</div>

					<!-- OI share -->
					<span class="pr-4"
						><Numeric
							value={oiShare * 100}
							format="numeric"
							percentage
							class="text-gecko-gray!"
						/></span
					>
				</a>
			{/each}
		</div>
	</Card>
</Grid>

<!-- Table of all markets -->
<CategoryPills bind:value={category}>
	<VenueFilter {snapshot} bind:value={venue} />
</CategoryPills>
<div class="md:border-t md:border-t-gecko-shade">
	<MarketTable {snapshot} filter={{ category, ...(venue !== "all" ? { venue } : {}) }} />
</div>
