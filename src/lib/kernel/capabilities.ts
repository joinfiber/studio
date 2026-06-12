/**
 * Capability readiness — Studio guides the operator/developer by surfacing
 * what's configured and what's needed to unlock each capability.
 *
 * Privacy + OSS discipline: this only ever checks env-var *presence*, never
 * reads or exposes a value. Studio ships zero keys; a clone starts blank and
 * the guidance tells the developer to bring their own.
 *
 * Tool surfaces gate on `capabilityReady(id)` and show the prereqs inline
 * when not ready, instead of erroring. Settings shows the full picture.
 */

import { env } from '$env/dynamic/private';

export interface Prereq {
	/** Env var name (shown to the dev — never its value). */
	env: string;
	label: string;
	met: boolean;
	/** Where to get it / what to do — the unlock instruction. */
	howto: string;
	optional?: boolean;
}

export interface Capability {
	id: string;
	label: string;
	unlocks: string;
	prereqs: Prereq[];
	/** All required (non-optional) prereqs met. */
	ready: boolean;
}

function present(name: string): boolean {
	return !!env[name];
}

export function getCapabilities(): Capability[] {
	const caps: Omit<Capability, 'ready'>[] = [
		{
			id: 'commons',
			label: 'Connect to the Commons',
			unlocks:
				'Read and publish neighborhood events to the shared Commons. Everything else builds on this.',
			prereqs: [
				{
					env: 'COMMONS_SERVICE_KEY',
					label: 'Commons API key',
					met: present('COMMONS_SERVICE_KEY'),
					howto:
						'Register a free key at neighborhood-commons.org/developers. Studio ships none — bring your own.',
				},
				{
					env: 'COMMONS_CONTRIBUTOR_SLUG',
					label: 'Contributor handle',
					met: present('COMMONS_CONTRIBUTOR_SLUG'),
					howto:
						'Your handle from the developer dashboard. Lets readers see “via you” and shows your profile card.',
					optional: true,
				},
			],
		},
		{
			id: 'access',
			label: 'Lock down access',
			unlocks:
				'Require a password (and optional 2-factor) so only you can use this deployment. Essential once it’s on a public URL.',
			prereqs: [
				{
					env: 'STUDIO_PASSWORD',
					label: 'Access password',
					met: present('STUDIO_PASSWORD'),
					howto: 'Set a strong password. Required for any public deployment.',
				},
				{
					env: 'STUDIO_TOTP_SECRET',
					label: 'MFA secret',
					met: present('STUDIO_TOTP_SECRET'),
					howto: 'Enroll at /enroll, then set the generated secret + redeploy.',
					optional: true,
				},
			],
		},
		{
			id: 'llm',
			label: 'Extract events with AI',
			unlocks:
				'Pull events out of unstructured text — newsletters, listings pages. Powers the Paste-text and Scrape sources.',
			prereqs: [
				{
					env: 'INFERENCE_API_KEY',
					label: 'Inference API key',
					met: present('INFERENCE_API_KEY'),
					howto: 'Bring your own key for your inference provider. Studio ships none.',
				},
				{
					env: 'INFERENCE_API_URL',
					label: 'Provider endpoint',
					met: present('INFERENCE_API_URL'),
					howto:
						'OpenAI-compatible base URL. Defaults to DeepInfra — set this to use OpenAI, Together, Groq, a local model, etc. Your key must match this provider.',
					optional: true,
				},
				{
					env: 'INFERENCE_MODEL',
					label: 'Model',
					met: present('INFERENCE_MODEL'),
					howto: 'Defaults to Llama 3.1 8B (on DeepInfra). Set to a model your provider serves.',
					optional: true,
				},
			],
		},
		{
			id: 'map',
			label: 'Map view',
			unlocks:
				'A live map of the venue graph — Commons organizations as dots, plus the OpenStreetMap businesses around them to add or cross-check. The data comes from the Commons + OSM; this key only provides the basemap tiles.',
			prereqs: [
				{
					env: 'MAPTILER_API_KEY',
					label: 'MapTiler API key',
					met: present('MAPTILER_API_KEY'),
					howto:
						'A free MapTiler key (maptiler.com) for the basemap. It is used in the browser, so restrict it to your domain in the MapTiler dashboard.',
				},
			],
		},
		{
			id: 'geocode',
			label: 'Geocode places',
			unlocks:
				'Turn a street address into coordinates so you can publish Places. Works out of the box via OpenStreetMap; point it at your own provider for volume.',
			prereqs: [
				{
					env: 'GEOCODER_API_URL',
					label: 'Geocoder endpoint',
					met: present('GEOCODER_API_URL'),
					howto:
						'Optional. Defaults to OpenStreetMap’s public Nominatim (no key; light use only, ~1 req/s). Set to a self-hosted Nominatim or a Nominatim-compatible host for volume.',
					optional: true,
				},
				{
					env: 'GEOCODER_API_KEY',
					label: 'Geocoder key',
					met: present('GEOCODER_API_KEY'),
					howto:
						'Optional. Sent as ?key= when your geocoder endpoint requires it (e.g. LocationIQ). Not needed for the public OSM default.',
					optional: true,
				},
			],
		},
		{
			id: 'place-identity',
			label: 'Stable venue identity + Google compare',
			unlocks:
				'Attach a Google Place ID when publishing a place (so the same venue from different contributors dedups to one record), and show Google’s name/address/phone/hours next to OpenStreetMap’s in the map curation panel for cross-checking. Places still publish without it (deduped on location instead); the Google reference data is shown only, never stored.',
			prereqs: [
				{
					env: 'GOOGLE_PLACES_API_KEY',
					label: 'Google Places API key',
					met: present('GOOGLE_PLACES_API_KEY'),
					howto:
						'A Google Places API key. Studio requests ONLY the place_id (the one field Google’s terms permit storing indefinitely) — all venue facts still come from OpenStreetMap.',
				},
			],
		},
		{
			id: 'community-submissions',
			label: 'Accept community submissions',
			unlocks:
				'Moderate events that people submit through an app you operate, and publish the ones you approve. Point it at your app’s submission queue.',
			prereqs: [
				{
					env: 'SUBMISSIONS_API_URL',
					label: 'Submission source',
					met: present('SUBMISSIONS_API_URL'),
					howto:
						'Base URL of the app whose submission queue you moderate. Studio reads its pending queue and posts your approve/reject decisions back to it.',
				},
				{
					env: 'SUBMISSIONS_API_KEY',
					label: 'Source shared key',
					met: present('SUBMISSIONS_API_KEY'),
					howto:
						'Shared secret that authenticates Studio to your app. The reference connector sends it as a header — adapt it to your app’s API.',
				},
			],
		},
	];

	return caps.map((c) => ({
		...c,
		ready: c.prereqs.filter((p) => !p.optional).every((p) => p.met),
	}));
}

export function getCapability(id: string): Capability | undefined {
	return getCapabilities().find((c) => c.id === id);
}

export function capabilityReady(id: string): boolean {
	return getCapability(id)?.ready ?? false;
}
