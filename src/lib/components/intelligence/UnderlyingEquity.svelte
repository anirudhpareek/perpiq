<script lang="ts">
	import Card from "$components/Card.svelte";
	import Grid from "$components/Grid.svelte";
	import Numeric from "$components/Numeric.svelte";
	import type { DiffedSnapshot } from "$lib/transform";
	import type { Fundamentals } from "$lib/fundamentals/types";
	import { computeEquityComparison, getEquityTicker } from "$lib/fundamentals/compare";

	let {
		snapshot,
		assetId,
		category
	}: { snapshot: DiffedSnapshot; assetId: string; category: string } = $props();

	let data: Fundamentals | null = $state(null);
	let loading = $state(true);
	let errored = $state(false);

	const ticker = $derived(getEquityTicker(assetId));

	$effect(() => {
		// Only fetch for equity-class assets
		if (category !== "stocks") {
			loading = false;
			return;
		}
		loading = true;
		errored = false;
		data = null;

		fetch(`/api/fundamentals/${ticker}`)
			.then(async (r) => {
				if (!r.ok) {
					errored = true;
					return null;
				}
				const j = await r.json();
				return j.ok ? (j.data as Fundamentals) : null;
			})
			.then((d) => {
				data = d;
				loading = false;
			})
			.catch(() => {
				errored = true;
				loading = false;
			});
	});

	const comp = $derived(computeEquityComparison(snapshot, assetId, data));

	function fmtPct(x: number | null | undefined, digits = 2): string {
		if (x === null || x === undefined || !Number.isFinite(x)) return "—";
		return `${(x * 100).toFixed(digits)}%`;
	}

	function fmtDate(iso: string | undefined): string {
		if (!iso) return "—";
		try {
			return new Date(iso).toLocaleDateString(undefined, {
				year: "numeric",
				month: "short",
				day: "numeric"
			});
		} catch {
			return "—";
		}
	}
</script>

{#if category === "stocks" && (loading || data)}
	<div>
		<Grid bottom={false}>
			<Card title="Underlying equity">
				<div class="flex flex-1 flex-col p-4">
					{#if loading}
						<p class="text-sm text-gecko-gray/75">Loading {ticker} fundamentals…</p>
					{:else if data}
						<!-- Top row: identity + sector -->
						<div class="flex items-baseline gap-2 text-sm">
							<span class="font-mono text-gecko-white uppercase">{ticker}</span>
							{#if data.sector}
								<span class="text-gecko-gray">·</span>
								<span class="text-gecko-gray">{data.sector}</span>
							{/if}
							<span
								class="ml-auto rounded-sm border border-gecko-shade bg-gecko-shade/40 px-1.5 py-0.5 font-mono text-[11px] text-gecko-gray/85 uppercase"
							>
								yahoo
							</span>
						</div>

						<!-- Fundamental grid -->
						<div class="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 text-sm md:grid-cols-3">
							{#if data.marketCap !== undefined}
								<div>
									<div class="text-gecko-gray/85">Market cap</div>
									<div class="text-gecko-white">
										<Numeric
											value={data.marketCap}
											format="currency"
											currency="USD"
											class="text-gecko-white"
										/>
									</div>
								</div>
							{/if}
							{#if data.revenueTtm !== undefined}
								<div>
									<div class="text-gecko-gray/85">Revenue (TTM)</div>
									<div class="text-gecko-white">
										<Numeric
											value={data.revenueTtm}
											format="currency"
											currency="USD"
											class="text-gecko-white"
										/>
									</div>
								</div>
							{/if}
							{#if data.earningsTtm !== undefined}
								<div>
									<div class="text-gecko-gray/85">Earnings (TTM)</div>
									<div class="text-gecko-white">
										<Numeric
											value={data.earningsTtm}
											format="currency"
											currency="USD"
											class="text-gecko-white"
										/>
									</div>
								</div>
							{/if}
							{#if data.peTrailing !== undefined}
								<div>
									<div class="text-gecko-gray/85">P/E (trailing)</div>
									<div class="font-mono text-gecko-white">{data.peTrailing.toFixed(2)}</div>
								</div>
							{/if}
							{#if data.dividendYield !== undefined}
								<div>
									<div class="text-gecko-gray/85">Dividend yield</div>
									<div class="font-mono text-gecko-white">{fmtPct(data.dividendYield)}</div>
								</div>
							{/if}
							{#if data.fiftyTwoWeekChange !== undefined}
								<div>
									<div class="text-gecko-gray/85">52w performance</div>
									<div
										class="font-mono {data.fiftyTwoWeekChange >= 0
											? 'text-green-400'
											: 'text-red-400'}"
									>
										{fmtPct(data.fiftyTwoWeekChange)}
									</div>
								</div>
							{/if}
							{#if data.dailyVolumeUsd !== undefined}
								<div>
									<div class="text-gecko-gray/85">Equity 24h volume</div>
									<div class="text-gecko-white">
										<Numeric
											value={data.dailyVolumeUsd}
											format="currency"
											currency="USD"
											class="text-gecko-white"
										/>
									</div>
								</div>
							{/if}
							{#if data.nextEarningsDate}
								<div>
									<div class="text-gecko-gray/85">Next earnings</div>
									<div class="font-mono text-gecko-white">{fmtDate(data.nextEarningsDate)}</div>
								</div>
							{/if}
						</div>
					{/if}
				</div>
			</Card>

			{#if data}
				<Card title="On-chain vs underlying">
					<div class="flex flex-1 flex-col p-4">
						<!-- Perp volume share of equity -->
						<div class="flex items-baseline justify-between text-sm">
							<span class="text-gecko-gray/85">Perp volume / equity volume</span>
							<span class="font-mono text-gecko-white">
								{fmtPct(comp.perpVolumeShareOfEquity, 3)}
							</span>
						</div>
						{#if comp.perpVolumeShareOfEquity !== null}
							<div class="mt-1 h-1 w-full overflow-hidden rounded-sm bg-gecko-shade/40">
								<div
									class="h-full bg-gecko-white/80"
									style="width: {Math.min(comp.perpVolumeShareOfEquity * 100, 100).toFixed(2)}%"
								></div>
							</div>
						{/if}

						<!-- OI / market cap -->
						<div class="mt-4 flex items-baseline justify-between text-sm">
							<span class="text-gecko-gray/85">Perp OI / market cap</span>
							<span class="font-mono text-gecko-white">
								{fmtPct(comp.perpOiShareOfMarketCap, 4)}
							</span>
						</div>
						{#if comp.perpOiShareOfMarketCap !== null}
							<div class="mt-1 h-1 w-full overflow-hidden rounded-sm bg-gecko-shade/40">
								<div
									class="h-full bg-gecko-white/80"
									style="width: {Math.min(comp.perpOiShareOfMarketCap * 10_000, 100).toFixed(2)}%"
								></div>
							</div>
						{/if}

						<p class="mt-4 text-xs leading-5 text-gecko-gray/78">
							Perp activity is measured in the latest snapshot; equity volume and market cap are
							pulled from the underlying TradFi feed. Treat as a rough liquidity ratio, not a
							precise market-share number.
						</p>
					</div>
				</Card>
			{/if}
		</Grid>
	</div>
{/if}
