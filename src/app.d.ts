// See https://kit.svelte.dev/docs/types#app

import type { CommonsClient } from '$lib/kernel/commons-client';

declare global {
	namespace App {
		interface Locals {
			commons: CommonsClient;
			isAdmin: boolean;
			authed: boolean;
		}
	}
}

export {};
