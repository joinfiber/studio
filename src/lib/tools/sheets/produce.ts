/**
 * Sheets ingestion — pure transforms (client-importable; the network fetch
 * lives in the route's server action).
 *
 * `normalizeSheetUrl` turns a Google Sheets edit URL into its CSV export.
 * `candidatesFromRows` maps parsed CSV rows + a column mapping into event
 * candidates. Provenance is `proxied` (the sheet is a relayed source).
 *
 * Date/time parsing is loose by design — sheets are messy. Common forms are
 * handled; unparseable-date rows are skipped and counted (the caller reports
 * the skip). Everything produced is editable in review, so near-misses get
 * fixed there.
 */

import { candidateId, type EventCandidate } from '$lib/kernel/candidate.js';
import { normalizeCategoryKey } from '$lib/kernel/categories.js';
import { assertSafeUrl } from '$lib/kernel/safe-fetch.js';

/** Which CSV column feeds each event field. Empty string = unmapped. */
export interface SheetMapping {
	name: string;
	date: string;
	time?: string;
	endTime?: string;
	venue?: string;
	address?: string;
	category?: string;
	description?: string;
}

export interface RowsToCandidatesOptions {
	sourceUrl: string;
	timezone: string;
}

export interface RowsToCandidatesResult {
	candidates: EventCandidate[];
	skipped: number;
}

export function normalizeSheetUrl(raw: string): string {
	const u = assertSafeUrl(raw);
	const m = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/.exec(u.pathname);
	if (m && u.hostname.includes('docs.google.com') && !u.pathname.includes('/export')) {
		const gid = (u.hash.match(/gid=(\d+)/) ?? u.search.match(/gid=(\d+)/) ?? [])[1] ?? '0';
		return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv&gid=${gid}`;
	}
	return u.toString();
}

const pad = (n: number) => String(n).padStart(2, '0');

function parseDateLoose(d: string): { y: number; mo: number; dy: number } | null {
	const t = d.trim();
	let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
	if (m) return { y: +m[1], mo: +m[2], dy: +m[3] };
	m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t); // US M/D/Y
	if (m) return { y: +m[3], mo: +m[1], dy: +m[2] };
	const parsed = Date.parse(t); // "May 21, 2026", etc.
	if (!Number.isNaN(parsed)) {
		const dt = new Date(parsed);
		// Local getters: Date.parse of a bare date is local midnight, so UTC
		// getters drift the calendar date back a day east of UTC.
		return { y: dt.getFullYear(), mo: dt.getMonth() + 1, dy: dt.getDate() };
	}
	return null;
}

function parseTimeLoose(t?: string): { h: number; mi: number } {
	if (!t) return { h: 0, mi: 0 };
	const m = /^(\d{1,2}):?(\d{2})?\s*(am|pm)?$/i.exec(t.trim());
	if (!m) return { h: 0, mi: 0 };
	let h = +m[1];
	const mi = m[2] ? +m[2] : 0;
	const ap = m[3]?.toLowerCase();
	if (ap === 'pm' && h < 12) h += 12;
	if (ap === 'am' && h === 12) h = 0;
	return { h, mi };
}

function col(row: Record<string, string>, key?: string): string | null {
	if (!key) return null;
	const v = row[key]?.trim();
	return v ? v : null;
}

export function candidatesFromRows(
	rows: Record<string, string>[],
	mapping: SheetMapping,
	opts: RowsToCandidatesOptions,
): RowsToCandidatesResult {
	const now = new Date().toISOString();
	const candidates: EventCandidate[] = [];
	let skipped = 0;

	rows.forEach((row, i) => {
		const name = col(row, mapping.name);
		const dateRaw = col(row, mapping.date);
		const date = dateRaw ? parseDateLoose(dateRaw) : null;
		if (!name || !date) {
			skipped += 1;
			return;
		}
		const start = parseTimeLoose(col(row, mapping.time) ?? undefined);
		const startIso = `${date.y}-${pad(date.mo)}-${pad(date.dy)}T${pad(start.h)}:${pad(start.mi)}:00`;
		let endIso: string | null = null;
		const endRaw = col(row, mapping.endTime);
		if (endRaw) {
			const end = parseTimeLoose(endRaw);
			endIso = `${date.y}-${pad(date.mo)}-${pad(date.dy)}T${pad(end.h)}:${pad(end.mi)}:00`;
		}

		candidates.push({
			id: candidateId('sheets', i, name, startIso, col(row, mapping.venue)),
			kind: 'event',
			status: 'pending',
			source_tool: 'sheets',
			source_uri: opts.sourceUrl,
			created_at: now,
			data: {
				name,
				start: startIso,
				timezone: opts.timezone,
				end: endIso,
				category: normalizeCategoryKey(col(row, mapping.category)) ?? 'community',
				description: col(row, mapping.description),
				location: {
					name: col(row, mapping.venue) ?? '',
					address: col(row, mapping.address),
					lat: null,
					lng: null,
				},
				organizer_name: null,
				image_url: null,
				source_method: 'proxied',
				source_feed_url: opts.sourceUrl,
			},
		});
	});

	return { candidates, skipped };
}
