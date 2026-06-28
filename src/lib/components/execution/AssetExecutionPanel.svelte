<script lang="ts">
	import { onMount } from "svelte";
	import { ArrowDown, Check, Settings, ShieldAlert } from "@lucide/svelte";
	import Icon from "$components/Icon.svelte";
	import Numeric from "$components/Numeric.svelte";
	import exchanges from "$config/exchanges.json";
	import type { ExchangeCfg, Meta as MetaT } from "$lib/types";
	import type { DiffedSnapshot } from "$lib/transform";
	import { formatNumeric, truncateCurrency } from "$lib/number-format";
	import { getExecutionAdapter } from "$lib/execution/adapters";
	import { asExecutionMarket, executionVenueRows } from "$lib/execution/metadata";
	import type {
		ExecutionOrderType,
		ExecutionSide,
		ExecutionWallet,
		ExecutionWalletProvider
	} from "$lib/execution/types";

	let {
		snapshot,
		assetId,
		meta,
		selectedMarketKey
	}: {
		snapshot: DiffedSnapshot;
		assetId: string;
		meta: MetaT;
		selectedMarketKey: string;
	} = $props();

	let side = $state<ExecutionSide>("buy");
	let orderType = $state<ExecutionOrderType>("market");
	let sizeUsd = $state(100);
	let riskAcknowledged = $state(false);
	let wallet = $state<ExecutionWallet | null>(null);
	let status = $state<"idle" | "review" | "submitting" | "submitted" | "rejected">("idle");
	let statusMessage = $state("");
	let hydrated = $state(false);
	let lastMarketKey = $state("");

	const sizePresets = [25, 50, 100, 500];
	const storagePrefix = $derived(`perpiq.execution.${assetId}`);
	const rows = $derived(executionVenueRows(snapshot, assetId));
	const selectedRow = $derived(rows.find((row) => row.marketKey === selectedMarketKey) ?? rows[0]);
	const selectedMarket = $derived(selectedRow ? asExecutionMarket(selectedRow.market) : null);
	const adapter = $derived(selectedMarket ? getExecutionAdapter(selectedMarket) : null);
	const exchange = $derived(
		selectedMarket
			? (exchanges as ExchangeCfg)[`${selectedMarket.venue}:${selectedMarket.namespace}`]
			: null
	);
	const quote = $derived(
		selectedMarket && selectedRow && adapter
			? adapter.getQuote({
					marketKey: selectedRow.marketKey,
					market: selectedMarket,
					side,
					sizeUsd
				})
			: null
	);
	const canUseNative = $derived(Boolean(selectedMarket?.supportsNativeExecution && quote?.native));
	const ctaLabel = $derived.by(() => {
		if (!selectedMarket || !quote) return "Unavailable";
		if (!canUseNative) return `Open ${exchange?.name ?? selectedMarket.venue}`;
		if (!wallet) return "Connect wallet";
		if (status === "review") return "Submit";
		if (status === "submitting") return "Submitting";
		if (status === "submitted") return "Submitted";
		return "Review order";
	});
	const nativeStatusLabel = $derived(canUseNative ? "Native" : "External");

	onMount(() => {
		const storedSide = localStorage.getItem(`${storagePrefix}.side`) as ExecutionSide | null;
		const storedRiskAck = localStorage.getItem(`${storagePrefix}.riskAck`);
		if (storedSide === "buy" || storedSide === "sell") side = storedSide;
		riskAcknowledged = storedRiskAck === "true";
		hydrated = true;
	});

	$effect(() => {
		if (!hydrated) return;
		localStorage.setItem(`${storagePrefix}.side`, side);
		localStorage.setItem(`${storagePrefix}.riskAck`, riskAcknowledged.toString());
	});

	$effect(() => {
		if (!selectedMarketKey || selectedMarketKey === lastMarketKey) return;
		lastMarketKey = selectedMarketKey;
		status = "idle";
		statusMessage = "";
	});

	function onSizeChange(event: Event) {
		const value = Number((event.currentTarget as HTMLInputElement).value);
		sizeUsd = Number.isFinite(value) ? value : 0;
		status = "idle";
		statusMessage = "";
	}

	function setSize(value: number) {
		sizeUsd = value;
		status = "idle";
		statusMessage = "";
	}

	async function connectWallet() {
		const ethereum = (window as unknown as { ethereum?: ExecutionWalletProvider }).ethereum;
		if (!ethereum) {
			status = "rejected";
			statusMessage = "No injected wallet found. Open the venue directly or install a wallet.";
			return;
		}

		const accounts = (await ethereum.request({ method: "eth_requestAccounts" })) as string[];
		if (accounts[0]) {
			wallet = { address: accounts[0], provider: ethereum };
			status = "idle";
			statusMessage = "";
		}
	}

	async function handlePrimaryCta() {
		if (!selectedRow || !selectedMarket || !quote || !adapter) return;
		if (!canUseNative) {
			if (selectedRow.externalUrl)
				window.open(selectedRow.externalUrl, "_blank", "noopener,noreferrer");
			return;
		}
		if (!wallet) {
			await connectWallet();
			return;
		}
		if (status !== "review") {
			status = "review";
			statusMessage = "Review venue, side, size, notional, and risk note before submitting.";
			return;
		}
		if (!riskAcknowledged) {
			status = "rejected";
			statusMessage = "Acknowledge external venue risk before submitting.";
			return;
		}

		status = "submitting";
		const result = await adapter.submitOrder(adapter.prepareOrder(quote), wallet);
		status = result.status;
		statusMessage = result.message;
	}
