import "server-only";

import { env } from "~/env.js";

interface PixabayHit {
    webformatURL?: unknown;
}

interface PixabayResponse {
    hits?: unknown;
}

function isPixabayHitArray(value: unknown): value is PixabayHit[] {
    return Array.isArray(value);
}

/**
 * Fetches a food image from Pixabay for a recipe/query term.
 * Returns the first `webformatURL` hit when available; otherwise `null`.
 */
export async function fetchPixabayImage(query: string): Promise<string | null> {
    try {
        const apiKey = (env as unknown as { PIXABAY_API_KEY?: string }).PIXABAY_API_KEY;
        const trimmedQuery = query.trim();

        if (!apiKey?.trim() || !trimmedQuery) {
            return null;
        }

        const params = new URLSearchParams({
            key: apiKey,
            q: trimmedQuery,
            image_type: "photo",
            category: "food",
            per_page: "3",
            safesearch: "true",
            orientation: "horizontal",
        });

        const response = await fetch(`https://pixabay.com/api/?${params.toString()}`);
        if (!response.ok) {
            return null;
        }

        const data = (await response.json()) as PixabayResponse;
        if (!data || typeof data !== "object" || !isPixabayHitArray(data.hits)) {
            return null;
        }

        const firstHit = data.hits[0];
        if (!firstHit || typeof firstHit !== "object") {
            return null;
        }

        return typeof firstHit.webformatURL === "string" && firstHit.webformatURL.trim()
            ? firstHit.webformatURL
            : null;
    } catch {
        return null;
    }
}