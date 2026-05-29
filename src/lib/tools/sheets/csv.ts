/**
 * Minimal RFC 4180 CSV parser — handles quoted fields, escaped quotes (""),
 * and commas/newlines inside quotes. Dependency-free.
 *
 * Returns the header row + objects keyed by header. Blank rows are dropped.
 */

export interface ParsedCsv {
	headers: string[];
	rows: Record<string, string>[];
}

export function parseCsv(text: string): ParsedCsv {
	const s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
	const records: string[][] = [];
	let field = '';
	let record: string[] = [];
	let inQuotes = false;

	for (let i = 0; i < s.length; i++) {
		const ch = s[i];
		if (inQuotes) {
			if (ch === '"') {
				if (s[i + 1] === '"') {
					field += '"';
					i++;
				} else {
					inQuotes = false;
				}
			} else {
				field += ch;
			}
		} else if (ch === '"') {
			inQuotes = true;
		} else if (ch === ',') {
			record.push(field);
			field = '';
		} else if (ch === '\n') {
			record.push(field);
			records.push(record);
			record = [];
			field = '';
		} else {
			field += ch;
		}
	}
	if (field.length > 0 || record.length > 0) {
		record.push(field);
		records.push(record);
	}

	if (records.length === 0) return { headers: [], rows: [] };

	const headers = records[0].map((h) => h.trim());
	const rows = records
		.slice(1)
		.filter((r) => r.some((c) => c.trim() !== ''))
		.map((r) => {
			const obj: Record<string, string> = {};
			headers.forEach((h, idx) => {
				obj[h] = (r[idx] ?? '').trim();
			});
			return obj;
		});

	return { headers, rows };
}
