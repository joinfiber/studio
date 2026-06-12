import { describe, it, expect } from 'vitest';
import { parseCsv } from './csv.js';

describe('parseCsv', () => {
	it('parses headers + rows keyed by header', () => {
		const { headers, rows } = parseCsv('Name,Date\nOpen Mic,2026-05-21\nTrivia,2026-05-22');
		expect(headers).toEqual(['Name', 'Date']);
		expect(rows).toEqual([
			{ Name: 'Open Mic', Date: '2026-05-21' },
			{ Name: 'Trivia', Date: '2026-05-22' },
		]);
	});

	it('handles quoted fields with commas and newlines', () => {
		const { rows } = parseCsv('Name,Note\n"Brenda\'s, Inc.","line1\nline2"');
		expect(rows[0]).toEqual({ Name: "Brenda's, Inc.", Note: 'line1\nline2' });
	});

	it('handles escaped quotes ("")', () => {
		const { rows } = parseCsv('Name\n"She said ""hi"""');
		expect(rows[0].Name).toBe('She said "hi"');
	});

	it('drops blank rows', () => {
		const { rows } = parseCsv('Name\nA\n\n   \nB');
		expect(rows.map((r) => r.Name)).toEqual(['A', 'B']);
	});

	it('normalizes CRLF and trims cells', () => {
		const { headers, rows } = parseCsv('A, B\r\n x , y \r\n');
		expect(headers).toEqual(['A', 'B']);
		expect(rows[0]).toEqual({ A: 'x', B: 'y' });
	});

	it('returns empty for empty input', () => {
		expect(parseCsv('')).toEqual({ headers: [], rows: [] });
	});
});

describe('stray quotes (RFC 4180 leniency)', () => {
	it('treats a mid-field quote as literal text instead of swallowing the rest of the file', () => {
		const { rows } = parseCsv(
			'name,venue\nJoe "The Man" Smith,Hall A\nSecond Event,Hall B\nThird Event,Hall C\n',
		);
		expect(rows).toHaveLength(3);
		expect(rows[0].name).toBe('Joe "The Man" Smith');
		expect(rows[1].name).toBe('Second Event');
		expect(rows[2].venue).toBe('Hall C');
	});

	it('still honours a properly quoted field with commas and escaped quotes', () => {
		const { rows } = parseCsv('name,venue\n"Quiz, ""Night""",Hall A\nNext,Hall B\n');
		expect(rows).toHaveLength(2);
		expect(rows[0].name).toBe('Quiz, "Night"');
		expect(rows[1].name).toBe('Next');
	});
});
