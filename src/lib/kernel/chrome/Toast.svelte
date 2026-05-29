<!--
	Renders active toasts. Mount once at the app root. Components push via
	the `toast.push(...)` API from `./toast.svelte.ts`.

	Fly transition for enter + exit, brisk (150ms). The transitions are
	intentionally subtle — speed is the operator's primary need.
-->
<script lang="ts">
	import { fly } from 'svelte/transition';
	import { toast } from './toast.svelte.js';
</script>

<div class="toasts" role="status" aria-live="polite">
	{#each toast.items as item (item.id)}
		<div class="toast {item.type}" transition:fly={{ y: 8, duration: 150 }}>
			{item.message}
		</div>
	{/each}
</div>

<style>
	.toasts {
		position: fixed;
		bottom: 1.5rem;
		right: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		z-index: 100;
		pointer-events: none;
	}
	.toast {
		background: #222;
		color: #fff;
		padding: 0.6rem 1rem;
		border-radius: 6px;
		font-size: 0.875rem;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
		max-width: 360px;
		pointer-events: auto;
	}
	.toast.success { background: #166534; }
	.toast.error   { background: #991b1b; }
	.toast.info    { background: #1e3a8a; }
</style>
