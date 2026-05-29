import type { LayoutServerLoad } from './$types';
import { gateEnabled } from '$lib/kernel/session';
import { totpEnabled } from '$lib/kernel/totp';

export const load: LayoutServerLoad = ({ locals }) => {
	return {
		isAdmin: locals.isAdmin,
		authed: locals.authed,
		gateEnabled: gateEnabled(),
		totpEnabled: totpEnabled(),
	};
};
