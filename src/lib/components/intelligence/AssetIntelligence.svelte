<script lang="ts">
	import Card from "$components/Card.svelte";
	import Grid from "$components/Grid.svelte";
	import Icon from "$components/Icon.svelte";
	import Numeric from "$components/Numeric.svelte";
	import exchanges from "$config/exchanges.json";
	import { marketToURL } from "$lib/utils";
	import type { ExchangeCfg } from "$lib/types";
	import { MARKET_TO_ASSET, type DiffedSnapshot } from "$lib/transform";
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

	function marketLabel(marketKey: string): string {
		const market = snapshot.markets[marketKey];
		const meta = market && exchangeMeta(market.venue, market.namespace);
		return meta ? `${meta.name} ${market.ticker}` : marketKey.toUpperCase();
	}
</script>

{#if intel}
	<!-- Market context header (summary + signals) -->
	<div>
		<Grid bottom={false}>
			<Card title="Market context">
				<div class="flex flex-1 flex-col gap-3 p-4">
					<p class="text-xs leading-relaxed text-gecko-gray/90 md:text-sm">
						{intel.summary}
					</p>

					{#if intel.signals.length > 0}
						<div class="flex flex-wrap gap-1.5">
							{#each intel.signals.slice(0, 4) as signal (`${signal.kind}:${signal.marketKey ?? signal.assetId ?? ""}`)}
								<SignalChip {signal} />
							{/each}
						</div>
					{/if}
				</div>
			</Card>
		</Grid>
	</div>

	<!-- Venue concentration + price range -->
	<div>
		<Grid bottom={false}>
			<Card title="Venue concentration">
				<div class="flex flex-1 flex-col p-4">
					<!-- Concentration meta -->
					<div class="flex items-center justify-between pb-2 text-xs">
						<div class="flex items-center gap-2">
							<span class="text-gecko-gray">HHI</span>
							<span class="font-mono text-gecko-white"
								>{intel.venueConcentration.hhi.toFixed(2)}</span
							>
							<span
								class="rounded-sm border border-gecko-shade bg-gecko-shade/40 px-1.5 py-0.5 font-mono text-[10px] text-gecko-gray uppercase"
							>
								{concentrationLabel(
									intel.venueConcentration.hhi,
									intel.venueConcentration.venueCount
								)}
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
						{#each intel.venueConcentration.venues as v (v.marketKey)}
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
						<div
							class="hidden border-t border-t-gecko-shade/60 py-1.5 font-mono text-[9px] tracking-wide text-gecko-gray/50 uppercase md:grid md:grid-cols-[1fr_64px_64px_84px_84px_20px]"
						>
							<span>Venue</span>
							<span class="text-right">Vol share</span>
							<span class="text-right">OI share</span>
							<span class="text-right">Volume</span>
							<span class="text-right">OI</span>
							<span></span>
						</div>
						{#each intel.venueConcentration.venues as v (v.marketKey)}
							{@const meta = exchangeMeta(v.venue, v.namespace)}
							{#if meta}
								<a
									href={marketToURL(v.venue, v.namespace, snapshot.markets[v.marketKey].ticker)}
									target="_blank"
									rel="noopener"
									class="grid grid-cols-[1fr_58px_58px_20px] items-center gap-2 border-t border-t-gecko-shade/60 py-2 text-xs hover:bg-gecko-black-hover md:grid-cols-[1fr_64px_64px_84px_84px_20px]"
								>
									<div class="flex min-w-0 items-center gap-2">
										<div class="flex w-7 items-center justify-center">
											<Icon src={meta.icon} alt={meta.name} nested />
										</div>
										<span class="truncate text-gecko-white">{meta.name}</span>
										{#if v.isNew}
											<span
												class="rounded-sm border border-amber-500/40 bg-amber-500/10 px-1 py-0.5 font-mono text-[9px] text-amber-300 uppercase"
											>
												new
											</span>
										{/if}
									</div>
									<span class="w-16 text-right font-mono text-gecko-gray">
										{(v.volumeShare * 100).toFixed(1)}%
									</span>
									<span class="w-16 text-right font-mono text-gecko-gray">
										{(v.oiShare * 100).toFixed(1)}%
									</span>
									<span class="hidden w-20 text-right md:inline">
										<Numeric
											value={v.volume}
											format="currency"
											currency="USD"
											class="text-gecko-white"
										/>
									</span>
									<span class="hidden w-20 text-right md:inline">
										<Numeric
											value={v.oi}
											format="currency"
											currency="USD"
											class="text-gecko-white"
										/>
									</span>
									<span class="pl-2 text-gecko-gray">↗</span>
								</a>
							{/if}
						{/each}
					</div>
				</div>
			</Card>

			<Card title="Cross-venue ref price range">
				<div class="flex flex-1 flex-col p-4">
					{#if intel.priceDivergence}
						{@const d = intel.priceDivergence}
						{@const quote = MARKET_TO_ASSET.get(d.lowMarketKey)?.quote ?? "USD"}
						<div class="flex items-baseline gap-2 text-lg">
							<span class="font-mono text-gecko-white">{d.bps.toFixed(0)}</span>
							<span class="text-xs text-gecko-gray">bps high–low</span>
						</div>
						<div class="mt-3 grid grid-cols-2 gap-3 text-xs">
							<div>
								<div class="text-gecko-gray">Low</div>
								<div class="text-gecko-white">
									<Numeric
										value={d.low}
										format="numeric"
										currency={quote}
										class="text-gecko-white"
									/>
								</div>
								<a
									href={marketToURL(
										snapshot.markets[d.lowMarketKey].venue,
										snapshot.markets[d.lowMarketKey].namespace,
										snapshot.markets[d.lowMarketKey].ticker
									)}
									target="_blank"
									rel="noopener"
									class="font-mono text-gecko-gray hover:text-gecko-white"
								>
									{marketLabel(d.lowMarketKey)} ↗
								</a>
							</div>
							<div>
								<div class="text-gecko-gray">High</div>
								<div class="text-gecko-white">
									<Numeric
										value={d.high}
										format="numeric"
										currency={quote}
										class="text-gecko-white"
									/>
								</div>
								<a
									href={marketToURL(
										snapshot.markets[d.highMarketKey].venue,
										snapshot.markets[d.highMarketKey].namespace,
										snapshot.markets[d.highMarketKey].ticker
									)}
									target="_blank"
									rel="noopener"
									class="font-mono text-gecko-gray hover:text-gecko-white"
								>
									{marketLabel(d.highMarketKey)} ↗
								</a>
							</div>
						</div>
						<p class="mt-3 text-[11px] text-gecko-gray/70">
							Computed only from comparable reference prices in the asset's preferred quote
							currency. Wider ranges may indicate stale prices, thin liquidity, or venue-specific
							risk.
						</p>
					{:else}
						<p class="text-xs text-gecko-gray/75">
							Not enough comparable-quote venues to compute a price range.
						</p>
					{/if}
				</div>
			</Card>
		</Grid>
	</div>
{/if}
