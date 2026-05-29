import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	checkPassword,
	issueToken,
	gateEnabled,
	COOKIE_NAME,
	MAX_AGE_SECONDS,
	PARTIAL_TTL_SECONDS,
	verifyToken,
} from '$lib/kernel/session';
import { totpEnabled, verifyTotp } from '$lib/kernel/totp';

export const load: PageServerLoad = () => {
	if (!gateEnabled()) {
		throw redirect(303, '/');
	}
	return {};
};

export const actions: Actions = {
	password: async ({ request, cookies, url }) => {
		const data = await request.formData();
		const password = String(data.get('password') ?? '');

		if (!checkPassword(password)) {
			return fail(401, { step: 'password' as const, error: 'Incorrect password.' });
		}

		const secure = url.protocol === 'https:';

		if (totpEnabled()) {
			// Password OK — issue a short-lived partial session, move to the code step.
			cookies.set(COOKIE_NAME, issueToken('password', PARTIAL_TTL_SECONDS), {
				path: '/',
				httpOnly: true,
				secure,
				sameSite: 'lax',
				maxAge: PARTIAL_TTL_SECONDS,
			});
			return { step: 'totp' as const };
		}

		// No MFA configured yet — full session. The layout nudges enrollment.
		cookies.set(COOKIE_NAME, issueToken('full'), {
			path: '/',
			httpOnly: true,
			secure,
			sameSite: 'lax',
			maxAge: MAX_AGE_SECONDS,
		});
		throw redirect(303, '/');
	},

	totp: async ({ request, cookies, url }) => {
		// Require a valid password-level session from the first step.
		if (!verifyToken(cookies.get(COOKIE_NAME), 'password')) {
			return fail(401, { step: 'password' as const, error: 'Session expired. Start over.' });
		}

		const data = await request.formData();
		const code = String(data.get('code') ?? '');

		if (!verifyTotp(code)) {
			return fail(401, { step: 'totp' as const, error: 'Invalid code.' });
		}

		cookies.set(COOKIE_NAME, issueToken('full'), {
			path: '/',
			httpOnly: true,
			secure: url.protocol === 'https:',
			sameSite: 'lax',
			maxAge: MAX_AGE_SECONDS,
		});
		throw redirect(303, '/');
	},
};
