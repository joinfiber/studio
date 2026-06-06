<script lang="ts">
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();

	const step = $derived(form?.step ?? 'password');

	function autofocus(node: HTMLElement) {
		node.focus();
	}
</script>

<div class="gate">
	{#if step === 'totp'}
		<form method="POST" action="?/totp" class="card">
			<h1>Studio</h1>
			<p class="sub">Enter the 6-digit code from your authenticator.</p>
			<input
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
			<button type="submit" class="primary">Verify</button>
		</form>
	{:else}
		<form method="POST" action="?/password" class="card">
			<h1>Studio</h1>
			<p class="sub">Enter the access password.</p>
			<input
				type="password"
				name="password"
				placeholder="Password"
				autocomplete="current-password"
				use:autofocus
			/>
			{#if form?.error}
				<p class="error">{form.error}</p>
			{/if}
			<button type="submit" class="primary">Sign in</button>
		</form>
	{/if}
</div>

<style>
	.gate {
		min-height: 70vh;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.card {
		width: 100%;
		max-width: 320px;
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
		background: #fff;
		border: 1px solid #e5e5e5;
		border-radius: 10px;
		padding: 2rem;
	}
	h1 {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 600;
	}
	.sub {
		margin: 0;
		font-size: 0.875rem;
		color: #777;
	}
	input {
		font-family: inherit;
		font-size: 0.95rem;
		padding: 0.55rem 0.75rem;
		border: 1px solid #d0d0d0;
		border-radius: 6px;
		outline: none;
		transition:
			border-color 100ms ease,
			box-shadow 100ms ease;
	}
	input:focus {
		border-color: #166534;
		box-shadow: 0 0 0 2px rgba(22, 101, 52, 0.15);
	}
	input[name='code'] {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 1.25rem;
		letter-spacing: 0.3em;
		text-align: center;
	}
	.error {
		margin: 0;
		font-size: 0.85rem;
		color: #991b1b;
	}
	.primary {
		background: #166534;
		border: 1px solid #166534;
		color: #fff;
		font-family: inherit;
		font-size: 0.9rem;
		padding: 0.55rem 1rem;
		border-radius: 6px;
		cursor: pointer;
		transition: background-color 100ms ease;
	}
	.primary:hover {
		background: #14532d;
	}
</style>
