import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { Client } from 'openapi-fetch';
import type { paths } from 'neighborhood-commons';
import { resolveOrganizerId, toOffsetIso } from '$lib/kernel/publish.js';
import { geocode, type GeocodedAddress } from '$lib/kernel/geocode.js';
import { findGooglePlaceId, googlePlacesConfigured } from '$lib/venues/google-places.js';

/**
 * Add → publish. Writes go server-side (the Commons key is private).
 *
 * A venue is an Organization at a Place. The Organization is the rich entity
 * (name, links, hours, logo) and the join `primaryPlaceId` points at a Place
 * for geo. So Add → Organization is the real "create a venue": it can attach a
 * primary place (created from a picked OSM result or a geocoded address) and
 * carry website / phone / socials / logo. Event attaches to an organizer org;
 * Place creates a bare location (rare — usually you want an Organization).
 *
 * The Place carries a googlePlaceId when a key is configured (the one Google
 * datum we store); all facts stay OSM-sourced.
 */

type Sdk = Client<paths>;

export const load: PageServerLoad = () => ({
	placeIdentity: googlePlacesConfigured(),
});

interface PlaceInput {
	name: string;
	address: string;
	lat: string;
	lng: string;
	addressJson: string;
}

/**
 * Resolve a Place id from either picked OSM coordinates or a typed address,
 * creating the Place in the Commons. Returns `{}` when no location was given
 * (a placeless org is valid). On failure returns `{ error }`.
 */
async function resolvePlaceId(
	sdk: Sdk,
	input: PlaceInput,
): Promise<{ id?: string; error?: string }> {
	const { name, address } = input;
	if (!address && !input.lat) return {}; // no location → placeless

	let latitude: number;
	let longitude: number;
	let postal: GeocodedAddress | undefined;

	if (input.lat && input.lng) {
		latitude = Number(input.lat);
		longitude = Number(input.lng);
		if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
			return { error: 'Invalid coordinates from the picked result.' };
		}
		if (input.addressJson) {
			try {
				postal = (JSON.parse(input.addressJson) as GeocodedAddress) ?? undefined;
			} catch {
				postal = undefined;
			}
		}
	} else {
		const geo = await geocode(address);
		if (!geo) {
			return {
				error: `Couldn’t geocode “${address}”. Try a more specific address, or pick from the list.`,
			};
		}
		latitude = geo.lat;
		longitude = geo.lng;
		postal = geo.address;
	}

	// Stable identity (best-effort): place_id is the only Google field we store.
	let googlePlaceId: string | undefined;
	if (googlePlacesConfigured()) {
		const q = [name, address].filter(Boolean).join(', ') || name;
		googlePlaceId = (await findGooglePlaceId(q, { lat: latitude, lng: longitude })) ?? undefined;
	}

	const result = await sdk.POST('/service/places', {
		body: {
			name: name || postal?.streetAddress || 'Place',
			geo: { latitude, longitude },
			address: postal,
			googlePlaceId,
		},
	});
	if (result.data) return { id: result.data.place.id };
	return {
		error:
			result.error?.error?.message ??
			`Commons returned ${result.response.status} creating the place.`,
	};
}

function splitList(raw: string): string[] | undefined {
	const items = raw
		.split(',')
		.map((t) => t.trim())
		.filter(Boolean);
	return items.length ? items : undefined;
}

