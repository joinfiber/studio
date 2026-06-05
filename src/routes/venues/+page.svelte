<script lang="ts">
	import { slide } from 'svelte/transition';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import type { PageData } from './$types';
	import { methodLabel, type LiveOrg } from '$lib/instance/organizations.js';
	import Toast from '$lib/kernel/chrome/Toast.svelte';
	import { toast } from '$lib/kernel/chrome/toast.svelte.js';

	let { data }: { data: PageData } = $props();

	const f = $derived(data.filters);
	const total = $derived(data.live ? data.total : 0);

	// Local copy so an optimistic edit updates a row without a reload.
	let orgs = $state<LiveOrg[]>([]);
	$effect(() => {
		orgs = data.live && data.orgs ? [...data.orgs] : [];
	});

	// --- Inline editing of an org's fields (partial PATCH) ---
	interface OrgDraft {
		name: string;
		commercial: 'unspecified' | 'true' | 'false';
		description: string;
		url: string;
		logo: string;
		telephone: string;
		email: string;
		sameAs: string;
		tags: string;
	}
	let editingId = $state<string | null>(null);
	let draft = $state<OrgDraft | null>(null);
	let saving = $state(false);

	function toDraft(o: LiveOrg): OrgDraft {
		return {
			name: o.name,
			commercial: o.commercial === true ? 'true' : o.commercial === false ? 'false' : 'unspecified',
			description: o.description ?? '',
			url: o.url ?? '',
			logo: o.logo ?? '',
			telephone: o.telephone ?? '',
			email: o.email ?? '',
			sameAs: o.sameAs.join(', '),
			tags: o.tags.join(', '),
		};
	}
	function startEdit(o: LiveOrg) {
		editingId = o.id;
		draft = toDraft(o);
	}
	function cancelEdit() {
		editingId = null;
		draft = null;
	}
	const csv = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

	// Only changed fields — the Commons PATCH is a partial merge.
	function buildPatch(o: LiveOrg, d: OrgDraft): Record<string, unknown> {
		const p: Record<string, unknown> = {};
		if (d.name.trim() && d.name.trim() !== o.name) p.name = d.name.trim();
		const commercial = d.commercial === 'true' ? true : d.commercial === 'false' ? false : null;
		if (commercial !== (o.commercial ?? null)) p.commercial = commercial;
		if (d.description.trim() !== (o.description ?? '')) p.description = d.description.trim();
		if (d.url.trim() !== (o.url ?? '')) p.url = d.url.trim();
		if (d.logo.trim() !== (o.logo ?? '')) p.logo = d.logo.trim();
		if (d.telephone.trim() !== (o.telephone ?? '')) p.telephone = d.telephone.trim();
		if (d.email.trim() !== (o.email ?? '')) p.email = d.email.trim();
		const sameAs = csv(d.sameAs);
		if (JSON.stringify(sameAs) !== JSON.stringify(o.sameAs)) p.sameAs = sameAs;
		const tags = csv(d.tags);
		if (JSON.stringify(tags) !== JSON.stringify(o.tags)) p.tags = tags;
		return p;
	}
	function applyLocal(id: string, d: OrgDraft) {
		orgs = orgs.map((o) =>
			o.id === id
				? {
						...o,
						name: d.name.trim() || o.name,
						commercial: d.commercial === 'true' ? true : d.commercial === 'false' ? false : null,
						description: d.description.trim() || null,
						url: d.url.trim() || null,
						logo: d.logo.trim() || null,
						telephone: d.telephone.trim() || null,
						email: d.email.trim() || null,
						sameAs: csv(d.sameAs),
						tags: csv(d.tags),
					}
				: o,
		);
	}

	// Server-driven filters (querystring).
	function setParam(key: string, value: string) {
		const params = new URLSearchParams(page.url.searchParams);
		if (value) params.set(key, value);
		else params.delete(key);
		if (key !== 'offset') params.delete('offset');
		expandedId = null;
		goto(`?${params.toString()}`, { replaceState: true, keepFocus: true });
	}

	let searchInput = $state('');
	$effect(() => {
		searchInput = f.search;
	});

	// Client-side facets over the loaded page.
	let cityFacet = $state('');
	let venuesOnly = $state(false);
	let expandedId = $state<string | null>(null);

	const cities = $derived(
		[...new Set(orgs.map((o) => o.city).filter((c): c is string => !!c))].sort(),
	);
	const shown = $derived(
		orgs.filter((o) => (!venuesOnly || o.hasPlace) && (!cityFacet || o.city === cityFacet)),
	);

	const hasPrev = $derived(f.offset > 0);
	const hasNext = $derived(f.offset + orgs.length < total);
