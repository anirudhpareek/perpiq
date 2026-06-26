<script lang="ts">
	import type { Snippet } from "svelte";
	import {
		Activity,
		BadgeDollarSign,
		ChartCandlestick,
		CircleDollarSign,
		Gem,
		Globe2,
		LineChart,
		Sparkles
	} from "@lucide/svelte";

	export type Category =
		| "all"
		| "stocks"
		| "indices"
		| "commodities"
		| "fx"
		| "pre-ipo"
		| "new"
		| "divergences";

	let {
		value = $bindable("all"),
		children
	}: {
		value: Category;
		children?: Snippet;
	} = $props();

	const opts: { id: Category; label: string; icon: typeof Activity }[] = [
		{ id: "all", label: "All", icon: Activity },
		{ id: "stocks", label: "Stocks", icon: BadgeDollarSign },
		{ id: "indices", label: "Indices", icon: LineChart },
		{ id: "commodities", label: "Commodities", icon: Gem },
		{ id: "fx", label: "FX", icon: Globe2 },
		{ id: "pre-ipo", label: "Pre-IPO", icon: CircleDollarSign },
		{ id: "new", label: "New markets", icon: Sparkles },
		{ id: "divergences", label: "Divergences", icon: ChartCandlestick }
	];
</script>

<div
	class="flex flex-wrap items-center gap-2 border-b border-b-gecko-shade bg-gecko-black px-4 py-3 md:px-8"
>
	<div class="flex min-w-0 flex-wrap items-center gap-1.5">
		{#each opts as opt (opt.id)}
			{@const FilterIcon = opt.icon}
			<button
				type="button"
				onclick={() => (value = opt.id)}
				class="press inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[11px] tracking-wide uppercase {value ===
				opt.id
					? 'border-gecko-gray bg-gecko-shade text-gecko-white'
					: 'border-gecko-shade/80 bg-transparent text-gecko-gray hover:border-gecko-gray/40 hover:text-gecko-white'}"
			>
				<FilterIcon
					size={13}
					strokeWidth={1.9}
					class={value === opt.id ? "text-gecko-white" : "text-gecko-gray/65"}
					aria-hidden="true"
				/>
				{opt.label}
			</button>
		{/each}
	</div>

	{#if children}
		<div class="ml-auto flex min-w-fit items-center">
			{@render children()}
		</div>
	{/if}
</div>
