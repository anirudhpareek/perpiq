<script lang="ts">
	import { page } from "$app/state";
	import type { PageProps } from "./$types";
	import Meta from "$components/Meta.svelte";
	import Grid from "$components/Grid.svelte";
	import Icon from "$components/Icon.svelte";
	import Card from "$components/Card.svelte";
	import metaConfig from "$config/meta.json";
	import exchanges from "$config/exchanges.json";
	import type { Meta as MetaT } from "$lib/types";
	import Numeric from "$components/Numeric.svelte";
	import { MARKET_TO_ASSET } from "$lib/transform";
	import { buildVenueContext } from "$lib/intelligence";
	import type { WithContext, Organization } from "schema-dts";
	import MarketTable from "$components/table/MarketTable.svelte";

	let { data }: PageProps = $props();

	// Collect exchange meta
	const meta: MetaT = $derived(
		exchanges[`${data.venue}:${data.dex ?? ""}` as keyof typeof exchanges]
	);

	// Filter markets by optimized ID search
	const snapshot = $derived(data.snapshot);
	const marketIds = $derived.by(() => {
		const ids = snapshot.index.marketsByVenue[data.venue] ?? [];
		return data.dex ? ids.filter((id) => snapshot.markets[id].namespace === data.dex) : ids;
	});
	const context = $derived(buildVenueContext(snapshot, data.venue, data.dex ?? undefined));

	// Aggregate statistics
	const stats = $derived.by(() => {
		let count = 0,
			vol = 0,
			oi = 0,
			volX = 0,
			oiX = 0;

		for (const id of marketIds) {
			const market = snapshot.markets[id];

			// Aggregate statistics
			count += 1;
			vol += market.volume;
			oi += market.oi;
			volX += market.volume * market.volumeChange;
			oiX += market.oi * market.oiChange;
		}

		return { count, vol, oi, volChg: vol ? volX / vol : 0, oiChg: oi ? oiX / oi : 0 };
	});

	// Structured schema
	// @dev: Doesn't have to be derived given pageload properties but added
	// 			 for page change posterity
	const title = $derived(`prepiq | ${meta.name}`);
	const schema: WithContext<Organization> = $derived({
		"@context": "https://schema.org",
		"@type": "Organization",
		name: meta.name,
		url: metaConfig.url + page.url.pathname,
		makesOffer: {
			"@type": "AggregateOffer",
			priceCurrency: "USD",
			offerCount: stats.count,
			description: `${meta.name} offers ${stats.count} real-world asset markets`
		},
		parentOrganization: {
			"@type": "Organization",
			name: metaConfig.title,
			url: metaConfig.url,
			logo: metaConfig.favicon
		}
	});

	function marketName(marketKey: string): string {
		const meta = MARKET_TO_ASSET.get(marketKey);
		return meta?.name ?? marketKey.toUpperCase();
	}
</script>

<Meta {title} {schema} />

<!-- Asset header -->
<div>
	<Grid bottom={false}>
		<div class="flex flex-1 flex-col px-4 py-6">
			<!-- Icon, name -->
			<div class="flex flex-row items-center gap-2">
				<Icon
					src={meta.icon}
					alt={meta.name}
					class="{meta.icon.length > 1 ? 'size-10' : ''} [&_img]:first:size-7 [&_img]:last:size-6"
					nested
				/>
				<h1 class="text-lg text-gecko-white md:text-xl">{meta.name}</h1>
			</div>

			<!-- Description -->
			<p class="mt-3 text-xs text-gecko-gray/75 md:text-sm">{meta.description}</p>
		</div>
	</Grid>
</div>

<!-- Aggregate statistics -->
<div>
	<Grid>
		<Card title="Market Count">
			<div class="flex gap-2 p-4 text-lg">
				<Numeric value={stats.count} class="text-gecko-white" />
			</div>
		</Card>

		<Card title="Aggregate Volume">
			<div class="flex gap-2 p-4 text-lg">
				<Numeric value={stats.vol} format="currency" currency="USD" class="text-gecko-white" />
				<Numeric value={stats.volChg * 100} format="numeric" change percentage />
			</div>
		</Card>

		<Card title="Aggregate Open Interest">
			<div class="flex gap-2 p-4 text-lg">
				<Numeric value={stats.oi} format="currency" currency="USD" class="text-gecko-white" />
				<Numeric value={stats.oiChg * 100} format="numeric" change percentage />
			</div>
		</Card>
	</Grid>
</div>

