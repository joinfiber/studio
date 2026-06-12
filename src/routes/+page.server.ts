import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getCapability } from '$lib/kernel/capabilities.js';
import {
	fetchSubmissionQueue,
	setSubmissionStatus,
	type CommunitySubmission,
} from '$lib/tools/submissions/client.js';
import {
	listCandidates,
	getCandidate,
	deleteCandidate,
	updateCandidate,
	type StoredCandidate,
} from '$lib/kernel/db.js';
import { resolveOrganizerId, publishEventCandidate } from '$lib/kernel/publish.js';
import { parseEventCandidate } from '$lib/kernel/candidate-parse.js';
import type { EventCandidate } from '$lib/kernel/candidate.js';

export const load: PageServerLoad = async ({ locals }) => {
	const capability = getCapability('community-submissions');
	let submissions: CommunitySubmission[] = [];
	let submissionsError: string | null = null;

	if (capability?.ready) {
		try {
			submissions = await fetchSubmissionQueue('under_review');
		} catch (err) {
			submissionsError = err instanceof Error ? err.message : 'Failed to load submissions.';
		}
	}

	// Persistent ingested-candidate queue (libsql). Failure is non-fatal.
	let ingested: StoredCandidate[] = [];
	let ingestedError: string | null = null;
	try {
		ingested = await listCandidates('pending');
	} catch (err) {
		ingestedError = err instanceof Error ? err.message : 'Failed to load the queue.';
	}

	return {
		isAdmin: locals.isAdmin,
		commonsConfigured: locals.commons.configured,
		capability,
		submissions,
		submissionsError,
		ingested,
		ingestedError,
	};
};

export const actions: Actions = {
	approve: async ({ request }) => {
		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		if (!id) return fail(400, { error: 'Missing event id.' });
		try {
			await setSubmissionStatus(id, 'published');
			return { ok: true, id, action: 'approved' as const };
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : 'Approve failed.' });
		}
	},

	reject: async ({ request }) => {
		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		const reason = String(data.get('reason') ?? '').trim() || undefined;
		if (!id) return fail(400, { error: 'Missing event id.' });
		try {
			await setSubmissionStatus(id, 'rejected', reason);
			return { ok: true, id, action: 'rejected' as const };
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : 'Reject failed.' });
		}
	},

	// --- Ingested queue (persistent candidates) ---
	queuePublish: async ({ request, locals }) => {
		const { commons } = locals;
		if (!commons.configured || !commons.sdk) {
			return fail(400, { error: 'Commons isn’t configured on this instance.' });
		}
		const data = await request.formData();
		const id = Number(data.get('id'));
		if (!id) return fail(400, { error: 'Missing candidate id.' });

		const row = await getCandidate(id);
		if (!row) return fail(404, { error: 'Candidate not found.' });
		const organizer = row.organizer || row.candidate.data.organizer_name || '';
		if (!organizer.trim()) {
			return fail(400, {
				error: 'No organizer on this candidate — re-save it from the source with an organizer.',
			});
		}

		try {
			const orgId = await resolveOrganizerId(commons.sdk, organizer);
			const result = await publishEventCandidate(commons.sdk, row.candidate, orgId);
			if (!result.ok) return fail(400, { error: result.error ?? 'Publish failed.' });
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : 'Publish failed.' });
		}

		// Published. The queue delete is housekeeping — if only IT fails, say
		// that honestly instead of 'Publish failed': the event is already live,
		// and a retried publish would create a duplicate.
		try {
			await deleteCandidate(id);
		} catch {
			return {
				ok: true,
				id,
				action: 'published' as const,
				warning:
					'Published to the Commons, but the queue row could not be removed — clear it with Reject; do not publish it again.',
			};
		}
		return { ok: true, id, action: 'published' as const };
	},

	queueUpdate: async ({ request }) => {
		const data = await request.formData();
		const id = Number(data.get('id'));
		if (!id) return fail(400, { error: 'Missing candidate id.' });
		let candidate: EventCandidate;
		try {
			candidate = parseEventCandidate(JSON.parse(String(data.get('candidate') ?? '')));
		} catch (err) {
			return fail(400, {
				error: err instanceof Error ? err.message : 'Could not read the edited candidate.',
			});
		}
		try {
			const updated = await updateCandidate(id, candidate);
			if (!updated) {
				return fail(404, { error: 'That candidate is no longer in the queue.' });
			}
			return { ok: true, id, action: 'updated' as const };
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : 'Save failed.' });
		}
	},

	queueReject: async ({ request }) => {
		const data = await request.formData();
		const id = Number(data.get('id'));
		if (!id) return fail(400, { error: 'Missing candidate id.' });
		try {
			await deleteCandidate(id);
			return { ok: true, id, action: 'rejected' as const };
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : 'Reject failed.' });
		}
	},
};
