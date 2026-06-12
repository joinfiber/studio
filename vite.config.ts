import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		// A deliberately non-default port so Studio doesn't collide with other
		// SvelteKit apps you may have running (5173 default). strictPort fails
		// loudly instead of silently falling through to the next port — no
		// confusion about which app you're looking at.
		port: 5273,
		strictPort: true,
	},
});
