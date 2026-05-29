<!--
	Renders a capability's readiness + the steps to unlock it. Used in Settings
	(full list) and inline on tool surfaces that gate on a capability. Shows env
	var NAMES and how-to text, never values.
-->
<script lang="ts">
	import type { Capability } from '$lib/kernel/capabilities.js';

	let { capability }: { capability: Capability } = $props();
</script>

<div class="cap" class:ready={capability.ready}>
	<div class="cap-head">
		<span class="cap-label">{capability.label}</span>
		<span class="pill {capability.ready ? 'ok' : 'todo'}">
			{capability.ready ? 'Ready' : 'Needs setup'}
		</span>
	</div>
	<p class="unlocks">{capability.unlocks}</p>
	<ul class="prereqs">
		{#each capability.prereqs as p}
			<li class="prereq" class:met={p.met}>
				<span class="dot">{p.met ? '✓' : '○'}</span>
				<div class="prereq-body">
					<span class="line">
						<code>{p.env}</code>
						<span class="plabel">{p.label}{#if p.optional} · optional{/if}</span>
					</span>
					{#if !p.met}
						<div class="howto">{p.howto}</div>
					{/if}
				</div>
			</li>
		{/each}
	</ul>
</div>

<style>
	.cap {
		border: 1px solid #e5e5e5;
		border-radius: 8px;
		padding: 1rem 1.25rem;
		background: #fff;
	}
	.cap-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}
	.cap-label {
		font-weight: 600;
		font-size: 0.95rem;
	}
	.pill {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 0.15rem 0.5rem;
		border-radius: 999px;
	}
	.pill.ok {
		background: #dcfce7;
		color: #166534;
	}
	.pill.todo {
		background: #fef3c7;
		color: #92400e;
	}
	.unlocks {
		margin: 0.4rem 0 0.75rem;
		font-size: 0.85rem;
		color: #666;
		line-height: 1.4;
	}
	.prereqs {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.prereq {
		display: flex;
		gap: 0.6rem;
		align-items: flex-start;
		font-size: 0.85rem;
	}
	.dot {
		color: #bbb;
		width: 1rem;
		flex-shrink: 0;
		text-align: center;
	}
	.prereq.met .dot {
		color: #166534;
	}
	.line {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.plabel {
		color: #555;
	}
	.howto {
		font-size: 0.8rem;
		color: #92400e;
		margin-top: 0.2rem;
		line-height: 1.45;
	}
	code {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.8rem;
		background: #f3f3f3;
		padding: 0.1rem 0.35rem;
		border-radius: 3px;
	}
</style>
