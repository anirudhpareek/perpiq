<script lang="ts">
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import { onMount, untrack } from "svelte";
	import { ArrowUpRight, Bell, Check, Filter, Radar, Search, ShieldAlert } from "@lucide/svelte";
	import type { PageProps } from "./$types";
	import Meta from "$components/Meta.svelte";
	import Icon from "$components/Icon.svelte";
	import CategoryPills, { type Category } from "$components/CategoryPills.svelte";
	import VenueFilter from "$components/VenueFilter.svelte";
	import tickers from "$config/tickers.json";
	import exchanges from "$config/exchanges.json";
	import type { ExchangeCfg, TickerCfg } from "$lib/types";
	import { parseCategory, parseVenue, updateFilterParams } from "$lib/filter-url";
	import { buildOpportunities, type Opportunity, type OpportunityKind } from "$lib/intelligence";
	import { marketExecutionUrl } from "$lib/execution/metadata";
	import { truncateCurrency } from "$lib/number-format";

	let { data }: PageProps = $props();
	const snapshot = $derived(data.snapshot);
	const title = "prepiq | Opportunities";

	const kinds: { id: OpportunityKind | "all"; label: string }[] = [
		{ id: "all", label: "All" },
		{ id: "funding_spread", label: "Funding spreads" },
		{ id: "price_range", label: "Dislocations" },
		{ id: "stale_market", label: "Stale venues" },
		{ id: "liquidity_migration", label: "Venue shifts" },
		{ id: "new_listing", label: "New listings" },
		{ id: "high_concentration", label: "Concentration" },
		{ id: "volume_oi_shock", label: "Flow shocks" }
	];

	let category = $state<Category>(parseCategory(page.url.searchParams.get("category")));
	let venue = $state(parseVenue(page.url.searchParams.get("venue")));
	let kind = $state<OpportunityKind | "all">(parseKind(page.url.searchParams.get("kind")));
	let minVolume = $state(parseNumber(page.url.searchParams.get("minVolume")));
	let minBps = $state(parseNumber(page.url.searchParams.get("minBps")));
	let watchlist = $state<Set<string>>(new Set());

	const opportunities = $derived(
		buildOpportunities(snapshot, {
			category,
			venue,
			kind,
			minVolume,
			minBps
		})
	);
	const stats = $derived.by(() => {
		const actionable = opportunities.filter((row) => row.severity === "actionable").length;
		const risky = opportunities.filter((row) => row.severity === "risky").length;
		const dislocations = opportunities.filter((row) => row.kind === "price_range").length;
		const funding = opportunities.filter((row) => row.kind === "funding_spread").length;
		const topBps = opportunities.reduce((max, row) => Math.max(max, row.bps ?? 0), 0);
		return { actionable, risky, dislocations, funding, topBps };
	});

	onMount(() => {
		const ids = Object.keys(localStorage).filter((key) => key.startsWith("perpiq.alert."));
		watchlist = new Set(ids.map((key) => key.replace("perpiq.alert.", "")));
	});

	$effect(() => {
		const nextCategory = parseCategory(page.url.searchParams.get("category"));
		const nextVenue = parseVenue(page.url.searchParams.get("venue"));
		const nextKind = parseKind(page.url.searchParams.get("kind"));
		const nextMinVolume = parseNumber(page.url.searchParams.get("minVolume"));
		const nextMinBps = parseNumber(page.url.searchParams.get("minBps"));
		if (untrack(() => category) !== nextCategory) category = nextCategory;
		if (untrack(() => venue) !== nextVenue) venue = nextVenue;
		if (untrack(() => kind) !== nextKind) kind = nextKind;
		if (untrack(() => minVolume) !== nextMinVolume) minVolume = nextMinVolume;
		if (untrack(() => minBps) !== nextMinBps) minBps = nextMinBps;
	});

	$effect(() => {
		let next = updateFilterParams(page.url, { category, venue });
		const url = new URL(next, page.url.origin);
		if (kind === "all") url.searchParams.delete("kind");
		else url.searchParams.set("kind", kind);
		if (minVolume > 0) url.searchParams.set("minVolume", String(minVolume));
		else url.searchParams.delete("minVolume");
		if (minBps > 0) url.searchParams.set("minBps", String(minBps));
		else url.searchParams.delete("minBps");
		next = `${url.pathname}${url.search}${url.hash}`;
		const current = `${page.url.pathname}${page.url.search}${page.url.hash}`;
		if (next !== current) goto(next, { replaceState: true, noScroll: true, keepFocus: true });
	});

	function parseKind(value: string | null): OpportunityKind | "all" {
		return kinds.some((row) => row.id === value) ? (value as OpportunityKind | "all") : "all";
	}

	function parseNumber(value: string | null): number {
		const parsed = Number(value);
		return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
	}

	function assetMeta(assetId: string) {
		for (const category of Object.values(tickers.perps as TickerCfg)) {
			if (category[assetId]) return category[assetId].meta;
		}
		return null;
	}

	function exchangeMeta(marketKey: string) {
		const market = snapshot.markets[marketKey];
		if (!market) return null;
		return (exchanges as ExchangeCfg)[`${market.venue}:${market.namespace}`] ?? null;
	}

	function routeLabel(row: Opportunity): string {
		switch (row.kind) {
			case "funding_spread":
				return "Funding spread";
			case "price_range":
				return "Dislocation watch";
			case "stale_market":
				return "Stale venue";
			case "liquidity_migration":
				return "Venue shift";
			case "new_listing":
				return "New listing";
			case "high_concentration":
				return "Concentration risk";
			case "volume_oi_shock":
				return "Flow shock";
		}
	}

	function marketLinks(row: Opportunity) {
		return row.marketKeys
			.slice(0, 2)
			.map((marketKey) => {
				const market = snapshot.markets[marketKey];
				if (!market) return null;
				const exchange = exchangeMeta(marketKey);
				const url = marketExecutionUrl(market);
				return {
					marketKey,
					name: exchange?.name ?? market.venue,
					icon: exchange?.icon,
					url
				};
			})
			.filter((row): row is NonNullable<typeof row> => Boolean(row));
	}

	function metric(row: Opportunity): { value: string; label: string } {
		switch (row.kind) {
			case "funding_spread":
				return {
					value: row.fundingApr == null ? "--" : `${(row.fundingApr * 100).toFixed(1)}%`,
					label: "annualized"
				};
			case "price_range":
				return { value: `${(row.bps ?? row.value).toFixed(0)} bps`, label: "venue range" };
			case "high_concentration":
				return { value: `${(row.value * 100).toFixed(1)}%`, label: "top venue" };
			case "liquidity_migration":
				return {
					value: `${row.value > 0 ? "+" : ""}${(row.value * 100).toFixed(1)}%`,
					label: "OI share"
				};
			case "volume_oi_shock":
				return {
					value: `${row.value > 0 ? "+" : ""}${(row.value * 100).toFixed(1)}%`,
					label: "volume move"
				};
			case "stale_market":
				return { value: truncateCurrency(row.oi), label: "stranded OI" };
			case "new_listing":
				return { value: "New", label: "venue" };
		}
	}

	function fundingLabel(row: Opportunity): string {
		if (row.kind === "funding_spread" && row.fundingApr != null) {
			return `${(row.fundingApr * 100).toFixed(1)}% APR`;
		}
		return "not collected";
	}

	function confidenceLabel(row: Opportunity): string {
		switch (row.confidence) {
			case "high":
				return "High";
			case "medium":
				return "Medium";
			case "low":
				return "Low";
			case "incomplete":
				return "Incomplete";
		}
	}

	function confidenceClass(row: Opportunity): string {
		switch (row.confidence) {
			case "high":
				return "bg-gecko-green";
			case "medium":
				return "bg-secondary";
			case "low":
				return "bg-gecko-gray";
			case "incomplete":
				return "bg-warning";
		}
	}

	function alertId(row: Opportunity): string {
		return `${row.assetId}.${row.marketKeys[0] ?? "all"}`;
	}

	function isWatched(row: Opportunity): boolean {
		return watchlist.has(alertId(row));
	}

	function toggleAlert(row: Opportunity) {
		const id = alertId(row);
		const key = `perpiq.alert.${id}`;
		const next = new Set(watchlist);
		if (next.has(id)) {
			next.delete(id);
			localStorage.removeItem(key);
		} else {
			next.add(id);
			localStorage.setItem(key, "1");
		}
		watchlist = next;
	}
