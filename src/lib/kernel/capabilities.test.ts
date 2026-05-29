import { describe, it, expect, beforeEach } from 'vitest';
// Import the stub directly: under vitest, `$env/dynamic/private` is aliased to
// this same file, so the `env` object here IS the one capabilities.ts reads.
// (Importing from the real `$env/...` would fail typecheck — no `clearEnv`.)
import { env, clearEnv } from '$lib/test/env-stub.js';
import { getCapabilities, getCapability, capabilityReady } from './capabilities.js';

beforeEach(clearEnv);

describe('capabilities', () => {
	it('commons is not ready with no key, ready once the key is present', () => {
		expect(capabilityReady('commons')).toBe(false);
		env.COMMONS_SERVICE_KEY = 'sk_test';
		expect(capabilityReady('commons')).toBe(true);
	});

	it('optional prereqs do not gate readiness (contributor slug)', () => {
		env.COMMONS_SERVICE_KEY = 'sk_test';
		const commons = getCapability('commons');
		const slug = commons?.prereqs.find((p) => p.env === 'COMMONS_CONTRIBUTOR_SLUG');
		expect(slug?.optional).toBe(true);
		expect(slug?.met).toBe(false);
		expect(commons?.ready).toBe(true); // still ready — slug is optional
	});

	it('geocode is ready by default (OSM needs no key)', () => {
		// All its prereqs are optional (BYO endpoint/key), so it is available out of the box.
		expect(capabilityReady('geocode')).toBe(true);
	});

	it('place-identity requires the Google key', () => {
		expect(capabilityReady('place-identity')).toBe(false);
		env.GOOGLE_PLACES_API_KEY = 'g_test';
		expect(capabilityReady('place-identity')).toBe(true);
	});

	it('community-submissions needs both source URL and key', () => {
		env.SUBMISSIONS_API_URL = 'https://app.example';
		expect(capabilityReady('community-submissions')).toBe(false);
		env.SUBMISSIONS_API_KEY = 'shared';
		expect(capabilityReady('community-submissions')).toBe(true);
	});

	it('reports presence without exposing values', () => {
		env.COMMONS_SERVICE_KEY = 'super-secret';
		const json = JSON.stringify(getCapabilities());
		expect(json).not.toContain('super-secret');
	});
});
