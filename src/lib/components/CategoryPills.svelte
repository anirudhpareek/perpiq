<script lang="ts">
	export type Category = "all" | "stocks" | "indices" | "commodities" | "fx" | "pre-ipo";

	let { value = $bindable("all") }: { value: Category } = $props();

	const opts: { id: Category; label: string }[] = [
		{ id: "all", label: "All" },
		{ id: "stocks", label: "Stocks" },
		{ id: "indices", label: "Indices" },
		{ id: "commodities", label: "Commodities" },
		{ id: "fx", label: "FX" },
		{ id: "pre-ipo", label: "Pre-IPO" }
	];
</script>

<div class="flex flex-wrap items-center gap-1.5 border-b border-b-gecko-shade bg-gecko-black px-4 py-3 md:px-8">
	{#each opts as opt}
		<button
			type="button"
			onclick={() => (value = opt.id)}
			class="rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-wide transition {value === opt.id
				? 'border-gecko-gray bg-gecko-shade text-gecko-white'
				: 'border-gecko-shade/80 bg-transparent text-gecko-gray hover:border-gecko-gray/40 hover:text-gecko-white'}"
		>
			{opt.label}
		</button>
	{/each}
</div>
