<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';
	import { page } from '$app/state';
	import Toast from '$lib/kernel/chrome/Toast.svelte';
	import '../app.css';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	const nav = [
		{ href: '/', label: 'Review' },
		{ href: '/sources', label: 'Sources' },
		{ href: '/add', label: 'Add' },
		{ href: '/venues', label: 'Venues' },
		{ href: '/map', label: 'Map' },
		{ href: '/library', label: 'Library' },
	];

	function isActive(href: string): boolean {
		const path = page.url.pathname;
		return href === '/' ? path === '/' : path.startsWith(href);
	}

	// Chrome (nav, sign-out) only shows once authed. On the login page the
	// app is bare.
	const showChrome = $derived(data.authed && page.url.pathname !== '/login');
</script>

<div class="app">
	{#if showChrome}
		<header class="header">
			<h1>Studio</h1>
			<nav class="primary">
				{#each nav as item}
					<a href={item.href} class:active={isActive(item.href)}>{item.label}</a>
				{/each}
			</nav>
			<nav class="meta">
				<a href="/guide" class:active={isActive('/guide')}>Guide</a>
				<a href="/settings" class:active={isActive('/settings')}>Settings</a>
				{#if data.isAdmin}
					<span class="badge">operator</span>
				{/if}
				{#if data.gateEnabled}
					<form method="POST" action="/logout" class="signout">
						<button type="submit">Sign out</button>
					</form>
				{/if}
			</nav>
		</header>
	{/if}

	{#if showChrome && data.gateEnabled && !data.totpEnabled}
		<div class="mfa-banner">
			MFA isn't set up — this instance is password-only.
			<a href="/enroll">Set up MFA</a>
		</div>
	{/if}

	<main>
		{@render children()}
	</main>
</div>

<Toast />

<style>
	:global(body) {
		margin: 0;
		font-family:
			system-ui,
			-apple-system,
			sans-serif;
		color: #222;
		background: #fafafa;
	}
	.app {
		max-width: 1400px;
		margin: 0 auto;
		padding: 1rem 1.5rem;
	}
	.header {
		display: flex;
		align-items: baseline;
		gap: 2rem;
		border-bottom: 1px solid #ddd;
		padding-bottom: 1rem;
		margin-bottom: 1.5rem;
	}
	.header h1 {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 600;
	}
	.header nav {
		display: flex;
		align-items: center;
		gap: 1.25rem;
	}
	.header nav.primary {
		flex: 1;
	}
	.header nav a {
		color: #555;
		text-decoration: none;
		font-size: 0.95rem;
		transition: color 100ms ease;
	}
	.header nav a:hover {
		color: #222;
	}
	.header nav a.active {
		color: #222;
		font-weight: 600;
	}
	.badge {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		background: #f0f0f0;
		color: #666;
		padding: 0.15rem 0.5rem;
		border-radius: 999px;
	}
	.signout {
		margin: 0;
	}
	.signout button {
		background: transparent;
		border: none;
		font-family: inherit;
		font-size: 0.85rem;
		color: #888;
		cursor: pointer;
		padding: 0;
		transition: color 100ms ease;
	}
	.signout button:hover {
		color: #991b1b;
	}
	.mfa-banner {
		background: #fef3c7;
		color: #92400e;
		border: 1px solid #fde68a;
		border-radius: 6px;
		padding: 0.5rem 0.85rem;
		font-size: 0.85rem;
		margin-bottom: 1.25rem;
		display: flex;
		gap: 0.75rem;
		align-items: center;
	}
	.mfa-banner a {
		color: #92400e;
		font-weight: 600;
		text-decoration: underline;
	}
	/* Shared secondary button (e.g. "Save to queue" across the Sources flows). */
	:global(.ghost-btn) {
		font-family: inherit;
		font-size: 0.875rem;
		padding: 0.45rem 0.95rem;
		border-radius: 5px;
		cursor: pointer;
		border: 1px solid #d0d0d0;
		background: #fff;
		color: #444;
	}
	:global(.ghost-btn:hover:not(:disabled)) {
		border-color: var(--accent);
		color: var(--accent);
	}
	:global(.ghost-btn:disabled) {
		opacity: 0.6;
		cursor: default;
	}
</style>
