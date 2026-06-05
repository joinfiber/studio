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
import type { GeocodedAddress } from './geocode.js';

type Sdk = Client<paths>;
type PlaceInput = components['schemas']['PlaceInput'];
type OrgInput = components['schemas']['OrganizationInput'];

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
	openingHours?: unknown[];
}

export async function createVenue(
	sdk: Sdk,
	v: VenueInput,
): Promise<{ orgId?: string; placeId?: string; error?: string }> {
	// Stable identity (best-effort): the place_id is the only Google field we store.
	let googlePlaceId: string | undefined;
	if (googlePlacesConfigured()) {
		const q =
			[v.name, v.address?.streetAddress, v.address?.addressLocality].filter(Boolean).join(', ') ||
			v.name;
		googlePlaceId = (await findGooglePlaceId(q, { lat: v.lat, lng: v.lng })) ?? undefined;
	}

	const place = await sdk.POST('/service/places', {
		body: {
			name: v.name,
			geo: { latitude: v.lat, longitude: v.lng },
			address: v.address,
			googlePlaceId,
		} as PlaceInput,
	});
	if (!place.data) {
		return { error: place.error?.error?.message ?? `place create returned ${place.response.status}` };
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
	// openingHoursSpecification may also lag the SDK type; attach at runtime.
	if (v.openingHours?.length) {
		(orgBody as Record<string, unknown>).openingHoursSpecification = v.openingHours;
	}
	const org = await sdk.POST('/service/organizations', { body: orgBody });
	if (!org.data) {
		const status = org.response.status;
		return {
			error: status === 409 ? 'already exists' : org.error?.error?.message ?? `org create returned ${status}`,
		};
	}
	return { orgId: org.data.organization.id, placeId };
}
