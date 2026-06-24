<script lang="ts">
	// Inline SVG mini-chart. Renders nothing if the series has fewer than 2
	// finite points — keeps the layout stable while history accumulates.
	let {
		series,
		width = 80,
		height = 24,
		strokeWidth = 1.25,
		fillOpacity = 0.18
	}: {
		series: number[];
		width?: number;
		height?: number;
		strokeWidth?: number;
		fillOpacity?: number;
	} = $props();

	const points = $derived.by(() => {
		const clean: { i: number; v: number }[] = [];
		for (let i = 0; i < series.length; i++) {
			const v = series[i];
			if (Number.isFinite(v)) clean.push({ i, v });
		}
		if (clean.length < 2) return null;
		const min = Math.min(...clean.map((p) => p.v));
		const max = Math.max(...clean.map((p) => p.v));
		const range = max - min || 1;
		const xMax = series.length - 1 || 1;
		const PAD_Y = 1.5;
		const ys = clean.map((p) => height - PAD_Y - ((p.v - min) / range) * (height - 2 * PAD_Y));
		const xs = clean.map((p) => (p.i / xMax) * width);
		const path = xs.map((x, j) => `${j === 0 ? "M" : "L"}${x.toFixed(2)},${ys[j].toFixed(2)}`).join(" ");
		const fillPath = `${path} L${xs[xs.length - 1].toFixed(2)},${height} L${xs[0].toFixed(2)},${height} Z`;
		const last = clean[clean.length - 1].v;
		const first = clean[0].v;
		const isUp = last >= first;
		return { path, fillPath, isUp };
	});
</script>

{#if points}
	<svg
		viewBox="0 0 {width} {height}"
		width={width}
		height={height}
		preserveAspectRatio="none"
		class="overflow-visible"
	>
		<path
			d={points.fillPath}
			fill={points.isUp ? "rgb(74 222 128)" : "rgb(248 113 113)"}
			fill-opacity={fillOpacity}
		/>
		<path
			d={points.path}
			fill="none"
			stroke={points.isUp ? "rgb(74 222 128)" : "rgb(248 113 113)"}
			stroke-width={strokeWidth}
			stroke-linejoin="round"
			stroke-linecap="round"
		/>
	</svg>
{:else}
	<span class="font-mono text-[10px] text-gecko-gray/40">—</span>
{/if}
