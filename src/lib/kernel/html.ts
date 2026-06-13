const ENTITIES: Record<string, string> = {
	'&amp;': '&',
	'&lt;': '<',
	'&gt;': '>',
	'&quot;': '"',
	'&#39;': "'",
	'&nbsp;': ' ',
};

/** Decode the handful of HTML entities that show up in feed / scraped text.
 *  Shared by the RSS and scrape tools. Single-pass so each entity decodes
 *  exactly once: replacing `&amp;` first used to double-decode `&amp;lt;`
 *  (the escaped text "&lt;") into "<" instead of the literal "&lt;". */
export function decodeEntities(s: string): string {
	return s.replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m]);
}
