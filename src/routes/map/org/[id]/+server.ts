import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { components } from 'neighborhood-commons';
import { mapOrganization, pickOrgPatch } from '$lib/instance/organizations.js';

type OrgInput = components['schemas']['OrganizationInput'];

/** Full org for the map edit panel (lazy-loaded on click — keeps the map payload lean). */
export const GET: RequestHandler = async ({ params, locals }) => {
	const { commons } = locals;
	if (!commons.configured || !commons.sdk) {
		return json({ error: 'Commons isn’t configured on this instance.' }, { status: 400 });
	}
	try {
		const r = await commons.sdk.GET('/organizations/{idOrSlug}', {
			params: { path: { idOrSlug: params.id } },
		});
		if (!r.data?.organization) {
			return json({ error: 'Venue not found.' }, { status: 404 });
		}
		return json({ org: mapOrganization(r.data.organization), raw: r.data.organization });
	} catch (err) {
		// Network error / timeout / unparseable response — a clean 502 beats an
		// opaque framework 500 the client can't act on.
		return json(
			{ error: err instanceof Error ? err.message : 'Could not reach the Commons.' },
			{ status: 502 },
		);
	}
};

/**
 * Update a venue. PATCH /service/organizations/{id} is a partial merge — only
 * the changed fields are sent. 403 if this key isn't linked to the org (admin
 * keys bypass). Mirrors the venues-tab editor.
 */
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	const { commons } = locals;
	if (!commons.configured || !commons.sdk) {
		return json({ error: 'Commons isn’t configured on this instance.' }, { status: 400 });
	}
	let patch: Partial<OrgInput> & { openingHoursSpecification?: unknown[] };
	try {
		patch = await request.json();
	} catch {
		return json({ error: 'Invalid JSON.' }, { status: 400 });
	}
	if (!patch || Object.keys(patch).length === 0) {
		return json({ error: 'No changes.' }, { status: 400 });
	}
	// Allowlist the editable fields — don't forward an arbitrary object to the
	// privileged write. Shared with the Venues tab.
	const body = pickOrgPatch(patch as Record<string, unknown>);
	if (Object.keys(body).length === 0) {
		return json({ error: 'No editable fields in the update.' }, { status: 400 });
	}

	try {
		const r = await commons.sdk.PATCH('/service/organizations/{id}', {
			params: { path: { id: params.id } },
			body: body as OrgInput,
		});
		if (r.error) {
			const status = r.response.status;
			if (status === 403) {
				return json(
					{ error: 'Not linked — only this venue’s owner (or an admin key) can edit it.' },
					{ status: 403 },
				);
			}
			return json({ error: r.error?.error?.message ?? `Commons returned ${status}.` }, { status });
		}
		return json({ org: r.data ? mapOrganization(r.data.organization) : null });
	} catch (err) {
		return json(
			{ error: err instanceof Error ? err.message : 'Could not reach the Commons.' },
			{ status: 502 },
		);
	}
};
