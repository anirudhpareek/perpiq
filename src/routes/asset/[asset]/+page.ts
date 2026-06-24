import { error } from "@sveltejs/kit";
import tickers from "$config/tickers.json";
import type { PageLoad } from "./$types";

// Valid asset slugs (`gold`, `nvidia`, etc.)
const VALID_ASSETS = Object.values(tickers.perps).flatMap((x) => Object.keys(x));

export const load: PageLoad = ({ params }) => {
	if (!VALID_ASSETS.includes(params.asset)) {
		error(404, "Asset not found");
	}
	return { asset: params.asset };
};
