/**
 * Test stub for SvelteKit's `$env/dynamic/private`.
 *
 * A mutable env map that tests import and set/clear, so capability and config
 * logic can be exercised deterministically. The module under test and the test
 * file share this one object (single module instance), so writes are visible to
 * both. Reset between tests with `clearEnv()`.
 */
export const env: Record<string, string | undefined> = {};

export function clearEnv(): void {
	for (const key of Object.keys(env)) delete env[key];
}
