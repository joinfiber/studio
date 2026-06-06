<!--
	Inline glossary term. Renders a word with a dotted underline; hovering or
	focusing it reveals a short definition (and a doc link when there is one),
	pulled from the single concepts.ts source of truth.

	Usage:
	  <Term id="proxied" />             → renders the concept's own term text
	  <Term id="proxied">proxied</Term> → override the displayed text/casing

	It's a reset <button> so it's keyboard-reachable and screen-reader-labelled
	without a11y hacks. The popover is CSS-driven on :hover / :focus — no
	positioning JS. Don't nest it inside an <a> (interactive-in-interactive).
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { CONCEPTS, type ConceptId } from '$lib/kernel/concepts.js';

	interface Props {
		id: ConceptId;
		children?: Snippet;
	}

	let { id, children }: Props = $props();
	const concept = $derived(CONCEPTS[id]);
</script>

<button class="term" type="button" aria-label={`${concept.term}: ${concept.definition}`}>
	{#if children}{@render children()}{:else}{concept.term}{/if}
	<span class="pop" role="tooltip">
		<span class="pop-term">{concept.term}</span>
		<span class="pop-def">{concept.definition}</span>
		{#if concept.doc}
			<a class="pop-doc" href={concept.doc} target="_blank" rel="noopener noreferrer"
				>Learn more ↗</a
			>
		{/if}
	</span>
</button>

<style>
	.term {
		position: relative;
		display: inline;
		font: inherit;
		color: inherit;
		background: none;
		border: none;
		border-bottom: 1px dotted #9ca3af;
		padding: 0;
		margin: 0;
		cursor: help;
	}
	.pop {
		position: absolute;
		left: 0;
		top: calc(100% + 11px);
		z-index: 60;
		width: 17rem;
		max-width: 80vw;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		padding: 0.65rem 0.8rem;
		background: #fff;
		color: #333;
		border: 1px solid #e5e5e5;
		border-radius: 8px;
		box-shadow: 0 8px 28px rgba(0, 0, 0, 0.12);
		font-size: 0.8rem;
		line-height: 1.5;
		font-weight: 400;
		text-align: left;
		text-transform: none;
		letter-spacing: normal;
		white-space: normal;
		opacity: 0;
		transform: translateY(-3px);
		pointer-events: none;
		transition:
			opacity 120ms ease,
			transform 120ms ease;
	}
	/* Transparent bridge over the gap so moving the cursor from the term down
	   to the popover doesn't pass through a non-hovered dead zone. */
	.pop::before {
		content: '';
		position: absolute;
		top: -11px;
		left: 0;
		width: 100%;
		height: 11px;
	}
	.term:hover .pop,
	.term:focus-visible .pop {
		opacity: 1;
		transform: translateY(0);
		pointer-events: auto;
	}
	.pop-term {
		font-size: 0.65rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: #999;
	}
	.pop-def {
		color: #333;
	}
	.pop-doc {
		color: var(--accent);
		text-decoration: none;
		font-size: 0.75rem;
	}
	.pop-doc:hover {
		text-decoration: underline;
	}
</style>
