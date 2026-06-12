import { fail, redirect } from '@sveltejs/kit';
import QRCode from 'qrcode';
import type { Actions, PageServerLoad } from './$types';
import { generateSecret, authUrl, checkCode, totpEnabled } from '$lib/kernel/totp';

const ENROLL_COOKIE = 'studio_enroll';
const ENROLL_TTL = 10 * 60; // 10 min

export const load: PageServerLoad = async ({ cookies, setHeaders }) => {
	// The freshly generated TOTP seed (and its QR) renders on this page —
	// never let a browser or intermediary cache it.
	setHeaders({ 'cache-control': 'no-store' });

	const inProgress = cookies.get(ENROLL_COOKIE);
	if (!inProgress) {
		return { stage: 'idle' as const, alreadyEnabled: totpEnabled() };
	}
	const otpauth = authUrl(inProgress);
	const qrSvg = await QRCode.toString(otpauth, { type: 'svg', margin: 1, width: 200 });
	return {
		stage: 'pending' as const,
		secret: inProgress,
		qrSvg,
		alreadyEnabled: totpEnabled(),
	};
};

export const actions: Actions = {
	begin: async ({ cookies, url }) => {
		const secret = generateSecret();
		cookies.set(ENROLL_COOKIE, secret, {
			path: '/enroll',
			httpOnly: true,
			secure: url.protocol === 'https:',
			sameSite: 'lax',
			maxAge: ENROLL_TTL,
		});
		throw redirect(303, '/enroll');
	},

	verify: async ({ request, cookies }) => {
		const secret = cookies.get(ENROLL_COOKIE);
		if (!secret) {
			return fail(400, { error: 'Enrollment expired. Start over.' });
		}
		const data = await request.formData();
		const code = String(data.get('code') ?? '');
		if (!checkCode(code, secret)) {
			return fail(400, {
				error: 'Code did not match. Check your authenticator and try again.',
			});
		}
		// Confirmed. Reveal the secret once for env-var setup, clear the cookie.
		cookies.delete(ENROLL_COOKIE, { path: '/enroll' });
		return { confirmed: true as const, secret };
	},

	cancel: async ({ cookies }) => {
		cookies.delete(ENROLL_COOKIE, { path: '/enroll' });
		throw redirect(303, '/enroll');
	},
};
