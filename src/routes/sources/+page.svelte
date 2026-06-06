<script lang="ts">
	import type { PageData } from './$types';
	import Term from '$lib/kernel/chrome/Term.svelte';

	let { data }: { data: PageData } = $props();
</script>

<header class="page-head">
	<h2>Sources</h2>
	<p class="sub">
		Bring event data into the <Term id="commons">Commons</Term>. Each method fetches, lets you tidy
		the results, then publishes. Imports run on demand.
	</p>
</header>

<div class="methods">
	<a class="method" href="/sources/calendar">
		<div class="method-title">Calendar</div>
		<p class="method-desc">Import from an iCal / Google Calendar URL. Structured — paste and go.</p>
		<span class="provenance">proxied</span>
	</a>

	<a class="method" href="/sources/sheets">
		<div class="method-title">Sheet</div>
		<p class="method-desc">Import from a Google Sheet or CSV, mapping columns to event fields.</p>
		<span class="provenance">proxied</span>
	</a>

	<a class="method" href="/sources/rss">
		<div class="method-title">Feed</div>
		<p class="method-desc">Import items from an RSS / Atom feed.</p>
		<span class="provenance">proxied</span>
	</a>

	<a class="method" href="/sources/extract" class:dim={!data.llmReady}>
		<div class="method-title">
			Paste text <span class="tag">LLM</span>
		</div>
		<p class="method-desc">Extract events from a newsletter or any unstructured text.</p>
		{#if data.llmReady}
			<span class="provenance">proxied</span>
		{:else}
			<span class="needs">Needs setup · INFERENCE_API_KEY</span>
		{/if}
	</a>

	<a class="method" href="/sources/scrape" class:dim={!data.llmReady}>
		<div class="method-title">
			Scrape page <span class="tag">LLM</span>
		</div>
		<p class="method-desc">
			Fetch a listings page and extract events. Generic; custom adapters per site.
		</p>
		{#if data.llmReady}
			<span class="provenance">proxied</span>
		{:else}
			<span class="needs">Needs setup · INFERENCE_API_KEY</span>
		{/if}
	</a>

	<a class="method" href="/sources/venues">
		<div class="method-title">Venues</div>
		<p class="method-desc">
			Bulk-import venues in an area from OpenStreetMap as organizations. Builds the venue spine.
		</p>
		<span class="provenance">organizations</span>
	</a>

	<a class="method create" href="/guide/extending">
		<div class="method-title"><span class="plus">+</span> Create new</div>
		<p class="method-desc">
			Build your own source. The guide walks through adding an ingestion tool — and contributing it
			back to the repo.
		</p>
		<span class="provenance">guide →</span>
	</a>
</div>

<p class="footer-note">
	Each method publishes as <Term id="proxied">proxied</Term> — attributed to the source it relays from.
	Saved subscriptions with scheduled auto-fetch are coming. For now, each import runs when you trigger
	it.
</p>

<style>
	.page-head {
		margin-bottom: 1.5rem;
	}
	.page-head h2 {
		margin: 0 0 0.4rem;
		font-size: 1.25rem;
		font-weight: 600;
	}
	.sub {
		margin: 0;
		font-size: 0.9rem;
		color: #666;
		max-width: 620px;
		line-height: 1.5;
	}
	.methods {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
		gap: 0.85rem;
		max-width: 900px;
	}
	.method {
		display: block;
		background: #fff;
		border: 1px solid #e5e5e5;
		border-radius: 8px;
		padding: 1.1rem 1.25rem;
		text-decoration: none;
		color: inherit;
		transition:
			border-color 100ms ease,
			box-shadow 100ms ease,
			transform 100ms ease;
	}
	.method:hover {
		border-color: var(--accent);
		box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
		transform: translateY(-1px);
	}
	.method.dim {
		opacity: 0.85;
	}
	.method.create {
		border-style: dashed;
		border-color: #d0d0d0;
		background: #fcfcfc;
	}
	.method.create:hover {
		border-color: var(--accent);
		background: #fff;
	}
	.plus {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.15rem;
		height: 1.15rem;
		border-radius: 4px;
		background: var(--accent);
		color: #fff;
		font-weight: 600;
		font-size: 0.9rem;
		line-height: 1;
	}
	.method-title {
		font-size: 1rem;
		font-weight: 600;
		color: #222;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.method-desc {
		margin: 0.4rem 0 0.75rem;
		font-size: 0.85rem;
		color: #666;
		line-height: 1.45;
	}
	.tag {
		font-size: 0.6rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		background: #e0e7ff;
		color: #3730a3;
		padding: 0.1rem 0.4rem;
		border-radius: 999px;
	}
	.provenance {
		font-size: 0.65rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #999;
	}
	.needs {
		font-size: 0.72rem;
		color: #92400e;
		background: #fffbeb;
		border: 1px solid #fde68a;
		padding: 0.1rem 0.45rem;
		border-radius: 4px;
	}
	.footer-note {
		max-width: 900px;
		margin: 1.5rem 0 0;
		font-size: 0.8rem;
		color: #999;
	}
</style>
