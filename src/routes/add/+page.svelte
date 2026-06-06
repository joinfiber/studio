<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from '$lib/kernel/chrome/toast.svelte.js';
	import { CATEGORIES } from '$lib/kernel/categories.js';
	import Term from '$lib/kernel/chrome/Term.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Broadcasts aren't addable here — they come from the businesses themselves
	// via their own apps. Library shows broadcasts read-only.
	let kind = $state<'organization' | 'event' | 'place'>('organization');
	let submitting = $state(false);

	// --- Typeahead state (Organization + Place name fields) ---
	interface CommonsMatch {
		id: string;
		name: string;
		slug?: string;
		address?: string | null;
	}
	interface OsmMatch {
		name: string;
		displayName: string;
		lat: number;
		lng: number;
		osmType: string;
		osmId: number;
		addressJson: string;
		website: string;
		phone: string;
		sameAsJson: string;
	}

	let name = $state(''); // name field of the active tab (drives the typeahead)
	let placeAddress = $state(''); // the location/address (shared by both tabs)
	let orgWebsite = $state('');
	let orgPhone = $state('');
	let orgSameAs = $state(''); // comma-separated social/identity URLs
	let commonsMatches = $state<CommonsMatch[]>([]);
	let osmMatches = $state<OsmMatch[]>([]);
	let searching = $state(false);
	let picked = $state<{ lat: number; lng: number; addressJson: string } | null>(null);
	let searchTimer: ReturnType<typeof setTimeout> | undefined;

	function clearSuggest() {
		commonsMatches = [];
		osmMatches = [];
	}

	function resetForm() {
		name = '';
		placeAddress = '';
		orgWebsite = '';
		orgPhone = '';
		orgSameAs = '';
		picked = null;
		clearTimeout(searchTimer);
		searching = false;
		clearSuggest();
	}

	function switchKind(k: typeof kind) {
		kind = k;
		resetForm();
	}

	function onName(value: string) {
		name = value;
		picked = null; // editing the name invalidates a prior OSM pick
		clearTimeout(searchTimer);
		if (value.trim().length < 2) {
			clearSuggest();
			return;
		}
		searchTimer = setTimeout(() => runSearch(value.trim()), 250);
	}

	async function runSearch(q: string) {
		searching = true;
		try {
			const res = await fetch(`/add/search?kind=${kind}&q=${encodeURIComponent(q)}`);
			const d = (await res.json()) as { commons: CommonsMatch[]; osm: OsmMatch[] };
			commonsMatches = d.commons ?? [];
			osmMatches = d.osm ?? [];
		} catch {
			clearSuggest();
		} finally {
			searching = false;
		}
	}

	function pickOsm(c: OsmMatch) {
		name = c.name;
		placeAddress = c.displayName;
		picked = { lat: c.lat, lng: c.lng, addressJson: c.addressJson };
		// Autofill the org's links from OSM's openly-licensed contact tags.
		orgWebsite = c.website ?? '';
		orgPhone = c.phone ?? '';
		try {
			orgSameAs = (JSON.parse(c.sameAsJson) as string[]).join(', ');
		} catch {
			orgSameAs = '';
		}
		clearSuggest();
	}
</script>

<header class="page-head">
	<h2>Add</h2>
	<div class="kind-picker">
		<button class:active={kind === 'organization'} onclick={() => switchKind('organization')}>
			Organization
		</button>
		<button class:active={kind === 'event'} onclick={() => switchKind('event')}>Event</button>
		<button class:active={kind === 'place'} onclick={() => switchKind('place')}>Place</button>
	</div>
</header>

