<script lang="ts">
	import { goto } from "$app/navigation";
	import Icon from "$components/Icon.svelte";
	import tickers from "$config/tickers.json";
	import Numeric from "$components/Numeric.svelte";
	import exchanges from "$config/exchanges.json";
	import Sparkline from "$components/Sparkline.svelte";
	import type { ExchangeCfg, TickerCfg } from "$lib/types";
	import type { DiffedSnapshot } from "$lib/transform";
	import { buildHomepageIntelligence, computePriceDivergence } from "$lib/intelligence";

	let {
		snapshot,
		sparklines = {}
	}: { snapshot: DiffedSnapshot; sparklines?: Record<string, number[]> } = $props();

	const intel = $derived(buildHomepageIntelligence(snapshot));

	// Build a "top movers" view that ALWAYS has data — we sort by absolute
	// change (volume + OI both surface high-conviction movers) and just take
	// whatever the top N is. No threshold gate, so the panel is never empty.
	type MoverRow = {
		assetId: string;
		volume: number;
		volumeChange: number;
		oi: number;
		oiChange: number;
		priceChange: number;
	};
	const allRows: MoverRow[] = $derived(
		Object.entries(snapshot.assets)
			.filter(([, a]) => !a.isNew && a.volume > 0)
			.map(([id, a]) => ({
				assetId: id,
				volume: a.volume,
				volumeChange: a.volumeChange,
				oi: a.oi,
				oiChange: a.oiChange,
				priceChange: a.medianRefPxChange
			}))
	);

	type TabId = "gainers" | "losers" | "oi_up" | "oi_down" | "spreads" | "new";
	let tab = $state<TabId>("gainers");

	const tabs: { id: TabId; label: string }[] = [
		{ id: "gainers", label: "Gainers" },
		{ id: "losers", label: "Losers" },
		{ id: "oi_up", label: "OI inflows" },
		{ id: "oi_down", label: "OI outflows" },
		{ id: "spreads", label: "Spreads" },
		{ id: "new", label: "New markets" }
	];

	const ticks = tickers.perps as TickerCfg;
	function assetMeta(id: string) {
		for (const cat of Object.values(ticks)) {
			if (cat[id]) return cat[id].meta;
		}
		return null;
	}
	function exchangeMeta(venue: string, namespace: string) {
		return (exchanges as ExchangeCfg)[`${venue}:${namespace}`];
	}

	function fmtPct(x: number): string {
		const sign = x > 0 ? "+" : "";
		return `${sign}${(x * 100).toFixed(2)}%`;
	}
	function fmtBps(x: number): string {
		return `${x.toFixed(0)} bps`;
	}

	const ROW_LIMIT = 8;

	type ViewRow = {
		assetId: string;
		primary: string;
		primaryTone: "up" | "down" | "neutral";
		secondary?: string;
		venueIcon?: { icon: string[]; name: string };
	};

	const rows = $derived.by<ViewRow[]>(() => {
		switch (tab) {
			case "gainers":
				return [...allRows]
					.filter((r) => r.priceChange !== 0)
					.sort((a, b) => b.priceChange - a.priceChange)
					.slice(0, ROW_LIMIT)
					.map((r) => ({
						assetId: r.assetId,
						primary: fmtPct(r.priceChange),
						primaryTone: r.priceChange >= 0 ? "up" : "down",
						secondary: `Vol ${nice(r.volume)}`
					}));
			case "losers":
				return [...allRows]
					.filter((r) => r.priceChange !== 0)
					.sort((a, b) => a.priceChange - b.priceChange)
					.slice(0, ROW_LIMIT)
					.map((r) => ({
						assetId: r.assetId,
						primary: fmtPct(r.priceChange),
						primaryTone: r.priceChange >= 0 ? "up" : "down",
						secondary: `Vol ${nice(r.volume)}`
					}));
			case "oi_up":
				return [...allRows]
					.sort((a, b) => b.oiChange - a.oiChange)
					.slice(0, ROW_LIMIT)
					.map((r) => ({
						assetId: r.assetId,
						primary: fmtPct(r.oiChange),
						primaryTone: r.oiChange >= 0 ? "up" : "down",
						secondary: `OI ${nice(r.oi)}`
					}));
			case "oi_down":
				return [...allRows]
					.sort((a, b) => a.oiChange - b.oiChange)
					.slice(0, ROW_LIMIT)
					.map((r) => ({
						assetId: r.assetId,
						primary: fmtPct(r.oiChange),
						primaryTone: r.oiChange >= 0 ? "up" : "down",
						secondary: `OI ${nice(r.oi)}`
					}));
			case "spreads": {
				const spreads = Object.keys(snapshot.assets)
					.map((id) => {
						const d = computePriceDivergence(snapshot, id);
						return d ? { assetId: id, bps: d.bps } : null;
					})
					.filter((x): x is { assetId: string; bps: number } => !!x)
					.sort((a, b) => b.bps - a.bps)
					.slice(0, ROW_LIMIT);
				return spreads.map((s) => ({
					assetId: s.assetId,
					primary: fmtBps(s.bps),
					primaryTone: "neutral",
					secondary: "cross-venue"
				}));
			}
			case "new":
				return intel.newMarkets.map((m) => ({
					assetId: m.assetId,
					primary: nice(m.volume),
					primaryTone: "up",
					secondary: "first batch",
					venueIcon: (() => {
						const ex = exchangeMeta(m.venue, m.namespace);
						return ex ? { icon: ex.icon, name: ex.name } : undefined;
					})()
				}));
		}
	});

	function nice(n: number): string {
		const sign = n < 0 ? "-" : "";
		const x = Math.abs(n);
		if (x >= 1e9) return `${sign}$${(x / 1e9).toFixed(2)}B`;
		if (x >= 1e6) return `${sign}$${(x / 1e6).toFixed(2)}M`;
		if (x >= 1e3) return `${sign}$${(x / 1e3).toFixed(2)}K`;
		return `${sign}$${x.toFixed(0)}`;
	}
