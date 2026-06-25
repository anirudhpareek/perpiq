import { strTimingSafeEqual } from "$lib/utils.server";
import { env } from "$env/dynamic/private";
import { json, error, type RequestHandler } from "@sveltejs/kit";
import { CRON_SECRET } from "$env/static/private";

// Allow force-rebuilding static pages
export const GET: RequestHandler = async ({ request }) => {
	// Collect auth header
	const authHeader = request.headers.get("Authorization") ?? "";

	// Validate authenticated status
	if (!strTimingSafeEqual(authHeader, `Bearer ${CRON_SECRET}`)) {
		throw error(401, "Missing `Authorization` header");
	}

	const deployHook = env.VERCEL_DEPLOY_HOOK;
	if (!deployHook) {
		throw error(500, "Missing `VERCEL_DEPLOY_HOOK` environment variable");
	}

	// Trigger rebuild, validate success
	const response = await fetch(deployHook, { method: "POST" });
	if (!response.ok) {
		throw error(502, "Failed to trigger rebuild");
	}

	return json({ triggered: true, ts: new Date().toISOString() });
};
