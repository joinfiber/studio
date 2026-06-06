<script lang="ts">
	import { enhance } from '$app/forms';
	import type { EventCandidate } from '$lib/kernel/candidate.js';
	import { candidatesFromRows, type SheetMapping } from '$lib/tools/sheets/produce.js';
	import CandidateCard from '$lib/kernel/chrome/CandidateCard.svelte';
	import { toast } from '$lib/kernel/chrome/toast.svelte.js';
	import { saveToQueue } from '$lib/kernel/queue-client.js';
	import Term from '$lib/kernel/chrome/Term.svelte';

	let headers = $state<string[]>([]);
	let rows = $state<Record<string, string>[]>([]);
	let sourceUrl = $state('');
	let timezone = $state('America/New_York');
	let organizer = $state('');
	let fetching = $state(false);
	let publishing = $state(false);
	let queuing = $state(false);

	async function queueSave() {
		if (candidates.length === 0) return;
		if (!organizer.trim()) {
			toast.push('Name the organizer first.', 'error');
			return;
		}
		queuing = true;
		try {
			const n = await saveToQueue(candidates, organizer);
			toast.push(`Saved ${n} to the review queue.`, 'success');
			candidates = [];
		} catch (e) {
			toast.push(e instanceof Error ? e.message : 'Save failed.', 'error');
		} finally {
			queuing = false;
		}
	}

	let mapping = $state<SheetMapping>({ name: '', date: '' });
	let candidates = $state<EventCandidate[]>([]);

	// Field definitions for the mapping UI.
	const fields: { key: keyof SheetMapping; label: string; required?: boolean; hints: string[] }[] =
		[
			{ key: 'name', label: 'Name', required: true, hints: ['name', 'title', 'event'] },
			{ key: 'date', label: 'Date', required: true, hints: ['date', 'day', 'when'] },
			{ key: 'time', label: 'Start time', hints: ['time', 'start'] },
			{ key: 'endTime', label: 'End time', hints: ['end'] },
			{ key: 'venue', label: 'Venue', hints: ['venue', 'location', 'place', 'where'] },
			{ key: 'address', label: 'Address', hints: ['address', 'street'] },
			{ key: 'category', label: 'Category', hints: ['category', 'type', 'kind'] },
			{
				key: 'description',
				label: 'Description',
				hints: ['description', 'desc', 'details', 'notes'],
			},
		];

	function autoGuess(hdrs: string[]): SheetMapping {
		const m: SheetMapping = { name: '', date: '' };
		for (const f of fields) {
			const match = hdrs.find((h) => f.hints.some((hint) => h.toLowerCase().includes(hint)));
			if (match) (m[f.key] as string) = match;
		}
		return m;
	}

	function generate() {
		if (!mapping.name || !mapping.date) {
			toast.push('Map at least Name and Date.', 'error');
			return;
		}
		const result = candidatesFromRows(rows, mapping, { sourceUrl, timezone });
		candidates = result.candidates;
		if (result.candidates.length === 0) {
			toast.push('No rows produced candidates — check the Date mapping.', 'error');
		} else if (result.skipped > 0) {
			toast.push(
				`Generated ${result.candidates.length}, skipped ${result.skipped} (no name / bad date).`,
				'info',
				5000,
			);
		} else {
			toast.push(`Generated ${result.candidates.length} candidates.`, 'success');
		}
	}

	function removeCandidate(id: string) {
		candidates = candidates.filter((c) => c.id !== id);
	}
</script>

<nav class="breadcrumb"><a href="/sources">← Sources</a></nav>

<header class="head">
	<h2>Import from a sheet</h2>
	<p class="sub">
		Paste a Google Sheets share/export URL (or any CSV URL). Map the columns, generate candidates,
		tidy, publish. Imported events are <Term id="proxied">proxied</Term> — attributed to the source.
	</p>
</header>

