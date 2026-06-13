/**
 * The 20 Commons event categories.
 *
 * Slugs are the canonical Commons keys (underscore) — the value the Service
 * API accepts on write. (The public read API renders them kebab-case; that's
 * a read-side cosmetic only.) Keep these in sync with the Commons taxonomy.
 *
 * Shared across Review (CandidateCard select) and Add (Event form select).
 */

export interface CategoryOption {
	slug: string;
	label: string;
}

export const CATEGORIES: readonly CategoryOption[] = [
	{ slug: 'live_music', label: 'Live music' },
	{ slug: 'dj_dance', label: 'DJ & dance' },
	{ slug: 'comedy', label: 'Comedy' },
	{ slug: 'theatre', label: 'Theatre' },
	{ slug: 'open_mic', label: 'Open mic' },
	{ slug: 'karaoke', label: 'Karaoke' },
	{ slug: 'art_exhibit', label: 'Art & exhibits' },
	{ slug: 'film', label: 'Film' },
	{ slug: 'literary', label: 'Literary' },
	{ slug: 'tour', label: 'Tour' },
	{ slug: 'happy_hour', label: 'Happy hour' },
	{ slug: 'market', label: 'Market' },
	{ slug: 'fitness', label: 'Fitness' },
	{ slug: 'sports', label: 'Sports' },
	{ slug: 'outdoors', label: 'Outdoors' },
	{ slug: 'class', label: 'Class' },
	{ slug: 'trivia_games', label: 'Trivia & games' },
	{ slug: 'kids_family', label: 'Kids & family' },
	{ slug: 'community', label: 'Community' },
	{ slug: 'spectator', label: 'Spectator' },
] as const;

const SLUGS: ReadonlySet<string> = new Set(CATEGORIES.map((c) => c.slug));

/**
 * Normalize a free-form category string (kebab/underscore/spaces, any case)
 * to its canonical Commons key, or null when it isn't one. The
 * underscore-on-write invariant lives HERE — every write sink (publish,
 * LLM extraction, sheets mapping) uses this instead of reimplementing it.
 */
export function normalizeCategoryKey(input: string | null | undefined): string | null {
	if (!input) return null;
	const key = input
		.trim()
		.toLowerCase()
		.replace(/[\s-]+/g, '_');
	return SLUGS.has(key) ? key : null;
}

const LABELS: ReadonlyMap<string, string> = new Map(CATEGORIES.map((c) => [c.slug, c.label]));

/**
 * Human label for a category key (any kebab/underscore/case form). Falls back
 * to a title-cased version of an unknown key rather than showing the raw
 * `live_music` slug in the UI.
 */
export function categoryLabel(key: string | null | undefined): string {
	if (!key) return '';
	const norm = normalizeCategoryKey(key);
	if (norm) return LABELS.get(norm) as string;
	return key.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
