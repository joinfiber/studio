/**
 * Concept glossary — one source of truth for the Commons vocabulary Studio
 * surfaces. The <Term> chrome component renders any of these with a dotted
 * underline and a hover/focus definition, so the jargon teaches itself in
 * place instead of sending a new developer to the docs.
 *
 * Definitions are plain-language and short. `doc` links the canonical Commons
 * reference where one exists. Keep these honest and aligned with the spec — a
 * clone developer learns the model from here.
 */

export interface Concept {
	/** Display term (lowercase; callers can override the rendered text). */
	term: string;
	/** One or two plain sentences. */
	definition: string;
	/** Canonical Commons doc, when there is one. */
	doc?: string;
}

const DOCS = 'https://neighborhood-commons.org/docs';

export type ConceptId =
	| 'commons'
	| 'contributor'
	| 'organizer'
	| 'venue'
	| 'provenance'
	| 'self_asserted'
	| 'proxied'
	| 'witnessed'
	| 'open_window'
	| 'first_party'
	| 'candidate'
	| 'service_key';

export const CONCEPTS: Record<ConceptId, Concept> = {
	commons: {
		term: 'Commons',
		definition:
			'The shared, open database of neighborhood events. Anyone can read it; contributors publish into it. Most of what you see was added by others — that is the point.',
		doc: DOCS,
	},
	contributor: {
		term: 'contributor',
		definition:
			'The app or tool that pushed an event into the Commons — that is you, identified by your service key. Readers can surface it as “via {you}”.',
		doc: `${DOCS}/four-roles`,
	},
	organizer: {
		term: 'organizer',
		definition:
			'The organization that actually runs the event — the venue, host, or group. Every event is published on behalf of exactly one organizer.',
		doc: `${DOCS}/four-roles`,
	},
	venue: {
		term: 'venue',
		definition:
			'Where the event happens — a place with a name and address. Distinct from the organizer, which is who runs it.',
		doc: `${DOCS}/four-roles`,
	},
	provenance: {
		term: 'provenance',
		definition:
			'How a fact got into the Commons — who asserted it and on what basis. Recorded per event as a source method, never guessed.',
		doc: `${DOCS}/provenance`,
	},
	self_asserted: {
		term: 'self-asserted',
		definition:
			'The organizer asserted its own event — the strongest first-party claim. Requires your key to be linked to that organization.',
		doc: `${DOCS}/provenance`,
	},
	proxied: {
		term: 'proxied',
		definition:
			'Relayed from a public source you don’t own — a scraped page or a feed — attributed honestly to that source URL.',
		doc: `${DOCS}/provenance`,
	},
	witnessed: {
		term: 'witnessed',
		definition:
			'Published from first-hand evidence you moderated, such as a community submission or a poster, under a collective publisher. Requires witness authority on your key.',
		doc: `${DOCS}/provenance`,
	},
	open_window: {
		term: 'open window',
		definition:
			'A come-and-go event with no single start moment. It stays visible for its whole window rather than disappearing once a start time passes.',
	},
	first_party: {
		term: 'first-party',
		definition:
			'Marks events whose organizer was verified at publish time — a trust signal the Commons computes, not something you set.',
	},
	candidate: {
		term: 'candidate',
		definition:
			'An event you’ve pulled in but not yet published — staged for review and tidying. Approving a candidate publishes it to the Commons.',
	},
	service_key: {
		term: 'service key',
		definition:
			'The API key that authorizes this instance. A standard key is scoped to its own organizations; an admin key can act across the whole Commons.',
	},
};
