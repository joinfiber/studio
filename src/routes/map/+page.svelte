<script lang="ts">
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import type { Map as MlMap, MapOptions, GeoJSONSource, FilterSpecification } from 'maplibre-gl';
	import type { PageData } from './$types';
	import CapabilityGuide from '$lib/kernel/chrome/CapabilityGuide.svelte';
	import Toast from '$lib/kernel/chrome/Toast.svelte';
	import { toast } from '$lib/kernel/chrome/toast.svelte.js';
	import {
		emptyWeek,
		parseOsmHours,
		weekFromGooglePeriods,
		weekToSpec,
		weekFromSpec,
		hasAnyHours,
		applyToWeekdays,
		applyToAll,
		DAYS,
		type WeekHours,
		type DayHours,
	} from '$lib/kernel/hours.js';
	import type { GoogleDetails } from '$lib/kernel/google-details.js';

	type OsmVenue = {
		name: string;
		lat: number;
		lng: number;
		address?: Record<string, string | undefined>;
		website?: string;
		phone?: string;
		sameAs?: string[];
		openingHoursRaw?: string;
		category?: string;
		osmType: string;
		osmId: number;
	};
	type FullOrg = {
		id: string;
		name: string;
		lat: number;
		lng: number;
		verified: boolean;
		reviewed: boolean;
		openingHoursSpecification: unknown;
	};
	type Feature = {
		type: 'Feature';
		geometry: { type: 'Point'; coordinates: [number, number] };
		properties: Record<string, unknown>;
	};
	interface Draft {
		name: string;
		website: string;
		phone: string;
		sameAs: string;
		tags: string;
		description: string;
	}
	type Filter = 'all' | 'needs' | 'reviewed';

	let { data }: { data: PageData } = $props();
	let mapContainer = $state<HTMLDivElement | null>(null);
	let mapError = $state('');
	let osmLoading = $state(false);
	let zoomLow = $state(false);
	let loadedCount = $state(0);
	let filter = $state<Filter>('all');
	let reviewedIds = $state(new Set<string>());

	// Panel: `selected` = adding a gray OSM venue; `editing` = editing an existing
	// Commons venue (yellow). At most one is set.
	let selected = $state<OsmVenue | null>(null);
	let editing = $state<FullOrg | null>(null);
	let draft = $state<Draft | null>(null);
	let original = $state<Draft | null>(null); // edit-mode dirty check
	let adding = $state(false);
	let savingEdit = $state(false);
	let editLoading = $state(false);
	let panelGen = 0; // bumped on every panel open/close; guards stale async results

	// Google reference (display-only) + hours editor
	let google = $state<GoogleDetails | null>(null);
	let googleLoading = $state(false);
	let googleTried = $state(false);
	let week = $state<WeekHours>(emptyWeek());
	let hoursOpen = $state(false);

	// Edit-mode OSM compare + the record's committed identifiers
	let osmRefMatch = $state<OsmVenue | null>(null);
	let osmRefLoading = $state(false);
	let osmRefTried = $state(false);
	let editMeta = $state<{
		placeId: string | null;
		address: Record<string, string | undefined> | null;
		identifiers: Array<{ propertyID: string; value: string }>;
	} | null>(null);
	const osmRef = $derived<OsmVenue | null>(selected ?? osmRefMatch);

	const claimedCount = $derived(data.live ? data.points.filter((p) => p.verified).length : 0);
	const reviewedCount = $derived(reviewedIds.size);
	const subjName = $derived(selected?.name ?? editing?.name ?? '');
	const subjLat = $derived(selected?.lat ?? editing?.lat ?? 0);
	const subjLng = $derived(selected?.lng ?? editing?.lng ?? 0);
	const editDirty = $derived(
		!!editing &&
			!!draft &&
			!!original &&
			(draft.name !== original.name ||
				draft.website !== original.website ||
				draft.phone !== original.phone ||
				draft.sameAs !== original.sameAs ||
				draft.tags !== original.tags ||
				draft.description !== original.description ||
				JSON.stringify(weekToSpec(week)) !==
					JSON.stringify(weekToSpec(weekFromSpec(editing.openingHoursSpecification)))),
	);

	const MIN_OSM_ZOOM = 13;
	const MAX_OSM = 2000;

	// Imperative refs shared by the map and the panel. The gray layer ACCUMULATES
	// (never cleared on view change); only an explicit add removes a dot.
	let map: MlMap | undefined;
	let osmFeatures: Feature[] = [];
	const osmById = new Map<string, OsmVenue>();
	let orgFeatures: Feature[] = [];
	const orgKeys = new Set<string>();

	const roundKey = (lat: number, lng: number) => `${lat.toFixed(3)},${lng.toFixed(3)}`;
	function orgFeature(p: {
		id: string;
		name: string;
		lat: number;
		lng: number;
		verified: boolean;
		reviewed: boolean;
	}): Feature {
		return {
			type: 'Feature',
			geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
			properties: { id: p.id, name: p.name, verified: p.verified, reviewed: p.reviewed },
		};
	}
	function setOsm() {
		(map?.getSource('osm') as GeoJSONSource | undefined)?.setData({
			type: 'FeatureCollection',
			features: osmFeatures,
		});
		loadedCount = osmFeatures.length;
	}
	function setOrgs() {
		(map?.getSource('orgs') as GeoJSONSource | undefined)?.setData({
			type: 'FeatureCollection',
			features: orgFeatures,
		});
	}
	function patchOrgFeature(orgId: string, props: Partial<{ name: string; reviewed: boolean }>) {
		const f = orgFeatures.find((ft) => ft.properties.id === orgId);
		if (!f) return;
		Object.assign(f.properties, props);
		setOrgs();
	}
	function fmtAddr(a?: Record<string, string | undefined> | null): string {
		return a
			? [a.streetAddress, a.addressLocality, a.addressRegion, a.postalCode].filter(Boolean).join(', ')
			: '';
	}

	function resetPanelExtras() {
		google = null;
		googleLoading = false;
		googleTried = false;
		week = emptyWeek();
		hoursOpen = false;
		osmRefMatch = null;
		osmRefLoading = false;
		osmRefTried = false;
		editMeta = null;
		editLoading = false;
	}
	function openPanel(v: OsmVenue) {
		panelGen++;
		editing = null;
		original = null;
		selected = v;
		draft = {
			name: v.name,
			website: v.website ?? '',
			phone: v.phone ?? '',
			sameAs: (v.sameAs ?? []).join(', '),
			tags: v.category ?? '',
			description: '',
		};
		resetPanelExtras();
	}
	async function openEditPanel(p: FullOrg) {
		panelGen++;
		const gen = panelGen;
		selected = null;
		resetPanelExtras();
		editLoading = true;
		editing = p;
		draft = { name: p.name, website: '', phone: '', sameAs: '', tags: '', description: '' };
		original = { ...draft };
		try {
			const res = await fetch(`/map/org/${encodeURIComponent(p.id)}`);
			const r = (await res.json().catch(() => ({}))) as {
				error?: string;
				raw?: {
					name?: string;
					url?: string | null;
					telephone?: string | null;
					description?: string | null;
					sameAs?: string[];
					tags?: string[];
					openingHoursSpecification?: unknown;
					verified?: boolean;
					location?: {
						id?: string;
						address?: Record<string, string | undefined>;
						geo?: { latitude?: number; longitude?: number };
						identifier?: Array<{ propertyID: string; value: string }>;
					};
				};
			};
			if (gen !== panelGen) return; // panel changed during load — drop this result
			if (!res.ok || !r.raw) {
				toast.push(r.error ?? 'Couldn’t load venue.', 'error');
				closePanel();
				return;
			}
			const raw = r.raw;
			const geo = raw.location?.geo;
			editing = {
				id: p.id,
				name: raw.name ?? p.name,
				lat: geo?.latitude ?? p.lat,
				lng: geo?.longitude ?? p.lng,
				verified: raw.verified ?? p.verified,
				reviewed: p.reviewed,
				openingHoursSpecification: raw.openingHoursSpecification ?? null,
			};
			draft = {
				name: raw.name ?? p.name,
				website: raw.url ?? '',
				phone: raw.telephone ?? '',
				sameAs: (raw.sameAs ?? []).join(', '),
				tags: (raw.tags ?? []).join(', '),
				description: raw.description ?? '',
			};
			original = { ...draft };
			week = weekFromSpec(raw.openingHoursSpecification);
			editMeta = {
				placeId: raw.location?.id ?? null,
				address: raw.location?.address ?? null,
				identifiers: Array.isArray(raw.location?.identifier) ? raw.location.identifier : [],
			};
		} catch (e) {
			if (gen === panelGen) {
				toast.push(e instanceof Error ? e.message : 'Couldn’t load venue.', 'error');
				closePanel();
			}
		} finally {
			if (gen === panelGen) editLoading = false;
		}
	}
	function closePanel() {
		panelGen++;
		selected = null;
		editing = null;
		draft = null;
		original = null;
		resetPanelExtras();
	}

	async function copy(text: string) {
		try {
			await navigator.clipboard.writeText(text);
			toast.push('Copied', 'success', 1100);
		} catch {
			toast.push('Copy failed', 'error');
		}
	}

	async function loadGoogle() {
		if ((!selected && !editing) || googleLoading) return;
		const gen = panelGen;
		googleLoading = true;
		try {
			const res = await fetch('/map/google', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: subjName, lat: subjLat, lng: subjLng }),
			});
			const r = (await res.json().catch(() => ({}))) as { details?: GoogleDetails | null; error?: string };
			if (gen !== panelGen) return; // panel changed — don't land this in another venue
			if (!res.ok) {
				toast.push(String(r.error ?? 'Google lookup failed.'), 'error');
			} else {
				google = r.details ?? null;
			}
		} catch (e) {
			if (gen === panelGen) toast.push(e instanceof Error ? e.message : 'Google lookup failed.', 'error');
		} finally {
			if (gen === panelGen) {
				googleLoading = false;
				googleTried = true;
			}
		}
	}

	async function loadOsmMatch() {
		if (!editing || osmRefLoading) return;
		const gen = panelGen;
		osmRefLoading = true;
		try {
			const { lat, lng, name } = editing;
			const dd = 0.0025; // ~250 m box around the venue
			const res = await fetch(`/map/osm?s=${lat - dd}&w=${lng - dd}&n=${lat + dd}&e=${lng + dd}`);
			const r = (await res.json().catch(() => ({}))) as { venues?: OsmVenue[] };
			if (gen !== panelGen) return; // panel changed — drop
			const target = name.toLowerCase();
			let best: OsmVenue | null = null;
			let bestScore = Infinity;
			for (const vn of r.venues ?? []) {
				const dist = Math.hypot(vn.lat - lat, vn.lng - lng);
				const nameMatch = vn.name.toLowerCase().includes(target) || target.includes(vn.name.toLowerCase());
				const score = dist - (nameMatch ? 0.002 : 0); // lightly prefer a name match
				if (score < bestScore) {
					bestScore = score;
					best = vn;
				}
			}
			osmRefMatch = best;
			if (!best) toast.push('No OSM venue found nearby.', 'info', 2000);
		} catch {
			if (gen === panelGen) toast.push('OSM lookup failed.', 'error');
		} finally {
			if (gen === panelGen) {
				osmRefLoading = false;
				osmRefTried = true;
			}
		}
	}

	function fillHoursFromOsm() {
		const raw = osmRef?.openingHoursRaw;
		const parsed = raw ? parseOsmHours(raw) : null;
		if (!parsed) {
			toast.push(raw ? 'Couldn’t read OSM hours — enter by hand.' : 'No OSM hours for this venue.', 'info', 2500);
			return;
		}
		week = parsed;
		hoursOpen = true;
	}
	function fillHoursFromGoogle() {
		if (!google?.hoursPeriods.length) {
			toast.push('No Google hours available.', 'info', 2000);
			return;
		}
		week = weekFromGooglePeriods(google.hoursPeriods);
		hoursOpen = true;
	}
	function useGoogle(field: 'name' | 'website' | 'phone', value: string | null) {
		if (!draft || !value) return;
		draft[field] = value;
		toast.push('Applied', 'success', 900);
	}
	function spreadWeekdays() {
		week = applyToWeekdays(week, 0);
	}
	function spreadAll() {
		week = applyToAll(week, 0);
	}
	function hoursSetCount(w: WeekHours): number {
		return w.filter((d) => !d.closed && d.open && d.close).length;
	}
	function isOvernight(d: DayHours): boolean {
		if (d.closed) return false;
		const toMin = (s: string) => {
			const m = s.match(/^(\d{1,2}):(\d{2})$/);
			return m ? +m[1] * 60 + +m[2] : NaN;
		};
		const o = toMin(d.open);
		const c = toMin(d.close);
		return Number.isFinite(o) && Number.isFinite(c) && c < o; // closes after midnight
	}

	async function addSelected() {
		if (!selected || !draft) return;
		const v = selected;
		const d = draft;
		adding = true;
		const payload = {
			name: d.name.trim() || v.name,
			lat: v.lat,
			lng: v.lng,
			address: v.address,
			website: d.website.trim() || undefined,
			phone: d.phone.trim() || undefined,
			sameAs: d.sameAs.split(',').map((s) => s.trim()).filter(Boolean),
			tags: d.tags.split(',').map((s) => s.trim()).filter(Boolean),
			category: v.category, // OSM category — a server-side tag fallback if tags is empty
			openingHours: hasAnyHours(week) ? weekToSpec(week) : undefined,
			osmType: v.osmType,
			osmId: v.osmId,
		};
		try {
			const res = await fetch('/map/add', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ venue: payload }),
			});
			const r = (await res.json().catch(() => ({}))) as { error?: string; orgId?: string };
			if (!res.ok) {
				toast.push(String(r.error ?? 'Add failed.'), 'error', 6000);
				return;
			}
			const key = `${v.osmType}/${v.osmId}`;
			osmById.delete(key);
			osmFeatures = osmFeatures.filter((f) => f.properties.key !== key);
			orgFeatures = [
				...orgFeatures,
				orgFeature({
					id: r.orgId ?? `osm-${v.osmType}-${v.osmId}`,
					name: payload.name,
					lat: v.lat,
					lng: v.lng,
					verified: false,
					reviewed: false,
				}),
			];
			orgKeys.add(roundKey(v.lat, v.lng));
			setOsm();
			setOrgs();
			toast.push(`Added “${payload.name}”`, 'success');
			closePanel();
		} catch (e) {
			toast.push(e instanceof Error ? e.message : 'Add failed.', 'error');
		} finally {
			adding = false;
		}
	}

	async function markReviewed(orgId: string, reviewed: boolean): Promise<boolean> {
		const res = await fetch('/map/review', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ orgId, reviewed }),
		});
		if (!res.ok) return false; // caller surfaces the message
		if (reviewed) reviewedIds.add(orgId);
		else reviewedIds.delete(orgId);
		patchOrgFeature(orgId, { reviewed });
		if (editing && editing.id === orgId) editing = { ...editing, reviewed };
		return true;
	}

	async function saveEdit() {
		if (!editing || !draft || !original) return;
		const e = editing;
		const d = draft;
		const o = original;
		savingEdit = true;
		try {
			const patch: Record<string, unknown> = {};
			if (d.name.trim() && d.name !== o.name) patch.name = d.name.trim();
			if (d.website !== o.website) patch.url = d.website.trim() || null;
			if (d.phone !== o.phone) patch.telephone = d.phone.trim() || null;
			if (d.description !== o.description) patch.description = d.description.trim() || null;
			if (d.sameAs !== o.sameAs) patch.sameAs = d.sameAs.split(',').map((s) => s.trim()).filter(Boolean);
			if (d.tags !== o.tags) patch.tags = d.tags.split(',').map((s) => s.trim()).filter(Boolean);
			const newSpec = weekToSpec(week);
			if (JSON.stringify(newSpec) !== JSON.stringify(weekToSpec(weekFromSpec(e.openingHoursSpecification)))) {
				patch.openingHoursSpecification = newSpec;
			}

			const edited = Object.keys(patch).length > 0;
			if (edited) {
				const res = await fetch(`/map/org/${encodeURIComponent(e.id)}`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(patch),
				});
				const r = (await res.json().catch(() => ({}))) as { error?: string };
				if (!res.ok) {
					toast.push(r.error ?? 'Save failed.', 'error', 6000);
					return;
				}
				if (patch.name) patchOrgFeature(e.id, { name: String(patch.name) });
			}
			const reviewed = await markReviewed(e.id, true);
			if (reviewed) {
				toast.push(edited ? 'Saved & marked reviewed' : 'Marked reviewed', 'success');
			} else {
				toast.push(edited ? 'Saved, but couldn’t mark reviewed' : 'Couldn’t mark reviewed', 'error');
			}
			closePanel();
		} catch (err) {
			toast.push(err instanceof Error ? err.message : 'Save failed.', 'error');
		} finally {
			savingEdit = false;
		}
	}
	async function unreview() {
		if (!editing) return;
		const ok = await markReviewed(editing.id, false);
		if (!ok) toast.push('Couldn’t update review state.', 'error');
	}

	function applyFilter(f: Filter) {
		filter = f;
		if (!map) return;
		const expr: unknown =
			f === 'needs'
				? ['all', ['!', ['get', 'reviewed']], ['!', ['get', 'verified']]]
				: f === 'reviewed'
					? ['==', ['get', 'reviewed'], true]
					: null;
		map.setFilter('org-dots', expr as FilterSpecification | null);
	}

	async function loadOsm() {
		if (!map) return;
		if (map.getZoom() < MIN_OSM_ZOOM) {
			zoomLow = true;
			return; // keep what's loaded; just don't fetch more
		}
		zoomLow = false;
		if (osmById.size >= MAX_OSM) return;
		const b = map.getBounds();
		osmLoading = true;
		try {
			const res = await fetch(
				`/map/osm?s=${b.getSouth()}&w=${b.getWest()}&n=${b.getNorth()}&e=${b.getEast()}`,
			);
			const d = (await res.json()) as { venues?: OsmVenue[] };
			let changed = false;
			for (const v of d.venues ?? []) {
				const key = `${v.osmType}/${v.osmId}`;
				if (osmById.has(key)) continue;
				if (orgKeys.has(roundKey(v.lat, v.lng))) continue;
				if (osmById.size >= MAX_OSM) break;
				osmById.set(key, v);
				osmFeatures.push({
					type: 'Feature',
					geometry: { type: 'Point', coordinates: [v.lng, v.lat] },
					properties: { name: v.name, key },
				});
				changed = true;
			}
			if (changed) setOsm();
		} catch {
			/* transient — keep existing dots */
		} finally {
			osmLoading = false;
		}
	}

	onMount(() => {
		const styleUrl = data.styleUrl;
		const container = mapContainer;
		if (!data.live || !data.mapReady || !styleUrl || !container) return;
		let destroyed = false;

		(async () => {
			const maplibre = await import('maplibre-gl');
			if (destroyed) return;

			orgFeatures = data.points.map(orgFeature);
			reviewedIds = new Set(data.points.filter((p) => p.reviewed).map((p) => p.id));
			for (const p of data.points) orgKeys.add(roundKey(p.lat, p.lng));

			const opts: MapOptions = { container, style: styleUrl, zoom: 15 };
			if (data.points.length > 0) {
				const lat = data.points.reduce((s, p) => s + p.lat, 0) / data.points.length;
				const lng = data.points.reduce((s, p) => s + p.lng, 0) / data.points.length;
				opts.center = [lng, lat];
			} else {
				opts.center = [-75.16, 39.95];
			}

			map = new maplibre.Map(opts);
			map.addControl(new maplibre.NavigationControl({ showCompass: false }), 'top-right');

			map.on('load', () => {
				if (!map) return;
				map.addSource('osm', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
				map.addSource('orgs', { type: 'geojson', data: { type: 'FeatureCollection', features: orgFeatures } });
				map.addLayer({
					id: 'osm-dots',
					type: 'circle',
					source: 'osm',
					paint: {
						'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 2.5, 17, 5],
						'circle-color': '#9ca3af',
						'circle-stroke-width': 0.75,
						'circle-stroke-color': '#ffffff',
						'circle-opacity': 0.85,
					},
				});
				map.addLayer({
					id: 'org-dots',
					type: 'circle',
					source: 'orgs',
					paint: {
						'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 3, 14, 6],
						'circle-color': ['case', ['get', 'verified'], '#2563eb', '#eab308'],
						'circle-stroke-width': 1,
						'circle-stroke-color': '#ffffff',
						'circle-opacity': 0.95,
					},
				});
				if (filter !== 'all') applyFilter(filter);

				map.on('click', 'osm-dots', (e) => {
					const f = e.features?.[0];
					if (!f) return;
					const v = osmById.get(String(f.properties?.key));
					if (v) openPanel(v);
				});
				map.on('click', 'org-dots', (e) => {
					const f = e.features?.[0];
					if (!f) return;
					const props = f.properties ?? {};
					if (!props.id) return;
					const coords = (f.geometry as { coordinates: [number, number] }).coordinates;
					openEditPanel({
						id: String(props.id),
						name: String(props.name ?? 'Venue'),
						lat: coords[1],
						lng: coords[0],
						verified: props.verified === true || props.verified === 'true',
						reviewed: props.reviewed === true || props.reviewed === 'true',
						openingHoursSpecification: null,
					});
				});
				for (const layer of ['org-dots', 'osm-dots']) {
					map.on('mouseenter', layer, () => {
						if (map) map.getCanvas().style.cursor = 'pointer';
					});
					map.on('mouseleave', layer, () => {
						if (map) map.getCanvas().style.cursor = '';
					});
				}

				let t: ReturnType<typeof setTimeout> | undefined;
				map.on('moveend', () => {
					clearTimeout(t);
					t = setTimeout(loadOsm, 500);
				});
				zoomLow = map.getZoom() < MIN_OSM_ZOOM;
				map.once('idle', () => loadOsm());
			});
		})().catch((e) => {
			mapError = e instanceof Error ? e.message : 'Map failed to load.';
		});

		return () => {
			destroyed = true;
			map?.remove();
			map = undefined;
		};
	});
</script>

<header class="page-head">
	<h2>Map</h2>
	{#if data.live && data.mapReady}
		<span class="total">
			{data.points.length} in Commons · {claimedCount} claimed{#if loadedCount > 0} · {loadedCount} on OSM{/if}
		</span>
	{/if}
</header>

{#if !data.live}
	<div class="empty">
		<p>The map plots the venues in the Commons.</p>
		<p class="hint">Set <code>COMMONS_SERVICE_KEY</code> (and redeploy) to load live data.</p>
	</div>
{:else if !data.mapReady}
	<div class="gate">
		<p class="gate-intro">
			The map needs a basemap. Add a free MapTiler key to turn it on — the venue data comes from
			the Commons regardless.
		</p>
		{#if data.capability}<CapabilityGuide capability={data.capability} />{/if}
	</div>
{:else}
	{#if data.error}<div class="error-box">Couldn't load venues: {data.error}</div>{/if}
	{#if mapError}<div class="error-box">{mapError}</div>{/if}

	<div class="map-controls">
		<div class="seg" role="group" aria-label="Filter venues by review state">
			<button class:active={filter === 'all'} onclick={() => applyFilter('all')}>All</button>
			<button class:active={filter === 'needs'} onclick={() => applyFilter('needs')}>Needs review</button>
			<button class:active={filter === 'reviewed'} onclick={() => applyFilter('reviewed')}>Reviewed</button>
		</div>
		<span class="rev-count">{reviewedCount} reviewed</span>
		{#if data.reviewWarning}
			<span class="rev-warn" title="Set STUDIO_DATABASE_URL to a persistent volume so review progress survives restarts.">
				⚠ {data.reviewWarning}
			</span>
		{/if}
	</div>

	<div class="map-wrap">
		<div class="map" bind:this={mapContainer}></div>
		<div class="legend">
			<span class="swatch osm"></span> OpenStreetMap
			<span class="swatch in-commons"></span> In the Commons
			<span class="swatch claimed"></span> Claimed
		</div>
		{#if zoomLow}
			<div class="map-hint">Zoom in to see nearby businesses</div>
		{:else if osmLoading}
			<div class="map-hint">Loading businesses…</div>
		{/if}

		{#if (selected || editing) && draft}
			{@const isEdit = !!editing}
			{@const addr = osmRef ? fmtAddr(osmRef.address) : ''}
			{@const gq = encodeURIComponent(`${subjName} ${addr}`.trim())}
			<aside class="panel" transition:fly={{ x: 360, duration: 200 }}>
				<div class="panel-head">
					<div class="panel-title">
						<div class="panel-name">{subjName}</div>
						{#if isEdit}
							<div class="panel-cat">
								in the Commons{#if editing?.verified} · claimed{/if}
								{#if editing?.reviewed}<span class="rev-badge">✓ reviewed</span>{/if}
							</div>
						{:else}
							<div class="panel-cat">{selected?.category ?? 'business'} · OpenStreetMap</div>
						{/if}
					</div>
					<button class="panel-close" onclick={closePanel} aria-label="Close">×</button>
				</div>

				{#if editLoading}<div class="panel-loading">Loading venue…</div>{/if}

				{#if !editLoading}
				{#if osmRef}
					{@const s = osmRef}
					<div class="ref">
						<div class="ref-title">{isEdit ? 'Nearest OSM match' : 'Reference (OpenStreetMap)'}</div>
						{#if isEdit}<div class="ref-sub">{s.name}</div>{/if}
						{#if addr}
							<div class="ref-row"><span class="ref-val">{addr}</span><button class="copy" onclick={() => copy(addr)}>copy</button></div>
						{/if}
						{#if s.website}
							{@const web = s.website}
							<div class="ref-row"><a class="ref-val" href={web} target="_blank" rel="noopener noreferrer">{web}</a><button class="copy" onclick={() => copy(web)}>copy</button><button class="use" onclick={() => useGoogle('website', web)}>use</button></div>
						{/if}
						{#if s.phone}
							{@const tel = s.phone}
							<div class="ref-row"><span class="ref-val">{tel}</span><button class="copy" onclick={() => copy(tel)}>copy</button><button class="use" onclick={() => useGoogle('phone', tel)}>use</button></div>
						{/if}
						{#each s.sameAs ?? [] as so}
							<div class="ref-row"><a class="ref-val" href={so} target="_blank" rel="noopener noreferrer">{so}</a><button class="copy" onclick={() => copy(so)}>copy</button></div>
						{/each}
						{#if !isEdit}
							<a class="gsearch" href={`https://www.google.com/search?q=${gq}`} target="_blank" rel="noopener noreferrer">Search Google ↗</a>
						{/if}
					</div>
				{:else if isEdit}
					<div class="gcompare">
						{#if !osmRefTried}
							<button class="compare-btn" onclick={loadOsmMatch} disabled={osmRefLoading}>
								{osmRefLoading ? 'Checking OSM…' : 'Compare with OSM'}
							</button>
						{:else}
							<div class="gnone">No OSM match nearby.</div>
						{/if}
					</div>
				{/if}

				{#if data.googleReady}
					<div class="gcompare">
						{#if !googleTried}
							<button class="compare-btn" onclick={loadGoogle} disabled={googleLoading}>
								{googleLoading ? 'Checking Google…' : isEdit ? 'Refresh from Google' : 'Compare with Google'}
							</button>
						{:else if google}
							{@const g = google}
							<div class="ref google">
								<div class="ref-title">Google <span class="ref-note">reference only · not stored</span></div>
								{#if g.name}
									<div class="ref-row"><span class="ref-val">{g.name}</span><button class="use" onclick={() => useGoogle('name', g.name)}>use</button></div>
								{/if}
								{#if g.address}
									<div class="ref-row"><span class="ref-val">{g.address}</span><button class="copy" onclick={() => copy(g.address ?? '')}>copy</button></div>
								{/if}
								{#if g.website}
									{@const gw = g.website}
									<div class="ref-row"><a class="ref-val" href={gw} target="_blank" rel="noopener noreferrer">{gw}</a><button class="use" onclick={() => useGoogle('website', gw)}>use</button></div>
								{/if}
								{#if g.phone}
									{@const gp = g.phone}
									<div class="ref-row"><span class="ref-val">{gp}</span><button class="use" onclick={() => useGoogle('phone', gp)}>use</button></div>
								{/if}
								{#if g.hoursText.length}
									<div class="ghours">
										<div class="ghours-head">
											<span>Hours</span>
											{#if g.hoursPeriods.length}<button class="use" onclick={fillHoursFromGoogle}>use</button>{/if}
										</div>
										{#each g.hoursText as line}<div class="ghours-line">{line}</div>{/each}
									</div>
								{/if}
								{#if g.googleMapsUri}
									{@const gm = g.googleMapsUri}
									<a class="gsearch" href={gm} target="_blank" rel="noopener noreferrer">Open in Google Maps ↗</a>
								{/if}
							</div>
						{:else}
							<div class="gnone">No Google match. <a class="gsearch" href={`https://www.google.com/search?q=${gq}`} target="_blank" rel="noopener noreferrer">Search ↗</a></div>
						{/if}
					</div>
				{/if}

				<div class="form">
					<div class="form-title">{isEdit ? 'Edit venue' : 'Curate & add'}</div>
					<label class="f"><span>Name</span><input type="text" bind:value={draft.name} /></label>
					<label class="f"><span>Website</span><input type="text" bind:value={draft.website} /></label>
					<label class="f"><span>Phone</span><input type="text" bind:value={draft.phone} /></label>
					{#if isEdit}
						<label class="f"><span>Description</span><textarea rows="2" bind:value={draft.description}></textarea></label>
					{/if}
					<label class="f"><span>Social links <em>(comma-separated)</em></span><input type="text" bind:value={draft.sameAs} /></label>
					<label class="f"><span>Tags <em>(comma-separated)</em></span><input type="text" bind:value={draft.tags} /></label>
				</div>

				<div class="hours">
					<div class="hours-head">
						<span class="form-title">Hours</span>
						<div class="hours-fill">
							{#if osmRef?.openingHoursRaw}<button class="mini" onclick={fillHoursFromOsm}>from OSM</button>{/if}
							{#if google?.hoursPeriods.length}<button class="mini" onclick={fillHoursFromGoogle}>from Google</button>{/if}
							<button class="mini" onclick={() => (hoursOpen = !hoursOpen)}>{hoursOpen ? 'hide' : 'edit'}</button>
						</div>
					</div>
					{#if hoursOpen}
						<div class="hours-grid">
							{#each week as day, i}
								<div class="hrow" class:off={day.closed}>
									<span class="hday">{DAYS[i].slice(0, 3)}</span>
									{#if day.closed}
										<span class="hclosed-label">closed</span>
									{:else}
										<input class="htime" type="text" inputmode="numeric" bind:value={week[i].open} placeholder="09:00" />
										<span class="hdash">–</span>
										<input class="htime" type="text" inputmode="numeric" bind:value={week[i].close} placeholder="17:00" />
										{#if isOvernight(day)}<span class="overnight" title="Closes after midnight (next day)">+1d</span>{/if}
									{/if}
									<label class="hcheck" title="Closed this day"><input type="checkbox" bind:checked={week[i].closed} /></label>
								</div>
							{/each}
							<div class="hours-quick">
								<button class="mini" onclick={spreadWeekdays}>Mon → weekdays</button>
								<button class="mini" onclick={spreadAll}>Mon → all</button>
							</div>
						</div>
					{:else if hasAnyHours(week)}
						<div class="hours-summary">{hoursSetCount(week)} day{hoursSetCount(week) === 1 ? '' : 's'} set</div>
					{/if}
				</div>

				<div class="ids">
					<div class="form-title">Place</div>
					{#if isEdit}
						{@const pa = fmtAddr(editMeta?.address)}
						{#if pa}
							<div class="addr">{pa}</div>
						{:else if editMeta}
							<div class="id-none">No address on this place.</div>
						{/if}
						<div class="id-row"><span class="id-k">place</span><code class="id-v">{editMeta?.placeId ?? '—'}</code>{#if editMeta?.placeId}<button class="copy" onclick={() => copy(editMeta?.placeId ?? '')}>copy</button>{/if}</div>
						<div class="id-row"><span class="id-k">org</span><code class="id-v">{editing?.id}</code><button class="copy" onclick={() => copy(editing?.id ?? '')}>copy</button></div>
						{#each editMeta?.identifiers ?? [] as id}
							<div class="id-row"><span class="id-k">{id.propertyID}</span><code class="id-v">{id.value}</code><button class="copy" onclick={() => copy(id.value)}>copy</button></div>
						{/each}
						{#if editMeta && !editMeta.identifiers.length}
							<div class="id-row"><span class="id-k">external id</span><span class="id-missing">none</span></div>
						{/if}
						{#if google?.placeId}
							<div class="id-row"><span class="id-k">google now</span><code class="id-v">{google.placeId}</code></div>
						{/if}
						<div class="id-note">Address &amp; identity live on the <strong>Place</strong> — read-only here (the Commons has no place update yet). Name, contact, socials &amp; hours above are the editable <strong>Organization</strong>.</div>
					{:else if selected}
						{@const pa = fmtAddr(selected.address)}
						{#if pa}<div class="addr">{pa}</div>{/if}
						<div class="id-row"><span class="id-k">osm</span><code class="id-v">{selected.osmType}/{selected.osmId}</code></div>
						{#if google?.placeId}
							<div class="id-row"><span class="id-k">googlePlaceId</span><code class="id-v">{google.placeId}</code></div>
						{/if}
						<div class="id-note">This address + external ID are committed to the new <strong>Place</strong> on add (Google place_id if found, else the OSM ref).</div>
					{/if}
				</div>

				{#if isEdit}
					<div class="panel-actions">
						<button class="primary" onclick={saveEdit} disabled={savingEdit}>
							{savingEdit ? 'Saving…' : editDirty ? 'Save & mark reviewed' : 'Mark reviewed'}
						</button>
					</div>
					{#if editing?.reviewed}
						<button class="linklike" onclick={unreview}>Un-mark reviewed</button>
					{/if}
					<p class="panel-note">Saves edits to the Commons and records this venue as reviewed (Studio-local). Google data is reference only — never stored.</p>
				{:else}
					<div class="panel-actions">
						<button class="primary" onclick={addSelected} disabled={adding}>{adding ? 'Adding…' : 'Add to Commons'}</button>
					</div>
					<p class="panel-note">Adds as <strong>proxied</strong> — relayed from OSM. Google data is shown for reference only and is never stored.</p>
				{/if}
				{/if}
			</aside>
		{/if}
	</div>
	<p class="hint">
		Gray = OpenStreetMap (click to add) · yellow = in the Commons (click to review &amp; edit) ·
		blue = claimed. Filter by <strong>needs review / reviewed</strong> above to work through the slate.
	</p>
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
	.empty {
		padding: 3rem 1rem;
		text-align: center;
		color: #888;
	}
	.hint {
		font-size: 0.85rem;
		color: #999;
		margin-top: 0.75rem;
		max-width: 820px;
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
		max-width: 900px;
		padding: 0.85rem 1.1rem;
		margin-bottom: 0.75rem;
		background: #fef2f2;
		border: 1px solid #fecaca;
		border-radius: 8px;
		color: #991b1b;
		font-size: 0.9rem;
	}
	.map-controls {
		display: flex;
		align-items: center;
		gap: 0.85rem;
		margin-bottom: 0.6rem;
		flex-wrap: wrap;
	}
	.seg {
		display: inline-flex;
		border: 1px solid #d8d8d8;
		border-radius: 6px;
		overflow: hidden;
	}
	.seg button {
		font-family: inherit;
		font-size: 0.8rem;
		color: #555;
		background: #fff;
		border: none;
		border-left: 1px solid #e5e5e5;
		padding: 0.35rem 0.8rem;
		cursor: pointer;
	}
	.seg button:first-child {
		border-left: none;
	}
	.seg button.active {
		background: #166534;
		color: #fff;
	}
	.rev-count {
		font-size: 0.8rem;
		color: #16a34a;
		font-weight: 500;
	}
	.rev-warn {
		font-size: 0.76rem;
		color: #b45309;
		background: #fffbeb;
		border: 1px solid #fde68a;
		border-radius: 5px;
		padding: 0.15rem 0.5rem;
	}
	.map-wrap {
		position: relative;
	}
	.map {
		width: 100%;
		height: 72vh;
		border: 1px solid #e5e5e5;
		border-radius: 8px;
		overflow: hidden;
	}
	.legend {
		position: absolute;
		left: 0.75rem;
		bottom: 0.75rem;
		z-index: 1;
		display: flex;
		align-items: center;
		gap: 0.35rem;
		background: rgba(255, 255, 255, 0.92);
		border: 1px solid #e5e5e5;
		border-radius: 6px;
		padding: 0.4rem 0.7rem;
		font-size: 0.76rem;
		color: #555;
	}
	.swatch {
		display: inline-block;
		width: 0.65rem;
		height: 0.65rem;
		border-radius: 50%;
		border: 1px solid #fff;
	}
	.swatch.osm {
		background: #9ca3af;
	}
	.swatch.in-commons {
		background: #eab308;
		margin-left: 0.55rem;
	}
	.swatch.claimed {
		background: #2563eb;
		margin-left: 0.55rem;
	}
	.map-hint {
		position: absolute;
		top: 0.75rem;
		left: 50%;
		transform: translateX(-50%);
		z-index: 1;
		background: rgba(255, 255, 255, 0.94);
		border: 1px solid #e5e5e5;
		border-radius: 999px;
		padding: 0.3rem 0.85rem;
		font-size: 0.78rem;
		color: #555;
	}
	.panel {
		position: absolute;
		top: 0;
		right: 0;
		height: 100%;
		width: 340px;
		max-width: 85%;
		z-index: 2;
		background: #fff;
		border-left: 1px solid #e5e5e5;
		border-radius: 0 8px 8px 0;
		box-shadow: -8px 0 24px rgba(0, 0, 0, 0.08);
		overflow-y: auto;
		padding: 1rem 1.1rem 1.25rem;
	}
	.panel-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.5rem;
		margin-bottom: 0.85rem;
	}
	.panel-name {
		font-size: 1.05rem;
		font-weight: 600;
		color: #222;
		line-height: 1.25;
	}
	.panel-cat {
		font-size: 0.75rem;
		color: #888;
		margin-top: 0.15rem;
	}
	.rev-badge {
		color: #16a34a;
		font-weight: 600;
		margin-left: 0.3rem;
	}
	.panel-close {
		flex-shrink: 0;
		background: none;
		border: none;
		font-size: 1.4rem;
		line-height: 1;
		color: #999;
		cursor: pointer;
		padding: 0 0.2rem;
	}
	.panel-close:hover {
		color: #333;
	}
	.panel-loading {
		font-size: 0.82rem;
		color: #999;
		padding: 0.3rem 0 0.8rem;
	}
	.ref {
		background: #fafafa;
		border: 1px solid #eee;
		border-radius: 6px;
		padding: 0.6rem 0.75rem;
		margin-bottom: 0.9rem;
	}
	.ref-title,
	.form-title {
		font-size: 0.66rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #999;
		margin-bottom: 0.4rem;
	}
	.ref-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.82rem;
		color: #444;
		padding: 0.15rem 0;
	}
	.ref-val {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: #166534;
	}
	span.ref-val {
		color: #444;
	}
	.copy {
		flex-shrink: 0;
		font-family: inherit;
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: #666;
		background: #fff;
		border: 1px solid #d8d8d8;
		border-radius: 4px;
		padding: 0.1rem 0.4rem;
		cursor: pointer;
	}
	.copy:hover {
		border-color: #166534;
		color: #166534;
	}
	.gsearch {
		display: inline-block;
		margin-top: 0.4rem;
		font-size: 0.78rem;
		color: #166534;
	}
	.form {
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
		margin-bottom: 0.9rem;
	}
	.f {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.78rem;
		color: #555;
	}
	.f span {
		font-weight: 500;
	}
	.f em {
		font-style: normal;
		font-weight: 400;
		color: #aaa;
	}
	.f input,
	.f textarea {
		font-family: inherit;
		font-size: 0.88rem;
		color: #222;
		padding: 0.4rem 0.55rem;
		border: 1px solid #d0d0d0;
		border-radius: 5px;
		outline: none;
	}
	.f textarea {
		resize: vertical;
		line-height: 1.4;
	}
	.f input:focus,
	.f textarea:focus {
		border-color: #166534;
		box-shadow: 0 0 0 2px rgba(22, 101, 52, 0.12);
	}
	.panel-actions {
		display: flex;
	}
	.primary {
		flex: 1;
		background: #166534;
		border: 1px solid #166534;
		color: #fff;
		font-family: inherit;
		font-size: 0.9rem;
		padding: 0.5rem 1rem;
		border-radius: 5px;
		cursor: pointer;
	}
	.primary:hover:not(:disabled) {
		background: #14532d;
	}
	.primary:disabled {
		opacity: 0.6;
		cursor: default;
	}
	.linklike {
		background: none;
		border: none;
		font-family: inherit;
		font-size: 0.76rem;
		color: #999;
		cursor: pointer;
		padding: 0.5rem 0 0;
		text-decoration: underline;
	}
	.linklike:hover {
		color: #b91c1c;
	}
	.panel-note {
		font-size: 0.72rem;
		color: #999;
		margin: 0.6rem 0 0;
		line-height: 1.4;
	}
	.gcompare {
		margin-bottom: 0.9rem;
	}
	.compare-btn {
		width: 100%;
		font-family: inherit;
		font-size: 0.82rem;
		color: #444;
		background: #fff;
		border: 1px solid #d8d8d8;
		border-radius: 6px;
		padding: 0.45rem 0.75rem;
		cursor: pointer;
	}
	.compare-btn:hover:not(:disabled) {
		border-color: #4285f4;
		color: #1a73e8;
	}
	.compare-btn:disabled {
		opacity: 0.6;
		cursor: default;
	}
	.ref.google {
		background: #f6f9ff;
		border-color: #dbe6fb;
		margin-bottom: 0;
	}
	.ref-note {
		font-weight: 400;
		text-transform: none;
		letter-spacing: 0;
		color: #aab;
		font-size: 0.9em;
	}
	.use {
		flex-shrink: 0;
		font-family: inherit;
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: #1a73e8;
		background: #fff;
		border: 1px solid #c7d8f7;
		border-radius: 4px;
		padding: 0.1rem 0.45rem;
		cursor: pointer;
	}
	.use:hover {
		background: #1a73e8;
		color: #fff;
	}
	.ghours {
		margin-top: 0.35rem;
		padding-top: 0.35rem;
		border-top: 1px solid #e6eefb;
	}
	.ghours-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		margin-bottom: 0.2rem;
		font-size: 0.7rem;
		font-weight: 500;
		color: #889;
	}
	.ghours-line {
		font-size: 0.74rem;
		color: #667;
		line-height: 1.5;
	}
	.gnone {
		font-size: 0.8rem;
		color: #999;
		padding: 0.3rem 0;
	}
	.hours {
		margin-bottom: 0.9rem;
	}
	.hours-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		margin-bottom: 0.4rem;
	}
	.hours-fill {
		display: flex;
		gap: 0.3rem;
		flex-wrap: wrap;
	}
	.mini {
		font-family: inherit;
		font-size: 0.7rem;
		color: #555;
		background: #f3f3f3;
		border: 1px solid #e0e0e0;
		border-radius: 4px;
		padding: 0.15rem 0.45rem;
		cursor: pointer;
		white-space: nowrap;
	}
	.mini:hover {
		border-color: #166534;
		color: #166534;
	}
	.hours-grid {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.hrow {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.8rem;
	}
	.hrow.off {
		opacity: 0.7;
	}
	.hday {
		width: 2.2rem;
		flex-shrink: 0;
		color: #666;
		font-weight: 500;
	}
	.hclosed-label {
		flex: 1;
		color: #aaa;
		font-style: italic;
	}
	.htime {
		width: 4rem;
		font-family: inherit;
		font-size: 0.82rem;
		text-align: center;
		padding: 0.2rem 0.3rem;
		border: 1px solid #d0d0d0;
		border-radius: 4px;
	}
	.htime:focus {
		outline: none;
		border-color: #166534;
	}
	.hdash {
		color: #bbb;
	}
	.overnight {
		flex-shrink: 0;
		font-size: 0.62rem;
		font-weight: 600;
		color: #b45309;
		background: #fff7ed;
		border: 1px solid #fed7aa;
		border-radius: 3px;
		padding: 0 0.25rem;
	}
	.hcheck {
		margin-left: auto;
		display: flex;
		align-items: center;
		cursor: pointer;
	}
	.hours-quick {
		display: flex;
		gap: 0.35rem;
		margin-top: 0.35rem;
	}
	.hours-summary {
		font-size: 0.76rem;
		color: #888;
	}
	.ref-sub {
		font-size: 0.85rem;
		font-weight: 600;
		color: #333;
		margin: -0.15rem 0 0.35rem;
	}
	.ids {
		margin-bottom: 0.9rem;
	}
	.id-row {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.12rem 0;
		font-size: 0.75rem;
	}
	.id-k {
		flex-shrink: 0;
		width: 6rem;
		color: #999;
	}
	.id-v {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.72rem;
		color: #444;
		background: #f6f6f6;
		padding: 0.1rem 0.3rem;
		border-radius: 3px;
	}
	.id-none {
		font-size: 0.74rem;
		color: #b45309;
		line-height: 1.4;
		padding: 0.2rem 0;
	}
	.id-note {
		font-size: 0.72rem;
		color: #aaa;
		line-height: 1.4;
		margin-top: 0.25rem;
	}
	.addr {
		font-size: 0.84rem;
		color: #222;
		font-weight: 500;
		margin-bottom: 0.4rem;
		line-height: 1.4;
	}
	.id-missing {
		font-size: 0.72rem;
		color: #b45309;
		font-style: italic;
	}
	code {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.85em;
		background: #f3f3f3;
		padding: 0.1rem 0.35rem;
		border-radius: 3px;
	}
</style>
