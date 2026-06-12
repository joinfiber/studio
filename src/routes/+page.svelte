<script lang="ts">
	import { enhance } from '$app/forms';
	import { slide } from 'svelte/transition';
	import type { PageData } from './$types';
	import type { CommunitySubmission } from '$lib/tools/submissions/client.js';
	import type { StoredCandidate } from '$lib/kernel/db.js';
	import type { EventCandidate } from '$lib/kernel/candidate.js';
	import CapabilityGuide from '$lib/kernel/chrome/CapabilityGuide.svelte';
	import CandidateCard from '$lib/kernel/chrome/CandidateCard.svelte';
	import { toast } from '$lib/kernel/chrome/toast.svelte.js';

	let { data }: { data: PageData } = $props();

	// Tab default is context-aware — Submissions when a source is wired,
	// otherwise Ingested (the ingest-clean-publish persona). A click overrides.
	let defaultTab = $derived(data.capability?.ready ? 'submissions' : 'ingested');
	let tabOverride = $state<'submissions' | 'ingested' | null>(null);
	let tab = $derived(tabOverride ?? defaultTab);
	let queue = $state<CommunitySubmission[]>([]);
	let rejectingId = $state<string | null>(null);
	let rejectReason = $state('');

	$effect(() => {
		queue = [...data.submissions];
	});

	const sourceReady = $derived(data.capability?.ready ?? false);

	// Persistent ingested-candidate queue.
	let ingestedQueue = $state<StoredCandidate[]>([]);
	$effect(() => {
		ingestedQueue = [...data.ingested];
	});
	const ingestedCount = $derived(ingestedQueue.length);
	// In-flight action per row, so the highest-frequency buttons show progress
	// and can't double-submit during the Commons round-trip.
	let busy = $state<Record<string, string>>({});
	function removeIngested(id: number) {
		ingestedQueue = ingestedQueue.filter((c) => c.id !== id);
	}

	// Inline editing of a queued candidate (reuses the editable CandidateCard).
	let editingId = $state<number | null>(null);
	let editDraft = $state<EventCandidate | null>(null);
	let savingEdit = $state(false);
	function startEdit(c: StoredCandidate) {
		editingId = c.id;
		editDraft = structuredClone(c.candidate); // mutable copy CandidateCard binds to
	}
	function cancelEdit() {
		editingId = null;
		editDraft = null;
	}
	function applyEditLocally(id: number, candidate: EventCandidate) {
		ingestedQueue = ingestedQueue.map((c) =>
			c.id === id
				? { ...c, candidate, organizer: candidate.data.organizer_name ?? c.organizer }
				: c,
		);
	}

	function removeFromQueue(id: string) {
		queue = queue.filter((s) => s.id !== id);
		if (rejectingId === id) {
			rejectingId = null;
			rejectReason = '';
		}
	}

	function formatDateTime(iso: string | null): string {
		if (!iso) return 'No date';
		try {
			return new Intl.DateTimeFormat('en-US', {
				weekday: 'short',
				month: 'short',
				day: 'numeric',
				hour: 'numeric',
				minute: '2-digit',
			}).format(new Date(iso));
		} catch {
			return iso;
		}
	}
</script>

