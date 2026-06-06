/**
 * In-app guides — rendered straight from the repo's `docs/*.md` files.
 *
 * Single source of truth: the markdown files ARE the docs. The /guide routes
 * render them, so editing (say) docs/extending.md updates both the repo doc and
 * the in-app guide on the next build — nothing is duplicated.
 *
 * Vite inlines the raw markdown at build time via import.meta.glob. The content
 * is first-party (our own docs), so marked's HTML is rendered with {@html}.
 */

import { marked } from 'marked';

const files = import.meta.glob('../../../docs/*.md', {
	query: '?raw',
	import: 'default',
	eager: true,
}) as Record<string, string>;

export interface GuideMeta {
	slug: string;
	title: string;
	description: string;
}

function slugOf(path: string): string {
	return (path.split('/').pop() ?? path).replace(/\.md$/, '');
}

function titleOf(md: string, slug: string): string {
	const m = md.match(/^#\s+(.+?)\s*$/m);
	return m ? m[1].trim() : slug;
}

function descriptionOf(md: string): string {
	for (const line of md.split('\n')) {
		const t = line.trim();
		if (!t || t.startsWith('#')) continue;
		return t
			.replace(/[*_`[\]]/g, '')
			.replace(/\(https?:\/\/[^)]+\)/g, '')
			.slice(0, 180);
	}
	return '';
}

/** All guides, for the index grid. */
export function listGuides(): GuideMeta[] {
	return Object.entries(files)
		.map(([path, md]) => {
			const slug = slugOf(path);
			return { slug, title: titleOf(md, slug), description: descriptionOf(md) };
		})
		.sort((a, b) => a.title.localeCompare(b.title));
}

/** One guide rendered to HTML, or null if the slug is unknown. */
export function getGuide(slug: string): { slug: string; title: string; html: string } | null {
	const entry = Object.entries(files).find(([path]) => slugOf(path) === slug);
	if (!entry) return null;
	const md = entry[1];
	return { slug, title: titleOf(md, slug), html: marked.parse(md) as string };
}
