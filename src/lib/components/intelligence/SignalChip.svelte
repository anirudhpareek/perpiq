<script lang="ts">
	import type { Signal } from "$lib/intelligence";

	let { signal }: { signal: Signal } = $props();

	const palette = {
		info: "border-gecko-shade bg-gecko-shade/40 text-gecko-gray",
		watch: "border-amber-500/40 bg-amber-500/10 text-amber-300",
		alert: "border-red-500/40 bg-red-500/10 text-red-300"
	} as const;
</script>

<span
	class="inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide {palette[
		signal.severity
	]}"
	title={signal.label}
>
	<span>{signal.kind.replace(/_/g, " ")}</span>
	<span class="opacity-75">{signal.label}</span>
</span>
