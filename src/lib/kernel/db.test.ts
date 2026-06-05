import { describe, it, expect } from 'vitest';
import {
	saveCandidates,
	listCandidates,
	getCandidate,
	setCandidateStatus,
	updateCandidate,
	deleteCandidate,
	setOrgReviewed,
	listReviewedOrgIds,
} from './db.js';
import type { EventCandidate } from './candidate.js';

const mk = (id: string, name: string): EventCandidate => ({
	id,
	kind: 'event',
	status: 'pending',
	source_tool: 'calendar',
	created_at: '2026-05-26T00:00:00Z',
	data: {
		name,
		start: '2026-05-21T19:00:00-04:00',
		timezone: 'America/New_York',
		category: 'community',
		location: { name: 'A Venue' },
		organizer_name: null,
		source_method: 'proxied',
	},
});

// In-memory libsql (no DATABASE_URL in tests) — exercises the real store.
describe('candidate store', () => {
	it('round-trips: save (stamping organizer) → list → status → delete', async () => {
		const saved = await saveCandidates([mk('cal-0', 'Round Trip A'), mk('cal-1', 'Round Trip B')], 'Acme Co');
		expect(saved).toBe(2);

		const pending = await listCandidates('pending');
		const a = pending.find((p) => p.candidate.data.name === 'Round Trip A');
		expect(a).toBeDefined();
		// organizer stamped onto both the column and the candidate payload
		expect(a!.organizer).toBe('Acme Co');
		expect(a!.candidate.data.organizer_name).toBe('Acme Co');
		expect(a!.source_tool).toBe('calendar');

		await setCandidateStatus(a!.id, 'published');
		expect((await getCandidate(a!.id))?.status).toBe('published');
		// published rows leave the pending list
		expect((await listCandidates('pending')).some((p) => p.id === a!.id)).toBe(false);

		const b = pending.find((p) => p.candidate.data.name === 'Round Trip B')!;
		await deleteCandidate(b.id);
		expect(await getCandidate(b.id)).toBeNull();
	});

	it('updateCandidate replaces the payload and re-derives the organizer column', async () => {
		await saveCandidates([mk('cal-9', 'Before Edit')], 'Old Org');
		const before = (await listCandidates('pending')).find((p) => p.candidate.data.name === 'Before Edit')!;
		const edited = structuredClone(before.candidate);
		edited.data.name = 'After Edit';
		edited.data.category = 'live_music';
		edited.data.organizer_name = 'New Org';
		await updateCandidate(before.id, edited);
		const after = await getCandidate(before.id);
		expect(after?.candidate.data.name).toBe('After Edit');
		expect(after?.candidate.data.category).toBe('live_music');
		expect(after?.organizer).toBe('New Org'); // column re-derived from payload
		await deleteCandidate(before.id);
	});

	it('falls back to the candidate organizer when none is passed', async () => {
		const cand = mk('cal-2', 'Self Organized');
		cand.data.organizer_name = 'Built-in Org';
		await saveCandidates([cand]);
		const row = (await listCandidates('pending')).find((p) => p.candidate.data.name === 'Self Organized');
		expect(row?.organizer).toBe('Built-in Org');
		if (row) await deleteCandidate(row.id);
	});
});

describe('org review overlay', () => {
	it('marks, lists, re-marks idempotently, and unmarks', async () => {
		const id = 'org-review-aaa';
		await setOrgReviewed(id, true);
		expect(await listReviewedOrgIds()).toContain(id);

		// Idempotent: marking again doesn't duplicate (PRIMARY KEY upsert).
		await setOrgReviewed(id, true);
		expect((await listReviewedOrgIds()).filter((x) => x === id)).toHaveLength(1);

		await setOrgReviewed(id, false);
		expect(await listReviewedOrgIds()).not.toContain(id);
	});

	it('tracks multiple venues independently', async () => {
		await setOrgReviewed('org-review-b', true);
		await setOrgReviewed('org-review-c', true);
		const ids = await listReviewedOrgIds();
		expect(ids).toEqual(expect.arrayContaining(['org-review-b', 'org-review-c']));
		await setOrgReviewed('org-review-b', false);
		const after = await listReviewedOrgIds();
		expect(after).toContain('org-review-c');
		expect(after).not.toContain('org-review-b');
	});
});
