<script lang="ts">
	import type { EChartsOption } from "echarts";
	import LazyChart from "$components/LazyChart.svelte";
	import type { AssetSeries } from "$lib/load";

	let { data, currency = "USD" }: { data: AssetSeries | null; currency?: string } = $props();

	type Range = "1H" | "1D" | "1W" | "1M" | "1Y" | "All";
	type Mode = "price" | "volume";

	let range = $state<Range>("1D");
	let mode = $state<Mode>("price");

	// Map a range to a max-age window. We only have ~3 hours of data right now
	// (12 batches × 15min), so anything beyond 1H collapses to "everything we
	// have". As history accrues this slicing becomes meaningful without code
	// changes.
	const RANGE_WINDOWS_MS: Record<Range, number> = {
		"1H": 60 * 60 * 1000,
		"1D": 24 * 60 * 60 * 1000,
		"1W": 7 * 24 * 60 * 60 * 1000,
		"1M": 30 * 24 * 60 * 60 * 1000,
		"1Y": 365 * 24 * 60 * 60 * 1000,
		All: Number.POSITIVE_INFINITY
	};

	const filtered = $derived.by(() => {
		if (!data) return { ts: [] as number[], price: [] as number[], volume: [] as number[] };
		const cutoff =
			data.timestamps.length > 0
				? data.timestamps[data.timestamps.length - 1] - RANGE_WINDOWS_MS[range]
				: 0;
		const ts: number[] = [];
		const price: number[] = [];
		const volume: number[] = [];
		for (let i = 0; i < data.timestamps.length; i++) {
			if (data.timestamps[i] < cutoff) continue;
			ts.push(data.timestamps[i]);
			price.push(data.price[i]);
			volume.push(data.volume[i]);
		}
		return { ts, price, volume };
	});

	const hasPoints = $derived(
		filtered.ts.length >= 2 &&
			filtered[mode === "price" ? "price" : "volume"].filter((v) => Number.isFinite(v)).length >= 2
	);

	const opts: EChartsOption = $derived.by(() => {
		const vals = mode === "price" ? filtered.price : filtered.volume;
		const finite = vals.map((v, i) => ({ v, i })).filter((p) => Number.isFinite(p.v));
		if (finite.length < 2) return {} as EChartsOption;

		const lastIdx = finite[finite.length - 1].i;
		const firstIdx = finite[0].i;
		const isUp = vals[lastIdx] >= vals[firstIdx];
		const stroke = isUp ? "rgba(74, 222, 128, 1)" : "rgba(248, 113, 113, 1)";
		const fillTop = isUp ? "rgba(74, 222, 128, 0.32)" : "rgba(248, 113, 113, 0.32)";
		const fillBot = "rgba(74, 222, 128, 0)";

		const min = Math.min(...finite.map((p) => p.v));
		const max = Math.max(...finite.map((p) => p.v));
		const pad = (max - min) * 0.1 || Math.max(1, max * 0.005);

		const fmt = (v: number) =>
			mode === "price"
				? `${currency} ${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
				: `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

		return {
			grid: { left: 4, right: 56, top: 8, bottom: 28 },
			xAxis: {
				type: "category",
				boundaryGap: false,
				data: filtered.ts.map((t) => new Date(t).toISOString()),
				axisLine: { show: false },
				axisTick: { show: false },
				splitLine: { show: false },
				axisLabel: {
					color: "oklch(0.78 0.005 270 / 0.6)",
					fontSize: 10,
					hideOverlap: true,
					formatter: (iso: string) => {
						const d = new Date(iso);
						return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
					}
				}
			},
			yAxis: {
				type: "value",
				position: "right",
				min: min - pad,
				max: max + pad,
				axisLine: { show: false },
				axisTick: { show: false },
				splitLine: { show: false },
				axisLabel: {
					color: "oklch(0.78 0.005 270 / 0.6)",
					fontSize: 10,
					formatter: (v: number) =>
						mode === "price"
							? v.toLocaleString(undefined, { maximumFractionDigits: 2 })
							: `$${(v / 1e6).toFixed(1)}M`
				}
			},
			series: [
				{
					type: "line",
					smooth: 0.35,
					symbol: "none",
					sampling: "lttb",
					lineStyle: { color: stroke, width: 1.5 },
					areaStyle: {
						color: {
							type: "linear",
							x: 0,
							y: 0,
							x2: 0,
							y2: 1,
							colorStops: [
								{ offset: 0, color: fillTop },
								{ offset: 1, color: fillBot }
							]
						}
					},
					data: vals,
					markPoint: {
						symbol: "circle",
						symbolSize: 8,
						itemStyle: { color: stroke, borderColor: "oklch(0.165 0.013 270)", borderWidth: 2 },
						data: [{ coord: [lastIdx, vals[lastIdx]] }]
					}
				}
			],
			tooltip: {
				trigger: "axis",
				backgroundColor: "oklch(0.165 0.013 270)",
				borderColor: "oklch(0.22 0.012 270)",
				textStyle: { color: "oklch(0.97 0.003 270)", fontSize: 11 },
				axisPointer: { lineStyle: { color: "oklch(0.45 0.015 270)", width: 1 } },
				formatter: (params: unknown) => {
					const arr = params as { value: number; axisValue: string }[];
					const p = arr?.[0];
					if (!p || typeof p.value !== "number") return "";
					const d = new Date(p.axisValue);
					const when = d.toLocaleString(undefined, {
						month: "short",
						day: "numeric",
						hour: "numeric",
						minute: "2-digit"
					});
					return `<b>${fmt(p.value)}</b><div style="opacity:0.6; font-size: 10px">${when}</div>`;
				}
			}
		} satisfies EChartsOption;
	});

	const ranges: Range[] = ["1H", "1D", "1W", "1M", "1Y", "All"];

	function rangeUnavailable(r: Range): boolean {
		if (!data || data.timestamps.length === 0) return true;
		const oldest = data.timestamps[0];
		const newest = data.timestamps[data.timestamps.length - 1];
		const span = newest - oldest;
		return RANGE_WINDOWS_MS[r] < Number.POSITIVE_INFINITY && r !== "1H" && span < 60 * 60 * 1000;
	}
