<script lang="ts">
	import type { Snippet } from "svelte";

	const {
		children,
		title,
		class: extraClass
	}: { class?: string; title: string; children: Snippet } = $props();
</script>

<div class="terminal-panel flex flex-1 flex-col overflow-hidden {extraClass}">
	<!-- Card header -->
	<div class="terminal-header flex h-10 items-center px-4 text-sm font-medium text-gecko-white">
		<h3>{title}</h3>
	</div>

	<!-- Card body -->
	<div class="flex flex-1 flex-col">
		{@render children()}
	</div>
</div>
