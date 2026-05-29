import { describe, it, expect } from 'vitest';
import { CATEGORIES } from './categories.js';

describe('CATEGORIES', () => {
	it('uses underscore slugs (the Commons write keys) — never kebab', () => {
		// The Service API validates category against underscore keys (live_music,
		// not live-music). A kebab slug here would silently fail to publish.
		for (const c of CATEGORIES) {
			expect(c.slug, c.slug).not.toMatch(/-/);
			expect(c.slug).toMatch(/^[a-z_]+$/);
		}
	});

	it('includes the canonical multi-word keys', () => {
		const slugs = CATEGORIES.map((c) => c.slug);
		expect(slugs).toContain('live_music');
		expect(slugs).toContain('open_mic');
		expect(slugs).toContain('trivia_games');
		expect(slugs).toContain('kids_family');
	});
});
