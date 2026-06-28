<script lang="ts">
	import type { Signal } from "$lib/intelligence";
	import { formatSignalValue, signalShortLabel } from "$lib/intelligence";

	let { signal }: { signal: Signal } = $props();

	const palette = {
		info: "border-gecko-shade bg-gecko-shade/40 text-gecko-gray",
		watch: "border-amber-500/40 bg-amber-500/10 text-amber-300",
		alert: "border-red-500/40 bg-red-500/10 text-red-300"
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
