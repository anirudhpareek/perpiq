<script lang="ts">
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import { onMount, untrack } from "svelte";
	import { AlertTriangle, ArrowUpRight, Bell, Check, Filter, Radar } from "@lucide/svelte";
	import type { PageProps } from "./$types";
	import Meta from "$components/Meta.svelte";
	import Icon from "$components/Icon.svelte";
	import CategoryPills, { type Category } from "$components/CategoryPills.svelte";
	import VenueFilter from "$components/VenueFilter.svelte";
	import SignalChip from "$components/intelligence/SignalChip.svelte";
	import tickers from "$config/tickers.json";
	import exchanges from "$config/exchanges.json";
	import type { ExchangeCfg, TickerCfg } from "$lib/types";
	import { parseCategory, parseVenue, updateFilterParams } from "$lib/filter-url";
	import {
		buildOpportunities,
		type Opportunity,
		type OpportunityKind,
		type Signal
	} from "$lib/intelligence";
	import { marketExecutionUrl } from "$lib/execution/metadata";
	import { truncateCurrency } from "$lib/number-format";

	let { data }: PageProps = $props();
	const snapshot = $derived(data.snapshot);
	const title = "prepiq | Opportunities";

	const kinds: { id: OpportunityKind | "all"; label: string }[] = [
		{ id: "all", label: "All signals" },
		{ id: "price_range", label: "Price ranges" },
		{ id: "stale_market", label: "Stale venues" },
		{ id: "liquidity_migration", label: "Liquidity migration" },
		{ id: "new_listing", label: "New listings" },
		{ id: "high_concentration", label: "Concentration" },
		{ id: "volume_oi_shock", label: "Volume/OI shocks" }
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
	const opportunityStats = $derived.by(() => {
		const actionable = opportunities.filter((row) => row.severity === "actionable").length;
		const risky = opportunities.filter((row) => row.severity === "risky").length;
		const ranges = opportunities.filter((row) => row.kind === "price_range").length;
		const topRange = opportunities
			.filter((row) => row.kind === "price_range")
			.reduce((max, row) => Math.max(max, row.bps ?? 0), 0);
		return { actionable, risky, ranges, topRange };
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

	function opportunitySignal(row: Opportunity): Signal {
		return {
			kind:
				row.kind === "price_range"
					? "price_divergence"
					: row.kind === "new_listing"
						? "new_market"
						: row.kind === "volume_oi_shock"
							? "volume_spike"
							: row.kind === "liquidity_migration"
								? "venue_dominance_shift"
								: row.kind,
			severity: row.severity,
			assetId: row.assetId,
			value: row.value,
			label: row.primary
		};
	}

	function kindLabel(kind: OpportunityKind): string {
		const found = kinds.find((row) => row.id === kind);
		return found?.label ?? kind;
	}

	function severityLabel(row: Opportunity): string {
		switch (row.severity) {
			case "actionable":
				return "Actionable";
			case "interesting":
				return "Interesting";
			case "risky":
				return "Risky";
			case "watch":
				return "Watch";
		}
	}

	function severityClass(row: Opportunity): string {
		switch (row.severity) {
			case "actionable":
				return "border-emerald-400/35 bg-emerald-400/10 text-emerald-300";
			case "interesting":
				return "border-cyan-400/30 bg-cyan-400/10 text-cyan-200";
			case "risky":
				return "border-warning/40 bg-warning/10 text-warning";
			case "watch":
				return "border-gecko-shade bg-gecko-shade/35 text-gecko-gray";
		}
	}

	function alphaMetric(row: Opportunity): { label: string; value: string } {
		switch (row.kind) {
			case "price_range":
				return { label: "Range", value: `${(row.bps ?? row.value).toFixed(0)} bps` };
			case "high_concentration":
				return { label: "Top venue", value: `${(row.value * 100).toFixed(1)}%` };
			case "liquidity_migration":
				return {
					label: "OI share move",
					value: `${row.value > 0 ? "+" : ""}${(row.value * 100).toFixed(1)}%`
				};
			case "volume_oi_shock":
				return {
					label: "Volume move",
					value: `${row.value > 0 ? "+" : ""}${(row.value * 100).toFixed(1)}%`
				};
			case "stale_market":
				return { label: "Stranded OI", value: truncateCurrency(row.oi) };
			case "new_listing":
				return { label: "Listing", value: "New" };
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

	function venueLine(row: Opportunity): string {
		const links = marketLinks(row);
		if (links.length === 0) return row.secondary;
		return links.map((link) => link.name).join(" / ");
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
	<div class="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-7 lg:px-8">
		<div class="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
			<div>
				<div class="font-mono text-[11px] tracking-wide text-gecko-gray/70 uppercase">
					Arb intelligence
				</div>
				<h1 class="mt-1 text-2xl font-semibold text-gecko-white md:text-3xl">Opportunities</h1>
				<p class="mt-2 max-w-3xl text-base leading-7 text-gecko-gray/85">
					Ranked cross-venue dislocations, stale venues, liquidity shifts, and listings from live
					Perpiq market snapshots. The strongest rows combine a measurable edge with enough volume
					or OI to justify opening venues.
				</p>
			</div>
			<div
				class="rounded-md border border-gecko-shade bg-gecko-shade/20 px-3 py-2 font-mono text-xs text-gecko-gray/75"
			>
				{opportunities.length} live signal{opportunities.length === 1 ? "" : "s"}
			</div>
		</div>

		<div class="grid grid-cols-2 gap-3 md:grid-cols-4">
			<div class="rounded-lg border border-gecko-shade bg-gecko-shade/20 p-3">
				<div class="font-mono text-[10px] tracking-wide text-gecko-gray/65 uppercase">
					Actionable
				</div>
				<div class="mt-1 font-mono text-2xl font-medium text-emerald-300">
					{opportunityStats.actionable}
				</div>
			</div>
			<div class="rounded-lg border border-gecko-shade bg-gecko-shade/20 p-3">
				<div class="font-mono text-[10px] tracking-wide text-gecko-gray/65 uppercase">
					Risk flags
				</div>
				<div class="mt-1 font-mono text-2xl font-medium text-warning">
					{opportunityStats.risky}
				</div>
			</div>
			<div class="rounded-lg border border-gecko-shade bg-gecko-shade/20 p-3">
				<div class="font-mono text-[10px] tracking-wide text-gecko-gray/65 uppercase">
					Price ranges
				</div>
				<div class="mt-1 font-mono text-2xl font-medium text-gecko-white">
					{opportunityStats.ranges}
				</div>
			</div>
			<div class="rounded-lg border border-gecko-shade bg-gecko-shade/20 p-3">
				<div class="font-mono text-[10px] tracking-wide text-gecko-gray/65 uppercase">
					Top spread
				</div>
				<div class="mt-1 font-mono text-2xl font-medium text-gecko-white">
					{opportunityStats.topRange.toFixed(0)} bps
				</div>
			</div>
		</div>
	</div>
</section>

<CategoryPills bind:value={category}>
	<VenueFilter {snapshot} bind:value={venue} />
</CategoryPills>

<section class="border-b border-b-gecko-shade bg-gecko-shade/10">
	<div class="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 lg:px-8">
		<div class="flex flex-wrap items-center gap-2">
			<div
				class="mr-1 inline-flex items-center gap-1.5 font-mono text-[10px] tracking-wide text-gecko-gray/60 uppercase"
			>
				<Filter class="size-3.5" />
				Signal
			</div>
			{#each kinds as row (row.id)}
				<button
					type="button"
					onclick={() => (kind = row.id)}
					class="press rounded-full border px-3 py-1.5 font-mono text-[11px] tracking-wide uppercase {kind ===
					row.id
						? 'border-gecko-gray bg-gecko-shade text-gecko-white'
						: 'border-gecko-shade/80 bg-transparent text-gecko-gray hover:border-gecko-gray/40 hover:text-gecko-white'}"
				>
					{row.label}
				</button>
			{/each}
		</div>
		<div class="flex flex-wrap items-center gap-3">
			<label class="flex items-center gap-2 text-xs text-gecko-gray/75">
				<span class="font-mono text-[10px] tracking-wide uppercase">Min volume</span>
				<input
					type="number"
					min="0"
					step="1000000"
					bind:value={minVolume}
					class="h-8 w-32 rounded-md border border-gecko-shade bg-black/30 px-2 font-mono text-xs text-gecko-white outline-none focus:border-gecko-gray/60"
					placeholder="0"
				/>
			</label>
			<label class="flex items-center gap-2 text-xs text-gecko-gray/75">
				<span class="font-mono text-[10px] tracking-wide uppercase">Min bps</span>
				<input
					type="number"
					min="0"
					step="10"
					bind:value={minBps}
					class="h-8 w-24 rounded-md border border-gecko-shade bg-black/30 px-2 font-mono text-xs text-gecko-white outline-none focus:border-gecko-gray/60"
					placeholder="0"
				/>
			</label>
		</div>
	</div>
</section>

<section class="mx-auto max-w-7xl px-4 py-6 lg:px-8">
	<div class="overflow-hidden rounded-xl border border-gecko-shade bg-black/20">
		<div
			class="hidden grid-cols-[minmax(14rem,1fr)_8rem_9rem_minmax(18rem,1.3fr)_9rem_10rem] gap-4 border-b border-b-gecko-shade bg-gecko-shade/40 px-4 py-3 text-xs font-medium text-gecko-gray lg:grid"
		>
			<div>Asset</div>
			<div>Status</div>
			<div>Alpha</div>
			<div>Evidence</div>
			<div class="text-right">Liquidity</div>
			<div class="text-right">Action</div>
		</div>

		{#if opportunities.length === 0}
			<div class="px-4 py-10 text-center text-sm text-gecko-gray/75">
				No opportunities match these filters in the latest snapshot.
			</div>
		{:else}
			<div class="divide-y divide-gecko-shade/80">
				{#each opportunities as row (row.id)}
					{@const meta = assetMeta(row.assetId)}
					{@const links = marketLinks(row)}
					{@const metric = alphaMetric(row)}
					<div
						class="grid grid-cols-1 gap-4 px-4 py-4 hover:bg-gecko-shade/15 lg:grid-cols-[minmax(14rem,1fr)_8rem_9rem_minmax(18rem,1.3fr)_9rem_10rem] lg:items-center"
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
									class="mt-0.5 font-mono text-[10px] tracking-wide text-gecko-gray/65 uppercase"
								>
									{row.assetId} / {kindLabel(row.kind)}
								</div>
							</div>
						</a>

						<div class="flex flex-wrap items-center gap-2">
							<span
								class="inline-flex items-center gap-1 rounded-full border px-2 py-1 font-mono text-[10px] tracking-wide uppercase {severityClass(
									row
								)}"
							>
								{#if row.severity === "risky"}
									<AlertTriangle class="size-3" />
								{:else}
									<Radar class="size-3" />
								{/if}
								{severityLabel(row)}
							</span>
							<div class="lg:hidden">
								<SignalChip signal={opportunitySignal(row)} />
							</div>
						</div>

						<div class="font-mono tabular-nums">
							<div class="text-base font-medium text-gecko-white">{metric.value}</div>
							<div class="mt-0.5 text-[10px] tracking-wide text-gecko-gray/60 uppercase">
								{metric.label}
							</div>
						</div>

						<div class="min-w-0">
							<div class="text-sm font-medium text-gecko-white">{venueLine(row)}</div>
							<p class="mt-1 max-w-[70ch] text-sm leading-6 text-gecko-gray/80">{row.why}</p>
							<div class="mt-2 flex flex-wrap gap-1.5">
								{#each links as link (link.marketKey)}
									{#if link.url}
										<a
											href={link.url}
											target="_blank"
											rel="noreferrer"
											class="inline-flex items-center gap-1 rounded-full border border-gecko-shade bg-gecko-shade/20 px-2 py-1 text-[11px] text-gecko-gray hover:border-gecko-gray/45 hover:text-gecko-white"
										>
											{#if link.icon}
												<Icon src={link.icon} alt={link.name} nested />
											{/if}
											{link.name}
											<ArrowUpRight class="size-3" />
										</a>
									{/if}
								{/each}
							</div>
						</div>

						<div class="font-mono text-xs text-gecko-gray/85 lg:text-right">
							<div class="text-sm text-gecko-white">{truncateCurrency(row.volume)}</div>
							<div class="mt-1 text-gecko-gray/65">OI {truncateCurrency(row.oi)}</div>
						</div>

						<div class="flex justify-start gap-2 lg:justify-end">
							<button
								type="button"
								onclick={() => toggleAlert(row)}
								class="press inline-flex h-9 items-center gap-2 rounded-md border border-gecko-shade bg-gecko-shade/25 px-3 text-xs font-medium text-gecko-white hover:border-gecko-gray/45 hover:bg-gecko-shade/45"
							>
								{#if isWatched(row)}
									<Check class="size-3.5 text-emerald-300" />
									Saved
								{:else}
									<Bell class="size-3.5" />
									Alert
								{/if}
							</button>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</section>
