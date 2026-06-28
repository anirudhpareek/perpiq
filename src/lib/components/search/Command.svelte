<script lang="ts">
	import { tick } from "svelte";
	import { page } from "$app/state";
	import { goto } from "$app/navigation";
	import Icon from "$components/Icon.svelte";
	import * as Command from "$shadcn/command";
	import tickers from "$config/tickers.json";
	import exchanges from "$config/exchanges.json";
	import Numeric from "$components/Numeric.svelte";
	import {
		Activity,
		BadgeDollarSign,
		Building2,
		ChartCandlestick,
		Gem,
		Globe2,
		Landmark,
		Layers3,
		LineChart,
		RadioTower,
		Sparkles
	} from "@lucide/svelte";
	import { MARKET_TO_ASSET, type DiffedSnapshot } from "$lib/transform";
	import { marketToURL } from "$lib/utils";
	import type { ExchangeCfg, TickerCfg } from "$lib/types";
	import { buildHomepageIntelligence } from "$lib/intelligence";

	type Scope = "all" | "assets" | "markets" | "venues" | "signals";
	type SearchCategory = "all" | "stocks" | "indices" | "commodities" | "fx" | "pre-ipo";

	// Snapshot via global page state
	const snapshot = $derived(page.data.snapshot as DiffedSnapshot);
	const intel = $derived(buildHomepageIntelligence(snapshot));

	// Collect menu close fn
	let { close }: { close: () => void } = $props();
	let scope = $state<Scope>("all");
	let category = $state<SearchCategory>("all");

	// Steal focus from hidden proxy input to search bar
	let inputEl: HTMLElement | undefined = $state();
	$effect(() => {
		if (inputEl) {
			tick().then(() => inputEl?.focus());
		}
		return () => inputEl?.blur();
	});

	/**
	 * Handle element selection
	 * @param {string} path to navigate to
	 */
	function onSelect(path: string) {
		// Goto relevant page
		goto(path);
		// Drop any input focus
		inputEl?.blur();
		// Close modal
		close();
	}

	function onExternalSelect(url: string) {
		window.open(url, "_blank");
		inputEl?.blur();
		close();
	}

	// Unified styling
	const groupClass =
		"p-0 **:data-command-group-heading:border-b **:data-command-group-heading:border-b-gecko-shade **:data-command-group-heading:bg-gecko-black/70 **:data-command-group-heading:px-3 **:data-command-group-heading:font-mono **:data-command-group-heading:text-[10px] **:data-command-group-heading:tracking-wide";
	const itemClass =
		"flex h-11 cursor-pointer flex-row justify-between rounded-none border-b border-b-gecko-shade px-3 text-xs font-light aria-selected:bg-gecko-black-hover aria-selected:text-gecko-white";
	const chipClass =
		"terminal-button inline-flex h-7 shrink-0 items-center gap-1.5 px-2.5 font-mono text-[10px] tracking-wide uppercase";

	const scopeOpts: { id: Scope; label: string; icon: typeof Activity }[] = [
		{ id: "all", label: "All", icon: Activity },
		{ id: "assets", label: "Assets", icon: Layers3 },
		{ id: "markets", label: "Markets", icon: ChartCandlestick },
		{ id: "venues", label: "Venues", icon: Building2 },
		{ id: "signals", label: "Signals", icon: RadioTower }
	];

	const categoryOpts: { id: SearchCategory; label: string; icon: typeof Activity }[] = [
		{ id: "all", label: "All classes", icon: Sparkles },
		{ id: "stocks", label: "Stocks", icon: BadgeDollarSign },
		{ id: "indices", label: "Indices", icon: LineChart },
		{ id: "commodities", label: "Commodities", icon: Gem },
		{ id: "fx", label: "FX", icon: Globe2 },
		{ id: "pre-ipo", label: "Pre-IPO", icon: Landmark }
	];

	function scopeAllows(target: Exclude<Scope, "all">) {
		return scope === "all" || scope === target;
	}

	function categoryAllows(assetCategory: string | undefined) {
		return category === "all" || assetCategory === category;
	}

	function setScope(next: Scope) {
		scope = next;
	}

	function setCategory(next: SearchCategory) {
		category = next;
	}

	const signalRows = $derived(
		[
			...intel.volumeSpikes.slice(0, 3).map((row) => ({
				assetId: row.assetId,
				label: "Volume spike",
				detail: `${(row.value * 100).toFixed(1)}%`
			})),
			...intel.oiSpikes.slice(0, 3).map((row) => ({
				assetId: row.assetId,
				label: "OI build",
				detail: `${(row.value * 100).toFixed(1)}%`
			})),
			...intel.largestDivergences.slice(0, 3).map((row) => ({
				assetId: row.assetId,
				label: "Price range",
				detail: `${row.bps.toFixed(0)} bps`
			})),
			...intel.newMarkets.slice(0, 3).map((row) => ({
				assetId: row.assetId,
				label: "New listing",
				detail: row.venue
			}))
		]
			.filter((row) => categoryAllows(snapshot.assets[row.assetId]?.category))
			.slice(0, 8)
	);

	const marketRows = $derived(
		Object.entries(snapshot.markets)
			.filter(([marketKey]) => categoryAllows(MARKET_TO_ASSET.get(marketKey)?.category))
			.sort(([, a], [, b]) => b.volume - a.volume)
			.slice(0, 12)
	);
