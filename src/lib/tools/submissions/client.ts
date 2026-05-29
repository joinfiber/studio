/**
 * Community-submissions connector.
 *
 * Studio's "Submissions" surface moderates user-generated content from an app
 * you operate: it reads that app's pending queue, shows each item for review,
 * and posts your approve/reject decision back. The app owns the data and does
 * any downstream publish (e.g., to the Commons) on approval — Studio is only
 * the moderation interface, so the submitter's identity never enters Studio.
 *
 * This is the reference adapter. It expects an upstream app exposing the two
 * endpoints below (see README). Point it at your app via SUBMISSIONS_API_URL +
 * SUBMISSIONS_API_KEY, and adapt the request shapes / CommunitySubmission type
 * if your app's API differs.
 */

import { env } from '$env/dynamic/private';

export interface CommunitySubmission {
	id: string;
	content: string;
	description: string | null;
	place_name: string | null;
	event_at: string | null;
	end_time: string | null;
	event_image_url: string | null;
	event_image_focal_y: number | null;
	category: string | null;
	link_url: string | null;
	region_name: string | null;
	status: string;
	from_poster_scan: boolean;
	organizer_name: string | null;
	created_at: string;
}

function config(): { base: string; key: string } {
	const base = env.SUBMISSIONS_API_URL?.replace(/\/$/, '');
	const key = env.SUBMISSIONS_API_KEY;
	if (!base || !key) {
		throw new Error(
			'Submissions source is not configured (SUBMISSIONS_API_URL + SUBMISSIONS_API_KEY).',
		);
	}
	return { base, key };
}

export async function fetchSubmissionQueue(
	status: 'under_review' | 'published' = 'under_review',
): Promise<CommunitySubmission[]> {
	const { base, key } = config();
	const res = await fetch(`${base}/api/studio/community-events?status=${status}`, {
		headers: { 'X-Studio-Key': key },
		signal: AbortSignal.timeout(15000),
	});
	if (!res.ok) throw new Error(`Submission source returned ${res.status} fetching the queue.`);
	const json = (await res.json()) as { data?: CommunitySubmission[] };
	return json.data ?? [];
}

export async function setSubmissionStatus(
	id: string,
	status: 'published' | 'rejected',
	reason?: string,
): Promise<void> {
	const { base, key } = config();
	const res = await fetch(`${base}/api/studio/community-events/${id}/status`, {
		method: 'PATCH',
		headers: { 'X-Studio-Key': key, 'Content-Type': 'application/json' },
		body: JSON.stringify({ status, reason }),
		signal: AbortSignal.timeout(15000),
	});
	if (!res.ok) {
		const j = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
		throw new Error(j?.error?.message ?? `Submission source returned ${res.status}.`);
	}
}
