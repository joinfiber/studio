import { describe, it, expect } from 'vitest';
import { CATEGORIES, normalizeCategoryKey } from './categories.js';

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

describe('normalizeCategoryKey', () => {
	it('accepts the canonical underscore key', () => {
		expect(normalizeCategoryKey('live_music')).toBe('live_music');
	});

	it('converts kebab, spaced, and mixed-case forms', () => {
		expect(normalizeCategoryKey('live-music')).toBe('live_music');
		expect(normalizeCategoryKey('Live Music')).toBe('live_music');
		expect(normalizeCategoryKey('  TRIVIA-GAMES ')).toBe('trivia_games');
	});

	it('returns null for unknown or empty values', () => {
		expect(normalizeCategoryKey('birthday-party')).toBeNull();
		expect(normalizeCategoryKey('')).toBeNull();
		expect(normalizeCategoryKey(null)).toBeNull();
		expect(normalizeCategoryKey(undefined)).toBeNull();
	});
});