</script>

<Meta {title} />

<section class="border-b border-b-gecko-shade">
	<div class="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6 lg:px-8">
		<div class="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
			<div class="max-w-3xl">
				<div class="font-mono text-[11px] tracking-wide text-gecko-gray/65 uppercase">
					Arb intelligence
				</div>
				<h1 class="mt-1 text-2xl font-semibold text-gecko-white md:text-3xl">Opportunities</h1>
				<p class="mt-2 text-sm leading-6 text-gecko-gray/78">
					Cross-venue RWA perp dislocations, venue risk, liquidity shifts, and funding hooks. Perpiq
					is alert and deep-link only: no wallet custody, deposits, or routed execution.
				</p>
			</div>
			<div class="terminal-badge px-3 py-2 font-mono text-[11px] text-gecko-gray/80 uppercase">
				{opportunities.length} rows · latest snapshot
			</div>
		</div>

		<div class="terminal-panel grid gap-0 overflow-hidden md:grid-cols-5">
			<div class="px-3 py-3 md:border-r md:border-r-gecko-shade/80">
				<div class="font-mono text-[10px] tracking-wide text-gecko-gray/55 uppercase">
					Actionable
				</div>
				<div class="mt-1 font-mono text-lg text-gecko-white">{stats.actionable}</div>
			</div>
			<div class="terminal-row px-3 py-3 md:border-t-0 md:border-r md:border-r-gecko-shade/80">
				<div class="font-mono text-[10px] tracking-wide text-gecko-gray/55 uppercase">
					Risk flags
				</div>
				<div class="mt-1 font-mono text-lg text-warning">{stats.risky}</div>
			</div>
			<div class="terminal-row px-3 py-3 md:border-t-0 md:border-r md:border-r-gecko-shade/80">
				<div class="font-mono text-[10px] tracking-wide text-gecko-gray/55 uppercase">
					Dislocations
				</div>
				<div class="mt-1 font-mono text-lg text-gecko-white">{stats.dislocations}</div>
			</div>
			<div class="terminal-row px-3 py-3 md:border-t-0 md:border-r md:border-r-gecko-shade/80">
				<div class="font-mono text-[10px] tracking-wide text-gecko-gray/55 uppercase">
					Funding rows
				</div>
				<div class="mt-1 font-mono text-lg text-gecko-gray">{stats.funding}</div>
			</div>
			<div class="terminal-row px-3 py-3 md:border-t-0">
				<div class="font-mono text-[10px] tracking-wide text-gecko-gray/55 uppercase">
					Top range
				</div>
				<div class="mt-1 font-mono text-lg text-gecko-white">{stats.topBps.toFixed(0)} bps</div>
			</div>
		</div>
	</div>
