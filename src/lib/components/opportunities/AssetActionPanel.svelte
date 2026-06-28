<script lang="ts">
	import { onMount } from "svelte";
	import { AlertTriangle, ArrowUpRight, Bell, Check, Radar } from "@lucide/svelte";
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

	function severityClass(opportunity: Opportunity): string {
		switch (opportunity.severity) {
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

	function alphaMetric(opportunity: Opportunity): { label: string; value: string } {
		switch (opportunity.kind) {
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
</script>

{#if selectedRow && selectedMarket}
	<aside class="lg:sticky lg:top-24">
		<div
			class="overflow-hidden rounded-xl border border-gecko-shade bg-[#0d0e12] shadow-xl shadow-black/35"
		>
			<div class="border-b border-b-gecko-shade/80 bg-gecko-shade/35 px-4 py-4">
				<div class="flex items-start justify-between gap-3">
					<div>
						<div class="text-base font-semibold text-gecko-white">Venue action</div>
						<p class="mt-1 max-w-72 text-sm leading-6 text-gecko-gray/85">
							Open the selected venue with the latest Perpiq signal and liquidity context.
						</p>
					</div>
					{#if assetOpportunity}
						<span
							class="inline-flex items-center gap-1 rounded-full border px-2 py-1 font-mono text-[10px] tracking-wide uppercase {severityClass(
								assetOpportunity
							)}"
						>
							{#if assetOpportunity.severity === "risky"}
								<AlertTriangle class="size-3" />
							{:else}
								<Radar class="size-3" />
							{/if}
							{assetOpportunity.severity}
						</span>
					{/if}
				</div>
			</div>

			<div class="space-y-4 p-4">
				<div class="rounded-lg border border-gecko-shade/80 bg-black/35 p-3">
					<div class="mb-3 flex items-center justify-between gap-3">
						<div class="flex min-w-0 items-center gap-2">
							{#if exchange}
								<Icon src={exchange.icon} alt={exchange.name} nested />
							{/if}
							<div class="min-w-0">
								<div class="truncate text-sm font-medium text-gecko-white">
									{exchange?.name ?? selectedMarket.venue}
								</div>
								<div class="font-mono text-[10px] tracking-wide text-gecko-gray/60 uppercase">
									{selectedRow.isBest ? "best by volume" : "selected venue"}
								</div>
							</div>
						</div>
						{#if selectedRow.externalUrl}
							<a
								href={selectedRow.externalUrl}
								target="_blank"
								rel="noreferrer"
								class="press inline-flex size-8 items-center justify-center rounded-md border border-gecko-shade bg-gecko-shade/20 text-gecko-gray hover:border-gecko-gray/50 hover:text-gecko-white"
								aria-label="Open venue"
							>
								<ArrowUpRight class="size-4" />
							</a>
						{/if}
					</div>

					<div class="grid grid-cols-2 gap-3 border-t border-t-gecko-shade/70 pt-3">
						<div>
							<div class="font-mono text-[10px] tracking-wide text-gecko-gray/55 uppercase">
								Ref price
							</div>
							<Numeric
								value={selectedMarket.refPx}
								format="numeric"
								currency={meta.quote ?? "USD"}
								class="text-sm font-medium text-gecko-white"
							/>
						</div>
						<div>
							<div class="font-mono text-[10px] tracking-wide text-gecko-gray/55 uppercase">
								Collateral
							</div>
							<div class="font-mono text-sm text-gecko-white">{selectedMarket.collateral}</div>
						</div>
						<div>
							<div class="font-mono text-[10px] tracking-wide text-gecko-gray/55 uppercase">
								Volume 24h
							</div>
							<div class="font-mono text-sm text-gecko-white">
								{truncateCurrency(selectedMarket.volume)}
							</div>
						</div>
						<div>
							<div class="font-mono text-[10px] tracking-wide text-gecko-gray/55 uppercase">OI</div>
							<div class="font-mono text-sm text-gecko-white">
								{truncateCurrency(selectedMarket.oi)}
							</div>
						</div>
					</div>
				</div>

				{#if assetOpportunity}
					{@const metric = alphaMetric(assetOpportunity)}
					<div class="rounded-lg border border-gecko-shade/80 bg-black/30 p-3">
						<div class="font-mono text-[10px] tracking-wide text-gecko-gray/60 uppercase">
							Current alpha
						</div>
						<div class="mt-2 flex items-end justify-between gap-3">
							<div>
								<div class="font-mono text-2xl font-medium text-gecko-white">{metric.value}</div>
								<div
									class="mt-0.5 font-mono text-[10px] tracking-wide text-gecko-gray/60 uppercase"
								>
									{metric.label}
								</div>
							</div>
							<div class="text-right font-mono text-xs text-gecko-gray/75">
								<div>{truncateCurrency(assetOpportunity.volume)} vol</div>
								<div class="mt-1">OI {truncateCurrency(assetOpportunity.oi)}</div>
							</div>
						</div>
						<p class="mt-3 text-sm leading-6 text-gecko-gray/85">{assetOpportunity.why}</p>
					</div>
				{/if}

				<div class="grid gap-2">
					{#if selectedRow.externalUrl}
						<a
							href={selectedRow.externalUrl}
							target="_blank"
							rel="noreferrer"
							class="press inline-flex h-10 items-center justify-center gap-2 rounded-md bg-gecko-white px-3 text-sm font-semibold text-black hover:bg-gecko-white/90"
						>
							Open {exchange?.name ?? "venue"}
							<ArrowUpRight class="size-4" />
						</a>
					{:else}
						<button
							type="button"
							disabled
							class="inline-flex h-10 items-center justify-center rounded-md border border-gecko-shade bg-gecko-shade/20 text-sm text-gecko-gray"
						>
							No venue link available
						</button>
					{/if}
					<button
						type="button"
						onclick={toggleAlert}
						class="press inline-flex h-10 items-center justify-center gap-2 rounded-md border border-gecko-shade bg-gecko-shade/25 px-3 text-sm font-medium text-gecko-white hover:border-gecko-gray/45 hover:bg-gecko-shade/45"
					>
						{#if alertSet}
							<Check class="size-4 text-emerald-300" />
							Local alert saved
						{:else}
							<Bell class="size-4" />
							Set local alert
						{/if}
					</button>
				</div>

				<div class="border-t border-t-gecko-shade/70 pt-3 text-[11px] leading-5 text-gecko-gray/65">
					V1 is alert and deep-link only. No wallet connect, custody, deposits, routing, or
					server-held keys.
				</div>
			</div>
		</div>
	</aside>
{/if}
