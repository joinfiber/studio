import type { PageServerLoad } from './$types';
import { capabilityReady } from '$lib/kernel/capabilities.js';

export const load: PageServerLoad = () => {
	return { llmReady: capabilityReady('llm') };
};
