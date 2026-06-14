import { describe, it, expect } from 'vitest';
import { orgFeatureDiff } from './org-features.js';

describe('orgFeatureDiff', () => {
	it('targets the given org id with a single update entry', () => {
		const diff = orgFeatureDiff('org-1', { reviewed: true });
		expect(diff.update).toHaveLength(1);
		expect(diff.update?.[0].id).toBe('org-1');
	});

	it('encodes properties as addOrUpdateProperties key/value pairs', () => {
		const diff = orgFeatureDiff('org-1', { reviewed: true });
		expect(diff.update?.[0].addOrUpdateProperties).toEqual([{ key: 'reviewed', value: true }]);
	});

	it('handles a name change', () => {
		const diff = orgFeatureDiff('org-2', { name: 'New Name' });
		expect(diff.update?.[0].addOrUpdateProperties).toEqual([{ key: 'name', value: 'New Name' }]);
	});

	it('carries multiple changed properties', () => {
		const diff = orgFeatureDiff('org-3', { name: 'X', reviewed: false });
		expect(diff.update?.[0].addOrUpdateProperties).toEqual([
			{ key: 'name', value: 'X' },
			{ key: 'reviewed', value: false },
		]);
	});

	it('drops undefined values (nothing to set)', () => {
		const diff = orgFeatureDiff('org-4', { name: undefined, reviewed: true });
		expect(diff.update?.[0].addOrUpdateProperties).toEqual([{ key: 'reviewed', value: true }]);
	});

	it('does not add or remove whole features (update-only)', () => {
		const diff = orgFeatureDiff('org-5', { reviewed: true });
		expect(diff.add).toBeUndefined();
		expect(diff.remove).toBeUndefined();
		expect(diff.removeAll).toBeUndefined();
	});
});
