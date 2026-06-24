import { loadSnapshot } from "$lib/load";
import type { DiffedSnapshot } from "$lib/transform";

// Server-render with short edge cache so /api/jobs/seed updates surface to
// users within 60s without rebuilding the site. CDN absorbs the load.
export async function load({
	setHeaders
}: {
	setHeaders: (headers: Record<string, string>) => void;
}): Promise<{ snapshot: DiffedSnapshot }> {
	setHeaders({
		"cache-control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300"
	});
	return await loadSnapshot();
}
