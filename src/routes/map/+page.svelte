<script lang="ts">
	import { onMount } from 'svelte';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import type { Map as MlMap, MapOptions } from 'maplibre-gl';
	import type { PageData } from './$types';
	import CapabilityGuide from '$lib/kernel/chrome/CapabilityGuide.svelte';

	let { data }: { data: PageData } = $props();
	let mapContainer = $state<HTMLDivElement | null>(null);
	let mapError = $state('');

	const claimedCount = $derived(data.live ? data.points.filter((p) => p.verified).length : 0);

	onMount(() => {
		const styleUrl = data.styleUrl;
		const container = mapContainer;
		if (!data.live || !data.mapReady || !styleUrl || !container) return;

		let map: MlMap | undefined;
		let destroyed = false;

		(async () => {
			const maplibre = await import('maplibre-gl');
			if (destroyed) return;

			const pts = data.points;
			const features = pts.map((p) => ({
				type: 'Feature' as const,
				geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
				properties: { name: p.name, verified: p.verified, method: p.method },
			}));

			const opts: MapOptions = { container, style: styleUrl };
			if (pts.length > 0) {
				const lons = pts.map((p) => p.lng);
				const lats = pts.map((p) => p.lat);
				opts.bounds = [
					[Math.min(...lons), Math.min(...lats)],
					[Math.max(...lons), Math.max(...lats)],
				];
				opts.fitBoundsOptions = { padding: 48, maxZoom: 15 };
			} else {
				opts.center = [-75.16, 39.95]; // Philadelphia fallback
				opts.zoom = 11;
			}

			map = new maplibre.Map(opts);
			map.addControl(new maplibre.NavigationControl({ showCompass: false }), 'top-right');

			map.on('load', () => {
				if (!map) return;
				map.addSource('orgs', {
					type: 'geojson',
					data: { type: 'FeatureCollection', features },
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
						'circle-opacity': 0.9,
					},
				});

				map.on('click', 'org-dots', (e) => {
					const feat = e.features?.[0];
					if (!feat || !map) return;
					const name = String(feat.properties?.name ?? 'Venue');
					const claimed = feat.properties?.verified;
					new maplibre.Popup({ closeButton: false, offset: 8 })
						.setLngLat(e.lngLat)
						.setHTML(
							`<strong>${name}</strong><br><span style="color:#666;font-size:0.78rem">${claimed ? 'claimed (verified)' : 'in the Commons'}</span>`,
						)
						.addTo(map);
				});
				map.on('mouseenter', 'org-dots', () => {
					if (map) map.getCanvas().style.cursor = 'pointer';
				});
				map.on('mouseleave', 'org-dots', () => {
					if (map) map.getCanvas().style.cursor = '';
				});
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
				· showing first {data.points.length}{/if}
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
			<span class="swatch in-commons"></span> In the Commons
			<span class="swatch claimed"></span> Claimed
		</div>
	</div>
	{#if data.points.length === 0 && !data.error}
		<p class="hint">No venues with a location yet — add venues (with a place) and they'll appear here.</p>
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
	.empty {
		padding: 3rem 1rem;
		text-align: center;
		color: #888;
	}
	.hint {
		font-size: 0.85rem;
		color: #aaa;
		margin-top: 0.75rem;
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
		gap: 0.4rem;
		background: rgba(255, 255, 255, 0.92);
		border: 1px solid #e5e5e5;
		border-radius: 6px;
		padding: 0.4rem 0.7rem;
		font-size: 0.78rem;
		color: #555;
	}
	.swatch {
		display: inline-block;
		width: 0.7rem;
		height: 0.7rem;
		border-radius: 50%;
		border: 1px solid #fff;
		margin-right: 0.1rem;
	}
	.swatch.in-commons {
		background: #eab308;
	}
	.swatch.claimed {
		background: #2563eb;
		margin-left: 0.6rem;
	}
	code {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.85em;
		background: #f3f3f3;
		padding: 0.1rem 0.35rem;
		border-radius: 3px;
	}
</style>