</script>

<section class="border-b border-b-gecko-shade">
	<div class="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 md:px-8">
		<!-- Section header -->
		<div class="flex flex-col gap-1">
			<div class="flex items-baseline gap-3">
				<h2 class="text-base font-medium text-gecko-white md:text-lg">Market intelligence</h2>
				<span class="text-xs text-gecko-gray/60">
					Derived from real-time RWA perp market data
				</span>
			</div>
		</div>

		<!-- Tabs (uniswap-style chips) -->
		<div class="flex flex-wrap items-center gap-1.5">
			{#each tabs as t}
				<button
					type="button"
					onclick={() => (tab = t.id)}
					class="rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-wide transition {tab ===
					t.id
						? 'border-gecko-gray bg-gecko-shade text-gecko-white'
						: 'border-gecko-shade/80 bg-transparent text-gecko-gray hover:border-gecko-gray/40 hover:text-gecko-white'}"
				>
					{t.label}
				</button>
			{/each}
		</div>

		<!-- Rows -->
		<div class="grid grid-cols-1 gap-x-6 gap-y-1 md:grid-cols-2">
			{#if rows.length === 0}
				<div class="col-span-full rounded-md border border-gecko-shade/60 bg-gecko-shade/10 px-4 py-6 text-xs text-gecko-gray/70">
					No qualifying entries yet — wait for the next batch.
				</div>
			{:else}
				{#each rows as r}
					{@const m = assetMeta(r.assetId)}
					{#if m}
						<button
							type="button"
							onclick={() => goto(`/asset/${r.assetId}`)}
							class="group flex items-center gap-3 rounded-sm border border-transparent px-2 py-2 text-left transition hover:border-gecko-shade hover:bg-gecko-shade/30"
						>
							<div class="flex w-7 items-center justify-center">
								<Icon src={m.icon} alt={m.name} />
							</div>
							<div class="flex flex-1 flex-col">
								<span class="text-sm text-gecko-white">{m.name}</span>
								<span class="font-mono text-[10px] uppercase tracking-wide text-gecko-gray/60">
									{r.secondary}
								</span>
							</div>
							{#if sparklines[r.assetId]?.length}
								<div class="hidden text-gecko-gray sm:block">
									<Sparkline series={sparklines[r.assetId]} width={64} height={20} />
								</div>
							{/if}
							{#if r.venueIcon}
								<div class="flex w-6 items-center justify-center">
									<Icon src={r.venueIcon.icon} alt={r.venueIcon.name} nested />
								</div>
							{/if}
							<span
								class="w-24 text-right font-mono text-xs {r.primaryTone === 'up'
									? 'text-emerald-400'
									: r.primaryTone === 'down'
										? 'text-red-400'
										: 'text-gecko-white'}"
							>
								{r.primary}
							</span>
						</button>
					{/if}
				{/each}
			{/if}
		</div>
	</div>
</section>
