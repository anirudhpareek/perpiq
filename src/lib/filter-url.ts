import type { Category } from "$components/CategoryPills.svelte";

const CATEGORIES = new Set<Category>([
	"all",
	"stocks",
	"indices",
	"commodities",
	"fx",
	"pre-ipo",
	"new",
	"divergences"
]);

export function parseCategory(value: string | null): Category {
	return value && CATEGORIES.has(value as Category) ? (value as Category) : "all";
}

export function parseVenue(value: string | null) {
	return value || "all";
}

export function updateFilterParams(
	url: URL,
	filters: {
		category: Category;
		venue: string;
	}
) {
	const next = new URL(url);

	if (filters.category === "all") next.searchParams.delete("category");
	else next.searchParams.set("category", filters.category);

	if (filters.venue === "all") next.searchParams.delete("venue");
	else next.searchParams.set("venue", filters.venue);

	return `${next.pathname}${next.search}${next.hash}`;
}
