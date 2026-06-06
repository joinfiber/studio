<script lang="ts">
	import type { PageData } from './$types';
	import CapabilityGuide from '$lib/kernel/chrome/CapabilityGuide.svelte';

	let { data }: { data: PageData } = $props();

	function formatRelative(iso: string): string {
		const ms = Date.now() - new Date(iso).getTime();
		const m = Math.floor(ms / 60000);
		if (m < 1) return 'just now';
		if (m < 60) return `${m}m ago`;
		const h = Math.floor(m / 60);
		if (h < 24) return `${h}h ago`;
		const d = Math.floor(h / 24);
		return `${d}d ago`;
	}
</script>

<header class="page-head">
	<h2>Settings</h2>
</header>

<section class="card">
	<h3>Instance</h3>
	<div class="row">
		<span class="label">Mode</span>
		<span class="value">
			{#if data.isAdmin}
				<span class="badge admin">Operator (admin key)</span>
			{:else}
				<span class="badge standard">Standard (service key)</span>
			{/if}
		</span>
	</div>
	<div class="row">
		<span class="label">Commons URL</span>
		<span class="value mono">{data.commonsBaseUrl}</span>
	</div>
	<div class="row">
		<span class="label">Commons key</span>
		<span class="value">
			{#if data.commonsConfigured}
				<span class="ok">configured</span>
			{:else}
				<span class="warn">not configured — fixture-only mode</span>
			{/if}
		</span>
	</div>
	<div class="row">
		<span class="label">Contributor slug</span>
		<span class="value">
			{#if data.contributorSlug}
				<span class="mono">{data.contributorSlug}</span>
			{:else}
				<span class="muted">not set</span>
			{/if}
		</span>
	</div>
</section>

<section class="card">
	<div class="card-head">
		<h3>Capabilities</h3>
		<span class="count">
			{data.capabilities.filter((c) => c.ready).length} / {data.capabilities.length} ready
		</span>
	</div>
	<p class="cap-intro">
		What's unlocked on this instance, and what each one needs. Studio reads only whether your env
		vars are <em>present</em> — never their values, and it ships none of its own.
	</p>
	<div class="cap-list">
		{#each data.capabilities as capability}
			<CapabilityGuide {capability} />
		{/each}
	</div>
</section>

<section class="card">
	<h3>Contributor profile</h3>
	{#if data.profile}
		<div class="profile">
			{#if data.profile.logo_url}
				<img class="logo" src={data.profile.logo_url} alt="" />
			{/if}
			<div class="profile-main">
				<div class="pname">{data.profile.name}</div>
				{#if data.profile.tagline}
					<div class="ptagline">{data.profile.tagline}</div>
				{/if}
				{#if data.profile.description}
					<p class="pdesc">{data.profile.description}</p>
				{/if}
				<div class="pmeta">
					<span class="mono">{data.profile.slug}</span>
					{#if data.profile.app_url}
						<span class="dot">·</span>
						<a href={data.profile.app_url} target="_blank" rel="noopener noreferrer">
							{data.profile.app_url}
						</a>
					{/if}
				</div>
			</div>
		</div>
	{:else if data.profileError}
		<p class="placeholder error">
			Could not load the contributor profile: {data.profileError}
		</p>
	{:else if !data.commonsConfigured}
		<p class="placeholder">
			Configure <code>COMMONS_SERVICE_KEY</code> in <code>.env</code> to load your contributor profile.
		</p>
	{:else if !data.contributorSlug}
		<p class="placeholder">
			Set <code>COMMONS_CONTRIBUTOR_SLUG</code> in <code>.env</code> to identify this instance's
			contributor profile. The slug is the lowercase-with-hyphens identifier from the
			<a
				href="https://neighborhood-commons.org/developers/dashboard"
				target="_blank"
				rel="noopener noreferrer">Commons developer dashboard</a
			>.
		</p>
	{:else}
		<p class="placeholder">Loading…</p>
	{/if}
</section>

<section class="card">
	<div class="card-head">
		<h3>Downstream consumers</h3>
		<span class="count">{data.consumers.length} apps</span>
	</div>
	{#if data.consumers.length === 0}
		<p class="placeholder">
			No apps consume from this instance yet. As your contributor profile becomes known, consuming
			apps will appear here.
		</p>
	{:else}
		<ul class="consumers">
			{#each data.consumers as c}
				<li class="consumer">
					<div class="consumer-main">
						<div class="cname">{c.name}</div>
						{#if c.tagline}
							<div class="tagline">{c.tagline}</div>
						{/if}
					</div>
					<div class="consumer-meta">
						<div class="delivered">
							<span class="num">{c.events_delivered_30d}</span>
							<span class="dlabel">events / 30d</span>
						</div>
						<div class="last">last seen {formatRelative(c.last_active_at)}</div>
					</div>
				</li>
			{/each}
		</ul>
		<p class="footnote">
			Mock data. Live counts require a Commons endpoint exposing consuming apps per contributor —
			not yet built.
		</p>
	{/if}
</section>

<section class="card">
	<h3>About</h3>
	<p>
		Studio — an open-source GUI on top of the Neighborhood Commons. See the
		<a href="/guide">in-app guide</a> for architecture and extension docs.
	</p>
</section>

<style>
	.page-head {
		margin-bottom: 1rem;
	}
	.page-head h2 {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 600;
	}
	.card {
		background: #fff;
		border: 1px solid #e5e5e5;
		border-radius: 8px;
		padding: 1.25rem 1.5rem;
		margin-bottom: 1rem;
		max-width: 720px;
	}
	.card h3 {
		margin: 0 0 0.75rem;
		font-size: 0.95rem;
		font-weight: 600;
		color: #444;
	}
	.card-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		margin-bottom: 0.75rem;
	}
	.card-head h3 {
		margin: 0;
	}
	.count {
		font-size: 0.8rem;
		color: #888;
	}
	.row {
		display: flex;
		gap: 1rem;
		padding: 0.5rem 0;
		font-size: 0.9rem;
		align-items: baseline;
	}
	.label {
		min-width: 8rem;
		color: #666;
	}
	.value {
		color: #222;
	}
	.value.mono,
	.mono {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.85rem;
	}
	.badge {
		font-size: 0.75rem;
		padding: 0.15rem 0.5rem;
		border-radius: 4px;
	}
	.badge.admin {
		background: #fef3c7;
		color: #92400e;
	}
	.badge.standard {
		background: #e0e7ff;
		color: #3730a3;
	}
	.ok {
		color: var(--accent);
	}
	.warn,
	.muted {
		color: #92400e;
	}
	.muted {
		color: #888;
	}
	.placeholder {
		color: #666;
		font-size: 0.9rem;
		margin: 0;
		line-height: 1.5;
	}
	.cap-intro {
		font-size: 0.82rem;
		color: #777;
		margin: 0 0 1rem;
		line-height: 1.5;
	}
	.cap-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.placeholder.error {
		color: #991b1b;
	}
	.profile {
		display: flex;
		gap: 1rem;
		align-items: flex-start;
	}
	.logo {
		width: 64px;
		height: 64px;
		object-fit: cover;
		border-radius: 8px;
		background: #f0f0f0;
		flex-shrink: 0;
	}
	.profile-main {
		flex: 1;
		min-width: 0;
	}
	.pname {
		font-size: 1.1rem;
		font-weight: 600;
		color: #222;
	}
	.ptagline {
		font-size: 0.9rem;
		color: #555;
		margin-top: 0.15rem;
	}
	.pdesc {
		font-size: 0.875rem;
		color: #444;
		margin: 0.5rem 0 0.5rem;
		line-height: 1.5;
		white-space: pre-wrap;
	}
	.pmeta {
		font-size: 0.8rem;
		color: #888;
		margin-top: 0.4rem;
		display: flex;
		gap: 0.4rem;
		align-items: center;
		flex-wrap: wrap;
	}
	.dot {
		color: #bbb;
	}
	.consumers {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.consumer {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.6rem 0.85rem;
		background: #fafafa;
		border: 1px solid #ececec;
		border-radius: 6px;
	}
	.consumer-main {
		flex: 1;
		min-width: 0;
	}
	.cname {
		font-weight: 500;
		color: #222;
		font-size: 0.9rem;
	}
	.tagline {
		font-size: 0.8rem;
		color: #777;
		margin-top: 0.1rem;
	}
	.consumer-meta {
		display: flex;
		align-items: center;
		gap: 1.5rem;
		flex-shrink: 0;
	}
	.delivered {
		text-align: center;
	}
	.delivered .num {
		display: block;
		font-weight: 600;
		font-size: 1rem;
		color: #222;
	}
	.delivered .dlabel {
		font-size: 0.65rem;
		color: #888;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.last {
		font-size: 0.75rem;
		color: #888;
		min-width: 7rem;
		text-align: right;
	}
	.footnote {
		margin: 0.85rem 0 0;
		padding-top: 0.85rem;
		border-top: 1px dashed #ddd;
		font-size: 0.75rem;
		color: #888;
	}
	code {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.85em;
		background: #f3f3f3;
		padding: 0.1rem 0.35rem;
		border-radius: 3px;
	}
	a {
		color: var(--accent);
		text-decoration: underline;
	}
</style>