</script>

<div class="flex flex-col gap-3">
	<!-- Chart canvas with dotted background -->
	<div class="chart-shell relative h-44 w-full overflow-hidden rounded-lg md:h-56">
		{#if hasPoints}
			<LazyChart options={opts} />
		{:else}
			<div
				class="flex h-full w-full items-center justify-center text-xs text-gecko-gray/60"
			>
				Building price history… (need more batches)
			</div>
		{/if}
	</div>

	<!-- Range + mode controls (now functional) -->
	<div class="flex items-center justify-between border-t border-t-gecko-shade pt-3">
		<div class="flex items-center gap-1">
			{#each ranges as r}
				<button
					type="button"
					onclick={() => (range = r)}
					disabled={rangeUnavailable(r)}
					class="press rounded-full border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide disabled:cursor-not-allowed disabled:opacity-40 {range ===
					r
						? 'border-gecko-gray bg-gecko-shade text-gecko-white'
						: 'border-transparent text-gecko-gray hover:bg-gecko-shade/40 hover:text-gecko-white'}"
				>
					{r}
				</button>
			{/each}
		</div>
		<div class="flex items-center gap-1">
			<button
				type="button"
				onclick={() => (mode = "price")}
				class="press rounded-full border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide {mode ===
				'price'
					? 'border-gecko-gray bg-gecko-shade text-gecko-white'
					: 'border-transparent text-gecko-gray hover:bg-gecko-shade/40 hover:text-gecko-white'}"
			>
				Price
			</button>
			<button
				type="button"
				onclick={() => (mode = "volume")}
				class="press rounded-full border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide {mode ===
				'volume'
					? 'border-gecko-gray bg-gecko-shade text-gecko-white'
					: 'border-transparent text-gecko-gray hover:bg-gecko-shade/40 hover:text-gecko-white'}"
			>
				Volume
			</button>
		</div>
	</div>
</div>

<style>
	/* Uniswap-style dotted grid background, layered behind the chart.
	   Uses CSS only — keeps the chart vector-clean and works regardless of
	   echarts renderer choice. */
	.chart-shell {
		background-image: radial-gradient(
			oklch(0.78 0.005 270 / 0.18) 1px,
			transparent 1px
		);
		background-size: 16px 16px;
		background-position: 0 0;
	}
</style>
