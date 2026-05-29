<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';
	import Toast from '$lib/kernel/chrome/Toast.svelte';
	import { toast } from '$lib/kernel/chrome/toast.svelte.js';
	import Term from '$lib/kernel/chrome/Term.svelte';

	interface Venue {
		name: string;
		lat: number;
		lng: number;
		address?: { streetAddress?: string; addressLocality?: string; addressRegion?: string };
		website?: string;
		phone?: string;
		sameAs: string[];
		category: string;
		osmType: string;
		osmId: number;
	}

	let { data }: { data: PageData } = $props();

	let area = $state('');
	// Initialize category toggles from the server defaults once (props are read
	// in an effect, not a $state initializer, to keep the capture explicit).
	let groupChecked = $state<Record<string, boolean>>({});
	let groupsInit = false;
	$effect.pre(() => {
		if (groupsInit) return;
		groupsInit = true;
		groupChecked = Object.fromEntries(
			data.groups.map((g) => [g.id, data.defaultGroups.includes(g.id)]),
		);
	});
	let finding = $state(false);
	let publishing = $state(false);

	let venues = $state<Venue[]>([]);
	let areaName = $state('');
	let truncated = $state(false);
	let checked = $state<boolean[]>([]);

	const selectedCount = $derived(checked.filter(Boolean).length);
	const selectedVenues = $derived(venues.filter((_, i) => checked[i]));

	function fmtAddr(a?: Venue['address']): string {
		if (!a) return '';
		return [a.streetAddress, a.addressLocality, a.addressRegion].filter(Boolean).join(', ');
	}
	function setAll(v: boolean) {
		checked = venues.map(() => v);
	}
</script>

<nav class="breadcrumb"><a href="/sources">← Sources</a></nav>

<header class="head">
	<h2>Import venues from an area</h2>
	<p class="sub">
		Pull venues in a neighborhood, city, or ZIP from <Term id="venue">OpenStreetMap</Term> and
		publish them as <Term id="organizer">organizations</Term> (each linked to its place). Builds the
		venue spine that events attach to. Address, website, phone, and socials come along from OSM.
	</p>
</header>

<form
	method="POST"
	action="?/find"
	class="find-form"
	use:enhance={() => {
		finding = true;
		return async ({ result }) => {
			finding = false;
			if (result.type === 'success' && result.data) {
				venues = (result.data.venues as Venue[]) ?? [];
				areaName = String(result.data.areaName ?? '');
				truncated = Boolean(result.data.truncated);
				checked = venues.map(() => true);
				toast.push(`Found ${venues.length} venue${venues.length === 1 ? '' : 's'}.`, 'success');
			} else if (result.type === 'failure') {
				toast.push(String(result.data?.error ?? 'Search failed.'), 'error', 6000);
			}
		};
	}}
