import { describe, it, expect } from 'vitest';
import { _buildOrgListQuery as buildOrgListQuery } from './+page.server.js';

const base = {
	search: '',
	verified: 'all' as const,
	owner: 'all' as const,
	contributorSlug: null,
	offset: 0,
};

describe('buildOrgListQuery', () => {
	it('always sets limit and offset', () => {
		const q = buildOrgListQuery({ ...base, offset: 120 });
		expect(q.limit).toBe(60);
		expect(q.offset).toBe(120);
	});

	it('omits optional filters when not set', () => {
		const q = buildOrgListQuery(base);
		expect(q.q).toBeUndefined();
		expect(q.verified).toBeUndefined();
		expect(q.created_by_contributor).toBeUndefined();
		expect(q.near).toBeUndefined();
		expect(q.radius_km).toBeUndefined();
	});

	it('passes search, verified, and owner (with a slug)', () => {
		const q = buildOrgListQuery({
			...base,
			search: 'pub',
			verified: 'verified',
			owner: 'mine',
			contributorSlug: 'me',
		});
		expect(q.q).toBe('pub');
		expect(q.verified).toBe(true);
		expect(q.created_by_contributor).toBe('me');
	});

	it('does not set created_by_contributor for owner=mine without a slug', () => {
		const q = buildOrgListQuery({ ...base, owner: 'mine', contributorSlug: null });
		expect(q.created_by_contributor).toBeUndefined();
	});

	it('sends near + radius_km when a resolved location is provided', () => {
		const q = buildOrgListQuery({ ...base, near: '39.96,-75.14', radiusKm: 2 });
		expect(q.near).toBe('39.96,-75.14');
		expect(q.radius_km).toBe(2);
	});

	it('defaults radius_km to 5 when near is set without an explicit radius', () => {
		const q = buildOrgListQuery({ ...base, near: '39.96,-75.14' });
		expect(q.radius_km).toBe(5);
	});

	it('never sends radius_km without near (the Commons requires near)', () => {
		const q = buildOrgListQuery({ ...base, radiusKm: 25 });
		expect(q.near).toBeUndefined();
		expect(q.radius_km).toBeUndefined();
	});
});
