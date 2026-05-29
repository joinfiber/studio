import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getGuide } from '$lib/kernel/guides.js';

export const load: PageServerLoad = ({ params }) => {
	const guide = getGuide(params.slug);
	if (!guide) throw error(404, 'Guide not found');
	return guide;
};
