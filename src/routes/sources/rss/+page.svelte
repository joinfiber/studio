<script lang="ts">
	import { enhance } from '$app/forms';
	import type { EventCandidate } from '$lib/kernel/candidate.js';
	import CandidateCard from '$lib/kernel/chrome/CandidateCard.svelte';
	import Toast from '$lib/kernel/chrome/Toast.svelte';
	import { toast } from '$lib/kernel/chrome/toast.svelte.js';
	import { saveToQueue } from '$lib/kernel/queue-client.js';
	import Term from '$lib/kernel/chrome/Term.svelte';

	let candidates = $state<EventCandidate[]>([]);
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

	function removeCandidate(id: string) {
		candidates = candidates.filter((c) => c.id !== id);
	}
</script>

<nav class="breadcrumb"><a href="/sources">← Sources</a></nav>

<header class="head">
	<h2>Import from an RSS / Atom feed</h2>
	<p class="sub">
		Paste a feed URL. Items become editable candidates. Imported events are <Term id="proxied"
			>proxied</Term
		>
		— attributed to the feed.
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
				candidates = (result.data.candidates as EventCandidate[]) ?? [];
				toast.push(`Parsed ${candidates.length} items.`, 'success');
			} else if (result.type === 'failure') {
				toast.push(String(result.data?.error ?? 'Import failed.'), 'error');
			}
		};
	}}
>
	<input type="url" name="url" placeholder="https://example.com/events/feed.xml" required />
	<input
		type="text"
		name="timezone"
		value="America/New_York"
		class="tz"
		aria-label="Default timezone"
	/>
	<button type="submit" class="primary" disabled={fetching}
		>{fetching ? 'Fetching…' : 'Fetch'}</button
	>
</form>

{#if candidates.length > 0}
	<p class="warn">
		Heads up: feeds carry a <strong>publish</strong> date, not an event date. Each candidate's time is
		seeded from the item's publish date — verify and correct it before publishing.
	</p>
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

<Toast />

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
		border-color: #166534;
		box-shadow: 0 0 0 2px rgba(22, 101, 52, 0.15);
	}
	.warn {
		max-width: 800px;
		margin: 0 auto 1rem;
		font-size: 0.82rem;
		color: #92400e;
		background: #fffbeb;
		border: 1px solid #fde68a;
		border-radius: 6px;
		padding: 0.6rem 0.85rem;
		line-height: 1.5;
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
		border-color: #166534;
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
		background: #166534;
		border: 1px solid #166534;
		color: #fff;
		font-family: inherit;
		font-size: 0.875rem;
		padding: 0.45rem 1rem;
		border-radius: 5px;
		cursor: pointer;
		transition: background-color 100ms ease;
	}
	button.primary:hover:not(:disabled) {
		background: #14532d;
	}
	button.primary:disabled {
		opacity: 0.6;
		cursor: default;
	}
</style>
