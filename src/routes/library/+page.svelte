<script lang="ts">
	import { enhance } from '$app/forms';
	import { slide } from 'svelte/transition';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import type { PageData } from './$types';
	import type { LiveEvent } from '$lib/instance/library.js';
	import { CATEGORIES } from '$lib/kernel/categories.js';
	import { toast } from '$lib/kernel/chrome/toast.svelte.js';

	let { data }: { data: PageData } = $props();

	// Local working copy so an optimistic save can patch a row in place.
	let rows = $state<LiveEvent[]>([]);
	$effect(() => {
		rows = data.live && data.events ? [...data.events] : [];
	});

	interface Draft {
		status: string;
		category: string;
		tags: string;
		description: string;
		price: string;
		openWindow: boolean;
		wheelchairAccessible: boolean;
	}

	function makeDraft(ev: LiveEvent): Draft {
		return {
			status: ev.status,
			category: ev.category ?? '',
			tags: ev.tags.join(', '),
			description: ev.description ?? '',
			price: ev.price ?? '',
			openWindow: ev.openWindow,
			wheelchairAccessible: ev.wheelchairAccessible ?? false,
		};
	}

	function isDirty(ev: LiveEvent, d: Draft): boolean {
		return (
			d.status !== ev.status ||
			d.category !== (ev.category ?? '') ||
			d.tags !== ev.tags.join(', ') ||
			d.description !== (ev.description ?? '') ||
			d.price !== (ev.price ?? '') ||
			d.openWindow !== ev.openWindow ||
			d.wheelchairAccessible !== (ev.wheelchairAccessible ?? false)
		);
	}

	let expandedId = $state<string | null>(null);
	let draft = $state<Draft | null>(null);
	let saving = $state(false);

	function toggle(ev: LiveEvent) {
		if (expandedId === ev.id) {
			expandedId = null;
			draft = null;
			return;
		}
		expandedId = ev.id;
		draft = makeDraft(ev);
	}

	function applyDraftLocally(id: string, d: Draft) {
		rows = rows.map((r) =>
			r.id === id
				? {
						...r,
						status: d.status,
						category: d.category || null,
						tags: d.tags
							.split(',')
							.map((t) => t.trim())
							.filter(Boolean),
						description: d.description || null,
						price: d.price || null,
						openWindow: d.openWindow,
						wheelchairAccessible: d.wheelchairAccessible,
					}
				: r,
		);
	}

	// --- Filters & paging: server-driven via the querystring. ---
	const f = $derived(data.filters);
	const total = $derived(data.live ? data.total : 0);
	const hasPrev = $derived(f.offset > 0);
	const hasNext = $derived(f.offset + rows.length < total);
	const pageStart = $derived(rows.length === 0 ? 0 : f.offset + 1);
	const pageEnd = $derived(f.offset + rows.length);

	function setParam(key: string, value: string) {
		const params = new URLSearchParams(page.url.searchParams);
		if (value) params.set(key, value);
		else params.delete(key);
		if (key !== 'offset') params.delete('offset'); // any filter change resets paging
		expandedId = null;
		draft = null;
		goto(`?${params.toString()}`, { replaceState: true, keepFocus: true });
	}

	let searchInput = $state('');
	$effect(() => {
		searchInput = f.search;
	});

	function formatDate(d: string | null): string {
		if (!d) return '';
		const [y, m, day] = d.split('-').map(Number);
		if (!y || !m || !day) return d;
		return new Intl.DateTimeFormat('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
		}).format(new Date(y, m - 1, day));
	}

	function statusLabel(s: string): string {
		return s === 'pending_review' ? 'pending' : s;
	}
</script>