>
	<input
		type="text"
		name="area"
		bind:value={area}
		placeholder="Fishtown, Philadelphia  ·  or a ZIP like 19125"
		required
	/>
	<button type="submit" class="primary" disabled={finding}>{finding ? 'Searching…' : 'Find venues'}</button>
	<div class="cats">
		{#each data.groups as g}
			<label class="cat" title={g.hint}>
				<input type="checkbox" name="groups" value={g.id} bind:checked={groupChecked[g.id]} />
				{g.label}
			</label>
		{/each}
	</div>
</form>

{#if venues.length > 0}
	<div class="results-head">
		<div class="area">
			<strong>{venues.length}</strong> in <span class="muted">{areaName}</span>
			{#if truncated}<span class="trunc">· capped at 120 — narrow the area for the rest</span>{/if}
		</div>
		<div class="bulk">
			<button type="button" class="link" onclick={() => setAll(true)}>All</button>
			<button type="button" class="link" onclick={() => setAll(false)}>None</button>
		</div>
	</div>

	{#if !data.configured}
		<div class="gate">Set <code>COMMONS_SERVICE_KEY</code> to publish. You can preview the results below.</div>
	{/if}

	<ul class="list">
		{#each venues as v, i (v.osmType + v.osmId)}
			<li class="row" class:off={!checked[i]}>
				<label class="pick">
					<input type="checkbox" bind:checked={checked[i]} />
				</label>
				<div class="body">
					<div class="line1">
						<span class="name">{v.name}</span>
						<span class="cat-tag">{v.category}</span>
					</div>
					<div class="line2">
						{#if fmtAddr(v.address)}<span class="addr">{fmtAddr(v.address)}</span>{:else}<span class="addr muted">no address</span>{/if}
						{#if v.website}<span class="dot">·</span><span class="link-flag">web</span>{/if}
						{#if v.phone}<span class="dot">·</span><span class="link-flag">tel</span>{/if}
						{#if v.sameAs.length}<span class="dot">·</span><span class="link-flag">{v.sameAs.length} social</span>{/if}
					</div>
				</div>
			</li>
		{/each}
	</ul>

	{#if data.configured}
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
							capped: boolean;
							cap: number;
						};
						const extra = r.capped ? ` (capped at ${r.cap}/run — publish again for more)` : '';
						if (r.failedCount === 0) {
							toast.push(`Published ${r.published} venues${extra}.`, 'success', 6000);
						} else {
							toast.push(
								`Published ${r.published}, ${r.failedCount} skipped — ${r.failed[0]?.error ?? ''}${extra}`,
								'error',
								7000,
							);
						}
					} else if (result.type === 'failure') {
						toast.push(String(result.data?.error ?? 'Publish failed.'), 'error');
					}
				};
			}}
		>
			<input type="hidden" name="venues" value={JSON.stringify(selectedVenues)} />
			<span class="count">{selectedCount} selected</span>
			<button type="submit" class="primary" disabled={publishing || selectedCount === 0}>
				{publishing ? 'Publishing…' : `Publish ${selectedCount}`}
			</button>
		</form>
	{/if}
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
		max-width: 680px;
		line-height: 1.55;
	}
	.find-form {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 0.5rem;
		max-width: 800px;
		margin-bottom: 1.5rem;
	}
	.find-form input[type='text'] {
		font-family: inherit;
		font-size: 0.9rem;
		padding: 0.5rem 0.75rem;
		border: 1px solid #d0d0d0;
		border-radius: 5px;
		outline: none;
	}
	.find-form input[type='text']:focus {
		border-color: #166534;
		box-shadow: 0 0 0 2px rgba(22, 101, 52, 0.15);
	}
	.cats {
		grid-column: 1 / -1;
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin-top: 0.25rem;
	}
	.cat {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.82rem;
		color: #555;
		cursor: pointer;
	}
	.results-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		max-width: 800px;
		margin-bottom: 0.5rem;
		gap: 1rem;
	}
	.area {
		font-size: 0.9rem;
		color: #333;
	}
	.trunc {
		font-size: 0.78rem;
		color: #92400e;
	}
	.muted {
		color: #999;
	}
	.bulk {
		display: flex;
		gap: 0.5rem;
		flex-shrink: 0;
	}
	.link {
		background: none;
		border: none;
		color: #166534;
		font-family: inherit;
		font-size: 0.82rem;
		cursor: pointer;
		text-decoration: underline;
		padding: 0;
	}
	.gate {
		max-width: 800px;
		margin-bottom: 0.75rem;
		padding: 0.6rem 0.85rem;
		background: #fffbeb;
		border: 1px solid #fde68a;
		border-radius: 6px;
		font-size: 0.82rem;
		color: #92400e;
	}
	.list {
		list-style: none;
		padding: 0;
		margin: 0 0 1rem;
		max-width: 800px;
		border: 1px solid #e5e5e5;
		border-radius: 8px;
		overflow: hidden;
		background: #fff;
	}
	.row {
		display: flex;
		align-items: flex-start;
		gap: 0.6rem;
		padding: 0.55rem 0.85rem;
		border-top: 1px solid #f0f0f0;
	}
	.row:first-child {
		border-top: none;
	}
	.row.off {
		opacity: 0.5;
	}
	.pick {
		padding-top: 0.15rem;
	}
	.body {
		flex: 1;
		min-width: 0;
	}
	.line1 {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
	}
	.name {
		font-size: 0.92rem;
		font-weight: 500;
		color: #222;
	}
	.cat-tag {
		font-size: 0.65rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: #888;
		background: #f3f3f3;
		padding: 0.05rem 0.4rem;
		border-radius: 3px;
	}
	.line2 {
		font-size: 0.8rem;
		color: #777;
		margin-top: 0.15rem;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.35rem;
	}
	.dot {
		color: #ccc;
	}
	.link-flag {
		font-size: 0.7rem;
		color: #166534;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}
	.publish-bar {
		display: flex;
		align-items: center;
		gap: 1rem;
		max-width: 800px;
		padding: 0.75rem 1rem;
		background: #fff;
		border: 1px solid #e5e5e5;
		border-radius: 8px;
		position: sticky;
		bottom: 1rem;
	}
	.count {
		font-size: 0.85rem;
		color: #666;
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
		white-space: nowrap;
	}
	button.primary:hover:not(:disabled) {
		background: #14532d;
	}
	button.primary:disabled {
		opacity: 0.6;
		cursor: default;
	}
	code {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.85em;
		background: #f3f3f3;
		padding: 0.1rem 0.35rem;
		border-radius: 3px;
	}
</style>
