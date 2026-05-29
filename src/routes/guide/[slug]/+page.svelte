<script lang="ts">
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<nav class="breadcrumb"><a href="/guide">← Guide</a></nav>

<!-- First-party docs rendered from the repo markdown; safe to inline. -->
<article class="doc">
	{@html data.html}
</article>

<style>
	.breadcrumb {
		margin-bottom: 1rem;
	}
	.breadcrumb a {
		color: #666;
		text-decoration: none;
		font-size: 0.85rem;
		transition: color 100ms ease;
	}
	.breadcrumb a:hover {
		color: #222;
	}
	.doc {
		max-width: 760px;
		color: #333;
		font-size: 0.92rem;
		line-height: 1.6;
	}
	.doc :global(h1) {
		font-size: 1.6rem;
		font-weight: 600;
		margin: 0 0 1rem;
		color: #1a1a1a;
	}
	.doc :global(h2) {
		font-size: 1.2rem;
		font-weight: 600;
		margin: 2rem 0 0.75rem;
		color: #1a1a1a;
		border-bottom: 1px solid #eee;
		padding-bottom: 0.3rem;
	}
	.doc :global(h3) {
		font-size: 1rem;
		font-weight: 600;
		margin: 1.5rem 0 0.5rem;
		color: #222;
	}
	.doc :global(p) {
		margin: 0 0 0.9rem;
	}
	.doc :global(ul),
	.doc :global(ol) {
		margin: 0 0 0.9rem;
		padding-left: 1.4rem;
	}
	.doc :global(li) {
		margin: 0.2rem 0;
	}
	.doc :global(a) {
		color: #166534;
	}
	.doc :global(code) {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.85em;
		background: #f3f3f3;
		padding: 0.1rem 0.35rem;
		border-radius: 3px;
	}
	.doc :global(pre) {
		background: #1f2430;
		color: #e6e6e6;
		padding: 0.9rem 1.1rem;
		border-radius: 8px;
		overflow-x: auto;
		margin: 0 0 1rem;
	}
	.doc :global(pre code) {
		background: none;
		padding: 0;
		color: inherit;
		font-size: 0.82rem;
		line-height: 1.5;
	}
	.doc :global(table) {
		border-collapse: collapse;
		width: 100%;
		margin: 0 0 1rem;
		font-size: 0.88rem;
	}
	.doc :global(th),
	.doc :global(td) {
		border: 1px solid #e5e5e5;
		padding: 0.4rem 0.6rem;
		text-align: left;
	}
	.doc :global(th) {
		background: #fafafa;
		font-weight: 600;
	}
	.doc :global(blockquote) {
		margin: 0 0 1rem;
		padding: 0.3rem 0 0.3rem 1rem;
		border-left: 3px solid #d0d0d0;
		color: #666;
	}
	.doc :global(hr) {
		border: none;
		border-top: 1px solid #e5e5e5;
		margin: 1.5rem 0;
	}
	.doc :global(strong) {
		font-weight: 600;
		color: #1a1a1a;
	}
</style>
