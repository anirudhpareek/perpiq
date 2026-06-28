<script lang="ts">
	import { onMount } from "svelte";
	import { ArrowUpRight, Bell, Check, Radar } from "@lucide/svelte";
	import Icon from "$components/Icon.svelte";
	import Numeric from "$components/Numeric.svelte";
	import exchanges from "$config/exchanges.json";
	import type { Meta, ExchangeCfg } from "$lib/types";
	import type { DiffedSnapshot } from "$lib/transform";
	import { buildOpportunities, type Opportunity } from "$lib/intelligence";
	import { executionVenueRows } from "$lib/execution/metadata";
	import { truncateCurrency } from "$lib/number-format";

	let {
		snapshot,
		assetId,
		meta,
		selectedMarketKey
	}: {
		snapshot: DiffedSnapshot;
		assetId: string;
		meta: Meta;
		selectedMarketKey?: string;
	} = $props();

	const rows = $derived(executionVenueRows(snapshot, assetId));
	const selectedRow = $derived(
		rows.find((row) => row.marketKey === selectedMarketKey) ?? rows[0] ?? null
	);
	const selectedMarket = $derived(selectedRow?.market ?? null);
	const exchange = $derived(
		selectedMarket
			? (exchanges as ExchangeCfg)[`${selectedMarket.venue}:${selectedMarket.namespace}`]
			: null
	);
	const opportunities = $derived(buildOpportunities(snapshot, { venue: selectedMarket?.venue }));
	const assetOpportunity = $derived<Opportunity | null>(
		opportunities.find((row) => row.assetId === assetId) ??
			buildOpportunities(snapshot).find((row) => row.assetId === assetId) ??
			null
	);
	const alertKey = $derived(`perpiq.alert.${assetId}.${selectedRow?.marketKey ?? "all"}`);
	let alertSet = $state(false);

	onMount(() => {
		alertSet = localStorage.getItem(alertKey) === "1";
	});

	$effect(() => {
		if (typeof localStorage !== "undefined") {
			alertSet = localStorage.getItem(alertKey) === "1";
		}
	});

	function toggleAlert() {
		alertSet = !alertSet;
		if (alertSet) localStorage.setItem(alertKey, "1");
		else localStorage.removeItem(alertKey);
	}

	function routeLabel(opportunity: Opportunity): string {
		switch (opportunity.kind) {
			case "funding_spread":
				return "Funding spread";
			case "price_range":
				return "Dislocation watch";
			case "stale_market":
				return "Stale venue";
			case "liquidity_migration":
				return "Venue shift";
			case "volume_oi_shock":
				return "Flow shock";
			case "high_concentration":
				return "Concentration";
			case "new_listing":
				return "New listing";
		}
	}

	function alphaMetric(opportunity: Opportunity): { label: string; value: string } {
		switch (opportunity.kind) {
			case "funding_spread":
				return {
					label: "Funding spread",
					value:
						opportunity.fundingApr == null
							? "not collected"
							: `${(opportunity.fundingApr * 100).toFixed(1)}% APR`
				};
			case "price_range":
				return {
					label: "Venue range",
					value: `${(opportunity.bps ?? opportunity.value).toFixed(0)} bps`
				};
			case "high_concentration":
				return { label: "Top venue share", value: `${(opportunity.value * 100).toFixed(1)}%` };
			case "liquidity_migration":
				return {
					label: "OI share move",
					value: `${opportunity.value > 0 ? "+" : ""}${(opportunity.value * 100).toFixed(1)}%`
				};
			case "volume_oi_shock":
				return {
					label: "Volume move",
					value: `${opportunity.value > 0 ? "+" : ""}${(opportunity.value * 100).toFixed(1)}%`
				};
			case "stale_market":
				return { label: "Stranded OI", value: truncateCurrency(opportunity.oi) };
			case "new_listing":
				return { label: "Listing state", value: "New" };
		}
	}

	function confidenceTone(opportunity: Opportunity): string {
		if (opportunity.confidence === "high") return "bg-gecko-green";
		if (opportunity.confidence === "medium") return "bg-secondary";
		if (opportunity.confidence === "incomplete") return "bg-warning";
		return "bg-gecko-gray";
	}
</script>

