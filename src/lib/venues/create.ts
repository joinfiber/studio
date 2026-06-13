/**
 * Create a venue = an Organization at a Place. Shared by the map's
 * click-to-add and available to other surfaces. Creates the Place (geo +
 * address, optional Google place_id) then the Organization linked to it.
 *
 * Server-only (uses the Commons service key).
 */

import type { Client } from 'openapi-fetch';
import type { paths, components } from 'neighborhood-commons';
import { findGooglePlaceId, googlePlacesConfigured } from './google-places.js';
import type { GeocodedAddress } from '$lib/kernel/geocode.js';

type Sdk = Client<paths>;
type PlaceInput = components['schemas']['PlaceInput'];
type OrgInput = components['schemas']['OrganizationInput'];
export type OpeningHoursEntry = components['schemas']['OpeningHoursEntry'];

export interface VenueInput {
	name: string;
	lat: number;
	lng: number;
	address?: GeocodedAddress;
	website?: string;
	phone?: string;
	sameAs?: string[];
	tags?: string[];
	/** Provenance for the org. OSM/scrape imports are 'proxied' (a public
	 *  source); omit to take the Commons default ('seeded'). Honored once the
	 *  Commons accepts caller-set method; harmless (stripped) before then. */
	method?: string;
	/** schema.org OpeningHoursSpecification[] — the operator's curated hours. */
	openingHours?: OpeningHoursEntry[];
	/** OSM source ref, used as the place's external ID when no Google place_id
	 *  is available (ecosystem convention: `osm:type/id`). */
	osmType?: string;
	osmId?: number;
	/** Skip the per-venue Google place_id lookup (the bulk importer sets this to
	 *  avoid one Google call per venue — it falls back to the OSM ref instead). */
	skipGoogleLookup?: boolean;
}

export async function createVenue(
	sdk: Sdk,
	v: VenueInput,
): Promise<{ orgId?: string; placeId?: string; error?: string }> {
	// Bounds (defense-in-depth — the Commons validates too, but fail fast and
	// keep obviously-bad data out of the write).
	if (!v.name?.trim() || v.name.length > 200) {
		return { error: 'Name is required and must be ≤200 characters.' };
	}
	if (
		!Number.isFinite(v.lat) ||
		v.lat < -90 ||
		v.lat > 90 ||
		!Number.isFinite(v.lng) ||
		v.lng < -180 ||
		v.lng > 180
	) {
		return { error: 'Coordinates are out of range.' };
	}
	if (
		(v.sameAs?.length ?? 0) > 25 ||
		(v.tags?.length ?? 0) > 25 ||
		(v.openingHours?.length ?? 0) > 60
	) {
		return { error: 'Too many social links, tags, or hours entries.' };
	}

	// Stable identity (best-effort): the place_id is the only Google field we store.
	let googlePlaceId: string | undefined;
	if (googlePlacesConfigured() && !v.skipGoogleLookup) {
		const q =
			[v.name, v.address?.streetAddress, v.address?.addressLocality].filter(Boolean).join(', ') ||
			v.name;
		googlePlaceId = (await findGooglePlaceId(q, { lat: v.lat, lng: v.lng })) ?? undefined;
	}

	// Every venue should commit a stable external ID (surfaced in the place's
	// identifier[]). Prefer Google's place_id; fall back to the OSM ref so an
	// instance without a Google key still records a durable cross-source key —
	// matching the existing `osm:type/id` convention in the Commons.
	const externalId =
		googlePlaceId ??
		(v.osmType && Number.isFinite(v.osmId) ? `osm:${v.osmType}/${v.osmId}` : undefined);

	const place = await sdk.POST('/service/places', {
		body: {
			name: v.name,
			geo: { latitude: v.lat, longitude: v.lng },
			address: v.address,
			googlePlaceId: externalId,
		} as PlaceInput,
	});
	if (!place.data) {
		return {
			error: place.error?.error?.message ?? `place create returned ${place.response.status}`,
		};
	}
	const placeId = place.data.place.id;

	// `method` isn't on the SDK's OrganizationInput type yet (regen pending), so
	// carry it on an intersection — the value is sent at runtime regardless.
	const orgBody: OrgInput & { method?: string } = {
		name: v.name,
		url: v.website || undefined,
		telephone: v.phone || undefined,
		sameAs: v.sameAs?.length ? v.sameAs : undefined,
		tags: v.tags?.length ? v.tags : undefined,
		primaryPlaceId: placeId,
	};
	if (v.method) orgBody.method = v.method;
	if (v.openingHours?.length) orgBody.openingHoursSpecification = v.openingHours;

	let org;
	try {
		org = await sdk.POST('/service/organizations', { body: orgBody });
	} catch (err) {
		// Network/timeout after the Place was already committed (see orphan note).
		return {
			placeId,
			error: `${err instanceof Error ? err.message : 'org create failed'}${orphanNote(externalId)}`,
		};
	}
	if (!org.data) {
		const status = org.response.status;
		const base =
			status === 409
				? 'already exists'
				: (org.error?.error?.message ?? `org create returned ${status}`);
		// The Place was committed first and the Commons exposes no place-delete
		// endpoint, so we can't roll it back. Report it rather than leave the
		// operator to discover a stray Place. It carries our externalId when one
		// was available, so it's dedup-keyed (a later success reuses it); without
		// one, a retry can fork another — which is exactly what we flag.
		return { placeId, error: `${base}${orphanNote(externalId)}` };
	}
	return { orgId: org.data.organization.id, placeId };
}

/** Append an honest note about the Place left behind by a failed org create. */
function orphanNote(externalId: string | undefined): string {
	return externalId
		? ` (a Place was created and kept; it's keyed to ${externalId}, so a retry reuses it)`
		: ' (a Place was created but has no external id — a retry may create another; consider a Google Places or OSM identity)';
}
