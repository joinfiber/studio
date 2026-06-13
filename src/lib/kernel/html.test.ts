import { describe, it, expect } from 'vitest';
import { decodeEntities } from './html.js';

describe('decodeEntities', () => {
	it('decodes the common named/numeric entities', () => {
		expect(decodeEntities('Tom &amp; Jerry')).toBe('Tom & Jerry');
		expect(decodeEntities('a &lt; b &gt; c')).toBe('a < b > c');
		expect(decodeEntities('&quot;quoted&quot;')).toBe('"quoted"');
		expect(decodeEntities('it&#39;s')).toBe("it's");
		expect(decodeEntities('a&nbsp;b')).toBe('a b');
	});

	it('decodes each entity exactly once (no double-decode of &amp;lt;)', () => {
		// The escaped text for a literal "&lt;" is "&amp;lt;". It must decode to
		// "&lt;", NOT all the way to "<".
		expect(decodeEntities('&amp;lt;')).toBe('&lt;');
		expect(decodeEntities('5 &amp;gt; 3 in code')).toBe('5 &gt; 3 in code');
	});

	it('leaves unknown entities and bare ampersands untouched', () => {
		expect(decodeEntities('100% &copy; 2026')).toBe('100% &copy; 2026');
		expect(decodeEntities('A & B')).toBe('A & B');
	});

	it('handles repeated and adjacent entities', () => {
		expect(decodeEntities('&amp;&amp;&lt;&gt;')).toBe('&&<>');
	});
});