{#if selectedRow && selectedMarket}
	<aside class="lg:sticky lg:top-24">
		<div class="terminal-panel overflow-hidden">
			<div class="terminal-header px-4 py-3">
				<div class="flex items-start justify-between gap-3">
					<div>
						<div class="text-sm font-semibold text-gecko-white">Venue Intelligence</div>
						<p class="mt-1 max-w-72 text-xs leading-5 text-gecko-gray/72">
							Best venue context, alert, and external venue access. No routed execution.
						</p>
					</div>
					{#if assetOpportunity}
						<div class="terminal-badge inline-flex items-center gap-1.5 px-2 py-1">
							<span class="size-1.5 rounded-full {confidenceTone(assetOpportunity)}"></span>
							<span class="font-mono text-[10px] tracking-wide text-gecko-gray/75 uppercase">
								{assetOpportunity.confidence}
							</span>
						</div>
					{/if}
				</div>
			</div>

			<div class="space-y-3 p-4">
				<div class="flex min-w-0 items-center justify-between gap-3">
					<div class="flex min-w-0 items-center gap-2.5">
						{#if exchange}
							<Icon src={exchange.icon} alt={exchange.name} nested />
						{/if}
						<div class="min-w-0">
							<div class="truncate text-sm font-medium text-gecko-white">
								{exchange?.name ?? selectedMarket.venue}
							</div>
							<div class="font-mono text-[10px] tracking-wide text-gecko-gray/58 uppercase">
								{selectedRow.isBest ? "best by volume" : "selected venue"}
							</div>
						</div>
					</div>
					{#if selectedRow.externalUrl}
						<a
							href={selectedRow.externalUrl}
							target="_blank"
							rel="noreferrer"
							class="terminal-button inline-flex size-8 items-center justify-center text-gecko-gray hover:text-gecko-white"
							aria-label="Open venue"
						>
							<ArrowUpRight class="size-4" />
						</a>
					{/if}
				</div>

				<div class="grid grid-cols-2 overflow-hidden rounded-md border border-gecko-shade/80">
					<div class="border-r border-r-gecko-shade/80 px-3 py-3">
						<div class="font-mono text-[10px] tracking-wide text-gecko-gray/55 uppercase">
							Ref price
						</div>
						<Numeric
							value={selectedMarket.refPx}
							format="numeric"
							currency={meta.quote ?? "USD"}
							class="mt-1 text-sm font-medium text-gecko-white"
						/>
					</div>
					<div class="px-3 py-3">
						<div class="font-mono text-[10px] tracking-wide text-gecko-gray/55 uppercase">
							Funding
						</div>
						<div class="mt-1 font-mono text-sm text-gecko-gray">not collected</div>
					</div>
					<div class="terminal-row border-r border-r-gecko-shade/80 px-3 py-3">
						<div class="font-mono text-[10px] tracking-wide text-gecko-gray/55 uppercase">
							Volume 24h
						</div>
						<div class="mt-1 font-mono text-sm text-gecko-white">
							{truncateCurrency(selectedMarket.volume)}
						</div>
					</div>
					<div class="terminal-row px-3 py-3">
						<div class="font-mono text-[10px] tracking-wide text-gecko-gray/55 uppercase">OI</div>
						<div class="mt-1 font-mono text-sm text-gecko-white">
							{truncateCurrency(selectedMarket.oi)}
						</div>
					</div>
				</div>

				{#if assetOpportunity}
					{@const metric = alphaMetric(assetOpportunity)}
					<div class="rounded-md border border-gecko-shade/80 bg-black/20 px-3 py-3">
						<div class="flex items-start justify-between gap-3">
							<div>
								<div class="font-mono text-[10px] tracking-wide text-gecko-gray/55 uppercase">
									{routeLabel(assetOpportunity)}
								</div>
								<div class="mt-1 font-mono text-lg text-gecko-white">{metric.value}</div>
								<div
									class="mt-0.5 font-mono text-[10px] tracking-wide text-gecko-gray/58 uppercase"
								>
									{metric.label}
								</div>
							</div>
							<Radar class="mt-1 size-4 text-gecko-gray/55" />
						</div>
						<p class="mt-3 text-xs leading-5 text-gecko-gray/78">{assetOpportunity.why}</p>
					</div>
				{/if}

				<div class="grid gap-2">
					{#if selectedRow.externalUrl}
						<a
							href={selectedRow.externalUrl}
							target="_blank"
							rel="noreferrer"
							class="terminal-button terminal-button-primary inline-flex h-10 items-center justify-center gap-2 px-3 text-sm font-semibold"
						>
							Open {exchange?.name ?? "venue"}
							<ArrowUpRight class="size-4" />
						</a>
					{:else}
						<button
							type="button"
							disabled
							class="terminal-button inline-flex h-10 items-center justify-center text-sm text-gecko-gray"
						>
							No venue link available
						</button>
					{/if}
					<button
						type="button"
						onclick={toggleAlert}
						class="terminal-button inline-flex h-10 items-center justify-center gap-2 px-3 text-sm font-medium text-gecko-white"
					>
						{#if alertSet}
							<Check class="size-4 text-gecko-green" />
							Local alert saved
						{:else}
							<Bell class="size-4" />
							Set local alert
						{/if}
					</button>
				</div>

				<div class="terminal-row pt-3 text-[11px] leading-5 text-gecko-gray/62">
					Perpiq surfaces venue context and links out. Venues custody, settle, and execute trades.
				</div>
			</div>
		</div>
	</aside>
{/if}