{#snippet matchList()}
	{#if searching || commonsMatches.length > 0 || osmMatches.length > 0}
		<div class="suggest">
			{#if searching}<div class="suggest-status">Searching…</div>{/if}
			{#if commonsMatches.length > 0}
				<div class="suggest-group">
					<div class="suggest-label">Already in the Commons</div>
					{#each commonsMatches as m (m.id)}
						<div class="suggest-item commons">
							<span class="si-name">{m.name}</span>
							{#if m.address}<span class="si-detail">{m.address}</span>
							{:else if m.slug}<span class="si-detail">{m.slug}</span>{/if}
						</div>
					{/each}
					<div class="suggest-hint">Already here — no need to add it again.</div>
				</div>
			{/if}
			{#if osmMatches.length > 0}
				<div class="suggest-group">
					<div class="suggest-label">From OpenStreetMap — pick to autofill</div>
					{#each osmMatches as m (m.osmType + m.osmId)}
						<button type="button" class="suggest-item osm" onclick={() => pickOsm(m)}>
							<span class="si-name">{m.name}</span>
							<span class="si-detail">{m.displayName}</span>
						</button>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
{/snippet}

{#if kind === 'organization'}
	<p class="explainer">
		An <Term id="organizer">organization</Term> is the entity that runs things — a venue, host, shop,
		or group, and what events attach to. Add a location below and it becomes a venue (an organization
		at a <Term id="venue">place</Term>). Picking an OpenStreetMap match autofills the address and
		links.
	</p>
	<form
		class="form"
		method="POST"
		action="?/organization"
		use:enhance={() => {
			submitting = true;
			return async ({ result, update }) => {
				submitting = false;
				if (result.type === 'success' && result.data?.success) {
					toast.push(
						`Published organization “${result.data.name}” (${result.data.slug})`,
						'success',
					);
					resetForm();
					await update({ reset: true });
				} else if (result.type === 'failure') {
					toast.push(String(result.data?.error ?? 'Publish failed.'), 'error');
				} else {
					await update();
				}
			};
		}}
	>
		<label>
			<span>Name</span>
			<input
				type="text"
				name="name"
				value={name}
				oninput={(e) => onName(e.currentTarget.value)}
				placeholder="Johnny Brenda's"
				autocomplete="off"
				required
			/>
		</label>
		{@render matchList()}

		<label>
			<span>Location <span class="opt">(optional — makes it a venue)</span></span>
			<input
				type="text"
				name="placeAddress"
				bind:value={placeAddress}
				oninput={() => (picked = null)}
				placeholder="1201 N Frankford Ave, Philadelphia PA"
			/>
		</label>
		<input type="hidden" name="lat" value={picked?.lat ?? ''} />
		<input type="hidden" name="lng" value={picked?.lng ?? ''} />
		<input type="hidden" name="addressJson" value={picked?.addressJson ?? ''} />
		{#if placeAddress}
			<p class="sub-hint">
				{#if picked}Coordinates locked from the picked result.{:else}Geocoded to coordinates on
					publish.{/if} Creates a Place and links it as the primary location.{#if data.placeIdentity}
					Deduped by Google Place ID.{/if}
			</p>
		{/if}

		<label>
			<span>Description</span>
			<textarea
				name="description"
				rows="2"
				placeholder="Music venue, bar, and restaurant in Fishtown."
			></textarea>
		</label>
		<div class="row">
			<label class="half">
				<span>Website</span>
				<input type="text" name="url" bind:value={orgWebsite} placeholder="https://..." />
			</label>
			<label class="half">
				<span>Phone</span>
				<input type="text" name="telephone" bind:value={orgPhone} placeholder="(215) 555-0100" />
			</label>
		</div>
		<label>
			<span>Social links <span class="opt">(comma-separated)</span></span>
			<input
				type="text"
				name="sameAs"
				bind:value={orgSameAs}
				placeholder="https://instagram.com/…, https://facebook.com/…"
			/>
		</label>
		<div class="row">
			<label class="half">
				<span>Logo URL</span>
				<input type="text" name="logo" placeholder="https://..." />
			</label>
			<label class="half">
				<span>Commercial</span>
				<select name="commercial">
					<option value="unspecified">unspecified</option>
					<option value="true">yes</option>
					<option value="false">no</option>
				</select>
			</label>
		</div>
		<label>
			<span>Tags <span class="opt">(comma-separated)</span></span>
			<input type="text" name="tags" placeholder="live-music, bar, restaurant" />
		</label>
		<div class="actions">
			<button type="submit" class="primary" disabled={submitting}>
				{submitting ? 'Publishing…' : 'Publish'}
			</button>
			<span class="hint"
				>Method: <Term id="self_asserted">self_asserted</Term> · creates an organization in Commons</span
			>
		</div>
	</form>
{:else if kind === 'event'}
	<form
		class="form"
		method="POST"
		action="?/event"
		use:enhance={() => {
			submitting = true;
			return async ({ result, update }) => {
				submitting = false;
				if (result.type === 'success' && result.data?.success) {
					toast.push(`Published event “${result.data.name}”`, 'success');
					await update({ reset: true });
				} else if (result.type === 'failure') {
					toast.push(String(result.data?.error ?? 'Publish failed.'), 'error');
				} else {
					await update();
				}
			};
		}}
	>
		<label>
			<span>Name</span>
			<input type="text" name="name" placeholder="Tuesday Chess" required />
		</label>
		<label>
			<span>Organizer</span>
			<input type="text" name="organizer" placeholder="Philly Chess Club" required />
		</label>
		<p class="sub-hint">The org running it — resolved by name, created in the Commons if new.</p>
		<div class="row">
			<label class="half">
				<span>Starts</span>
				<input type="datetime-local" name="when" required />
			</label>
			<label class="half">
				<span>Ends (optional)</span>
				<input type="datetime-local" name="end" />
			</label>
		</div>
		<div class="row">
			<label class="half">
				<span>Timezone</span>
				<input type="text" name="timezone" value="America/New_York" />
			</label>
			<label class="half">
				<span>Category</span>
				<select name="category">
					{#each CATEGORIES as cat}
						<option value={cat.slug}>{cat.label}</option>
					{/each}
				</select>
			</label>
		</div>
		<label>
			<span>Venue</span>
			<input type="text" name="venue" placeholder="Johnny Brenda's" />
		</label>
		<label>
			<span>Address (optional)</span>
			<input type="text" name="address" placeholder="1201 N Frankford Ave, Philadelphia PA" />
		</label>
		<label>
			<span>Description (optional)</span>
			<textarea name="description" rows="3"></textarea>
		</label>
		<div class="actions">
			<button type="submit" class="primary" disabled={submitting}>
				{submitting ? 'Publishing…' : 'Publish'}
			</button>
			<span class="hint"
				>Method: <Term id="self_asserted">self_asserted</Term> · attaches to the organizer org</span
			>
		</div>
	</form>
{:else if kind === 'place'}
	<p class="explainer">
		A <Term id="venue">Place</Term> is a bare physical location — a park, a building, a stretch of sidewalk
		— with no operator attached. Usually you want an
		<Term id="organizer">Organization</Term> instead (which links its own place). Add a Place only when
		you need the location on its own.
	</p>
	<form
		class="form"
		method="POST"
		action="?/place"
		use:enhance={() => {
			submitting = true;
			return async ({ result, update }) => {
				submitting = false;
				if (result.type === 'success' && result.data?.success) {
					toast.push(`Published place “${result.data.name}”`, 'success');
					resetForm();
					await update({ reset: true });
				} else if (result.type === 'failure') {
					toast.push(String(result.data?.error ?? 'Publish failed.'), 'error');
				} else {
					await update();
				}
			};
		}}
	>
		<label>
			<span>Name</span>
			<input
				type="text"
				name="name"
				value={name}
				oninput={(e) => onName(e.currentTarget.value)}
				placeholder="Clark Park"
				autocomplete="off"
				required
			/>
		</label>
		{@render matchList()}
		<label>
			<span>Address</span>
			<input
				type="text"
				name="address"
				bind:value={placeAddress}
				oninput={() => (picked = null)}
				placeholder="4300 Baltimore Ave, Philadelphia PA"
			/>
		</label>
		<input type="hidden" name="lat" value={picked?.lat ?? ''} />
		<input type="hidden" name="lng" value={picked?.lng ?? ''} />
		<input type="hidden" name="addressJson" value={picked?.addressJson ?? ''} />
		<p class="sub-hint">
			{#if picked}Coordinates locked from the picked result.{:else}Pick a result above, or type an
				address — it's geocoded to coordinates on publish.{/if}
			The Commons derives place categories from OpenStreetMap.{#if data.placeIdentity}
				Deduped by Google Place ID.{/if}
		</p>
		<div class="actions">
			<button type="submit" class="primary" disabled={submitting}>
				{submitting ? 'Publishing…' : 'Publish'}
			</button>
			<span class="hint">Creates a place in the Commons · geocoded via OpenStreetMap</span>
		</div>
	</form>
{/if}

<style>
	.page-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		margin-bottom: 1.25rem;
	}
	.page-head h2 {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 600;
	}
	.kind-picker {
		display: flex;
		gap: 0.25rem;
	}
	.kind-picker button {
		background: transparent;
		border: 1px solid transparent;
		font-family: inherit;
		font-size: 0.85rem;
		color: #666;
		padding: 0.3rem 0.7rem;
		border-radius: 5px;
		cursor: pointer;
		transition:
			background-color 100ms ease,
			color 100ms ease;
	}
	.kind-picker button:hover {
		background: #f0f0f0;
		color: #222;
	}
	.kind-picker button.active {
		background: #222;
		color: #fff;
	}
	.explainer {
		max-width: 640px;
		font-size: 0.85rem;
		color: #555;
		line-height: 1.55;
		margin: 0 0 1rem;
	}
	.form {
		max-width: 640px;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		background: #fff;
		border: 1px solid #e5e5e5;
		border-radius: 8px;
		padding: 1.5rem;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		font-size: 0.85rem;
		color: #444;
	}
	label span {
		font-weight: 500;
	}
	.opt {
		font-weight: 400;
		color: #999;
	}
	input,
	select,
	textarea {
		font-family: inherit;
		font-size: 0.95rem;
		padding: 0.5rem 0.7rem;
		border: 1px solid #d0d0d0;
		border-radius: 5px;
		color: #222;
		background: #fff;
		outline: none;
		transition:
			border-color 100ms ease,
			box-shadow 100ms ease;
	}
	input:focus,
	select:focus,
	textarea:focus {
		border-color: var(--accent);
		box-shadow: 0 0 0 2px rgba(22, 101, 52, 0.15);
	}
	.row {
		display: flex;
		gap: 0.75rem;
	}
	.half {
		flex: 1;
	}
	textarea {
		resize: vertical;
		font-family: inherit;
	}
	.suggest {
		max-width: 640px;
		margin: -0.5rem 0 0;
		border: 1px solid #e5e5e5;
		border-radius: 6px;
		background: #fff;
		overflow: hidden;
	}
	.suggest-status {
		padding: 0.5rem 0.75rem;
		font-size: 0.8rem;
		color: #999;
	}
	.suggest-group {
		border-top: 1px solid #f0f0f0;
	}
	.suggest-group:first-child {
		border-top: none;
	}
	.suggest-label {
		padding: 0.45rem 0.75rem 0.2rem;
		font-size: 0.65rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #999;
	}
	.suggest-item {
		display: block;
		width: 100%;
		text-align: left;
		padding: 0.35rem 0.75rem;
		border: none;
		background: transparent;
		font-family: inherit;
		color: inherit;
	}
	.suggest-item.osm {
		cursor: pointer;
	}
	.suggest-item.osm:hover {
		background: #f4f7f4;
	}
	.suggest-item.commons {
		opacity: 0.85;
	}
	.si-name {
		font-size: 0.9rem;
		color: #222;
		font-weight: 500;
	}
	.si-detail {
		display: block;
		font-size: 0.78rem;
		color: #888;
		margin-top: 0.05rem;
	}
	.suggest-hint {
		padding: 0.2rem 0.75rem 0.55rem;
		font-size: 0.72rem;
		color: #aaa;
	}
	.actions {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-top: 0.5rem;
	}
	button.primary {
		background: var(--accent);
		border: 1px solid var(--accent);
		color: #fff;
		font-family: inherit;
		font-size: 0.9rem;
		padding: 0.5rem 1rem;
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
	.hint {
		font-size: 0.8rem;
		color: #888;
	}
	.sub-hint {
		font-size: 0.78rem;
		color: #888;
		margin: -0.5rem 0 0;
	}
</style>