</script>

<Command.Root
	class="flex flex-col rounded-none bg-transparent **:data-[slot=command-input-wrapper]:h-11 **:data-[slot=command-input-wrapper]:border-gecko-shade **:data-[slot=command-input-wrapper]:bg-gecko-black/60 [&_svg:first-child]:hidden"
>
	<!-- Input field -->
	<Command.Input placeholder="Search assets, categories, venues..." ref={inputEl} autofocus />

	<div class="terminal-header px-3 py-2">
		<div class="flex gap-1.5 overflow-x-auto pb-1">
			{#each scopeOpts as opt (opt.id)}
				{@const FilterIcon = opt.icon}
				<button
					type="button"
					onmousedown={(event) => event.preventDefault()}
					onclick={() => setScope(opt.id)}
					class="{chipClass} {scope === opt.id
						? 'terminal-button-primary'
						: 'text-gecko-gray hover:text-gecko-white'}"
				>
					<FilterIcon size={12} strokeWidth={1.9} aria-hidden="true" />
					{opt.label}
				</button>
			{/each}
		</div>
		<div class="mt-1 flex gap-1.5 overflow-x-auto">
			{#each categoryOpts as opt (opt.id)}
				{@const FilterIcon = opt.icon}
				<button
					type="button"
					onmousedown={(event) => event.preventDefault()}
					onclick={() => setCategory(opt.id)}
					class="{chipClass} {category === opt.id
						? 'terminal-button-primary'
						: 'text-gecko-gray/70 hover:text-gecko-white'}"
				>
					<FilterIcon size={12} strokeWidth={1.9} aria-hidden="true" />
					{opt.label}
				</button>
			{/each}
		</div>
	</div>

	<!-- Items list -->
	<Command.List class="max-h-full lg:max-h-80 lg:min-h-80">
		<!-- No items found -->
		<Command.Empty class="text-gecko-gray/50">No results found.</Command.Empty>

		{#if scopeAllows("signals") && signalRows.length > 0}
			<Command.Group heading="SIGNALS" class={groupClass}>
				{#each signalRows as row (`${row.label}:${row.assetId}`)}
					{@const asset = snapshot.assets[row.assetId]}
					{@const meta = asset && (tickers.perps as TickerCfg)[asset.category]?.[row.assetId]?.meta}
					{#if asset && meta}
						<Command.Item
							onSelect={() => onSelect(`/asset/${row.assetId}`)}
							value="{row.label} {meta.name} {row.assetId}"
							class={itemClass}
						>
							<div class="flex items-center" inert>
								<Icon src={meta.icon} alt={meta.name} />
								<div class="ml-2 flex flex-col">
									<h5 class="text-gecko-white">{meta.name}</h5>
									<span class="font-mono text-[10px] text-gecko-gray/60 uppercase">
										{row.label}
									</span>
								</div>
							</div>
							<div class="flex items-center font-mono text-gecko-gray">{row.detail}</div>
						</Command.Item>
					{/if}
				{/each}
			</Command.Group>
		{/if}

		<!-- Iterate asset groups -->
		{#if scopeAllows("assets")}
			{#each Object.entries(tickers.perps as TickerCfg) as [assetCategory, assets] (assetCategory)}
				{#if categoryAllows(assetCategory)}
					<Command.Group heading={assetCategory.toUpperCase()} class={groupClass}>
						<!-- Iterate assets -->
						{#each Object.entries(assets) as [id, { meta }] (id)}
							{@const live = snapshot.assets[id]}

							<Command.Item
								onSelect={() => onSelect(`/asset/${id}`)}
								value="{meta.name} {id} {assetCategory}"
								class={itemClass}
							>
								<div class="flex items-center" inert>
									<Icon src={meta.icon} alt={meta.name} />
									<h5 class="ml-2 text-gecko-white">{meta.name}</h5>

									{#if meta.name.length <= 15}
										<!-- Don't render symbol if overflowing on mobile -->
										<span class="ml-1 text-gecko-gray">({id.toUpperCase()})</span>
									{/if}
									{#if live}
										<span
											class="ml-2 hidden font-mono text-[10px] text-gecko-gray/50 uppercase md:inline"
										>
											{assetCategory} · {live.marketIds.length} venues
										</span>
									{/if}
								</div>

								{#if live}
									<div class="flex items-center [&_span]:w-22 [&_span]:text-right">
										<div>
											<span class="font-mono text-gecko-muted">VOL:</span>
											<Numeric
												value={live.volume}
												currency="USD"
												format="currency"
												class="text-white"
											/>
										</div>
										<Numeric
											value={live.volumeChange * 100}
											format="numeric"
											class="ml-1"
											change
											percentage
										/>
									</div>
								{/if}
							</Command.Item>
						{/each}
					</Command.Group>
				{/if}
			{/each}
		{/if}

		<!-- Iterate markets -->
		{#if scopeAllows("markets") && marketRows.length > 0}
			<Command.Group heading="MARKETS" class={groupClass}>
				{#each marketRows as [marketKey, market] (marketKey)}
					{@const assetMeta = MARKET_TO_ASSET.get(marketKey)}
					{@const exchange = (exchanges as ExchangeCfg)[`${market.venue}:${market.namespace}`]}
					{#if assetMeta && exchange}
						<Command.Item
							onSelect={() =>
								onExternalSelect(marketToURL(market.venue, market.namespace, market.ticker))}
							value="{assetMeta.name} {marketKey} {exchange.name} {market.ticker}"
							class={itemClass}
						>
							<div class="flex items-center" inert>
								<Icon src={exchange.icon} alt={exchange.name} nested />
								<div class="ml-2 flex flex-col">
									<h5 class="text-gecko-white">{assetMeta.name}</h5>
									<span class="font-mono text-[10px] text-gecko-gray/60 uppercase">
										{exchange.name} · {market.ticker}
									</span>
								</div>
							</div>

							<div class="flex items-center [&_span]:w-22 [&_span]:text-right">
								<div>
									<span class="font-mono text-gecko-muted">VOL:</span>
									<Numeric
										value={market.volume}
										currency="USD"
										format="currency"
										class="text-white"
									/>
								</div>
							</div>
						</Command.Item>
					{/if}
				{/each}
			</Command.Group>
		{/if}

		<!-- Iterate venues -->
		{#if scopeAllows("venues")}
			<Command.Group heading="VENUES" class={groupClass}>
				{#each Object.entries(exchanges as ExchangeCfg) as [id, meta] (id)}
					{@const [venue, namespace] = id.split(":")}

					<Command.Item
						onSelect={() => onSelect(`/venue/${venue}${namespace && `/dex/${namespace}`}`)}
						value="{meta.name} {id}"
						class={itemClass}
					>
						<div class="flex items-center" inert>
							<Icon src={meta.icon} alt={meta.name} nested />
							<h5 class="ml-2 text-gecko-white">{meta.name}</h5>
						</div>

						<div class="flex items-center">
							<span class="ml-1 font-mono text-gecko-gray uppercase"
								>{namespace ? `${venue}:${namespace}` : venue}</span
							>
						</div>
					</Command.Item>
				{/each}
			</Command.Group>
		{/if}
	</Command.List>
</Command.Root>
