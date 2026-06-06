import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { ServiceEvent } from 'neighborhood-commons';
import { mapServiceEvent, type LiveEvent } from '$lib/instance/library.js';

type StatusFilter = 'all' | 'published' | 'pending_review' | 'draft';
type TimeFilter = 'all' | 'upcoming' | 'past';
type MethodFilter = 'all' | 'self_asserted' | 'proxied' | 'witnessed';

const STATUS_VALUES: StatusFilter[] = ['all', 'published', 'pending_review', 'draft'];
const TIME_VALUES: TimeFilter[] = ['all', 'upcoming', 'past'];
const METHOD_VALUES: MethodFilter[] = ['all', 'self_asserted', 'proxied', 'witnessed'];
const PAGE_SIZE = 50;

function pick<T extends string>(value: string | null, allowed: T[], fallback: T): T {
	return value && (allowed as string[]).includes(value) ? (value as T) : fallback;
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const { commons } = locals;

	const status = pick(url.searchParams.get('status'), STATUS_VALUES, 'all');
	const time = pick(url.searchParams.get('time'), TIME_VALUES, 'all');
	const method = pick(url.searchParams.get('method'), METHOD_VALUES, 'all');
	const search = (url.searchParams.get('q') ?? '').trim();
	const category = (url.searchParams.get('category') ?? '').trim();
	const offset = Math.max(0, Math.trunc(Number(url.searchParams.get('offset')) || 0));

	const filters = { status, time, method, search, category, offset, pageSize: PAGE_SIZE };

	if (!commons.configured || !commons.sdk) {
		return { live: false as const, filters };
	}

	// Server-side filtering: serviceListEvents supports search/category/status/
	// source_method + limit/offset. Everything we surface is key-scoped (admin
	// sees the whole Commons; a standard key sees its own).
	const query: {
		time: TimeFilter;
		limit: number;
		offset: number;
		status?: 'published' | 'pending_review' | 'draft';
		source_method?: 'self_asserted' | 'proxied' | 'witnessed';
		search?: string;
		category?: string;
	} = { time, limit: PAGE_SIZE, offset };
	if (status !== 'all') query.status = status;
	if (method !== 'all') query.source_method = method;
	if (search) query.search = search;
	if (category) query.category = category;

	const result = await commons.sdk.GET('/service/events', { params: { query } });

	if (!result.data) {
		return {
			live: true as const,
			filters,
			events: [] as LiveEvent[],
			total: 0,
			error:
				result.error?.error?.message ??
				`Commons returned ${result.response.status} listing events.`,
		};
	}

	const raw = (result.data.events ?? []) as ServiceEvent[];
	return {
		live: true as const,
		filters,
		events: raw.map(mapServiceEvent),
		total: result.data.total ?? raw.length,
		error: null as string | null,
	};
};

export const actions: Actions = {
	// Curate metadata on a live event. Only the fields the Commons exposes as a
	// true partial update (serviceBatchUpdateEvents) are editable here — title,
	// date/time, and venue can't be patched via a service key (a current
	// Commons service-API limitation).
	update: async ({ request, locals }) => {
		const { commons } = locals;
		if (!commons.configured || !commons.sdk) {
			return fail(400, { error: 'Commons isn’t configured on this instance.' });
		}

		const data = await request.formData();
		const id = String(data.get('id') ?? '').trim();
		if (!id) return fail(400, { error: 'Missing event id.' });

		const status = String(data.get('status') ?? '').trim();
		const category = String(data.get('category') ?? '').trim();
		const tags = String(data.get('tags') ?? '')
			.split(',')
			.map((t) => t.trim())
			.filter(Boolean);
		const description = String(data.get('description') ?? '').trim();
		const price = String(data.get('price') ?? '').trim();

		const updates: {
			status?: 'published' | 'pending_review' | 'draft';
			category?: string;
			tags?: string[];
			description?: string | null;
			price?: string | null;
			open_window?: boolean;
			wheelchair_accessible?: boolean | null;
		} = {
			tags,
			description: description || null,
			price: price || null,
			open_window: data.get('open_window') === 'true',
			wheelchair_accessible: data.get('wheelchair_accessible') === 'true',
		};
		if (status === 'published' || status === 'pending_review' || status === 'draft') {
			updates.status = status;
		}
		if (category) updates.category = category;

		const result = await commons.sdk.PATCH('/service/events/batch', {
			body: { ids: [id], updates },
		});

		if (result.error) {
			return fail(400, {
				error: result.error?.error?.message ?? 'Could not save changes.',
			});
		}
		return { ok: true, id };
	},
};
