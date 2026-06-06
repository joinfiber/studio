<!--
	Inline-editable event candidate card.

	Borderless inputs: text fields look like prose until hovered/focused, then
	show a subtle affordance. The operator tidies the candidate in place; edits
	bind directly to the passed candidate object (no callback ceremony).

	Evidence fields (image, submitter, provenance method, organizer) are
	read-only — facts about the candidate's origin, not editorial choices.

	Used by the Sources import previews and the Ingested review queue.
-->
<script lang="ts">
	import type { EventCandidate } from '../candidate.js';
	import { CATEGORIES } from '../categories.js';

	interface Props {
		candidate: EventCandidate;
	}

	let { candidate }: Props = $props();
</script>

<article class="card">
	{#if candidate.data.image_url}
		<img class="hero" src={candidate.data.image_url} alt="" />
	{/if}

	<div class="body">
		<input class="title" type="text" bind:value={candidate.data.name} />

		<div class="meta-row">
			<input class="time" type="text" bind:value={candidate.data.start} aria-label="Start time" />
			<span class="dot">·</span>
			<select class="category" bind:value={candidate.data.category} aria-label="Category">
				{#each CATEGORIES as cat}
					<option value={cat.slug}>{cat.label}</option>
				{/each}
			</select>
		</div>

		<div class="venue-row">
			<input
				class="venue"
				type="text"
				bind:value={candidate.data.location.name}
				placeholder="Venue name"
				aria-label="Venue name"
			/>
			<input
				class="address"
				type="text"
				value={candidate.data.location.address ?? ''}
				oninput={(e) =>
					(candidate.data.location.address = (e.currentTarget as HTMLInputElement).value || null)}
				placeholder="Address"
				aria-label="Address"
			/>
		</div>

		<textarea
			class="description"
			rows="3"
			placeholder="Description"
			value={candidate.data.description ?? ''}
			oninput={(e) =>
				(candidate.data.description = (e.currentTarget as HTMLTextAreaElement).value || null)}
			aria-label="Description"
		></textarea>

		<div class="footer">
			{#if candidate.submitter}
				<div class="submitter">
					{#if candidate.submitter.avatar_url}
						<img class="avatar" src={candidate.submitter.avatar_url} alt="" />
					{/if}
					<span>submitted by {candidate.submitter.display_name}</span>
				</div>
			{:else}
				<span class="submitter-empty"></span>
			{/if}
			<div class="provenance">
				<span class="method">{candidate.data.source_method}</span>
				{#if candidate.data.organizer_name}
					<span class="dot">·</span>
					<span class="organizer">{candidate.data.organizer_name}</span>
				{/if}
			</div>
		</div>
	</div>
</article>

<style>
	.card {
		background: #fff;
		border: 1px solid #e5e5e5;
		border-radius: 8px;
		overflow: hidden;
	}
	.hero {
		display: block;
		width: 100%;
		max-height: 55vh;
		object-fit: contain;
		background: #f5f5f5;
	}
	.body {
		padding: 1.25rem 1.5rem 1.5rem;
	}

	/* Borderless edit affordance: prose by default, subtle on hover, clear
	   on focus. No layout shift — relies on background + bottom-border. */
	input,
	textarea,
	select {
		font-family: inherit;
		color: inherit;
		background: transparent;
		border: none;
		border-bottom: 1px solid transparent;
		outline: none;
		padding: 2px 4px;
		margin: -2px -4px;
		border-radius: 3px;
		transition:
			background-color 100ms ease,
			border-color 100ms ease;
		width: 100%;
	}
	input:hover,
	textarea:hover,
	select:hover {
		background: #f4f4f4;
	}
	input:focus,
	textarea:focus,
	select:focus {
		background: #fff;
		border-bottom-color: var(--accent);
		box-shadow: 0 1px 0 0 var(--accent);
	}

	.title {
		font-size: 1.5rem;
		font-weight: 600;
		line-height: 1.25;
		display: block;
		margin-bottom: 0.5rem;
	}

	.meta-row {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		font-size: 0.95rem;
		color: #444;
		margin-bottom: 0.4rem;
	}
	.time {
		flex: 1;
		min-width: 0;
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.85rem;
	}
	.category {
		flex: 0 0 auto;
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #666;
		cursor: pointer;
	}

	.venue-row {
		display: flex;
		gap: 0.75rem;
		margin-bottom: 0.75rem;
	}
	.venue {
		font-size: 0.95rem;
		color: #333;
		flex: 1;
		min-width: 0;
	}
	.address {
		font-size: 0.95rem;
		color: #888;
		flex: 1.4;
		min-width: 0;
	}

	.description {
		font-family: inherit;
		font-size: 0.95rem;
		line-height: 1.5;
		color: #333;
		resize: vertical;
		margin: 0.75rem 0 1rem;
		display: block;
	}

	.footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding-top: 0.75rem;
		border-top: 1px solid #f0f0f0;
		font-size: 0.8rem;
		color: #666;
	}
	.submitter {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.submitter-empty {
		visibility: hidden;
	}
	.avatar {
		width: 20px;
		height: 20px;
		border-radius: 50%;
		object-fit: cover;
	}
	.provenance {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.method {
		text-transform: uppercase;
		letter-spacing: 0.04em;
		font-size: 0.7rem;
		color: #888;
	}
	.dot {
		color: #bbb;
	}
</style>
