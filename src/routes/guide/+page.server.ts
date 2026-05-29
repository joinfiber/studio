import type { PageServerLoad } from './$types';
import { listGuides } from '$lib/kernel/guides.js';

export const load: PageServerLoad = () => ({ guides: listGuides() });
