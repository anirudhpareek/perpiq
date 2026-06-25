<script lang="ts">
	import Icon from "$components/Icon.svelte";
	import tickers from "$config/tickers.json";
	import Numeric from "$components/Numeric.svelte";
	import Sparkline from "$components/Sparkline.svelte";
	import { goto, preloadCode, preloadData } from "$app/navigation";
	import type { TickerCfg } from "$lib/types";
	import type { DiffedSnapshot } from "$lib/transform";
	import { computePriceDivergence } from "$lib/intelligence";

	let {
		snapshot,
		sparklines = {}
	}: { snapshot: DiffedSnapshot; sparklines?: Record<string, number[]> } = $props();

	type FeaturedCard = {
		id: string;
		label: string;
		asset: DiffedSnapshot["assets"][string];
		primary: number;
		primaryFormat: "currency" | "percent" | "bps";
		secondary: string;
	};

	const cards = $derived.by(() => {
		const all = snapshot.index.assetsByVolume
			.map((e) => ({ id: e.asset, asset: snapshot.assets[e.asset] }))
			.filter((x) => x.asset);

		const selected: FeaturedCard[] = [];
		const add = (card: FeaturedCard | null) => {
			if (!card) return;
			if (selected.some((item) => item.id === card.id)) return;
			selected.push(card);
		};

		const mostActive = all[0];
		add(
			mostActive
				? {
						id: mostActive.id,
						label: "Most active",
						asset: mostActive.asset,
						primary: mostActive.asset.volume,
						primaryFormat: "currency",
						secondary: "24h volume"
					}
				: null
		);

		const oiMove = [...all]
			.filter((row) => !row.asset.isNew)
			.filter((row) => !selected.some((item) => item.id === row.id))
			.sort((a, b) => Math.abs(b.asset.oiChange) - Math.abs(a.asset.oiChange))[0];
		add(
			oiMove
				? {
						id: oiMove.id,
						label: "Biggest OI move",
						asset: oiMove.asset,
						primary: oiMove.asset.oiChange,
						primaryFormat: "percent",
						secondary: "open interest change"
					}
				: null
		);

		const newMarket = Object.entries(snapshot.markets)
			.filter(([, market]) => market.isNew)
			.map(([marketKey, market]) => {
				const assetId = all.find((row) => row.asset.marketIds.includes(marketKey))?.id;
				return assetId ? { assetId, market } : null;
			})
			.filter((row): row is { assetId: string; market: DiffedSnapshot["markets"][string] } => !!row)
			.filter((row) => !selected.some((item) => item.id === row.assetId))
			.sort((a, b) => b.market.volume - a.market.volume)[0];
		add(
			newMarket
				? {
						id: newMarket.assetId,
						label: "New listing",
						asset: snapshot.assets[newMarket.assetId],
						primary: newMarket.market.volume,
						primaryFormat: "currency",
						secondary: `${newMarket.market.venue}${newMarket.market.namespace ? `:${newMarket.market.namespace}` : ""}`
					}
				: null
		);

		const range = all
			.map((row) => {
				const priceRange = computePriceDivergence(snapshot, row.id);
				return priceRange ? { id: row.id, asset: row.asset, bps: priceRange.bps } : null;
			})
			.filter(
				(row): row is { id: string; asset: DiffedSnapshot["assets"][string]; bps: number } => !!row
			)
			.filter((row) => !selected.some((item) => item.id === row.id))
			.sort((a, b) => b.bps - a.bps)[0];
		add(
			range
				? {
						id: range.id,
						label: "Price range",
						asset: range.asset,
						primary: range.bps,
						primaryFormat: "bps",
						secondary: "comparable venues"
					}
				: null
		);

		for (const row of all) {
			if (selected.length >= 4) break;
			add({
				id: row.id,
				label: "Active market",
				asset: row.asset,
				primary: row.asset.volume,
				primaryFormat: "currency",
				secondary: "24h volume"
			});
		}

		return selected.slice(0, 4);
	});

	const ticks = tickers.perps as TickerCfg;
	function meta(category: string, id: string) {
		return ticks[category]?.[id]?.meta;
	}

	function bps(n: number): string {
		return `${n.toFixed(0)} bps`;
	}
</script>

{#if cards.length > 0}
	<section class="border-b border-b-gecko-shade bg-gecko-black/30">
		<div class="mx-auto flex max-w-7xl flex-col px-4 py-5 md:px-8 md:py-6">
			<div class="flex items-baseline justify-between gap-3 pb-4">
				<div class="flex items-baseline gap-3">
					<h2 class="text-base font-medium text-gecko-white md:text-lg">Market focus</h2>
					<span
						class="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] tracking-wide text-emerald-300 uppercase"
					>
						Live
					</span>
					<span class="hidden text-xs text-gecko-gray/70 md:inline">
						What changed, where liquidity is, and where prices diverge
					</span>
				</div>
				<a
					href="/markets"
					class="font-mono text-[11px] tracking-wide text-gecko-gray uppercase hover:text-gecko-white"
				>
					View all →
				</a>
			</div>

			<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
				{#each cards as card (card.id)}
					{@const { id, asset } = card}
					{@const m = meta(asset.category, id)}
					{#if m}
						<button
							type="button"
							onmouseenter={() => {
								preloadCode(`/asset/${id}`);
								preloadData(`/asset/${id}`);
							}}
							onclick={() => goto(`/asset/${id}`)}
							class="group press flex flex-col rounded-2xl border border-gecko-shade/80 bg-gecko-shade/20 p-4 text-left hover:border-gecko-gray/40 hover:bg-gecko-shade/40"
							style="animation: feat-in 480ms var(--ease-tactile) backwards; animation-delay: {cards.findIndex(
								(c) => c.id === id
							) *
								80 +
								60}ms;"
						>
							<div class="flex items-center gap-2">
								<div class="flex w-7 items-center justify-center">
									<Icon src={m.icon} alt={m.name} />
								</div>
								<div class="flex flex-1 flex-col">
									<span class="text-sm text-gecko-white">{m.name}</span>
									<span class="font-mono text-[10px] tracking-wide text-gecko-gray/70 uppercase">
										{card.label}
									</span>
								</div>
								<span
									class="font-mono text-[10px] text-gecko-gray/50 uppercase group-hover:text-gecko-gray"
								>
									→
								</span>
							</div>

							<div class="mt-3 flex items-baseline justify-between gap-2">
								<div class="flex items-baseline gap-2">
									{#if card.primaryFormat === "currency"}
										<Numeric
											value={card.primary}
											format="currency"
											currency="USD"
											class="text-lg text-gecko-white"
										/>
									{:else if card.primaryFormat === "percent"}
										<Numeric
											value={card.primary * 100}
											format="numeric"
											change
											percentage
											class="text-lg"
										/>
									{:else}
										<span class="font-mono text-lg text-gecko-white">{bps(card.primary)}</span>
									{/if}
								</div>
								{#if sparklines[id]?.length}
									<Sparkline series={sparklines[id]} width={70} height={26} />
								{/if}
							</div>

							<div class="mt-3 flex items-center justify-between text-xs">
								<div class="flex flex-col">
									<span class="text-[10px] tracking-wide text-gecko-gray/60 uppercase">
										Context
									</span>
									<span class="font-mono text-gecko-white">{card.secondary}</span>
								</div>
								<div class="flex flex-col items-end">
									<span class="text-[10px] tracking-wide text-gecko-gray/60 uppercase"> OI </span>
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

<style>
	@keyframes feat-in {
		from {
			opacity: 0;
			transform: translateY(8px) scale(0.985);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}
</style>
