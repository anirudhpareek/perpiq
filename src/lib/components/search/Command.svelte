<script lang="ts">
	import { tick } from "svelte";
	import { page } from "$app/state";
	import { goto } from "$app/navigation";
	import Icon from "$components/Icon.svelte";
	import * as Command from "$shadcn/command";
	import tickers from "$config/tickers.json";
	import exchanges from "$config/exchanges.json";
	import Numeric from "$components/Numeric.svelte";
	import { MARKET_TO_ASSET, type DiffedSnapshot } from "$lib/transform";
	import { marketToURL } from "$lib/utils";
	import type { ExchangeCfg, TickerCfg } from "$lib/types";
	import { buildHomepageIntelligence } from "$lib/intelligence";

	// Snapshot via global page state
	const snapshot = $derived(page.data.snapshot as DiffedSnapshot);
	const intel = $derived(buildHomepageIntelligence(snapshot));

	// Collect menu close fn
	let { close }: { close: () => void } = $props();

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
		"p-0 **:data-command-group-heading:border-b **:data-command-group-heading:border-b-gecko-shade **:data-command-group-heading:bg-gecko-black **:data-command-group-heading:px-3";
	const itemClass =
		"flex h-10 cursor-pointer flex-row justify-between rounded-none border-b border-b-gecko-shade px-3 text-xs font-light aria-selected:bg-gecko-black-hover";

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
		].slice(0, 8)
	);

	const marketRows = $derived(
		Object.entries(snapshot.markets)
			.sort(([, a], [, b]) => b.volume - a.volume)
			.slice(0, 12)
	);
</script>

<Command.Root
	class="flex flex-col rounded-none **:data-[slot=command-input-wrapper]:h-10 **:data-[slot=command-input-wrapper]:border-gecko-shade [&_svg:first-child]:hidden"
>
	<!-- Input field -->
	<Command.Input placeholder="Search assets, categories, venues..." ref={inputEl} autofocus />

	<!-- Items list -->
	<Command.List class="max-h-full lg:max-h-80 lg:min-h-80">
		<!-- No items found -->
		<Command.Empty class="text-gecko-gray/50">No results found.</Command.Empty>

		{#if signalRows.length > 0}
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
		{#each Object.entries(tickers.perps as TickerCfg) as [category, assets] (category)}
			<Command.Group heading={category.toUpperCase()} class={groupClass}>
				<!-- Iterate assets -->
				{#each Object.entries(assets) as [id, { meta }] (id)}
					{@const live = snapshot.assets[id]}

					<Command.Item
						onSelect={() => onSelect(`/asset/${id}`)}
						value="{meta.name} {id} {category}"
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
									{category} · {live.marketIds.length} venues
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
		{/each}

		<!-- Iterate markets -->
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

		<!-- Iterate venues -->
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
	</Command.List>
</Command.Root>
