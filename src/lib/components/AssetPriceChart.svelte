<script lang="ts">
	import type { EChartsOption } from "echarts";
	import LazyChart from "$components/LazyChart.svelte";

	let { series, currency = "USD" }: { series: number[]; currency?: string } = $props();

	// Defensive: drop NaNs but keep ordinal positions (we don't have real
	// timestamps per batch; the order is "oldest → newest" which is what
	// matters for visual trend).
	const points = $derived(
		series.map((v, i) => ({ i, v })).filter((p) => Number.isFinite(p.v))
	);

	const opts: EChartsOption = $derived.by(() => {
		if (points.length < 2) return {} as EChartsOption;
		const vals = points.map((p) => p.v);
		const min = Math.min(...vals);
		const max = Math.max(...vals);
		const isUp = vals[vals.length - 1] >= vals[0];
		// 8% padding above/below
		const pad = (max - min) * 0.08 || 1;

		const stroke = isUp ? "rgba(74, 222, 128, 1)" : "rgba(248, 113, 113, 1)";
		const fillTop = isUp ? "rgba(74, 222, 128, 0.32)" : "rgba(248, 113, 113, 0.32)";
		const fillBot = "rgba(74, 222, 128, 0)";

		return {
			grid: { left: 4, right: 4, top: 8, bottom: 4 },
			xAxis: {
				type: "category",
				show: false,
				boundaryGap: false,
				data: points.map((p) => p.i.toString())
			},
			yAxis: {
				type: "value",
				show: false,
				min: min - pad,
				max: max + pad
			},
			series: [
				{
					type: "line",
					smooth: true,
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
					data: vals
				}
			],
			tooltip: {
				trigger: "axis",
				backgroundColor: "oklch(0.165 0.013 270)",
				borderColor: "oklch(0.22 0.012 270)",
				textStyle: { color: "oklch(0.97 0.003 270)", fontSize: 11 },
				axisPointer: { lineStyle: { color: "oklch(0.45 0.015 270)", width: 1 } },
				formatter: (params: unknown) => {
					const arr = params as { value: number }[];
					const v = arr?.[0]?.value;
					if (typeof v !== "number") return "";
					return `<b>${currency} ${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>`;
				}
			}
		} satisfies EChartsOption;
	});
</script>

{#if points.length >= 2}
	<div class="h-44 w-full md:h-56">
		<LazyChart options={opts} />
	</div>
{:else}
	<div
		class="flex h-44 w-full items-center justify-center rounded-lg border border-dashed border-gecko-shade/60 bg-gecko-shade/10 text-xs text-gecko-gray/60 md:h-56"
	>
		Building price history… (need more batches)
	</div>
{/if}