</section>

<CategoryPills bind:value={category}>
	<VenueFilter {snapshot} bind:value={venue} />
</CategoryPills>

<section class="border-b border-b-gecko-shade bg-gecko-black/55">
	<div class="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 lg:px-8">
		<div class="flex flex-wrap items-center gap-2">
			<div
				class="mr-1 inline-flex items-center gap-1.5 font-mono text-[10px] tracking-wide text-gecko-gray/60 uppercase"
			>
				<Filter class="size-3.5" />
				Route
			</div>
			{#each kinds as row (row.id)}
				<button
					type="button"
					onclick={() => (kind = row.id)}
					class="terminal-button h-8 px-3 font-mono text-[11px] tracking-wide uppercase {kind ===
					row.id
						? 'terminal-button-primary'
						: 'text-gecko-gray hover:text-gecko-white'}"
				>
					{row.label}
				</button>
			{/each}
		</div>

		<div class="flex flex-wrap items-center gap-3">
			<label class="terminal-input flex h-9 items-center gap-2 px-2 text-xs text-gecko-gray/75">
				<Search class="size-3.5 text-gecko-gray/55" />
				<span class="font-mono text-[10px] tracking-wide uppercase">Min volume</span>
				<input
					type="number"
					min="0"
					step="1000000"
					bind:value={minVolume}
					class="w-28 bg-transparent font-mono text-xs text-gecko-white outline-none placeholder:text-gecko-gray/40"
					placeholder="0"
				/>
			</label>
			<label class="terminal-input flex h-9 items-center gap-2 px-2 text-xs text-gecko-gray/75">
				<Radar class="size-3.5 text-gecko-gray/55" />
				<span class="font-mono text-[10px] tracking-wide uppercase">Min bps</span>
				<input
					type="number"
					min="0"
					step="10"
					bind:value={minBps}
					class="w-20 bg-transparent font-mono text-xs text-gecko-white outline-none placeholder:text-gecko-gray/40"
					placeholder="0"
				/>
			</label>
			<div class="text-xs leading-5 text-gecko-gray/60">
				Funding spreads appear only when collectors provide real funding rate and interval fields.
			</div>
		</div>
	</div>
</section>

