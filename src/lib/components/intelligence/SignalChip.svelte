<script lang="ts">
	import type { Signal } from "$lib/intelligence";
	import { formatSignalValue, signalShortLabel } from "$lib/intelligence";

	let { signal }: { signal: Signal } = $props();

	const palette = {
		watch: "border-gecko-shade bg-gecko-shade/40 text-gecko-gray",
		interesting: "border-cyan-400/30 bg-cyan-400/8 text-cyan-200",
		actionable: "border-emerald-400/35 bg-emerald-400/10 text-emerald-300",
		risky: "border-amber-400/40 bg-amber-400/10 text-amber-300"
	} as const;
</script>

<span
	class="inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-[9px] tracking-wide uppercase {palette[
		signal.severity
	]}"
	title={signal.label}
>
	<span>{signalShortLabel(signal.kind)}</span>
	{#if formatSignalValue(signal)}
		<span class="opacity-70">{formatSignalValue(signal)}</span>
	{/if}
</span>
