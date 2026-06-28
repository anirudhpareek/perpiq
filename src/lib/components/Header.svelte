<script lang="ts">
	import { page } from "$app/state";
	import SearchBar from "./search/Bar.svelte";
	let { class: extraClass }: { class?: string } = $props();

	const nav: { title: string; path: string }[] = [
		{ title: "Markets", path: "/" },
		{ title: "Opportunities", path: "/opportunities" },
		{ title: "Venues", path: "/venues" },
		{ title: "All markets", path: "/markets" }
	];
</script>

<header
	class="sticky top-0 z-30 order-2 flex h-14 flex-row items-center justify-center border-b border-b-gecko-shade lg:h-16 {extraClass} bg-black/80 backdrop-blur"
>
	<div class="flex h-full w-full max-w-7xl items-center gap-4">
		<!-- Logo (left) -->
		<a href="/" class="shrink-0">
			<img
				src="/assets/brand/logo.svg"
				alt="prepiq logo"
				class="no-outline hidden lg:inline"
				height="32px"
				width="160px"
			/>
			<img
				src="/assets/brand/logo.svg"
				alt="prepiq logo"
				class="no-outline lg:hidden"
				height="24px"
				width="120px"
			/>
		</a>

		<!-- Nav -->
		<nav class="hidden lg:block">
			<ul class="flex gap-1 text-sm font-medium [&_a]:hover:text-gecko-white">
				{#each nav as { title, path }}
					{@const isActive = page.url.pathname === path}
					<li>
						<a
							href={path}
							class="rounded-full px-3 py-1.5 transition {isActive
								? 'bg-gecko-shade/60 text-gecko-white'
								: 'text-gecko-gray hover:bg-gecko-shade/30'}"
						>
							{title}
						</a>
					</li>
				{/each}
			</ul>
		</nav>

		<!-- Search -->
		<div class="ml-auto flex shrink-0 justify-end">
			<SearchBar />
		</div>
	</div>
</header>
