/**
 * Instance-level analytics — facts about THIS Studio deployment's standing
 * in the Commons ecosystem.
 *
 * "Downstream consumers" is the canonical case: apps that read from this
 * contributor's published data. Seeing who consumes reinforces the
 * editorial loop — high-quality tidied data attracts more consumers,
 * making the operator's effort visible and worthwhile.
 *
 * Real implementation needs a Commons endpoint exposing consuming apps for a
 * contributor profile (not yet available upstream). Expected shape:
 *
 *   GET /v1/contributors/<my-slug>/downstream
 *   → [{ consumer_slug, consumer_name, consumer_tagline,
 *        last_active_at, events_delivered_30d }, ...]
 *
 * Until that lands the Settings card renders its empty state — this stays
 * empty rather than fabricating consumers.
 */

export interface DownstreamConsumer {
	slug: string;
	name: string;
	tagline?: string | null;
	last_active_at: string;        // ISO 8601
	events_delivered_30d: number;
}

export const fixtureConsumers: DownstreamConsumer[] = [];
