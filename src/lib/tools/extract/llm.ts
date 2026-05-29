/**
 * LLM event extraction. Calls an OpenAI-compatible chat endpoint (DeepInfra
 * by default, matching the current Studio) to pull structured events out of
 * unstructured text — newsletter bodies, pasted listings, scraped pages.
 *
 * Bring-your-own-key: reads INFERENCE_API_KEY from env. Studio ships none.
 * The capability framework gates the surface so this only runs when the
 * developer has set their own key.
 */

import { env } from '$env/dynamic/private';
import { CATEGORIES } from '$lib/kernel/categories.js';

const DEFAULT_URL = 'https://api.deepinfra.com/v1/openai';
const DEFAULT_MODEL = 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo';
const MAX_INPUT = 16000;

export interface ExtractedEvent {
	name: string;
	date: string | null; // YYYY-MM-DD
	time: string | null; // HH:MM
	venue: string | null;
	description: string | null;
	category: string | null;
}

const CATEGORY_SLUGS = CATEGORIES.map((c) => c.slug).join(', ');

function systemPrompt(today: string): string {
	return [
		'You extract real-world calendar events from text a user pastes (a newsletter, a listings page).',
		`Today is ${today}. If a date omits the year, infer the most likely upcoming year.`,
		'Return ONLY a JSON object of the form {"events": [...]}. Each event has:',
		'- name (string, required)',
		'- date (string "YYYY-MM-DD", required — OMIT any event without a determinable date)',
		'- time (string "HH:MM" 24-hour, or null)',
		'- venue (string or null)',
		'- description (string, one sentence, or null)',
		`- category (one of: ${CATEGORY_SLUGS}; use "community" if unsure)`,
		'Output nothing but the JSON object.',
	].join('\n');
}

const VALID = new Set(CATEGORIES.map((c) => c.slug));

function normalizeCategory(c: string | null | undefined): string | null {
	if (!c) return null;
	const slug = c.trim().toLowerCase();
	return VALID.has(slug) ? slug : 'community';
}

function parseContent(content: string): ExtractedEvent[] {
	// Strip markdown code fences if the model wrapped the JSON.
	const cleaned = content.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
	let obj: unknown;
	try {
		obj = JSON.parse(cleaned);
	} catch {
		return [];
	}
	const raw =
		(obj as { events?: unknown }).events ?? (Array.isArray(obj) ? obj : []);
	if (!Array.isArray(raw)) return [];
	return raw
		.map((e): ExtractedEvent | null => {
			const r = e as Record<string, unknown>;
			const name = typeof r.name === 'string' ? r.name.trim() : '';
			if (!name) return null;
			return {
				name,
				date: typeof r.date === 'string' && r.date.trim() ? r.date.trim() : null,
				time: typeof r.time === 'string' && r.time.trim() ? r.time.trim() : null,
				venue: typeof r.venue === 'string' && r.venue.trim() ? r.venue.trim() : null,
				description:
					typeof r.description === 'string' && r.description.trim()
						? r.description.trim()
						: null,
				category: normalizeCategory(typeof r.category === 'string' ? r.category : null),
			};
		})
		.filter((e): e is ExtractedEvent => e !== null);
}

export async function extractEventsFromText(text: string): Promise<ExtractedEvent[]> {
	const apiKey = env.INFERENCE_API_KEY;
	if (!apiKey) throw new Error('INFERENCE_API_KEY is not set.');
	const base = (env.INFERENCE_API_URL ?? DEFAULT_URL).replace(/\/$/, '');
	const model = env.INFERENCE_MODEL ?? DEFAULT_MODEL;
	const today = new Date().toISOString().slice(0, 10);

	const res = await fetch(`${base}/chat/completions`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify({
			model,
			temperature: 0,
			response_format: { type: 'json_object' },
			messages: [
				{ role: 'system', content: systemPrompt(today) },
				{ role: 'user', content: text.slice(0, MAX_INPUT) },
			],
		}),
		signal: AbortSignal.timeout(60000),
	});

	if (!res.ok) {
		const body = await res.text().catch(() => '');
		throw new Error(`Inference request failed (${res.status}). ${body.slice(0, 200)}`);
	}

	const data = (await res.json()) as {
		choices?: { message?: { content?: string } }[];
	};
	const content = data.choices?.[0]?.message?.content ?? '';
	return parseContent(content);
}
