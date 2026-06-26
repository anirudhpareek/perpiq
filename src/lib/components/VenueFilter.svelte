<script lang="ts">
	import { Check, ChevronDown, Search } from "@lucide/svelte";
	import Icon from "$components/Icon.svelte";
	import exchanges from "$config/exchanges.json";
	import type { ExchangeCfg } from "$lib/types";
	import type { DiffedSnapshot } from "$lib/transform";

	type VenueOption = {
		id: string;
		label: string;
		icon: string[];
		markets: number;
		assets: number;
	};

	let {
		snapshot,
		value = $bindable("all")
	}: {
		snapshot: DiffedSnapshot;
		value: string;
	} = $props();

	let open = $state(false);
	let query = $state("");

	const exchangeCfg = exchanges as ExchangeCfg;

	function exchangeMeta(venue: string) {
		const direct = exchangeCfg[`${venue}:`];
		if (direct) return direct;

		const namespaced = Object.entries(exchangeCfg).find(([id]) => id.startsWith(`${venue}:`))?.[1];
		return namespaced ?? { name: venue, icon: [] };
	}

	const venues = $derived.by<VenueOption[]>(() => {
		const assetSets = new Map<string, Set<string>>();

		for (const [assetId, asset] of Object.entries(snapshot.assets)) {
			for (const marketId of asset.marketIds) {
				const market = snapshot.markets[marketId];
				if (!market) continue;
				const set = assetSets.get(market.venue) ?? new Set<string>();
				set.add(assetId);
				assetSets.set(market.venue, set);
			}
		}

		return snapshot.aggregates.oiByVenue.map(({ venue }) => {
			const meta = exchangeMeta(venue);
			return {
				id: venue,
				label: meta.name,
				icon: meta.icon,
				markets: snapshot.index.marketsByVenue[venue]?.length ?? 0,
				assets: assetSets.get(venue)?.size ?? 0
			};
		});
	});

	const selected = $derived(venues.find((venue) => venue.id === value));
	const filteredVenues = $derived(
		venues.filter((venue) => {
			const q = query.trim().toLowerCase();
			if (!q) return true;
			return venue.label.toLowerCase().includes(q) || venue.id.toLowerCase().includes(q);
		})
	);

	function selectVenue(id: string) {
		value = id;
		query = "";
		open = false;
	}
</script>

<div class="relative shrink-0">
	<button
		type="button"
		aria-haspopup="listbox"
		aria-expanded={open}
		onclick={() => (open = !open)}
		class="press inline-flex h-9 items-center gap-2 rounded-md border border-gecko-shade/90 bg-gecko-shade/25 px-2.5 text-left text-xs text-gecko-white transition-colors duration-150 ease-out hover:border-gecko-gray/45 hover:bg-gecko-shade/45"
		title={value === "all"
			? "Showing assets across all tracked venues"
			: `Showing assets listed on ${selected?.label ?? value}`}
	>
		{#if selected?.icon.length}
			<Icon src={selected.icon} alt={selected.label} nested />
		{:else}
			<div class="grid size-5 grid-cols-2 gap-0.5" aria-hidden="true">
				{#each venues.slice(0, 4) as venue (venue.id)}
					{#if venue.icon[0]}
						<img src={venue.icon.at(-1)} alt="" class="size-2 rounded-full" loading="lazy" />
					{/if}
				{/each}
			</div>
		{/if}
		<span class="hidden max-w-32 truncate font-medium md:inline">
			{selected?.label ?? "All venues"}
		</span>
		<ChevronDown
			size={15}
			strokeWidth={1.8}
			class="text-gecko-gray transition-transform duration-150 ease-out {open ? 'rotate-180' : ''}"
			aria-hidden="true"
		/>
	</button>

	{#if open}
		<div
			class="absolute right-0 z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-gecko-shade bg-[#101014] p-2 shadow-2xl shadow-black/40"
		>
			<label
				class="flex h-10 items-center gap-2 rounded-md bg-gecko-shade/55 px-3 text-sm text-gecko-gray focus-within:text-gecko-white"
			>
				<Search size={17} strokeWidth={1.8} aria-hidden="true" />
				<input
					bind:value={query}
					placeholder="Search venues"
					class="min-w-0 flex-1 bg-transparent text-sm text-gecko-white placeholder:text-gecko-gray/75 focus:outline-none"
				/>
			</label>

			<div class="mt-2 max-h-80 overflow-y-auto" role="listbox" aria-label="Filter by venue">
				<button
					type="button"
					role="option"
					aria-selected={value === "all"}
					onclick={() => selectVenue("all")}
					class="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-sm text-gecko-white transition-colors duration-150 ease-out hover:bg-gecko-shade/50"
				>
					<div class="grid size-7 shrink-0 grid-cols-2 gap-0.5" aria-hidden="true">
						{#each venues.slice(0, 4) as venue (venue.id)}
							{#if venue.icon[0]}
								<img src={venue.icon.at(-1)} alt="" class="size-3 rounded-full" loading="lazy" />
							{/if}
						{/each}
					</div>
					<div class="min-w-0 flex-1">
						<div class="font-medium">All venues</div>
						<div class="font-mono text-[10px] text-gecko-gray/65 uppercase">
							{venues.length} venues
						</div>
					</div>
					{#if value === "all"}
						<Check size={16} strokeWidth={2} class="text-gecko-white" aria-hidden="true" />
					{/if}
				</button>

				{#each filteredVenues as venue (venue.id)}
					<button
						type="button"
						role="option"
						aria-selected={value === venue.id}
						onclick={() => selectVenue(venue.id)}
						class="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-sm text-gecko-white transition-colors duration-150 ease-out hover:bg-gecko-shade/50"
					>
						<div class="flex size-7 shrink-0 items-center justify-center">
							<Icon src={venue.icon} alt={venue.label} nested />
						</div>
						<div class="min-w-0 flex-1">
							<div class="truncate font-medium">{venue.label}</div>
							<div class="font-mono text-[10px] text-gecko-gray/65 uppercase">
								{venue.assets} assets · {venue.markets} markets
							</div>
						</div>
						{#if value === venue.id}
							<Check size={16} strokeWidth={2} class="text-gecko-white" aria-hidden="true" />
						{/if}
					</button>
				{/each}

				{#if filteredVenues.length === 0}
					<div class="px-3 py-5 text-center text-xs text-gecko-gray/65">No venues found</div>
				{/if}
			</div>
		</div>
	{/if}
</div>
