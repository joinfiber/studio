import type { GeoJSONSourceDiff } from 'maplibre-gl';

/** The org-feature properties the map patches in place. */
export type OrgFeatureProps = Partial<{ name: string; reviewed: boolean }>;

/**
 * A maplibre source diff that updates ONE org feature's properties in place.
 * Flipping `reviewed`/`name` used to re-serialize the entire ≤3000-feature
 * collection (full `setData`); a diff touches only the changed feature.
 *
 * Requires the `orgs` source to use `promoteId: 'id'` so a feature is
 * addressable by its org id. `undefined` values are dropped (nothing to set).
 */
export function orgFeatureDiff(orgId: string, props: OrgFeatureProps): GeoJSONSourceDiff {
	const addOrUpdateProperties = Object.entries(props)
		.filter(([, value]) => value !== undefined)
		.map(([key, value]) => ({ key, value }));
	return { update: [{ id: orgId, addOrUpdateProperties }] };
}
