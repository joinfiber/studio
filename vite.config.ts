import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		// Dedicated port so V3 doesn't collide with the existing apps/studio/
		// (5173 default) or other SvelteKit apps in the monorepo (e.g., Merrie).
		// strictPort fails loudly instead of silently falling through to 5174 —
		// no confusion about which app you're looking at.
		port: 5273,
		strictPort: true,
	},
});
