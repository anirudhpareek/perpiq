<script lang="ts">
	import { page } from "$app/state";
	import Numeric from "$components/Numeric.svelte";

	let { class: extraClass }: { class?: string } = $props();

	const snapshot = $derived(page.data.snapshot);
	const assets = $derived(Object.keys(snapshot.assets).length);
	const markets = $derived(Object.keys(snapshot.markets).length);
	const ven = $derived(snapshot.aggregates.oiByVenue.slice(0, 2));

	type Stat = {
		label: string;
		value: number;
		format: "number" | "currency";
		change?: number;
	};

	const stats = $derived<Stat[]>([
		{ label: "Assets", value: assets, format: "number" },
		{ label: "Markets", value: markets, format: "number" },
		{
			label: "OI",
			value: snapshot.aggregates.oi,
			format: "currency",
			change: snapshot.aggregates.oiChange * 100
		},
		{
			label: "Volume 24h",
			value: snapshot.aggregates.volume,
			format: "currency",
			change: snapshot.aggregates.volumeChange * 100
		}
	]);

	function venueName(v: string) {
		return v.at(0)?.toUpperCase() + v.slice(1);
	}
</script>

<section class="border-b border-gecko-shade {extraClass}">
	<div
		class="mx-auto flex max-w-7xl flex-wrap items-stretch gap-x-8 gap-y-3 px-4 py-3 text-xs lg:px-8 lg:py-4"
	>
		{#each stats as s}
			<div class="flex flex-col gap-0.5">
				<span class="text-[10px] font-medium uppercase tracking-wide text-gecko-gray/70">
					{s.label}
				</span>
				<div class="flex items-baseline gap-1.5">
					<Numeric
						value={s.value}
						format={s.format === "currency" ? "currency" : "numeric"}
						currency="USD"
						class="text-sm font-medium text-gecko-white"
					/>
					{#if s.change !== undefined}
						<Numeric value={s.change} format="numeric" change percentage />
					{/if}
				</div>
			</div>
		{/each}

		{#if ven.length > 0}
			<div class="flex flex-col gap-0.5">
				<span class="text-[10px] font-medium uppercase tracking-wide text-gecko-gray/70">
					OI Dominance
				</span>
				<div class="flex items-baseline gap-2 text-sm">
					{#each ven as { venue, oiShare }}
						<span class="font-medium text-gecko-white">
							{venueName(venue)}
							<Numeric
								value={oiShare * 100}
								format="numeric"
								percentage
								class="ml-0.5 text-gecko-gray!"
							/>
						</span>
					{/each}
				</div>
			</div>
		{/if}

		<div class="ml-auto hidden self-center lg:block">
			<a
				href="https://github.com/anirudhpareek/perpiq"
				target="_blank"
				rel="noopener noreferrer"
				class="font-mono text-[10px] uppercase tracking-wide text-gecko-gray/60 hover:text-gecko-white"
				>View on GitHub →</a
			>
		</div>
	</div>
</section>