<header class="page-head">
	<h2>Library</h2>
	{#if data.live}
		<span class="total">{total} event{total === 1 ? '' : 's'}</span>
	{/if}
</header>

{#if !data.live}
	<div class="empty">
		<p>Library shows events this instance can see in the Commons.</p>
		<p class="hint">
			Set <code>COMMONS_SERVICE_KEY</code> (and redeploy) to load live data. An admin key sees the whole
			catalog; a standard key sees its own.
		</p>
	</div>
{:else}
	<div class="toolbar">
		<form class="search" onsubmit={(e) => (e.preventDefault(), setParam('q', searchInput.trim()))}>
			<input type="search" bind:value={searchInput} placeholder="Search title, venue, address…" />
		</form>
		<select
			aria-label="Status"
			value={f.status}
			onchange={(e) =>
				setParam('status', e.currentTarget.value === 'all' ? '' : e.currentTarget.value)}
		>
			<option value="all">All statuses</option>
			<option value="published">Published</option>
			<option value="pending_review">Pending</option>
			<option value="draft">Draft</option>
		</select>
		<select
			aria-label="Category"
			value={f.category}
			onchange={(e) => setParam('category', e.currentTarget.value)}
		>
			<option value="">All categories</option>
			{#each CATEGORIES as c}<option value={c.slug}>{c.label}</option>{/each}
		</select>
		<select
			aria-label="Time"
			value={f.time}
			onchange={(e) =>
				setParam('time', e.currentTarget.value === 'all' ? '' : e.currentTarget.value)}
		>
			<option value="all">Any time</option>
			<option value="upcoming">Upcoming</option>
			<option value="past">Past</option>
		</select>
		<select
			aria-label="Provenance"
			value={f.method}
			onchange={(e) =>
				setParam('method', e.currentTarget.value === 'all' ? '' : e.currentTarget.value)}
		>
			<option value="all">Any source</option>
			<option value="self_asserted">Self-asserted</option>
			<option value="proxied">Proxied</option>
			<option value="witnessed">Witnessed</option>
		</select>
	</div>

	{#if data.error}
		<div class="error-box"><p>Couldn't load events: {data.error}</p></div>
	{:else if rows.length === 0}
		<div class="empty"><p>No events match these filters.</p></div>
	{:else}
		<ul class="items">
			{#each rows as ev (ev.id)}
				<li class="row" class:expanded={expandedId === ev.id}>
					<button class="row-summary" onclick={() => toggle(ev)}>
						<div class="item-main">
							<div class="line">
								<span class="name">{ev.title}</span>
								{#if ev.recurrence}<span class="recurring" title="Recurring">↻</span>{/if}
							</div>
							<div class="subtitle">
								{ev.venue ?? 'No venue'}{#if ev.date}
									· {formatDate(ev.date)}{#if ev.time}
										{ev.time}{/if}{/if}
							</div>
						</div>
						<div class="item-meta">
							{#if ev.category}<span class="category">{ev.category}</span>{/if}
							<span class="status status-{ev.status}">{statusLabel(ev.status)}</span>
						</div>
					</button>

					{#if expandedId === ev.id && draft}
						{@const dirty = isDirty(ev, draft)}
						<div class="detail" transition:slide={{ duration: 200 }}>
							{#if ev.imageUrl}<img class="hero" src={ev.imageUrl} alt="" />{/if}

							<form
								method="POST"
								action="?/update"
								class="editor"
								use:enhance={() => {
									const d = draft;
									const id = ev.id;
									saving = true;
									return async ({ result }) => {
										saving = false;
										if (result.type === 'success') {
											if (d) {
												applyDraftLocally(id, d);
												const updated = rows.find((r) => r.id === id);
												if (updated && expandedId === id) draft = makeDraft(updated);
											}
											toast.push('Saved.', 'success');
										} else if (result.type === 'failure') {
											toast.push(String(result.data?.error ?? 'Save failed.'), 'error');
										}
									};
								}}
							>
								<input type="hidden" name="id" value={ev.id} />

								<!-- Origin facts: read-only (no hover-lift). They can't be patched
								     via a service key, so they read as context, not fields. -->
								<div class="ro">
									{formatDate(ev.date)}{#if ev.time}
										· {ev.time}{#if ev.endTime}–{ev.endTime}{/if}{/if}
									<span class="muted">({ev.timezone})</span>
									<span class="sep">·</span>
									{ev.venue ?? 'No venue'}{#if ev.address}<span class="muted">
											· {ev.address}</span
										>{/if}
								</div>

								<!-- Editable in place: hover to see the lift, click to edit. -->
								<div class="edit-row">
									<select
										class="inline cat"
										name="category"
										bind:value={draft.category}
										aria-label="Category"
									>
										{#each CATEGORIES as c}<option value={c.slug}>{c.label}</option>{/each}
									</select>
									<span class="sep">·</span>
									<select
										class="inline status-sel"
										name="status"
										bind:value={draft.status}
										aria-label="Status"
									>
										<option value="published">published</option>
										<option value="pending_review">pending</option>
										<option value="draft">draft</option>
									</select>
								</div>

								<input
									class="inline tags"
									type="text"
									name="tags"
									bind:value={draft.tags}
									placeholder="add tags, comma separated"
									aria-label="Tags"
								/>

								<textarea
									class="inline desc"
									name="description"
									rows="3"
									bind:value={draft.description}
									placeholder="Add a description…"
									aria-label="Description"
								></textarea>

								<div class="extras">
									<input
										class="inline price"
										type="text"
										name="price"
										bind:value={draft.price}
										placeholder="Price"
										aria-label="Price"
									/>
									<label class="check">
										<input
											type="checkbox"
											name="open_window"
											value="true"
											bind:checked={draft.openWindow}
										/> open window
									</label>
									<label class="check">
										<input
											type="checkbox"
											name="wheelchair_accessible"
											value="true"
											bind:checked={draft.wheelchairAccessible}
										/>
										wheelchair accessible
										<input
											type="hidden"
											name="wheelchair_accessible_original"
											value={ev.wheelchairAccessible == null ? '' : String(ev.wheelchairAccessible)}
										/>
									</label>
									{#if ev.sourceFeedUrl}
										<a class="src" href={ev.sourceFeedUrl} target="_blank" rel="noopener noreferrer"
											>source ↗</a
										>
									{/if}
								</div>

								{#if dirty}
									<div class="save-row" transition:slide={{ duration: 150 }}>
										<button type="button" class="link" onclick={() => (draft = makeDraft(ev))}
											>Revert</button
										>
										<button type="submit" class="primary" disabled={saving}
											>{saving ? 'Saving…' : 'Save changes'}</button
										>
									</div>
								{/if}
							</form>
						</div>
					{/if}
				</li>
			{/each}
		</ul>

		{#if hasPrev || hasNext}
			<div class="pager">
				<button
					disabled={!hasPrev}
					onclick={() => setParam('offset', String(Math.max(0, f.offset - f.pageSize)))}
				>
					← Prev
				</button>
				<span class="range">{pageStart}–{pageEnd} of {total}</span>
				<button
					disabled={!hasNext}
					onclick={() => setParam('offset', String(f.offset + f.pageSize))}
				>
					Next →
				</button>
			</div>
		{/if}
	{/if}
{/if}

<style>
	.page-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		margin-bottom: 1rem;
		gap: 1rem;
	}
	.page-head h2 {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 600;
	}
	.total {
		font-size: 0.8rem;
		color: #888;
	}
	.toolbar {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 1rem;
		align-items: center;
	}
	.toolbar .search {
		flex: 1 1 16rem;
		margin: 0;
	}
	.toolbar .search input {
		width: 100%;
		font-family: inherit;
		font-size: 0.9rem;
		padding: 0.45rem 0.7rem;
		border: 1px solid #d0d0d0;
		border-radius: 5px;
		outline: none;
	}
	.toolbar .search input:focus {
		border-color: var(--accent);
		box-shadow: 0 0 0 2px rgba(22, 101, 52, 0.15);
	}
	.toolbar select {
		font-family: inherit;
		font-size: 0.85rem;
		padding: 0.45rem 0.5rem;
		border: 1px solid #d0d0d0;
		border-radius: 5px;
		background: #fff;
		color: #333;
		cursor: pointer;
	}
	.empty {
		padding: 3rem 1rem;
		text-align: center;
		color: #888;
	}
	.hint {
		font-size: 0.85rem;
		color: #aaa;
	}
	.error-box {
		padding: 1rem 1.25rem;
		background: #fef2f2;
		border: 1px solid #fecaca;
		border-radius: 8px;
		color: #991b1b;
		font-size: 0.9rem;
	}
	.items {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.row {
		background: #fff;
		border: 1px solid #e5e5e5;
		border-radius: 6px;
		overflow: hidden;
		transition: border-color 100ms ease;
	}
	.row.expanded {
		border-color: #ccc;
	}
	.row-summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.75rem 1rem;
		width: 100%;
		background: transparent;
		border: none;
		text-align: left;
		font-family: inherit;
		font-size: inherit;
		color: inherit;
		cursor: pointer;
		transition: background-color 100ms ease;
	}
	.row-summary:hover,
	.row.expanded .row-summary {
		background: #fafafa;
	}
	.line {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
	}
	.name {
		font-weight: 500;
		color: #222;
	}
	.recurring {
		color: #888;
		font-size: 0.85rem;
	}
	.subtitle {
		font-size: 0.85rem;
		color: #666;
		margin-top: 0.15rem;
	}
	.item-meta {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-shrink: 0;
	}
	.category {
		font-size: 0.65rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #888;
	}
	.status {
		font-size: 0.65rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 0.1rem 0.5rem;
		border-radius: 3px;
	}
	.status-published {
		background: #dcfce7;
		color: var(--accent);
	}
	.status-pending_review {
		background: #fef3c7;
		color: #92400e;
	}
	.status-draft {
		background: #ececec;
		color: #555;
	}
	.detail {
		padding: 1.1rem 1.4rem 1.3rem;
		background: #fafafa;
		border-top: 1px solid #e5e5e5;
	}
	.hero {
		display: block;
		max-width: 100%;
		max-height: 240px;
		object-fit: cover;
		border-radius: 6px;
		margin-bottom: 1rem;
		background: #f0f0f0;
	}
	.editor {
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
	}
	.ro {
		font-size: 0.9rem;
		color: #555;
	}
	.ro .sep {
		color: #ccc;
		margin: 0 0.4rem;
	}
	.muted {
		color: #999;
	}
	.edit-row {
		display: flex;
		align-items: baseline;
		gap: 0.1rem;
		font-size: 0.8rem;
	}
	.edit-row .sep {
		color: #ccc;
		margin: 0 0.3rem;
	}

	/* Edit-in-place: prose at rest, a subtle lift on hover, clear on focus. */
	.inline {
		font-family: inherit;
		color: inherit;
		background: transparent;
		border: none;
		border-bottom: 1px solid transparent;
		outline: none;
		padding: 2px 5px;
		margin: -2px -5px;
		border-radius: 4px;
		transition:
			background-color 100ms ease,
			border-color 100ms ease;
	}
	.inline:hover {
		background: #eceeec;
	}
	.inline:focus {
		background: #fff;
		border-bottom-color: var(--accent);
		box-shadow: 0 1px 0 0 var(--accent);
	}
	.cat,
	.status-sel {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #666;
		cursor: pointer;
	}
	.tags {
		font-size: 0.85rem;
		color: #444;
		width: 100%;
	}
	.desc {
		font-size: 0.95rem;
		line-height: 1.5;
		color: #333;
		width: 100%;
		resize: vertical;
		display: block;
	}
	.extras {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.9rem;
		font-size: 0.8rem;
		color: #666;
		margin-top: 0.1rem;
	}
	.price {
		font-size: 0.85rem;
		width: 8rem;
	}
	.check {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		cursor: pointer;
	}
	.src {
		margin-left: auto;
		color: var(--accent);
		font-size: 0.8rem;
		text-decoration: none;
	}
	.save-row {
		display: flex;
		justify-content: flex-end;
		align-items: center;
		gap: 0.75rem;
		margin-top: 0.35rem;
		padding-top: 0.75rem;
		border-top: 1px solid #ececec;
	}
	button.link {
		background: none;
		border: none;
		color: #888;
		font-family: inherit;
		font-size: 0.85rem;
		cursor: pointer;
		text-decoration: underline;
	}
	button.link:hover {
		color: #555;
	}
	button.primary {
		background: var(--accent);
		border: 1px solid var(--accent);
		color: #fff;
		font-family: inherit;
		font-size: 0.875rem;
		padding: 0.45rem 1.1rem;
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
	.pager {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		margin-top: 1.25rem;
	}
	.pager button {
		font-family: inherit;
		font-size: 0.85rem;
		padding: 0.4rem 0.85rem;
		border: 1px solid #d0d0d0;
		border-radius: 5px;
		background: #fff;
		color: #333;
		cursor: pointer;
	}
	.pager button:disabled {
		opacity: 0.45;
		cursor: default;
	}
	.range {
		font-size: 0.8rem;
		color: #888;
	}
	a {
		color: var(--accent);
	}
	code {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.85em;
		background: #f3f3f3;
		padding: 0.1rem 0.35rem;
		border-radius: 3px;
	}
</style>
