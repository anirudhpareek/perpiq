<script lang="ts">
	import { onMount } from "svelte";
	import * as Dialog from "$shadcn/dialog";
	import * as Drawer from "$shadcn/drawer";
	import { MediaQuery } from "svelte/reactivity";
	import Command from "$components/search/Command.svelte";
	import { Search } from "@lucide/svelte";

	// Kick to Vaul on small displays
	const isDesktop = new MediaQuery("(min-width: 1024px)");

	// Dialog/drawer open state
	let open: boolean = $state(false);

	// Proxy input element to force-cpature focus
	let proxyInput: HTMLInputElement;

	onMount(() => {
		// Handle keyboard shortcut
		function onKeydown(e: KeyboardEvent) {
			if ((e.metaKey || e.ctrlKey) && e.key === "k") {
				e.preventDefault();
				open = !open;
			}
		}

		// Track key event
		document.addEventListener("keydown", onKeydown);
		return () => document.removeEventListener("keydown", onKeydown);
	});

	$effect(() => {
		if (!open) return;

		// Force lock scroll on dialog/drawer open
		window.scrollTo(0, 0);
		const lock = () => window.scrollTo(0, 0);
		window.addEventListener("scroll", lock);

		return () => {
			window.removeEventListener("scroll", lock);

			// Force dismiss iOS keyboard
			const active = document.activeElement as HTMLElement | null;
			active?.setAttribute("readonly", "readonly");
			active?.blur();
			setTimeout(() => active?.removeAttribute("readonly"), 100);
		};
	});

	// Close modal fn
	const close = () => (open = false);
</script>

<!-- Hidden proxy input to capture iOS keyboard -->
<input
	bind:this={proxyInput}
	class="pointer-events-none fixed -top-20 left-0 opacity-0"
	tabindex="-1"
	aria-hidden="true"
/>

<!-- Search trigger button -->
<button
	onclick={() => {
		// Synchronously capture focus to "reserve" keyboard (esp. on iOS)
		proxyInput?.focus();
		// Then, toggle opening drawer/dialog
		open = true;
	}}
	aria-label="Search"
	class="terminal-button group flex h-9 w-9 cursor-pointer items-center justify-center gap-2 px-3.5 text-sm text-gecko-gray lg:h-10 lg:w-[420px]"
>
	<!-- Search icon -->
	<Search size={15} strokeWidth={1.8} class="shrink-0 opacity-55" aria-hidden="true" />

	<!-- Search text -->
	<span class="hidden flex-1 text-left text-gecko-gray/80 lg:inline-flex"
		>Search assets, venues, or markets</span
	>

	<kbd
		class="pointer-events-none hidden gap-[1.5px] rounded border border-gecko-shade/80 px-1.5 font-mono text-[11px] text-gecko-gray/60 group-hover:border-gecko-gray/40 lg:inline-flex"
	>
		<span class="translate-y-[0.5px]">⌘</span>
		<span>K</span>
	</kbd>
</button>

{#if isDesktop.current}
	<!-- Desktop: Dialog + Command -->
	<Dialog.Root bind:open>
		<Dialog.Content class="terminal-panel border-0 p-0 **:data-dialog-close:hidden">
			<Command {close} />
		</Dialog.Content>
	</Dialog.Root>
{:else}
	<!-- Mobile: Drawer + Command -->
	<Drawer.Root bind:open>
		<Drawer.Content
			class="top-12 mt-0! h-[calc(100%-48px)]! max-h-[calc(100%-48px)]! rounded-none! border-gecko-shade bg-gecko-black [&>div:first-child]:hidden"
		>
			<Command {close} />
		</Drawer.Content>
	</Drawer.Root>
{/if}
