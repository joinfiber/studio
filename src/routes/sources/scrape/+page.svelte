<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';
	import type { EventCandidate } from '$lib/kernel/candidate.js';
	import CandidateCard from '$lib/kernel/chrome/CandidateCard.svelte';
	import CapabilityGuide from '$lib/kernel/chrome/CapabilityGuide.svelte';
	import Toast from '$lib/kernel/chrome/Toast.svelte';
	import { toast } from '$lib/kernel/chrome/toast.svelte.js';
	import { saveToQueue } from '$lib/kernel/queue-client.js';
	import Term from '$lib/kernel/chrome/Term.svelte';

	let { data }: { data: PageData } = $props();
	const ready = $derived(data.capability?.ready ?? false);

	let candidates = $state<EventCandidate[]>([]);
	let organizer = $state('');
	let scraping = $state(false);
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
	<h2>Scrape a page</h2>
	<p class="sub">
		Fetch a listings page, strip it to text, and let the LLM pull out events. The generic path —
		for sites it can't handle, write a site-specific adapter (see <code>docs/extending.md</code>).
		Imported events are <Term id="proxied">proxied</Term>.
	</p>
</header>

{#if !ready}
	{#if data.capability}
		<div class="gate">
			<p class="gate-intro">Scraping reuses the LLM extraction capability:</p>
			<CapabilityGuide capability={data.capability} />
			<p class="gate-note">Set the key + redeploy — Studio ships none. Then this page scrapes.</p>
		</div>
	{/if}
{:else}
	<form
		method="POST"
		action="?/scrape"
		class="scrape-form"
		use:enhance={() => {
			scraping = true;
			return async ({ result }) => {
				scraping = false;
				if (result.type === 'success' && result.data) {
					candidates = (result.data.candidates as EventCandidate[]) ?? [];
					toast.push(`Scraped ${candidates.length} events.`, 'success');
				} else if (result.type === 'failure') {
					toast.push(String(result.data?.error ?? 'Scrape failed.'), 'error');
				}
			};
		}}
	>
		<input type="url" name="url" placeholder="https://example.com/events" required />
		<input type="text" name="timezone" value="America/New_York" class="tz" aria-label="Default timezone" />
		<button type="submit" class="primary" disabled={scraping}>{scraping ? 'Scraping…' : 'Scrape'}</button>
	</form>

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
						const r = result.data.publishResult as { published: number; failedCount: number; failed: { name: string; error: string }[] };
						if (r.failedCount === 0) {
							toast.push(`Published ${r.published} events.`, 'success');
							candidates = [];
						} else {
							toast.push(`Published ${r.published}, ${r.failedCount} failed — ${r.failed[0]?.error ?? ''}`, 'error', 6000);
						}
					} else if (result.type === 'failure') {
						toast.push(String(result.data?.error ?? 'Publish failed.'), 'error');
					}
				};
			}}
		>
			<input type="text" name="organizer" bind:value={organizer} placeholder="Organizer for these events" required />
			<input type="hidden" name="candidates" value={JSON.stringify(candidates)} />
			<span class="count"><strong>{candidates.length}</strong> candidates</span>
			<button type="submit" class="primary" disabled={publishing}>{publishing ? 'Publishing…' : 'Publish all'}</button>
			<button type="button" class="ghost-btn" onclick={queueSave} disabled={queuing}>{queuing ? 'Saving…' : 'Save to queue'}</button>
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
{/if}

<Toast />

<style>
	.breadcrumb { margin-bottom: 0.5rem; }
	.breadcrumb a { color: #666; text-decoration: none; font-size: 0.85rem; transition: color 100ms ease; }
	.breadcrumb a:hover { color: #222; }
	.head { margin-bottom: 1.25rem; }
	.head h2 { margin: 0 0 0.4rem; font-size: 1.5rem; font-weight: 600; }
	.sub { margin: 0; font-size: 0.9rem; color: #666; max-width: 640px; line-height: 1.5; }
	.gate { max-width: 560px; }
	.gate-intro { font-size: 0.9rem; color: #444; margin: 0 0 0.75rem; }
	.gate-note { font-size: 0.82rem; color: #888; margin: 0.85rem 0 0; line-height: 1.5; }
	.scrape-form { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; max-width: 800px; }
	.scrape-form input[type='url'] {
		flex: 1; font-family: inherit; font-size: 0.9rem; padding: 0.5rem 0.75rem;
		border: 1px solid #d0d0d0; border-radius: 5px; outline: none;
		transition: border-color 100ms ease, box-shadow 100ms ease;
	}
	.scrape-form .tz {
		width: 11rem; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.8rem;
		padding: 0.5rem 0.6rem; border: 1px solid #d0d0d0; border-radius: 5px; outline: none;
	}
	.scrape-form input:focus { border-color: #166534; box-shadow: 0 0 0 2px rgba(22, 101, 52, 0.15); }
	.publish-bar {
		display: flex; align-items: center; gap: 0.75rem; max-width: 800px; margin: 0 auto 1rem;
		padding: 0.75rem 1rem; background: #fff; border: 1px solid #e5e5e5; border-radius: 8px;
	}
	.publish-bar input[type='text'] {
		flex: 1; font-family: inherit; font-size: 0.9rem; padding: 0.45rem 0.7rem;
		border: 1px solid #d0d0d0; border-radius: 5px; outline: none;
	}
	.publish-bar input[type='text']:focus { border-color: #166534; box-shadow: 0 0 0 2px rgba(22, 101, 52, 0.15); }
	.publish-bar .count { font-size: 0.85rem; color: #666; white-space: nowrap; }
	.preview { list-style: none; padding: 0; margin: 0; max-width: 800px; margin-inline: auto; display: flex; flex-direction: column; gap: 0.75rem; }
	.preview-item { position: relative; }
	.remove {
		position: absolute; top: -0.5rem; right: -0.5rem; z-index: 2; width: 24px; height: 24px;
		border-radius: 50%; border: 1px solid #d0d0d0; background: #fff; color: #991b1b;
		font-size: 1rem; line-height: 1; cursor: pointer; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
	}
	.remove:hover { background: #fef2f2; border-color: #991b1b; }
	button.primary {
		background: #166534; border: 1px solid #166534; color: #fff; font-family: inherit;
		font-size: 0.875rem; padding: 0.45rem 1rem; border-radius: 5px; cursor: pointer;
		transition: background-color 100ms ease; white-space: nowrap;
	}
	button.primary:hover:not(:disabled) { background: #14532d; }
	button.primary:disabled { opacity: 0.6; cursor: default; }
	code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.85em; background: #f3f3f3; padding: 0.1rem 0.35rem; border-radius: 3px; }
</style>
