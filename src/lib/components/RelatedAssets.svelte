<script lang="ts">
	import Icon from "$components/Icon.svelte";
	import tickers from "$config/tickers.json";
	import Numeric from "$components/Numeric.svelte";
	import Sparkline from "$components/Sparkline.svelte";
	import { goto, preloadCode, preloadData } from "$app/navigation";
	import type { TickerCfg } from "$lib/types";
	import type { DiffedSnapshot } from "$lib/transform";

	let {
		snapshot,
		assetId,
		category,
		sparklines = {}
	}: {
		snapshot: DiffedSnapshot;
		assetId: string;
		category: string;
		sparklines?: Record<string, number[]>;
	} = $props();

	const ticks = tickers.perps as TickerCfg;

	// Top 4 same-category assets by volume, excluding the current one.
	const related = $derived.by(() => {
		const ids = snapshot.index.assetsByVolume
			.map((e) => e.asset)
			.filter((id) => id !== assetId && snapshot.assets[id]?.category === category)
			.slice(0, 4);
		return ids.map((id) => ({ id, asset: snapshot.assets[id], meta: ticks[category]?.[id]?.meta }));
	});
</script>

{#if related.length > 0}
	<section class="border-t border-t-gecko-shade bg-gecko-black/20">
		<div class="mx-auto flex max-w-7xl flex-col px-4 py-6 md:px-8 md:py-8">
			<div class="pb-4">
				<h3 class="text-sm font-medium text-gecko-white md:text-base">More {category}</h3>
				<p class="text-[11px] text-gecko-gray/60">Top RWA perps in the same class</p>
			</div>

			<div class="grid grid-cols-2 gap-3 md:grid-cols-4">
				{#each related as r}
					{#if r.meta}
						<button
							type="button"
							onmouseenter={() => {
								preloadCode(`/asset/${r.id}`);
								preloadData(`/asset/${r.id}`);
							}}
							onclick={() => goto(`/asset/${r.id}`)}
							class="group flex flex-col rounded-md border border-gecko-shade/80 bg-gecko-shade/20 p-3 text-left transition hover:border-gecko-gray/40 hover:bg-gecko-shade/40"
						>
							<div class="flex items-center gap-2">
								<div class="flex w-6 items-center justify-center">
									<Icon src={r.meta.icon} alt={r.meta.name} />
								</div>
								<span class="flex-1 truncate text-sm text-gecko-white">{r.meta.name}</span>
							</div>
							<div class="mt-2 flex items-baseline justify-between gap-2">
								<Numeric
									value={r.asset.medianRefPx}
									format="numeric"
									currency={r.meta.quote ?? "USD"}
									class="text-sm text-gecko-white"
								/>
								<Numeric
									value={r.asset.medianRefPxChange * 100}
									format="numeric"
									change
									percentage
								/>
							</div>
							{#if sparklines[r.id]?.length}
								<div class="mt-2">
									<Sparkline series={sparklines[r.id]} width={140} height={28} />
								</div>
							{/if}
						</button>
					{/if}
				{/each}
			</div>
		</div>
	</section>
{/if}
