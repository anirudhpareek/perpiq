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
		sparklines = {}
	}: { snapshot: DiffedSnapshot; sparklines?: Record<string, number[]> } = $props();

	// Pick 4 hero cards. We blend "most volume" with one notable mover so the
	// strip stays interesting even when 24h diffs are zero on cold runs.
	const cards = $derived.by(() => {
		const all = snapshot.index.assetsByVolume
			.map((e) => ({ id: e.asset, asset: snapshot.assets[e.asset] }))
			.filter((x) => x.asset);

		const byVol = [...all].slice(0, 3);
		const remaining = all.filter((a) => !byVol.find((b) => b.id === a.id));
		const topMover =
			remaining
				.filter((a) => Math.abs(a.asset.volumeChange) > 0.0001)
				.sort((a, b) => Math.abs(b.asset.volumeChange) - Math.abs(a.asset.volumeChange))[0] ??
			remaining[0];

		return topMover ? [...byVol, topMover] : byVol;
	});

	const ticks = tickers.perps as TickerCfg;
	function meta(category: string, id: string) {
		return ticks[category]?.[id]?.meta;
	}
</script>

{#if cards.length > 0}
	<section class="border-b border-b-gecko-shade bg-gecko-black/30">
		<div class="mx-auto flex max-w-7xl flex-col px-4 py-5 md:px-8 md:py-6">
			<div class="flex items-baseline gap-3 pb-4">
				<h2 class="text-base font-medium text-gecko-white md:text-lg">Featured</h2>
				<span class="rounded-sm border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-emerald-300">
					Live
				</span>
				<span class="text-xs text-gecko-gray/70">
					Top RWA perp markets by 24h volume
				</span>
			</div>

			<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
				{#each cards as { id, asset }}
					{@const m = meta(asset.category, id)}
					{#if m}
						<button
							type="button"
							onmouseenter={() => {
								preloadCode(`/asset/${id}`);
								preloadData(`/asset/${id}`);
							}}
							onclick={() => goto(`/asset/${id}`)}
							class="group flex flex-col rounded-md border border-gecko-shade/80 bg-gecko-shade/20 p-4 text-left transition hover:border-gecko-gray/40 hover:bg-gecko-shade/40"
						>
							<div class="flex items-center gap-2">
								<div class="flex w-7 items-center justify-center">
									<Icon src={m.icon} alt={m.name} />
								</div>
								<div class="flex flex-1 flex-col">
									<span class="text-sm text-gecko-white">{m.name}</span>
									<span class="font-mono text-[10px] uppercase tracking-wide text-gecko-gray/70">
										{asset.category}
									</span>
								</div>
								<span class="font-mono text-[10px] uppercase text-gecko-gray/50 group-hover:text-gecko-gray">
									→
								</span>
							</div>

							<div class="mt-3 flex items-baseline justify-between gap-2">
								<div class="flex items-baseline gap-2">
									<Numeric
										value={asset.medianRefPx}
										format="numeric"
										currency={m.quote ?? "USD"}
										class="text-lg text-gecko-white"
									/>
									<Numeric
										value={asset.medianRefPxChange * 100}
										format="numeric"
										change
										percentage
									/>
								</div>
								{#if sparklines[id]?.length}
									<Sparkline series={sparklines[id]} width={70} height={26} />
								{/if}
							</div>

							<div class="mt-3 flex items-center justify-between text-xs">
								<div class="flex flex-col">
									<span class="text-[10px] uppercase tracking-wide text-gecko-gray/60">
										Vol 24h
									</span>
									<Numeric
										value={asset.volume}
										format="currency"
										currency="USD"
										class="text-gecko-white"
									/>
								</div>
								<div class="flex flex-col items-end">
									<span class="text-[10px] uppercase tracking-wide text-gecko-gray/60">
										OI
									</span>
									<Numeric
										value={asset.oi}
										format="currency"
										currency="USD"
										class="text-gecko-white"
									/>
								</div>
							</div>
						</button>
					{/if}
				{/each}
			</div>
		</div>
	</section>
{/if}