</script>

{#if rows.length > 0 && selectedMarket && selectedRow && quote}
	<aside class="execution-panel sticky top-24 flex h-fit flex-col p-1.5">
		<div class="flex items-center gap-2 px-1.5 pt-1 pb-2.5">
			<button
				type="button"
				class="press h-9 rounded-full bg-gecko-shade/70 px-4 text-sm font-semibold text-gecko-white"
			>
				Market
			</button>
			<button
				type="button"
				disabled
				class="h-9 rounded-full px-2.5 text-sm font-semibold text-gecko-gray/65"
				title="Limit orders are planned for a later execution phase"
			>
				Limit
			</button>
			<button
				type="button"
				class="press h-9 rounded-full px-2.5 text-sm font-semibold {side === 'buy'
					? 'text-gecko-white'
					: 'text-gecko-gray/80 hover:text-gecko-white'}"
				onclick={() => {
					side = "buy";
					status = "idle";
					statusMessage = "";
				}}
			>
				Long
			</button>
			<button
				type="button"
				class="press h-9 rounded-full px-2.5 text-sm font-semibold {side === 'sell'
					? 'text-gecko-white'
					: 'text-gecko-gray/80 hover:text-gecko-white'}"
				onclick={() => {
					side = "sell";
					status = "idle";
					statusMessage = "";
				}}
			>
				Short
			</button>
			<button
				type="button"
				class="press ml-auto inline-flex size-9 shrink-0 items-center justify-center rounded-full text-gecko-gray hover:bg-gecko-shade/45 hover:text-gecko-white"
				aria-label="Execution settings"
			>
				<Settings class="size-3.5" />
			</button>
		</div>

		<div class="flex flex-col gap-1.5">
			<div class="execution-card execution-card-muted p-4">
				<div class="flex items-start justify-between gap-4">
					<label class="flex min-w-0 flex-1 flex-col gap-2">
						<span class="text-sm font-medium text-gecko-gray/90">
							{side === "buy" ? "Pay" : "Margin"}
						</span>
						<input
							type="number"
							min="0"
							step="10"
							value={sizeUsd}
							oninput={onSizeChange}
							class="min-w-0 bg-transparent text-4xl font-medium tracking-tight text-gecko-white outline-none placeholder:text-gecko-gray/30"
						/>
					</label>
					<div
						class="mt-8 inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-gecko-black px-2 pr-3 text-sm font-semibold text-gecko-white shadow-[0_0_0_1px_rgba(255,255,255,0.12)]"
					>
						<span
							class="inline-flex size-7 items-center justify-center rounded-full bg-gecko-shade text-[10px] text-gecko-white"
						>
							$
						</span>
						{quote.collateral}
					</div>
				</div>
				<div class="mt-3 flex flex-wrap items-center gap-1.5">
					{#each sizePresets as preset}
						<button
							type="button"
							class="press h-7 rounded-full bg-gecko-shade/55 px-2.5 font-mono text-[11px] text-gecko-gray/85 hover:bg-gecko-shade hover:text-gecko-white"
							onclick={() => setSize(preset)}
						>
							${preset}
						</button>
					{/each}
				</div>
			</div>

			<div
				class="z-10 mx-auto -my-3.5 flex size-10 items-center justify-center rounded-2xl bg-gecko-black text-gecko-white shadow-[0_0_0_5px_var(--color-gecko-black),0_0_0_6px_rgba(255,255,255,0.08)]"
			>
				<ArrowDown class="size-4" />
			</div>

			<div class="execution-card p-4">
				<div class="flex items-start justify-between gap-4">
					<div class="min-w-0">
						<div class="text-sm font-medium text-gecko-gray/90">
							{side === "buy" ? "Long position" : "Short position"}
						</div>
						<div class="mt-2 text-4xl font-medium tracking-tight text-gecko-white">
							{formatNumeric(quote.estimatedSize)}
						</div>
						<div class="mt-1.5 font-mono text-xs text-gecko-gray/75">
							${truncateCurrency(quote.estimatedNotional)}
						</div>
					</div>
					<div
						class="mt-8 inline-flex h-10 max-w-36 shrink-0 items-center gap-2 rounded-full bg-gecko-black px-2 pr-3 text-sm font-semibold text-gecko-white shadow-[0_0_0_1px_rgba(255,255,255,0.12)]"
					>
						<Icon src={meta.icon} alt={meta.name} class="size-6 [&_img]:size-6" />
						<span class="truncate font-mono">{selectedMarket.ticker}</span>
					</div>
				</div>
			</div>

			<div
				class="mx-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 py-1 text-xs text-gecko-gray/75"
			>
				<span class="font-mono uppercase">{nativeStatusLabel}</span>
				<span class="text-gecko-gray/45">/</span>
				<span class="inline-flex items-center gap-1">
					{exchange?.name ?? selectedMarket.venue}
				</span>
				<span class="text-gecko-gray/45">/</span>
				<span class="inline-flex items-center gap-1">
					Ref
					<Numeric
						value={quote.refPx}
						format="numeric"
						currency={meta.quote ?? "USD"}
						class="font-mono text-gecko-white"
					/>
				</span>
			</div>

			<label class="mx-2.5 flex items-start gap-2 text-xs leading-5 text-gecko-gray/70">
				<input
					type="checkbox"
					checked={riskAcknowledged}
					onchange={(event) =>
						(riskAcknowledged = (event.currentTarget as HTMLInputElement).checked)}
					class="mt-0.5 accent-gecko-white"
				/>
				<span>
					I understand orders settle on the selected venue and are subject to its market,
					liquidation, and availability risk.
				</span>
			</label>

			<button
				type="button"
				disabled={status === "submitting" || sizeUsd <= 0}
				class="press mx-2.5 flex h-12 items-center justify-center gap-2 rounded-2xl bg-gecko-shade px-4 text-sm font-semibold text-gecko-white hover:bg-gecko-black-hover disabled:cursor-not-allowed disabled:opacity-40"
				onclick={handlePrimaryCta}
			>
				{#if status === "submitted"}
					<Check class="size-3.5" />
				{/if}
				{ctaLabel}
			</button>

			{#if statusMessage || quote.reason || !canUseNative}
				<div
					class="mx-2.5 flex gap-2 border-t border-t-gecko-shade pt-2 pb-1 text-xs leading-5 text-gecko-gray/75"
				>
					<ShieldAlert class="mt-0.5 size-3.5 shrink-0 text-gecko-gray" />
					<span>
						{statusMessage ||
							quote.reason ||
							"Native execution is disabled for this venue. Use the external venue link."}
					</span>
				</div>
			{/if}
		</div>
	</aside>
{/if}