<!-- Venue context -->
<div>
	<Grid bottom={false}>
		<Card title="Venue context">
			<div class="flex flex-1 flex-col gap-3 p-4 text-xs">
				<div class="grid grid-cols-2 gap-3">
					<div>
						<div class="font-mono text-[10px] tracking-wide text-gecko-gray/60 uppercase">
							OI share
						</div>
						<div class="mt-1 flex items-baseline gap-2">
							<Numeric
								value={context.oiShare * 100}
								format="numeric"
								percentage
								class="text-gecko-white"
							/>
							<Numeric value={context.oiShareChange * 100} format="numeric" change percentage />
						</div>
					</div>
					<div>
						<div class="font-mono text-[10px] tracking-wide text-gecko-gray/60 uppercase">
							Active markets
						</div>
						<div class="mt-1 text-gecko-white">{context.marketCount}</div>
					</div>
				</div>

				<div>
					<div class="mb-2 font-mono text-[10px] tracking-wide text-gecko-gray/60 uppercase">
						Dominant classes
					</div>
					<div class="flex flex-col gap-1.5">
						{#each context.dominantClasses as item (item.category)}
							<div class="grid grid-cols-[92px_1fr_48px] items-center gap-2">
								<span class="font-mono text-gecko-gray uppercase">{item.category}</span>
								<div class="h-1.5 overflow-hidden rounded-sm bg-gecko-shade/60">
									<div
										class="h-full bg-gecko-white/70"
										style="width: {(item.share * 100).toFixed(1)}%"
									></div>
								</div>
								<span class="text-right font-mono text-gecko-white">
									{(item.share * 100).toFixed(0)}%
								</span>
							</div>
						{/each}
					</div>
				</div>
			</div>
		</Card>

		<Card title="Top markets">
			<div class="grid flex-1 grid-cols-1 text-xs lg:grid-cols-2">
				<div
					class="border-b border-b-gecko-shade lg:border-r lg:border-b-0 lg:border-r-gecko-shade"
				>
					<div
						class="border-b border-b-gecko-shade px-4 py-2 font-mono text-[10px] tracking-wide text-gecko-gray/60 uppercase"
					>
						By volume
					</div>
					{#each context.topByVolume.slice(0, 4) as row (row.marketKey)}
						<a
							href="/asset/{row.assetId}"
							class="flex items-center justify-between border-b border-b-gecko-shade/60 px-4 py-2 last:border-b-0 hover:bg-gecko-black-hover"
						>
							<span class="text-gecko-white">{marketName(row.marketKey)}</span>
							<Numeric value={row.value} format="currency" currency="USD" class="text-gecko-gray" />
						</a>
					{/each}
				</div>
				<div>
					<div
						class="border-b border-b-gecko-shade px-4 py-2 font-mono text-[10px] tracking-wide text-gecko-gray/60 uppercase"
					>
						By OI
					</div>
					{#each context.topByOi.slice(0, 4) as row (row.marketKey)}
						<a
							href="/asset/{row.assetId}"
							class="flex items-center justify-between border-b border-b-gecko-shade/60 px-4 py-2 last:border-b-0 hover:bg-gecko-black-hover"
						>
							<span class="text-gecko-white">{marketName(row.marketKey)}</span>
							<Numeric value={row.value} format="currency" currency="USD" class="text-gecko-gray" />
						</a>
					{/each}
				</div>
			</div>
		</Card>

		<Card title="Venue signals">
			<div class="flex flex-1 flex-col text-xs">
				{#if context.newMarkets.length > 0}
					<div
						class="border-b border-b-gecko-shade px-4 py-2 font-mono text-[10px] tracking-wide text-gecko-gray/60 uppercase"
					>
						New listings
					</div>
					{#each context.newMarkets as row (row.marketKey)}
						<a
							href="/asset/{row.assetId}"
							class="flex items-center justify-between border-b border-b-gecko-shade/60 px-4 py-2 hover:bg-gecko-black-hover"
						>
							<span class="text-gecko-white">{marketName(row.marketKey)}</span>
							<Numeric
								value={row.volume}
								format="currency"
								currency="USD"
								class="text-gecko-gray"
							/>
						</a>
					{/each}
				{:else}
					<div
						class="border-b border-b-gecko-shade px-4 py-2 font-mono text-[10px] tracking-wide text-gecko-gray/60 uppercase"
					>
						Biggest movers
					</div>
					{#each context.biggestMovers.slice(0, 5) as row (row.marketKey)}
						<a
							href="/asset/{row.assetId}"
							class="flex items-center justify-between border-b border-b-gecko-shade/60 px-4 py-2 last:border-b-0 hover:bg-gecko-black-hover"
						>
							<span class="text-gecko-white">{marketName(row.marketKey)}</span>
							<Numeric value={row.value * 100} format="numeric" change percentage />
						</a>
					{/each}
				{/if}
			</div>
		</Card>
	</Grid>
</div>

<!-- Market table -->
<div class="flex flex-1 flex-col md:border-t md:border-t-gecko-shade">
	<MarketTable
		filter={{ venue: data.venue, ...(data.dex ? { namespace: data.dex } : {}) }}
		{snapshot}
	/>
</div>
