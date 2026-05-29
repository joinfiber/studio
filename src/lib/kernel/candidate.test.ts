import { describe, it, expect } from 'vitest';
import { candidateId } from './candidate.js';

describe('candidateId', () => {
	const base = () => candidateId('calendar', 0, 'Open Mic', '2026-05-21T19:00:00', 'Cafe Walnut');

	it('is stable for identical input (idempotent re-import)', () => {
		expect(candidateId('calendar', 0, 'Open Mic', '2026-05-21T19:00:00', 'Cafe Walnut')).toBe(base());
	});

	it('differs by tool, index, and content (no cross-import collision)', () => {
		expect(candidateId('sheets', 0, 'Open Mic', '2026-05-21T19:00:00', 'Cafe Walnut')).not.toBe(base());
		expect(candidateId('calendar', 1, 'Open Mic', '2026-05-21T19:00:00', 'Cafe Walnut')).not.toBe(base());
		expect(candidateId('calendar', 0, 'Trivia', '2026-05-21T19:00:00', 'Cafe Walnut')).not.toBe(base());
	});

	it('tolerates null/undefined seed parts', () => {
		expect(() => candidateId('rss', 2, 'X', null, undefined)).not.toThrow();
	});
});
