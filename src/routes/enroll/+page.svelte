<script lang="ts">
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	function autofocus(node: HTMLElement) {
		node.focus();
	}
</script>

<nav class="breadcrumb"><a href="/settings">← Settings</a></nav>

<header class="head">
	<h2>Multi-factor authentication</h2>
</header>

{#if form?.confirmed}
	<section class="card success">
		<h3>Code confirmed ✓</h3>
		<p>Your authenticator is working. To require MFA at login, set this in your environment and redeploy:</p>
		<pre class="secret-block">STUDIO_TOTP_SECRET={form.secret}</pre>
		<p class="note">
			Treat this like a password — it's the seed your authenticator uses. Until it's set and the
			service redeploys, MFA isn't enforced yet.
		</p>
		<a class="btn" href="/settings">Back to Settings</a>
	</section>
{:else if data.stage === 'pending'}
	<section class="card">
		<h3>Scan with your authenticator</h3>
		<div class="qr">{@html data.qrSvg}</div>
		<p class="sub">Or enter the secret manually:</p>
		<pre class="secret-block">{data.secret}</pre>
		<form method="POST" action="?/verify" class="verify">
			<label for="code">Enter the 6-digit code to confirm</label>
			<input
				id="code"
				type="text"
				name="code"
				inputmode="numeric"
				autocomplete="one-time-code"
				maxlength="6"
				placeholder="123456"
				use:autofocus
			/>
			{#if form?.error}
				<p class="error">{form.error}</p>
			{/if}
			<div class="actions">
				<button type="submit" class="primary">Confirm</button>
			</div>
		</form>
		<form method="POST" action="?/cancel" class="cancel">
			<button type="submit" class="link">Start over</button>
		</form>
	</section>
{:else}
	<section class="card">
		{#if data.alreadyEnabled}
			<p class="status active">MFA is active on this instance.</p>
			<p class="sub">Enrolling again generates a new secret (you'll need to update the env var).</p>
		{:else}
			<p class="status inactive">MFA is not set up yet — this instance is password-only.</p>
		{/if}
		<form method="POST" action="?/begin">
			<button type="submit" class="primary">{data.alreadyEnabled ? 'Re-enroll' : 'Set up MFA'}</button>
		</form>
	</section>
{/if}

<style>
	.breadcrumb {
		margin-bottom: 0.5rem;
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
	.head {
		margin-bottom: 1.25rem;
	}
	.head h2 {
		margin: 0;
		font-size: 1.5rem;
		font-weight: 600;
	}
	.card {
		background: #fff;
		border: 1px solid #e5e5e5;
		border-radius: 8px;
		padding: 1.5rem;
		max-width: 480px;
	}
	.card.success {
		border-color: #bbf7d0;
		background: #f0fdf4;
	}
	h3 {
		margin: 0 0 0.75rem;
		font-size: 1rem;
		font-weight: 600;
	}
	.sub {
		font-size: 0.85rem;
		color: #666;
		margin: 0.5rem 0;
	}
	.note {
		font-size: 0.8rem;
		color: #92400e;
		margin: 0.75rem 0;
		line-height: 1.5;
	}
	.qr {
		width: 200px;
		height: 200px;
		margin: 0.5rem 0 1rem;
	}
	.qr :global(svg) {
		width: 100%;
		height: 100%;
	}
	.secret-block {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.8rem;
		background: #f3f3f3;
		padding: 0.6rem 0.75rem;
		border-radius: 6px;
		overflow-x: auto;
		margin: 0.5rem 0;
		word-break: break-all;
		white-space: pre-wrap;
	}
	.verify {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		margin-top: 1rem;
	}
	.verify label {
		font-size: 0.8rem;
		font-weight: 500;
		color: #444;
	}
	.verify input {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 1.1rem;
		letter-spacing: 0.25em;
		text-align: center;
		padding: 0.5rem 0.75rem;
		border: 1px solid #d0d0d0;
		border-radius: 6px;
		outline: none;
		max-width: 200px;
	}
	.verify input:focus {
		border-color: #166534;
		box-shadow: 0 0 0 2px rgba(22, 101, 52, 0.15);
	}
	.error {
		color: #991b1b;
		font-size: 0.85rem;
		margin: 0;
	}
	.status {
		font-size: 0.95rem;
		margin: 0 0 0.5rem;
	}
	.status.active {
		color: #166534;
	}
	.status.inactive {
		color: #92400e;
	}
	.actions {
		margin-top: 0.5rem;
	}
	.primary,
	.btn {
		display: inline-block;
		background: #166534;
		border: 1px solid #166534;
		color: #fff;
		font-family: inherit;
		font-size: 0.9rem;
		padding: 0.5rem 1rem;
		border-radius: 6px;
		cursor: pointer;
		text-decoration: none;
		transition: background-color 100ms ease;
	}
	.primary:hover,
	.btn:hover {
		background: #14532d;
	}
	.cancel {
		margin-top: 0.75rem;
	}
	.link {
		background: none;
		border: none;
		color: #888;
		font-family: inherit;
		font-size: 0.8rem;
		cursor: pointer;
		padding: 0;
		text-decoration: underline;
	}
	.link:hover {
		color: #555;
	}
</style>
