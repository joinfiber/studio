/**
 * Service-key tier detection.
 *
 * Commons has two service-key tiers:
 *
 * - **Admin keys** (`api_keys.is_admin=true`) bypass scoping and can act on
 *   any organization's data. Issued only to the platform operator.
 * - **Standard service keys** are scoped to organizations via
 *   `api_key_organization_links`. Writes against unlinked orgs return
 *   `403 NOT_LINKED`.
 *
 * Studio uses this distinction to gate operator-only features (the
 * `src/lib/operator/` modules and their routes). The check is honor-system
 * via the COMMONS_IS_ADMIN env var — if a deployer sets it true without
 * actually holding an admin key, Commons-side writes fail with the
 * appropriate 403 and surface honest errors.
 *
 * Clone deployments leave COMMONS_IS_ADMIN unset or false. Operator routes
 * return 404 (don't leak admin-feature existence to non-admin instances).
 */

import { env } from '$env/dynamic/private';

export function isAdminInstance(): boolean {
	return env.COMMONS_IS_ADMIN === 'true';
}
