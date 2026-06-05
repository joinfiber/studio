<script lang="ts">
	import { onMount } from 'svelte';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import type { Map as MlMap, MapOptions, GeoJSONSource, Popup } from 'maplibre-gl';
	import type { PageData } from './$types';
	import CapabilityGuide from '$lib/kernel/chrome/CapabilityGuide.svelte';
	import Toast from '$lib/kernel/chrome/Toast.svelte';
	import { toast } from '$lib/kernel/chrome/toast.svelte.js';

	type OsmVenue = {
		name: string;
		lat: number;
		lng: number;
		address?: Record<string, string | undefined>;
		website?: string;
		phone?: string;
		sameAs?: string[];
		category?: string;
		osmType: string;
		osmId: number;
	};
	type Feature = {
		type: 'Feature';
		geometry: { type: 'Point'; coordinates: [number, number] };
		properties: Record<string, unknown>;
	};

	let { data }: { data: PageData } = $props();
	let mapContainer = $state<HTMLDivElement | null>(null);
	let mapError = $state('');
	let osmLoading = $state(false);
	let zoomLow = $state(false);

	const MIN_OSM_ZOOM = 14;
	const claimedCount = $derived(data.live ? data.points.filter((p) => p.verified).length : 0);

	function orgFeature(p: { name: string; lat: number; lng: number; verified: boolean }): Feature {
		return {
			type: 'Feature',
			geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
			properties: { name: p.name, verified: p.verified },
		};
	}
	const roundKey = (lat: number, lng: number) => `${lat.toFixed(3)},${lng.toFixed(3)}`;

	onMount(() => {
		const styleUrl = data.styleUrl;
		const container = mapContainer;
		if (!data.live || !data.mapReady || !styleUrl || !container) return;

		let map: MlMap | undefined;
		let destroyed = false;

		(async () => {
			const maplibre = await import('maplibre-gl');
			if (destroyed) return;

			const orgFeatures: Feature[] = data.points.map(orgFeature);
			const orgKeys = new Set(data.points.map((p) => roundKey(p.lat, p.lng)));
			let osmFeatures: Feature[] = [];
			const osmById = new Map<string, OsmVenue>();

			const opts: MapOptions = { container, style: styleUrl };
			if (data.points.length > 0) {
				const lons = data.points.map((p) => p.lng);
				const lats = data.points.map((p) => p.lat);
				opts.bounds = [
					[Math.min(...lons), Math.min(...lats)],
					[Math.max(...lons), Math.max(...lats)],
				];
				opts.fitBoundsOptions = { padding: 48, maxZoom: 15 };
			} else {
				opts.center = [-75.16, 39.95]; // Philadelphia fallback
				opts.zoom = 14;
			}

			map = new maplibre.Map(opts);
			map.addControl(new maplibre.NavigationControl({ showCompass: false }), 'top-right');

			const setOsm = () =>
				(map?.getSource('osm') as GeoJSONSource | undefined)?.setData({
					type: 'FeatureCollection',
					features: osmFeatures,
				});
			const setOrgs = () =>
				(map?.getSource('orgs') as GeoJSONSource | undefined)?.setData({
					type: 'FeatureCollection',
					features: orgFeatures,
				});

			async function loadOsm() {
				if (!map) return;
				if (map.getZoom() < MIN_OSM_ZOOM) {
					zoomLow = true;
					osmFeatures = [];
					setOsm();
					return;
				}
				zoomLow = false;
				const b = map.getBounds();
				osmLoading = true;
				try {
					const res = await fetch(
						`/map/osm?s=${b.getSouth()}&w=${b.getWest()}&n=${b.getNorth()}&e=${b.getEast()}`,
					);
					const d = (await res.json()) as { venues?: OsmVenue[] };
					osmById.clear();
					osmFeatures = [];
					for (const v of d.venues ?? []) {
						if (orgKeys.has(roundKey(v.lat, v.lng))) continue; // dedup vs Commons venues
						const key = `${v.osmType}/${v.osmId}`;
						osmById.set(key, v);
						osmFeatures.push({
							type: 'Feature',
							geometry: { type: 'Point', coordinates: [v.lng, v.lat] },
							properties: { name: v.name, key, category: v.category ?? '' },
						});
					}
					setOsm();
				} catch {
					/* transient — ignore */
				} finally {
					osmLoading = false;
				}
			}

			async function addVenue(v: OsmVenue, popup: Popup) {
				const res = await fetch('/map/add', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ venue: v }),
				});
				const d = (await res.json().catch(() => ({}))) as { error?: string };
				if (!res.ok) {
					toast.push(String(d.error ?? 'Add failed.'), 'error', 6000);
					return;
				}
				const key = `${v.osmType}/${v.osmId}`;
				osmById.delete(key);
				osmFeatures = osmFeatures.filter((f) => f.properties.key !== key);
				orgFeatures.push(orgFeature({ name: v.name, lat: v.lat, lng: v.lng, verified: false }));
				orgKeys.add(roundKey(v.lat, v.lng));
				setOsm();
				setOrgs();
				toast.push(`Added “${v.name}”`, 'success');
				popup.remove();
			}

			map.on('load', () => {
				if (!map) return;
				map.addSource('osm', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
				map.addSource('orgs', {
					type: 'geojson',
					data: { type: 'FeatureCollection', features: orgFeatures },
				});
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

				map.on('click', 'org-dots', (e) => {
					const f = e.features?.[0];
					if (!f || !map) return;
					new maplibre.Popup({ closeButton: false, offset: 8 })
						.setLngLat(e.lngLat)
						.setHTML(
							`<strong>${String(f.properties?.name ?? 'Venue')}</strong><br><span style="color:#666;font-size:0.78rem">${f.properties?.verified ? 'claimed (verified)' : 'in the Commons'}</span>`,
						)
						.addTo(map);
				});

				map.on('click', 'osm-dots', (e) => {
					const f = e.features?.[0];
					if (!f || !map) return;
					const v = osmById.get(String(f.properties?.key));
					if (!v) return;
					const el = document.createElement('div');
					el.innerHTML = `<strong>${v.name}</strong><br><span style="color:#888;font-size:0.74rem">${v.category ?? 'business'} · OpenStreetMap</span><br>`;
					const btn = document.createElement('button');
					btn.textContent = 'Add to Commons';
					btn.className = 'map-add-btn';
					el.appendChild(btn);
					const popup = new maplibre.Popup({ closeButton: true, offset: 8 })
						.setLngLat(e.lngLat)
						.setDOMContent(el)
						.addTo(map);
					btn.addEventListener('click', () => {
						btn.disabled = true;
						btn.textContent = 'Adding…';
						addVenue(v, popup);
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
				loadOsm();
			});
		})().catch((e) => {
			mapError = e instanceof Error ? e.message : 'Map failed to load.';
		});

		return () => {
			destroyed = true;
			map?.remove();
		};
	});
</script>

<header class="page-head">
	<h2>Map</h2>
	{#if data.live && data.mapReady}
		<span class="total">
			{data.points.length} venue{data.points.length === 1 ? '' : 's'} · {claimedCount} claimed{#if data.truncated}
				· first {data.points.length}{/if}
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
	</div>
	<p class="hint">
		Gray dots are OpenStreetMap businesses in view — click one and <strong>Add to Commons</strong>
		to bring it in (it turns yellow). Yellow = in the Commons, blue = claimed.
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
		max-width: 800px;
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
	code {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.85em;
		background: #f3f3f3;
		padding: 0.1rem 0.35rem;
		border-radius: 3px;
	}
	/* Popup "Add" button is created imperatively (outside Svelte's scoping). */
	:global(.map-add-btn) {
		margin-top: 0.4rem;
		font-family: inherit;
		font-size: 0.8rem;
		padding: 0.3rem 0.7rem;
		border: 1px solid #166534;
		border-radius: 5px;
		background: #166534;
		color: #fff;
		cursor: pointer;
	}
	:global(.map-add-btn:disabled) {
		opacity: 0.6;
		cursor: default;
	}
</style>
