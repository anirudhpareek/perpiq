<script lang="ts">
	import Card from "$components/Card.svelte";
	import Grid from "$components/Grid.svelte";
	import Icon from "$components/Icon.svelte";
	import Numeric from "$components/Numeric.svelte";
	import exchanges from "$config/exchanges.json";
	import { marketToURL } from "$lib/utils";
	import type { ExchangeCfg } from "$lib/types";
	import type { DiffedSnapshot } from "$lib/transform";
	import { buildAssetIntelligence } from "$lib/intelligence";
	import SignalChip from "$components/intelligence/SignalChip.svelte";

	let { snapshot, assetId }: { snapshot: DiffedSnapshot; assetId: string } = $props();

	const intel = $derived(buildAssetIntelligence(snapshot, assetId));

	function exchangeMeta(venue: string, namespace: string) {
		return (exchanges as ExchangeCfg)[`${venue}:${namespace}`];
	}

	function concentrationLabel(hhi: number, venueCount: number): string {
		if (venueCount <= 1) return "Single venue";
		if (hhi >= 0.6) return "Concentrated";
		if (hhi <= 0.25) return "Distributed";
		return "Mixed";
	}
</script>

{#if intel}
	<!-- Intelligence header (summary + signals) -->
	<div>
		<Grid bottom={false}>
			<Card title="Intelligence">
				<div class="flex flex-1 flex-col gap-3 p-4">
					<p class="text-xs leading-relaxed text-gecko-gray/90 md:text-sm">
						{intel.summary}
					</p>

					{#if intel.signals.length > 0}
						<div class="flex flex-wrap gap-1.5">
							{#each intel.signals as signal}
								<SignalChip {signal} />
							{/each}
						</div>
					{/if}
				</div>
			</Card>
		</Grid>
	</div>

	<!-- Venue concentration + price spread -->
	<div>
		<Grid bottom={false}>
			<Card title="Venue concentration">
				<div class="flex flex-1 flex-col p-4">
					<!-- Concentration meta -->
					<div class="flex items-center justify-between pb-2 text-xs">
						<div class="flex items-center gap-2">
							<span class="text-gecko-gray">HHI</span>
							<span class="font-mono text-gecko-white">{intel.venueConcentration.hhi.toFixed(2)}</span>
							<span class="rounded-sm border border-gecko-shade bg-gecko-shade/40 px-1.5 py-0.5 font-mono text-[10px] uppercase text-gecko-gray">
								{concentrationLabel(intel.venueConcentration.hhi, intel.venueConcentration.venueCount)}
							</span>
						</div>
						<div class="text-gecko-gray">
							{intel.venueConcentration.venueCount} venue{intel.venueConcentration.venueCount === 1
								? ""
								: "s"}
						</div>
					</div>

					<!-- Stacked share bar (volume) -->
					<div class="flex h-1.5 w-full overflow-hidden rounded-sm bg-gecko-shade/40">
						{#each intel.venueConcentration.venues as v}
							{@const width = (v.volumeShare * 100).toFixed(2)}
							{#if v.volumeShare > 0}
								<div
									class="h-full bg-gecko-white/70 first:bg-gecko-white"
									style="width: {width}%"
									title="{v.venue}:{v.namespace} — {(v.volumeShare * 100).toFixed(1)}%"
								></div>
							{/if}
						{/each}
					</div>

					<!-- Venue list with deep links -->
					<div class="mt-3 flex flex-col">
						{#each intel.venueConcentration.venues as v}
							{@const meta = exchangeMeta(v.venue, v.namespace)}
							{#if meta}
								<a
									href={marketToURL(v.venue, v.namespace, snapshot.markets[v.marketKey].ticker)}
									target="_blank"
									rel="noopener"
									class="flex items-center gap-2 border-t border-t-gecko-shade/60 py-2 text-xs first:border-t-0 hover:bg-gecko-black-hover"
								>
									<div class="flex w-7 items-center justify-center">
										<Icon src={meta.icon} alt={meta.name} nested />
									</div>
									<span class="flex-1 text-gecko-white">{meta.name}</span>
									{#if v.isNew}
										<span class="rounded-sm border border-amber-500/40 bg-amber-500/10 px-1 py-0.5 font-mono text-[9px] uppercase text-amber-300">
											new
										</span>
									{/if}
									<span class="w-16 text-right font-mono text-gecko-gray">
										{(v.volumeShare * 100).toFixed(1)}%
									</span>
									<span class="w-20 text-right">
										<Numeric value={v.volume} format="currency" currency="USD" class="text-gecko-white" />
									</span>
									<span class="pl-2 text-gecko-gray">↗</span>
								</a>
							{/if}
						{/each}
					</div>
				</div>
			</Card>

			<Card title="Cross-venue price spread">
				<div class="flex flex-1 flex-col p-4">
					{#if intel.priceDivergence}
						{@const d = intel.priceDivergence}
						<div class="flex items-baseline gap-2 text-lg">
							<span class="font-mono text-gecko-white">{d.bps.toFixed(0)}</span>
							<span class="text-xs text-gecko-gray">bps high–low</span>
						</div>
						<div class="mt-3 grid grid-cols-2 gap-3 text-xs">
							<div>
								<div class="text-gecko-gray">Low</div>
								<div class="text-gecko-white">
									<Numeric value={d.low} format="numeric" currency="USD" class="text-gecko-white" />
								</div>
								<div class="font-mono text-gecko-gray">{d.lowMarketKey}</div>
							</div>
							<div>
								<div class="text-gecko-gray">High</div>
								<div class="text-gecko-white">
									<Numeric value={d.high} format="numeric" currency="USD" class="text-gecko-white" />
								</div>
								<div class="font-mono text-gecko-gray">{d.highMarketKey}</div>
							</div>
						</div>
						<p class="mt-3 text-[11px] text-gecko-gray/70">
							Computed over venues quoting in the asset's preferred currency. Larger spreads
							typically indicate thin books, listing lag, or stale prices on one side.
						</p>
					{:else}
						<p class="text-xs text-gecko-gray/75">
							Not enough comparable-quote venues to compute a spread.
						</p>
					{/if}
				</div>
			</Card>
		</Grid>
	</div>
{/if}
