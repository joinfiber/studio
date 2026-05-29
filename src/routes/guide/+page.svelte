<script lang="ts">
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<header class="page-head">
	<h2>Guide</h2>
	<p class="sub">
		How Studio works and how to extend it. These pages render straight from the repo docs — edit
		the markdown and they update here too.
	</p>
</header>

<div class="guides">
	{#each data.guides as g}
		<a class="guide" href={`/guide/${g.slug}`}>
			<div class="guide-title">{g.title}</div>
			<p class="guide-desc">{g.description}</p>
		</a>
	{/each}
</div>

<style>
	.page-head {
		margin-bottom: 1.5rem;
	}
	.page-head h2 {
		margin: 0 0 0.4rem;
		font-size: 1.25rem;
		font-weight: 600;
	}
	.sub {
		margin: 0;
		font-size: 0.9rem;
		color: #666;
		max-width: 620px;
		line-height: 1.5;
	}
	.guides {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
		gap: 0.85rem;
		max-width: 900px;
	}
	.guide {
		display: block;
		background: #fff;
		border: 1px solid #e5e5e5;
		border-radius: 8px;
		padding: 1.1rem 1.25rem;
		text-decoration: none;
		color: inherit;
		transition: border-color 100ms ease, box-shadow 100ms ease, transform 100ms ease;
	}
	.guide:hover {
		border-color: #166534;
		box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
		transform: translateY(-1px);
	}
	.guide-title {
		font-size: 1rem;
		font-weight: 600;
		color: #222;
	}
	.guide-desc {
		margin: 0.4rem 0 0;
		font-size: 0.85rem;
		color: #666;
		line-height: 1.45;
	}
</style>