export const actions: Actions = {
	organization: async ({ request, locals }) => {
		const { commons } = locals;
		if (!commons.configured || !commons.sdk) {
			return fail(400, {
				kind: 'organization' as const,
				error: 'Commons isn’t configured on this instance.',
			});
		}

		const data = await request.formData();
		const name = String(data.get('name') ?? '').trim();
		if (!name) return fail(400, { kind: 'organization' as const, error: 'Name is required.' });

		const description = String(data.get('description') ?? '').trim() || undefined;
		const url = String(data.get('url') ?? '').trim() || undefined;
		const logo = String(data.get('logo') ?? '').trim() || undefined;
		const telephone = String(data.get('telephone') ?? '').trim() || undefined;
		const commercialRaw = String(data.get('commercial') ?? 'unspecified');
		const commercial = commercialRaw === 'unspecified' ? undefined : commercialRaw === 'true';
		const tags = splitList(String(data.get('tags') ?? ''));
		const sameAs = splitList(String(data.get('sameAs') ?? ''));

		// Optional primary place (the venue join).
		let primaryPlaceId: string | undefined;
		try {
			const place = await resolvePlaceId(commons.sdk, {
				name,
				address: String(data.get('placeAddress') ?? '').trim(),
				lat: String(data.get('lat') ?? '').trim(),
				lng: String(data.get('lng') ?? '').trim(),
				addressJson: String(data.get('addressJson') ?? '').trim(),
			});
			if (place.error) return fail(422, { kind: 'organization' as const, error: place.error });
			primaryPlaceId = place.id;
		} catch (err) {
			return fail(400, {
				kind: 'organization' as const,
				error: err instanceof Error ? err.message : 'Could not resolve the place.',
			});
		}

		const result = await commons.sdk.POST('/service/organizations', {
			body: { name, description, url, logo, telephone, commercial, tags, sameAs, primaryPlaceId },
		});

		if (result.data) {
			return {
				kind: 'organization' as const,
				ok: true as const,
				name: result.data.organization.name,
				slug: result.data.organization.slug,
			};
		}

		// If a primary Place was created above and the org create then failed, the
		// Place is committed and the Commons has no delete endpoint to undo it.
		// Say so rather than let the operator discover a stray Place.
		const orphan = primaryPlaceId
			? ' A Place was already created; the Organization was not — re-submit to attach it.'
			: '';
		const status = result.response.status;
		if (status === 409) {
			return fail(409, {
				kind: 'organization' as const,
				error: `Slug already in use for "${name}". Try a more specific name.${orphan}`,
			});
		}
		if (status === 401) {
			return fail(401, {
				kind: 'organization' as const,
				error: `Unauthorized — check the Commons service key.${orphan}`,
			});
		}
		return fail(status, {
			kind: 'organization' as const,
			error: `${result.error?.error?.message ?? `Commons returned ${status}.`}${orphan}`,
		});
	},

	event: async ({ request, locals }) => {
		const { commons } = locals;
		if (!commons.configured || !commons.sdk) {
			return fail(400, {
				kind: 'event' as const,
				error: 'Commons isn’t configured on this instance.',
			});
		}

		const data = await request.formData();
		const name = String(data.get('name') ?? '').trim();
		const organizer = String(data.get('organizer') ?? '').trim();
		const when = String(data.get('when') ?? '').trim();
		const end = String(data.get('end') ?? '').trim();
		const timezone = String(data.get('timezone') ?? '').trim() || 'America/New_York';
		// Commons category keys are underscore; the picker is underscore now, but
		// normalize defensively in case a kebab value slips in.
		const category = (String(data.get('category') ?? '').trim() || 'community').replace(/-/g, '_');
		const venue = String(data.get('venue') ?? '').trim();
		const address = String(data.get('address') ?? '').trim();
		const description = String(data.get('description') ?? '').trim();

		if (!name) return fail(400, { kind: 'event' as const, error: 'Name is required.' });
		if (!organizer) {
			return fail(400, {
				kind: 'event' as const,
				error: 'Organizer is required — events attach to an organization.',
			});
		}
		if (!when)
			return fail(400, { kind: 'event' as const, error: 'A start date/time is required.' });

		try {
			const organizerOrganizationId = await resolveOrganizerId(commons.sdk, organizer);
			const result = await commons.sdk.POST('/service/events', {
				body: {
					organizerOrganizationId,
					source_method: 'self_asserted',
					name,
					start: toOffsetIso(when, timezone),
					end: end ? toOffsetIso(end, timezone) : undefined,
					timezone,
					category,
					location: { name: venue || name, address: address || undefined },
					description: description || undefined,
					status: 'published',
				},
			});

			if (result.data) {
				return { kind: 'event' as const, ok: true as const, name };
			}

			const status = result.response.status;
			if (status === 403) {
				return fail(403, {
					kind: 'event' as const,
					error: `Not linked to "${organizer}" — a standard key publishes only for orgs it owns (admin keys bypass this).`,
				});
			}
			return fail(status, {
				kind: 'event' as const,
				error: result.error?.error?.message ?? `Commons returned ${status}.`,
			});
		} catch (err) {
			return fail(400, {
				kind: 'event' as const,
				error: err instanceof Error ? err.message : 'Publish failed.',
			});
		}
	},

	place: async ({ request, locals }) => {
		const { commons } = locals;
		if (!commons.configured || !commons.sdk) {
			return fail(400, {
				kind: 'place' as const,
				error: 'Commons isn’t configured on this instance.',
			});
		}

		const data = await request.formData();
		const name = String(data.get('name') ?? '').trim();
		const address = String(data.get('address') ?? '').trim();
		const lat = String(data.get('lat') ?? '').trim();
		if (!name) return fail(400, { kind: 'place' as const, error: 'Name is required.' });
		if (!address && !lat) {
			return fail(400, {
				kind: 'place' as const,
				error: 'Pick a result or enter an address — a place needs coordinates.',
			});
		}

		try {
			const place = await resolvePlaceId(commons.sdk, {
				name,
				address,
				lat,
				lng: String(data.get('lng') ?? '').trim(),
				addressJson: String(data.get('addressJson') ?? '').trim(),
			});
			if (place.error) return fail(422, { kind: 'place' as const, error: place.error });
			if (!place.id) {
				return fail(400, {
					kind: 'place' as const,
					error: 'A place needs an address or a picked result.',
				});
			}
			return { kind: 'place' as const, ok: true as const, name };
		} catch (err) {
			return fail(400, {
				kind: 'place' as const,
				error: err instanceof Error ? err.message : 'Publish failed.',
			});
		}
	},
};
