<script lang="ts">
	import { goto } from "$app/navigation";
	import Card from "$components/Card.svelte";
	import Grid from "$components/Grid.svelte";
	import Icon from "$components/Icon.svelte";
	import tickers from "$config/tickers.json";
	import Numeric from "$components/Numeric.svelte";
	import exchanges from "$config/exchanges.json";
	import type { ExchangeCfg, TickerCfg } from "$lib/types";
	import type { DiffedSnapshot } from "$lib/transform";
	import { buildHomepageIntelligence } from "$lib/intelligence";

	let { snapshot }: { snapshot: DiffedSnapshot } = $props();

	const intel = $derived(buildHomepageIntelligence(snapshot));

	const assetIndex = Object.values(tickers.perps as TickerCfg).reduce<
		Record<string, { name: string; icon: string[]; category: string }>
	>((acc, group) => {
		for (const [id, def] of Object.entries(group)) {
			acc[id] = { name: def.meta.name, icon: def.meta.icon, category: "" };
		}
		return acc;
	}, {});

	function assetMeta(id: string) {
		return assetIndex[id];
	}

	function exchangeMeta(venue: string, namespace: string) {
		return (exchanges as ExchangeCfg)[`${venue}:${namespace}`];
	}

	function fmtBps(n: number): string {
		return `${n.toFixed(0)} bps`;
	}

	function fmtPctChange(x: number): string {
		const sign = x > 0 ? "+" : "";
		return `${sign}${(x * 100).toFixed(1)}%`;
	}
</script>

{#snippet assetRow(id: string, valueLabel: string, accent: "up" | "down" | "neutral", volume: number | null)}
	{@const meta = assetMeta(id)}
	{#if meta}
		<button
			type="button"
			onclick={() => goto(`/asset/${id}`)}
			class="flex w-full items-center gap-2 border-t border-t-gecko-shade/60 px-4 py-2 text-xs first:border-t-0 hover:bg-gecko-black-hover"
		>
			<div class="flex w-6 items-center justify-center">
				<Icon src={meta.icon} alt={meta.name} />
			</div>
			<span class="flex-1 text-left text-gecko-white">{meta.name}</span>
			{#if volume !== null}
				<span class="hidden w-20 text-right md:inline">
					<Numeric value={volume} format="currency" currency="USD" class="text-gecko-gray" />
				</span>
			{/if}
			<span
				class="w-20 text-right font-mono {accent === 'up'
					? 'text-green-400'
					: accent === 'down'
						? 'text-red-400'
						: 'text-gecko-white'}"
			>
				{valueLabel}
			</span>
		</button>
	{/if}
{/snippet}

{#snippet movers(title: string, rows: { assetId: string; value: number; volume: number }[], direction: "up" | "down")}
	<Card {title}>
		<div class="flex flex-1 flex-col">
			{#if rows.length === 0}
				<div class="p-4 text-xs text-gecko-gray/75">No qualifying signals in last 24h.</div>
			{:else}
				{#each rows as r}
					{@render assetRow(r.assetId, fmtPctChange(r.value), direction, r.volume)}
				{/each}
			{/if}
		</div>
	</Card>
{/snippet}

<!-- Section header -->
<div>
	<Grid bottom={false}>
		<div class="flex flex-1 flex-col gap-0.5 px-4 py-6">
			<h2 class="text-lg text-gecko-white md:text-xl">Market intelligence</h2>
			<p class="text-xs text-gecko-gray/75 md:text-sm">
				Notable 24h moves across volume, open interest, cross-venue price spread, and new listings.
				Signals are derived from collected market data only.
			</p>
		</div>
	</Grid>
</div>

<!-- Row 1: volume + OI movers -->
<div>
	<Grid bottom={false}>
		{@render movers("Top volume spikes", intel.volumeSpikes, "up")}
		{@render movers("Top volume drops", intel.volumeDrops, "down")}
	</Grid>
</div>

<div>
	<Grid bottom={false}>
		{@render movers("Top OI spikes", intel.oiSpikes, "up")}
		{@render movers("Top OI drops", intel.oiDrops, "down")}
	</Grid>
</div>

<!-- Row 2: cross-venue spreads + new listings -->
<div>
	<Grid bottom={false}>
		<Card title="Largest cross-venue spreads">
			<div class="flex flex-1 flex-col">
				{#if intel.largestDivergences.length === 0}
					<div class="p-4 text-xs text-gecko-gray/75">No spreads above threshold.</div>
				{:else}
					{#each intel.largestDivergences as d}
						{@render assetRow(d.assetId, fmtBps(d.bps), "neutral", null)}
					{/each}
				{/if}
			</div>
		</Card>

		<Card title="New markets">
			<div class="flex flex-1 flex-col">
				{#if intel.newMarkets.length === 0}
					<div class="p-4 text-xs text-gecko-gray/75">No new listings in latest batch.</div>
				{:else}
					{#each intel.newMarkets as m}
						{@const a = assetMeta(m.assetId)}
						{@const ex = exchangeMeta(m.venue, m.namespace)}
						{#if a && ex}
							<button
								type="button"
								onclick={() => goto(`/asset/${m.assetId}`)}
								class="flex w-full items-center gap-2 border-t border-t-gecko-shade/60 px-4 py-2 text-xs first:border-t-0 hover:bg-gecko-black-hover"
							>
								<div class="flex w-6 items-center justify-center">
									<Icon src={a.icon} alt={a.name} />
								</div>
								<span class="flex-1 text-left text-gecko-white">{a.name}</span>
								<div class="flex w-6 items-center justify-center">
									<Icon src={ex.icon} alt={ex.name} nested />
								</div>
								<span class="hidden w-24 text-right text-gecko-gray md:inline">{ex.name}</span>
								<span class="w-20 text-right">
									<Numeric value={m.volume} format="currency" currency="USD" class="text-gecko-white" />
								</span>
							</button>
						{/if}
					{/each}
				{/if}
			</div>
		</Card>
	</Grid>
</div>

<!-- Row 3: venue dominance shifts -->
{#if intel.venueShifts.length > 0}
	<div>
		<Grid bottom={false}>
			<Card title="Venue dominance shifts (OI share)">
				<div class="flex flex-1 flex-col">
					{#each intel.venueShifts as v}
						<div class="flex w-full items-center gap-2 border-t border-t-gecko-shade/60 px-4 py-2 text-xs first:border-t-0">
							<span class="flex-1 text-gecko-white">{v.venue}</span>
							<span class="w-24 text-right font-mono text-gecko-gray">
								{(v.oiShare * 100).toFixed(1)}% share
							</span>
							<span
								class="w-24 text-right font-mono {v.oiShareChange > 0
									? 'text-green-400'
									: 'text-red-400'}"
							>
								{v.oiShareChange > 0 ? "+" : ""}{(v.oiShareChange * 100).toFixed(2)} pp
							</span>
						</div>
					{/each}
				</div>
			</Card>
		</Grid>
	</div>
{/if}