<form
	method="POST"
	action="?/fetch"
	class="fetch-form"
	use:enhance={() => {
		fetching = true;
		return async ({ result }) => {
			fetching = false;
			if (result.type === 'success' && result.data) {
				headers = (result.data.headers as string[]) ?? [];
				rows = (result.data.rows as Record<string, string>[]) ?? [];
				sourceUrl = String(result.data.sourceUrl ?? '');
				mapping = autoGuess(headers);
				candidates = [];
				toast.push(`Loaded ${rows.length} rows, ${headers.length} columns.`, 'success');
			} else if (result.type === 'failure') {
				toast.push(String(result.data?.error ?? 'Import failed.'), 'error');
			}
		};
	}}
>
	<input
		type="url"
		name="url"
		placeholder="https://docs.google.com/spreadsheets/d/.../edit"
		required
	/>
	<input
		type="text"
		name="timezone"
		bind:value={timezone}
		class="tz"
		aria-label="Default timezone"
	/>
	<button type="submit" class="primary" disabled={fetching}>{fetching ? 'Loading…' : 'Load'}</button
	>
</form>

{#if headers.length > 0}
	<section class="mapping">
		<h3>Map columns</h3>
		<div class="map-grid">
			{#each fields as f}
				<label class="map-row">
					<span class="map-label"
						>{f.label}{#if f.required}<em>*</em>{/if}</span
					>
					<select bind:value={mapping[f.key]}>
						<option value="">—</option>
						{#each headers as h}
							<option value={h}>{h}</option>
						{/each}
					</select>
				</label>
			{/each}
		</div>
		<button class="primary" onclick={generate}>Generate {rows.length} rows →</button>
	</section>
{/if}

{#if candidates.length > 0}
	<form
		method="POST"
		action="?/publish"
		class="publish-bar"
		use:enhance={() => {
			publishing = true;
			return async ({ result }) => {
				publishing = false;
				if (result.type === 'success' && result.data?.publishResult) {
					const r = result.data.publishResult as {
						published: number;
						failedCount: number;
						failed: { name: string; error: string }[];
					};
					if (r.failedCount === 0) {
						toast.push(`Published ${r.published} events.`, 'success');
						candidates = [];
					} else {
						toast.push(
							`Published ${r.published}, ${r.failedCount} failed — ${r.failed[0]?.error ?? ''}`,
							'error',
							6000,
						);
					}
				} else if (result.type === 'failure') {
					toast.push(String(result.data?.error ?? 'Publish failed.'), 'error');
				}
			};
		}}
	>
		<input
			type="text"
			name="organizer"
			bind:value={organizer}
			placeholder="Organizer for these events"
			required
		/>
		<input type="hidden" name="candidates" value={JSON.stringify(candidates)} />
		<span class="count"><strong>{candidates.length}</strong> candidates</span>
		<button type="submit" class="primary" disabled={publishing}
			>{publishing ? 'Publishing…' : 'Publish all'}</button
		>
		<button type="button" class="ghost-btn" onclick={queueSave} disabled={queuing}
			>{queuing ? 'Saving…' : 'Save to queue'}</button
		>
	</form>
	<ul class="preview">
		{#each candidates as candidate (candidate.id)}
			<li class="preview-item">
				<button class="remove" title="Drop" onclick={() => removeCandidate(candidate.id)}>×</button>
				<CandidateCard {candidate} />
			</li>
		{/each}
	</ul>
{/if}

<style>
	.breadcrumb {
		margin-bottom: 0.5rem;
	}
	.breadcrumb a {
		color: #666;
		text-decoration: none;
		font-size: 0.85rem;
		transition: color 100ms ease;
	}
	.breadcrumb a:hover {
		color: #222;
	}
	.head {
		margin-bottom: 1.25rem;
	}
	.head h2 {
		margin: 0 0 0.4rem;
		font-size: 1.5rem;
		font-weight: 600;
	}
	.sub {
		margin: 0;
		font-size: 0.9rem;
		color: #666;
		max-width: 640px;
		line-height: 1.5;
	}
	.fetch-form {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1.5rem;
		max-width: 800px;
	}
	.fetch-form input[type='url'] {
		flex: 1;
		font-family: inherit;
		font-size: 0.9rem;
		padding: 0.5rem 0.75rem;
		border: 1px solid #d0d0d0;
		border-radius: 5px;
		outline: none;
		transition:
			border-color 100ms ease,
			box-shadow 100ms ease;
	}
	.fetch-form .tz {
		width: 11rem;
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.8rem;
		padding: 0.5rem 0.6rem;
		border: 1px solid #d0d0d0;
		border-radius: 5px;
		outline: none;
	}
	.fetch-form input:focus {
		border-color: var(--accent);
		box-shadow: 0 0 0 2px rgba(22, 101, 52, 0.15);
	}
	.mapping {
		max-width: 800px;
		margin: 0 auto 1.5rem;
		padding: 1.25rem 1.5rem;
		background: #fff;
		border: 1px solid #e5e5e5;
		border-radius: 8px;
	}
	.mapping h3 {
		margin: 0 0 1rem;
		font-size: 0.95rem;
		font-weight: 600;
		color: #444;
	}
	.map-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: 0.75rem 1rem;
		margin-bottom: 1.25rem;
	}
	.map-row {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		font-size: 0.8rem;
	}
	.map-label {
		font-weight: 500;
		color: #666;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		font-size: 0.7rem;
	}
	.map-label em {
		color: #991b1b;
		font-style: normal;
	}
	.map-row select {
		font-family: inherit;
		font-size: 0.9rem;
		padding: 0.4rem 0.6rem;
		border: 1px solid #d0d0d0;
		border-radius: 5px;
		background: #fff;
		outline: none;
	}
	.map-row select:focus {
		border-color: var(--accent);
		box-shadow: 0 0 0 2px rgba(22, 101, 52, 0.15);
	}
	.publish-bar {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		max-width: 800px;
		margin: 0 auto 1rem;
		padding: 0.75rem 1rem;
		background: #fff;
		border: 1px solid #e5e5e5;
		border-radius: 8px;
	}
	.publish-bar input[type='text'] {
		flex: 1;
		font-family: inherit;
		font-size: 0.9rem;
		padding: 0.45rem 0.7rem;
		border: 1px solid #d0d0d0;
		border-radius: 5px;
		outline: none;
		transition:
			border-color 100ms ease,
			box-shadow 100ms ease;
	}
	.publish-bar input[type='text']:focus {
		border-color: var(--accent);
		box-shadow: 0 0 0 2px rgba(22, 101, 52, 0.15);
	}
	.publish-bar .count {
		font-size: 0.85rem;
		color: #666;
		white-space: nowrap;
	}
	.preview {
		list-style: none;
		padding: 0;
		margin: 0;
		max-width: 800px;
		margin-inline: auto;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.preview-item {
		position: relative;
	}
	.remove {
		position: absolute;
		top: -0.5rem;
		right: -0.5rem;
		z-index: 2;
		width: 24px;
		height: 24px;
		border-radius: 50%;
		border: 1px solid #d0d0d0;
		background: #fff;
		color: #991b1b;
		font-size: 1rem;
		line-height: 1;
		cursor: pointer;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
	}
	.remove:hover {
		background: #fef2f2;
		border-color: #991b1b;
	}
	button.primary {
		background: var(--accent);
		border: 1px solid var(--accent);
		color: #fff;
		font-family: inherit;
		font-size: 0.875rem;
		padding: 0.45rem 1rem;
		border-radius: 5px;
		cursor: pointer;
		transition: background-color 100ms ease;
	}
	button.primary:hover:not(:disabled) {
		background: var(--accent-strong);
	}
	button.primary:disabled {
		opacity: 0.6;
		cursor: default;
	}
</style>