<div class="tabs">
	<button class:active={tab === 'submissions'} onclick={() => (tabOverride = 'submissions')}>
		Submissions
		{#if sourceReady && queue.length > 0}<span class="badge">{queue.length}</span>{/if}
	</button>
	<button class:active={tab === 'ingested'} onclick={() => (tabOverride = 'ingested')}>
		Ingested
		{#if ingestedCount > 0}<span class="badge">{ingestedCount}</span>{/if}
	</button>
</div>

{#if tab === 'submissions'}
	{#if !sourceReady}
		<div class="gate">
			<p class="gate-intro">
				Submissions is where user-generated content from an app you operate gets moderated — people
				submit events through your app, you publish the ones you approve. Connect your app's
				submission queue to start:
			</p>
			{#if data.capability}<CapabilityGuide capability={data.capability} />{/if}
		</div>
	{:else if data.submissionsError}
		<div class="error-box">Couldn't load submissions: {data.submissionsError}</div>
	{:else if queue.length === 0}
		<div class="empty">
			<p>No submissions waiting.</p>
			<p class="hint">The queue updates as users post.</p>
		</div>
	{:else}
		<ul class="queue">
			{#each queue as s (s.id)}
				<li class="sub" transition:slide={{ duration: 200 }}>
					{#if s.event_image_url}
						<img class="hero" src={s.event_image_url} alt="" referrerpolicy="no-referrer" />
					{/if}
					<div class="body">
						<h3 class="title">{s.content}</h3>
						<div class="meta">
							{formatDateTime(s.event_at)}
							{#if s.category}<span class="dot">·</span><span class="category">{s.category}</span
								>{/if}
							{#if s.from_poster_scan}<span class="dot">·</span><span class="tag">poster scan</span
								>{/if}
						</div>
						<div class="venue">{s.place_name ?? 'No venue'}</div>
						{#if s.description}<p class="desc">{s.description}</p>{/if}

						{#if rejectingId === s.id}
							<form
								method="POST"
								action="?/reject"
								class="reject-form"
								use:enhance={() =>
									async ({ result }) => {
										if (result.type === 'success') {
											toast.push(`Rejected: ${s.content}`, 'success');
											removeFromQueue(s.id);
										} else if (result.type === 'failure') {
											toast.push(String(result.data?.error ?? 'Reject failed.'), 'error');
										}
									}}
							>
								<input type="hidden" name="id" value={s.id} />
								<input
									type="text"
									name="reason"
									bind:value={rejectReason}
									placeholder="Optional reason (sent to the submitter)"
								/>
								<button type="submit" class="danger">Confirm reject</button>
								<button type="button" onclick={() => ((rejectingId = null), (rejectReason = ''))}
									>Cancel</button
								>
							</form>
						{:else}
							<div class="actions">
								<form
									method="POST"
									action="?/approve"
									use:enhance={() => {
										busy[s.id] = 'approve';
										return async ({ result }) => {
											delete busy[s.id];
											if (result.type === 'success') {
												toast.push(`Approved: ${s.content}`, 'success');
												removeFromQueue(s.id);
											} else if (result.type === 'failure') {
												toast.push(String(result.data?.error ?? 'Approve failed.'), 'error');
											}
										};
									}}
								>
									<input type="hidden" name="id" value={s.id} />
									<button type="submit" class="primary" disabled={!!busy[s.id]}>
										{busy[s.id] === 'approve' ? 'Approving…' : 'Approve'}
									</button>
								</form>
								<button
									class="danger-outline"
									onclick={() => ((rejectingId = s.id), (rejectReason = ''))}
								>
									Reject
								</button>
								{#if s.link_url}
									<a class="external" href={s.link_url} target="_blank" rel="noopener noreferrer">
										Source ↗
									</a>
								{/if}
							</div>
						{/if}
					</div>
				</li>
			{/each}
		</ul>
	{/if}
{:else if data.ingestedError}
	<div class="error-box">Couldn't load the queue: {data.ingestedError}</div>
{:else if ingestedQueue.length === 0}
	<div class="ingested">
		<p class="lead">No candidates in the queue.</p>
		<p class="hint">
			Import from a <a href="/sources">Source</a> and choose <strong>Save to queue</strong> to stage candidates
			here. They persist until you publish or reject them.
		</p>
	</div>
{:else}
	<ul class="iqueue">
		{#each ingestedQueue as c (c.id)}
			<li class="icard" class:editing={editingId === c.id} transition:slide={{ duration: 200 }}>
				{#if editingId === c.id && editDraft}
					<div class="iedit">
						<CandidateCard candidate={editDraft} />
						<form
							method="POST"
							action="?/queueUpdate"
							class="edit-actions"
							use:enhance={() => {
								savingEdit = true;
								return async ({ result }) => {
									savingEdit = false;
									if (result.type === 'success') {
										if (editDraft) applyEditLocally(c.id, editDraft);
										toast.push('Saved.', 'success');
										cancelEdit();
									} else if (result.type === 'failure') {
										toast.push(String(result.data?.error ?? 'Save failed.'), 'error');
									}
								};
							}}
						>
							<input type="hidden" name="id" value={c.id} />
							<input type="hidden" name="candidate" value={JSON.stringify(editDraft)} />
							<button type="submit" class="primary" disabled={savingEdit}>
								{savingEdit ? 'Saving…' : 'Save changes'}
							</button>
							<button type="button" class="ghost-btn" onclick={cancelEdit}>Cancel</button>
						</form>
					</div>
				{:else}
					<div class="ibody">
						<div class="ititle">{c.candidate.data.name}</div>
						<div class="imeta">
							{formatDateTime(c.candidate.data.start)}
							{#if c.candidate.data.location?.name}<span class="dot">·</span>{c.candidate.data
									.location.name}{/if}
							<span class="dot">·</span><span class="tag">{c.source_tool}</span>
							{#if c.organizer}<span class="dot">·</span><span class="org">{c.organizer}</span
								>{:else}<span class="dot">·</span><span class="org missing">no organizer</span>{/if}
						</div>
					</div>
					<div class="iactions">
						<button type="button" class="ghost-btn" onclick={() => startEdit(c)}>Edit</button>
						<form
							method="POST"
							action="?/queuePublish"
							use:enhance={() => {
								busy[c.id] = 'publish';
								return async ({ result }) => {
									delete busy[c.id];
									if (result.type === 'success') {
										const warning = result.data?.warning;
										if (warning) toast.push(String(warning), 'error', 9000);
										else toast.push(`Published: ${c.candidate.data.name}`, 'success');
										removeIngested(c.id);
									} else if (result.type === 'failure') {
										toast.push(String(result.data?.error ?? 'Publish failed.'), 'error', 6000);
									}
								};
							}}
						>
							<input type="hidden" name="id" value={c.id} />
							<button
								type="submit"
								class="primary"
								disabled={!data.commonsConfigured || !!busy[c.id]}
							>
								{busy[c.id] === 'publish' ? 'Publishing…' : 'Publish'}
							</button>
						</form>
						<form
							method="POST"
							action="?/queueReject"
							use:enhance={() => {
								busy[c.id] = 'reject';
								return async ({ result }) => {
									delete busy[c.id];
									if (result.type === 'success') {
										toast.push('Removed from queue.', 'success');
										removeIngested(c.id);
									} else if (result.type === 'failure') {
										toast.push(String(result.data?.error ?? 'Reject failed.'), 'error');
									}
								};
							}}
						>
							<input type="hidden" name="id" value={c.id} />
							<button type="submit" class="danger-outline" disabled={!!busy[c.id]}>
								{busy[c.id] === 'reject' ? 'Removing…' : 'Reject'}
							</button>
						</form>
					</div>
				{/if}
			</li>
		{/each}
	</ul>
	{#if !data.commonsConfigured}
		<p class="hint gate-note">
			Set <code>COMMONS_SERVICE_KEY</code> to publish from the queue. Reject works regardless.
		</p>
	{/if}
{/if}

<style>
	.tabs {
		display: flex;
		gap: 0.5rem;
		border-bottom: 1px solid #e5e5e5;
		margin-bottom: 1.25rem;
	}
	.tabs button {
		background: transparent;
		border: none;
		border-bottom: 2px solid transparent;
		font-family: inherit;
		font-size: 0.95rem;
		color: #777;
		padding: 0.4rem 0.25rem 0.6rem;
		margin-bottom: -1px;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
	}
	.tabs button:hover {
		color: #222;
	}
	.tabs button.active {
		color: #222;
		font-weight: 600;
		border-bottom-color: var(--accent);
	}
	.badge {
		font-size: 0.7rem;
		background: var(--accent);
		color: #fff;
		padding: 0.05rem 0.4rem;
		border-radius: 999px;
	}
	.gate {
		max-width: 560px;
	}
	.gate-intro {
		font-size: 0.9rem;
		color: #555;
		line-height: 1.5;
		margin: 0 0 0.85rem;
	}
	.error-box {
		max-width: 800px;
		padding: 1rem 1.25rem;
		background: #fef2f2;
		border: 1px solid #fecaca;
		border-radius: 8px;
		color: #991b1b;
		font-size: 0.9rem;
	}
	.empty {
		padding: 3rem 1rem;
		text-align: center;
		color: #888;
	}
	.hint {
		font-size: 0.85rem;
		color: #999;
	}
	.queue {
		list-style: none;
		padding: 0;
		margin: 0;
		max-width: 800px;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.sub {
		background: #fff;
		border: 1px solid #e5e5e5;
		border-radius: 8px;
		overflow: hidden;
	}
	.hero {
		display: block;
		width: 100%;
		max-height: 50vh;
		object-fit: contain;
		background: #f5f5f5;
	}
	.body {
		padding: 1.1rem 1.4rem 1.4rem;
	}
	.title {
		margin: 0 0 0.4rem;
		font-size: 1.3rem;
		font-weight: 600;
	}
	.meta {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.9rem;
		color: #555;
		margin-bottom: 0.3rem;
	}
	.category {
		text-transform: uppercase;
		font-size: 0.7rem;
		letter-spacing: 0.05em;
		color: #666;
	}
	.tag {
		font-size: 0.65rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		background: #f0f0f0;
		color: #666;
		padding: 0.1rem 0.45rem;
		border-radius: 3px;
	}
	.dot {
		color: #ccc;
	}
	.venue {
		font-size: 0.9rem;
		color: #333;
		margin-bottom: 0.6rem;
	}
	.desc {
		font-size: 0.9rem;
		color: #444;
		line-height: 1.5;
		margin: 0 0 1rem;
		white-space: pre-wrap;
	}
	.actions,
	.reject-form {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding-top: 0.5rem;
		border-top: 1px solid #f0f0f0;
	}
	.reject-form {
		gap: 0.5rem;
	}
	.reject-form input {
		flex: 1;
		font-family: inherit;
		font-size: 0.875rem;
		padding: 0.4rem 0.7rem;
		border: 1px solid #991b1b;
		border-radius: 5px;
		outline: none;
	}
	form {
		margin: 0;
	}
	button,
	.external {
		font-family: inherit;
		font-size: 0.875rem;
		padding: 0.45rem 0.95rem;
		border-radius: 5px;
		cursor: pointer;
		border: 1px solid #d0d0d0;
		background: #fff;
		color: #333;
		text-decoration: none;
	}
	button.primary {
		background: var(--accent);
		border-color: var(--accent);
		color: #fff;
	}
	button.primary:hover {
		background: var(--accent-strong);
	}
	button.danger {
		background: #991b1b;
		border-color: #991b1b;
		color: #fff;
	}
	button.danger-outline {
		border-color: #991b1b;
		color: #991b1b;
		background: #fff;
	}
	button.danger-outline:hover {
		background: #fef2f2;
	}
	.external {
		margin-left: auto;
		color: var(--accent);
		border-color: transparent;
	}
	.ingested {
		max-width: 640px;
	}
	.lead {
		font-size: 0.95rem;
		color: #444;
		margin: 0 0 0.5rem;
	}
	.ingested .hint {
		line-height: 1.5;
		margin-bottom: 1.25rem;
	}
	.ingested a {
		color: var(--accent);
	}
	.gate-note {
		max-width: 800px;
		margin-top: 0.85rem;
	}
	.iqueue {
		list-style: none;
		padding: 0;
		margin: 0;
		max-width: 800px;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.icard {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		background: #fff;
		border: 1px solid #e5e5e5;
		border-radius: 8px;
		padding: 0.7rem 1rem;
	}
	.ibody {
		min-width: 0;
		flex: 1;
	}
	.ititle {
		font-size: 0.95rem;
		font-weight: 600;
		color: #222;
	}
	.imeta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.82rem;
		color: #666;
		margin-top: 0.2rem;
	}
	.org {
		color: var(--accent);
	}
	.org.missing {
		color: #b45309;
	}
	.iactions {
		display: flex;
		gap: 0.5rem;
		flex-shrink: 0;
	}
	.icard.editing {
		display: block;
		padding: 0.85rem;
	}
	.iedit {
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
	}
	.edit-actions {
		display: flex;
		gap: 0.5rem;
		margin: 0;
	}
</style>
