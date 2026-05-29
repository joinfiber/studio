import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

/**
 * Unit tests for the pure data-transformation core (no live Commons, no
 * network). SvelteKit's `$lib` alias is mapped manually, and the
 * `$env/dynamic/private` virtual module is stubbed with a mutable env map
 * (src/lib/test/env-stub.ts) so capability/config logic is controllable.
 */
export default defineConfig({
	test: {
		globals: true,
		environment: 'node',
		include: ['src/**/*.test.ts'],
	},
	resolve: {
		alias: {
			'$env/dynamic/private': resolve(__dirname, 'src/lib/test/env-stub.ts'),
			$lib: resolve(__dirname, 'src/lib'),
		},
	},
});
