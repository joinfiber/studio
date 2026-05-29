/**
 * Minimal RFC 5545 VEVENT parser for one-shot calendar import.
 *
 * Handles line unfolding, VEVENT extraction, the common DTSTART/DTEND forms
 * (UTC `Z`, `TZID=`, `VALUE=DATE` all-day), and text unescaping. Deliberately
 * dependency-free and small — it covers the fields an event candidate needs.
 *
 * Does NOT expand RRULE: a recurring event imports as its DTSTART instance
 * for v1. Series expansion can come later (the Commons stores expanded
 * instances anyway).
 */

export interface ParsedDate {
	/** Wall-clock ISO (no offset) for TZID/floating, or `…Z` for UTC. */
	iso: string;
	/** IANA tz from TZID, 'UTC' for Z-suffixed, or null when floating. */
	tz: string | null;
	allDay: boolean;
}

export interface ParsedVEvent {
	uid: string | null;
	summary: string | null;
	description: string | null;
	location: string | null;
	url: string | null;
	start: ParsedDate | null;
	end: ParsedDate | null;
}

function unfold(raw: string): string[] {
	const lines = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
	const out: string[] = [];
	for (const line of lines) {
		if ((line.startsWith(' ') || line.startsWith('\t')) && out.length > 0) {
			out[out.length - 1] += line.slice(1);
		} else {
			out.push(line);
		}
	}
	return out;
}

function unescapeText(v: string): string {
	return v
		.replace(/\\n/gi, '\n')
		.replace(/\\,/g, ',')
		.replace(/\\;/g, ';')
		.replace(/\\\\/g, '\\');
}

interface PropLine {
	name: string;
	params: Record<string, string>;
	value: string;
}

function parsePropLine(line: string): PropLine | null {
	const colon = line.indexOf(':');
	if (colon === -1) return null;
	const left = line.slice(0, colon);
	const value = line.slice(colon + 1);
	const parts = left.split(';');
	const name = parts[0].toUpperCase();
	const params: Record<string, string> = {};
	for (let i = 1; i < parts.length; i++) {
		const eq = parts[i].indexOf('=');
		if (eq !== -1) {
			params[parts[i].slice(0, eq).toUpperCase()] = parts[i].slice(eq + 1);
		}
	}
	return { name, params, value };
}

function parseDate(p: PropLine): ParsedDate | null {
	const v = p.value.trim();
	if (p.params.VALUE === 'DATE' || /^\d{8}$/.test(v)) {
		const m = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
		if (!m) return null;
		return { iso: `${m[1]}-${m[2]}-${m[3]}`, tz: null, allDay: true };
	}
	const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(v);
	if (!m) return null;
	const [, y, mo, d, h, mi, s, z] = m;
	const tz = p.params.TZID ?? (z ? 'UTC' : null);
	const local = `${y}-${mo}-${d}T${h}:${mi}:${s}`;
	return { iso: z ? `${local}Z` : local, tz, allDay: false };
}

export function parseIcal(text: string): ParsedVEvent[] {
	const lines = unfold(text);
	const events: ParsedVEvent[] = [];
	let cur: ParsedVEvent | null = null;

	for (const line of lines) {
		if (line === 'BEGIN:VEVENT') {
			cur = {
				uid: null,
				summary: null,
				description: null,
				location: null,
				url: null,
				start: null,
				end: null,
			};
			continue;
		}
		if (line === 'END:VEVENT') {
			if (cur) events.push(cur);
			cur = null;
			continue;
		}
		if (!cur) continue;

		const p = parsePropLine(line);
		if (!p) continue;
		switch (p.name) {
			case 'UID':
				cur.uid = p.value.trim();
				break;
			case 'SUMMARY':
				cur.summary = unescapeText(p.value);
				break;
			case 'DESCRIPTION':
				cur.description = unescapeText(p.value);
				break;
			case 'LOCATION':
				cur.location = unescapeText(p.value);
				break;
			case 'URL':
				cur.url = p.value.trim();
				break;
			case 'DTSTART':
				cur.start = parseDate(p);
				break;
			case 'DTEND':
				cur.end = parseDate(p);
				break;
		}
	}

	return events;
}