</script>

<header class="page-head">
	<h2>Venues</h2>
	{#if data.live}
		<span class="total">{total} organization{total === 1 ? '' : 's'} in the Commons</span>
	{/if}
</header>

{#if !data.live}
	<div class="empty">
		<p>Venues shows the organizations in the Commons.</p>
		<p class="hint">Set <code>COMMONS_SERVICE_KEY</code> (and redeploy) to load live data.</p>
	</div>
{:else}
	<div class="toolbar">
		<form class="search" onsubmit={(e) => (e.preventDefault(), setParam('q', searchInput.trim()))}>
			<input type="search" bind:value={searchInput} placeholder="Search organizations…" />
		</form>
		<select
			aria-label="Verification"
			value={f.verified}
			onchange={(e) => setParam('verified', e.currentTarget.value === 'all' ? '' : e.currentTarget.value)}
		>
			<option value="all">All</option>
			<option value="verified">Verified only</option>
		</select>
		{#if data.contributorSlug}
			<div class="toggle">
				<button class:active={f.owner === 'all'} onclick={() => setParam('owner', '')}>All</button>
				<button class:active={f.owner === 'mine'} onclick={() => setParam('owner', 'mine')}>Mine</button>
			</div>
		{/if}
		<label class="check">
			<input type="checkbox" bind:checked={venuesOnly} /> Venues only
		</label>
		{#if cities.length > 1}
			<select aria-label="City" bind:value={cityFacet}>
				<option value="">All cities</option>
				{#each cities as c}<option value={c}>{c}</option>{/each}
			</select>
		{/if}
	</div>

	{#if data.error}
		<div class="error-box"><p>Couldn't load organizations: {data.error}</p></div>
	{:else if shown.length === 0}
		<div class="empty"><p>No organizations match.</p></div>
	{:else}
		<ul class="items">
			{#each shown as o (o.id)}
				<li class="row" class:expanded={expandedId === o.id}>
					<button class="row-summary" onclick={() => (expandedId = expandedId === o.id ? null : o.id)}>
						<div class="item-main">
							<div class="line">
								<span class="name">{o.name}</span>
								{#if o.verified}<span class="badge claimed" title="Verified — claimed">✓ claimed</span>
								{:else}<span class="badge unclaimed">unclaimed</span>{/if}
							</div>
							<div class="subtitle">
								{#if o.hasPlace}{o.placeName ?? 'venue'}{#if o.city} · {o.city}{/if}{:else}<span class="muted">no location</span>{/if}
								{#if o.tags.length}<span class="dot">·</span>{o.tags.slice(0, 3).join(', ')}{/if}
							</div>
						</div>
						<div class="item-meta">
							{#if o.commercial === true}<span class="kind">commercial</span>
							{:else if o.commercial === false}<span class="kind">community</span>{/if}
						</div>
					</button>
					{#if expandedId === o.id}
						<div class="detail" transition:slide={{ duration: 180 }}>
							{#if editingId === o.id && draft}
								<form
									method="POST"
									action="?/update"
									class="edit"
									use:enhance={() => {
										const d = draft;
										saving = true;
										return async ({ result }) => {
											saving = false;
											if (result.type === 'success') {
												if (d) applyLocal(o.id, d);
												toast.push('Saved.', 'success');
												cancelEdit();
											} else if (result.type === 'failure') {
												toast.push(String(result.data?.error ?? 'Save failed.'), 'error', 6000);
											}
										};
									}}
								>
									<input type="hidden" name="id" value={o.id} />
									<input type="hidden" name="patch" value={JSON.stringify(buildPatch(o, draft))} />
									<label class="field"><span>Name</span><input type="text" bind:value={draft.name} /></label>
									<div class="grid">
										<label class="field"><span>Type</span>
											<select bind:value={draft.commercial}>
												<option value="unspecified">unspecified</option>
												<option value="true">commercial</option>
												<option value="false">community</option>
											</select>
										</label>
										<label class="field"><span>Website</span><input type="text" bind:value={draft.url} placeholder="https://…" /></label>
									</div>
									<label class="field"><span>Description</span><textarea rows="2" bind:value={draft.description}></textarea></label>
									<div class="grid">
										<label class="field"><span>Phone</span><input type="text" bind:value={draft.telephone} /></label>
										<label class="field"><span>Email</span><input type="text" bind:value={draft.email} /></label>
									</div>
									<label class="field"><span>Social links <span class="opt">(comma-separated)</span></span><input type="text" bind:value={draft.sameAs} placeholder="https://instagram.com/…" /></label>
									<div class="grid">
										<label class="field"><span>Logo URL</span><input type="text" bind:value={draft.logo} /></label>
										<label class="field"><span>Tags <span class="opt">(comma-separated)</span></span><input type="text" bind:value={draft.tags} /></label>
									</div>
									<p class="edit-note">
										Editing the organization’s own facts. Hours, the linked place, and authority
										(<code>{methodLabel(o.method)}</code>) aren’t editable here — the Commons sets
										authority on verification.
									</p>
									<div class="edit-actions">
										<button type="submit" class="primary" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
										<button type="button" class="ghost" onclick={cancelEdit}>Cancel</button>
									</div>
								</form>
							{:else}
								<dl>
									{#if o.description}<dt>About</dt><dd>{o.description}</dd>{/if}
									<dt>Location</dt>
									<dd>{o.address ?? (o.hasPlace ? (o.placeName ?? 'venue') : 'No location (touring / online)')}</dd>
									{#if o.url}<dt>Website</dt><dd><a href={o.url} target="_blank" rel="noopener noreferrer">{o.url}</a></dd>{/if}
									{#if o.telephone}<dt>Phone</dt><dd>{o.telephone}</dd>{/if}
									{#if o.email}<dt>Email</dt><dd>{o.email}</dd>{/if}
									{#if o.sameAs.length}<dt>Social</dt><dd>{#each o.sameAs as s}<a href={s} target="_blank" rel="noopener noreferrer">{s}</a>{' '}{/each}</dd>{/if}
									{#if o.tags.length}<dt>Tags</dt><dd>{o.tags.join(', ')}</dd>{/if}
									<dt>Status</dt>
									<dd>
										{#if o.verified}<span class="badge claimed">✓ claimed</span>{:else}<span class="badge unclaimed">unclaimed</span>{/if}
										<span class="auth-note">
											{#if o.verified}Claimed — a business verified itself through an ecosystem app; its info is under its control.
											{:else}Not yet claimed — imported or operator-entered data, editable here until a business formally claims it.{/if}
										</span>
									</dd>
									<dt>Provenance</dt>
									<dd>
										<span class="mono">{methodLabel(o.method)}</span>
										<span class="auth-note" style="display:inline"> · how the data arrived (Commons-set; not the claim signal)</span>
									</dd>
									<dt>Slug</dt><dd class="mono">{o.slug}</dd>
								</dl>
								<button type="button" class="edit-btn" onclick={() => startEdit(o)}>Edit</button>
							{/if}
						</div>
					{/if}
				</li>
			{/each}
		</ul>

		{#if hasPrev || hasNext}
			<div class="pager">
				<button disabled={!hasPrev} onclick={() => setParam('offset', String(Math.max(0, f.offset - f.pageSize)))}>← Prev</button>
				<span class="range">{orgs.length === 0 ? 0 : f.offset + 1}–{f.offset + orgs.length} of {total}</span>
				<button disabled={!hasNext} onclick={() => setParam('offset', String(f.offset + f.pageSize))}>Next →</button>
			</div>
		{/if}
	{/if}
{/if}

<Toast />

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
		border-color: #166534;
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
	.toggle {
		display: inline-flex;
		border: 1px solid #d0d0d0;
		border-radius: 5px;
		overflow: hidden;
	}
	.toggle button {
		background: #fff;
		border: none;
		font-family: inherit;
		font-size: 0.82rem;
		color: #666;
		padding: 0.45rem 0.7rem;
		cursor: pointer;
	}
	.toggle button.active {
		background: #166534;
		color: #fff;
	}
	.check {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.82rem;
		color: #555;
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
		padding: 0.7rem 1rem;
		width: 100%;
		background: transparent;
		border: none;
		text-align: left;
		font-family: inherit;
		font-size: inherit;
		color: inherit;
		cursor: pointer;
	}
	.row-summary:hover,
	.row.expanded .row-summary {
		background: #fafafa;
	}
	.line {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.name {
		font-weight: 600;
		color: #222;
	}
	.subtitle {
		font-size: 0.85rem;
		color: #666;
		margin-top: 0.15rem;
	}
	.muted {
		color: #aaa;
	}
	.dot {
		color: #ccc;
		margin: 0 0.1rem;
	}
	.item-meta {
		flex-shrink: 0;
	}
	.kind {
		font-size: 0.65rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #888;
	}
	.badge {
		font-size: 0.62rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		padding: 0.1rem 0.4rem;
		border-radius: 3px;
		background: #eee;
		color: #666;
		font-weight: 600;
	}
	.badge.claimed {
		background: #dbeafe;
		color: #1e40af;
	}
	.badge.unclaimed {
		background: #f3f4f6;
		color: #6b7280;
	}
	.detail {
		padding: 1rem 1.4rem 1.25rem;
		background: #fafafa;
		border-top: 1px solid #e5e5e5;
	}
	dl {
		margin: 0;
		display: grid;
		grid-template-columns: minmax(5.5rem, auto) 1fr;
		gap: 0.5rem 1rem;
		font-size: 0.9rem;
	}
	dt {
		color: #666;
		font-weight: 500;
	}
	dd {
		margin: 0;
		color: #222;
	}
	dd.mono,
	.mono {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.85em;
		color: #555;
	}
	.auth-note {
		display: block;
		font-size: 0.8rem;
		color: #777;
		margin-top: 0.3rem;
		line-height: 1.45;
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
		color: #166534;
		word-break: break-all;
	}
	code {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.85em;
		background: #f3f3f3;
		padding: 0.1rem 0.35rem;
		border-radius: 3px;
	}
	.edit-btn {
		margin-top: 0.85rem;
		font-family: inherit;
		font-size: 0.82rem;
		padding: 0.35rem 0.85rem;
		border: 1px solid #d0d0d0;
		border-radius: 5px;
		background: #fff;
		color: #444;
		cursor: pointer;
	}
	.edit-btn:hover {
		border-color: #166534;
		color: #166534;
	}
	.edit {
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		font-size: 0.8rem;
		color: #555;
	}
	.field span {
		font-weight: 500;
	}
	.field .opt {
		font-weight: 400;
		color: #999;
	}
	.field input,
	.field select,
	.field textarea {
		font-family: inherit;
		font-size: 0.9rem;
		color: #222;
		padding: 0.4rem 0.55rem;
		border: 1px solid #d0d0d0;
		border-radius: 5px;
		background: #fff;
		outline: none;
		width: 100%;
	}
	.field textarea {
		resize: vertical;
		line-height: 1.5;
	}
	.field input:focus,
	.field select:focus,
	.field textarea:focus {
		border-color: #166534;
		box-shadow: 0 0 0 2px rgba(22, 101, 52, 0.12);
	}
	.grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.7rem;
	}
	.edit-note {
		font-size: 0.78rem;
		color: #888;
		margin: 0;
		line-height: 1.5;
	}
	.edit-actions {
		display: flex;
		gap: 0.5rem;
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
	}
	button.primary:hover:not(:disabled) {
		background: #14532d;
	}
	button.primary:disabled {
		opacity: 0.6;
		cursor: default;
	}
	button.ghost {
		background: #fff;
		border: 1px solid #d0d0d0;
		color: #444;
		font-family: inherit;
		font-size: 0.875rem;
		padding: 0.45rem 0.85rem;
		border-radius: 5px;
		cursor: pointer;
	}
	button.ghost:hover {
		border-color: #166534;
		color: #166534;
	}
</style>