<section class="mx-auto max-w-7xl px-4 py-5 lg:px-8">
	<div class="terminal-panel overflow-hidden">
		<div
			class="terminal-header hidden grid-cols-[minmax(13rem,1fr)_9rem_9rem_9rem_8rem_9rem_8rem_7rem] gap-4 px-4 py-3 font-mono text-[11px] tracking-wide text-gecko-gray/65 uppercase lg:grid"
		>
			<div>Asset</div>
			<div>Route</div>
			<div>Venue A</div>
			<div>Venue B</div>
			<div class="text-right">Spread</div>
			<div class="text-right">Funding</div>
			<div class="text-right">Liquidity</div>
			<div class="text-right">Action</div>
		</div>

		{#if opportunities.length === 0}
			<div class="px-4 py-12 text-center">
				<div class="text-sm font-medium text-gecko-white">
					{kind === "funding_spread"
						? "No funding spread rows yet"
						: "No opportunities match these filters"}
				</div>
				<p class="mx-auto mt-2 max-w-lg text-sm leading-6 text-gecko-gray/70">
					{kind === "funding_spread"
						? "Funding data is intentionally not inferred. Once collectors provide rate, interval, and freshness fields, this route will populate."
						: "Try lowering the minimum volume or basis point filter, or switch the venue/category scope."}
				</p>
			</div>
		{:else}
			<div class="divide-y divide-gecko-shade/80">
				{#each opportunities as row (row.id)}
					{@const meta = assetMeta(row.assetId)}
					{@const links = marketLinks(row)}
					{@const firstVenue = links[0]}
					{@const secondVenue = links[1]}
					{@const rowMetric = metric(row)}
					<div
						class="grid grid-cols-1 gap-3 px-4 py-3 transition-colors duration-150 hover:bg-gecko-shade/18 lg:grid-cols-[minmax(13rem,1fr)_9rem_9rem_9rem_8rem_9rem_8rem_7rem] lg:items-center lg:gap-4"
					>
						<a href="/asset/{row.assetId}" class="flex min-w-0 items-center gap-3">
							{#if meta}
								<Icon src={meta.icon} alt={meta.name} />
							{/if}
							<div class="min-w-0">
								<div class="truncate text-sm font-medium text-gecko-white">
									{meta?.name ?? row.assetId}
								</div>
								<div
									class="mt-0.5 font-mono text-[10px] tracking-wide text-gecko-gray/60 uppercase"
								>
									{row.assetId}
								</div>
							</div>
						</a>

						<div class="font-mono text-xs">
							<div class="text-gecko-white">{routeLabel(row)}</div>
							<div class="mt-1 flex items-center gap-1.5 text-[10px] text-gecko-gray/60 uppercase">
								<span class="size-1.5 rounded-full {confidenceClass(row)}"></span>
								{confidenceLabel(row)}
							</div>
						</div>

						<div class="flex min-w-0 items-center gap-2 text-sm text-gecko-gray/85">
							{#if firstVenue?.icon}
								<Icon src={firstVenue.icon} alt={firstVenue.name} nested />
							{/if}
							<span class="truncate">{firstVenue?.name ?? row.secondary}</span>
						</div>

						<div class="flex min-w-0 items-center gap-2 text-sm text-gecko-gray/85">
							{#if secondVenue?.icon}
								<Icon src={secondVenue.icon} alt={secondVenue.name} nested />
							{/if}
							<span class="truncate">{secondVenue?.name ?? "single venue"}</span>
						</div>

						<div class="font-mono tabular-nums lg:text-right">
							<div class="text-sm font-medium text-gecko-white">{rowMetric.value}</div>
							<div class="mt-0.5 text-[10px] text-gecko-gray/55 uppercase">{rowMetric.label}</div>
						</div>

						<div class="font-mono text-xs text-gecko-gray/75 lg:text-right">
							{fundingLabel(row)}
						</div>

						<div class="font-mono text-xs text-gecko-gray/80 lg:text-right">
							<div class="text-sm text-gecko-white">{truncateCurrency(row.volume)}</div>
							<div class="mt-0.5 text-[10px] text-gecko-gray/55 uppercase">
								OI {truncateCurrency(row.oi)}
							</div>
						</div>

						<div class="flex items-center gap-2 lg:justify-end">
							<button
								type="button"
								onclick={() => toggleAlert(row)}
								class="terminal-button inline-flex size-8 items-center justify-center text-gecko-gray hover:text-gecko-white"
								aria-label={isWatched(row) ? "Remove local alert" : "Set local alert"}
							>
								{#if isWatched(row)}
									<Check class="size-3.5 text-gecko-green" />
								{:else}
									<Bell class="size-3.5" />
								{/if}
							</button>
							{#if firstVenue?.url}
								<a
									href={firstVenue.url}
									target="_blank"
									rel="noreferrer"
									class="terminal-button terminal-button-primary inline-flex size-8 items-center justify-center"
									aria-label="Open venue"
								>
									<ArrowUpRight class="size-3.5" />
								</a>
							{:else}
								<div
									class="terminal-button inline-flex size-8 items-center justify-center text-warning"
									title="No venue link available"
								>
									<ShieldAlert class="size-3.5" />
								</div>
							{/if}
						</div>

						<div class="text-sm leading-6 text-gecko-gray/76 lg:col-start-3 lg:col-end-8">
							{row.why}
							{#if row.riskLabels?.length}
								<span class="ml-2 font-mono text-[10px] text-warning uppercase">
									{row.riskLabels.join(" · ")}
								</span>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</section>
