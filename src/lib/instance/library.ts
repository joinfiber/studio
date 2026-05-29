/**
 * Library data — the operator's view of events in the Commons, read via the
 * Service API (`GET /service/events`).
 *
 * The service read is key-authority-scoped: an admin key sees the whole
 * corpus; a standard key sees its own. That's the model the Commons enforces
 * — Studio just calls and renders what comes back.
 *
 * `ServiceEvent` is DB-flavored (title/venue_name/event_date/start_time…) and
 * — notably — omits organizer name and source_method (a known gap in the
 * service read shape). It does carry `status`, which is the operator signal we
 * surface. Dates/times are local wall-clock in `event_timezone`; we display
 * them as-is (no tz conversion).
 */

import type { ServiceEvent } from 'neighborhood-commons';

export type EventStatus = 'published' | 'pending_review' | 'draft' | string;

export interface LiveEvent {
	id: string;
	title: string;
	venue: string | null;
	address: string | null;
	date: string | null; // YYYY-MM-DD, local to timezone
	time: string | null; // HH:MM, local to timezone
	endTime: string | null; // HH:MM, local
	timezone: string;
	category: string | null;
	description: string | null;
	imageUrl: string | null;
	status: EventStatus;
	sourceFeedUrl: string | null;
	recurrence: string | null;
	// Curate-able metadata (editable via serviceBatchUpdateEvents).
	tags: string[];
	price: string | null;
	openWindow: boolean;
	wheelchairAccessible: boolean | null;
}

function hhmm(t: string | null | undefined): string | null {
	if (!t) return null;
	return t.slice(0, 5); // HH:MM:SS → HH:MM
}

export function mapServiceEvent(e: ServiceEvent): LiveEvent {
	return {
		id: e.id,
		title: e.title,
		venue: e.venue_name ?? null,
		address: e.address ?? null,
		date: e.event_date ?? null,
		time: hhmm(e.start_time),
		endTime: hhmm(e.end_time),
		timezone: e.event_timezone,
		category: e.category ?? null,
		description: e.description ?? null,
		imageUrl: e.image_url ?? null,
		status: e.status,
		sourceFeedUrl: e.source_feed_url ?? null,
		recurrence: e.recurrence ?? null,
		tags: e.tags ?? [],
		price: e.price ?? null,
		openWindow: e.open_window,
		wheelchairAccessible: e.wheelchair_accessible ?? null,
	};
}
