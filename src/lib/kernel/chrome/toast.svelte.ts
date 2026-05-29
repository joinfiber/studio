/**
 * Toast state — shared across the app.
 *
 * Any component can push a notification via `toast.push(message, type)`.
 * The Toast component (mounted once at app root) renders the current items
 * and auto-dismisses after `ms` (default 3000ms).
 */

type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
	id: number;
	message: string;
	type: ToastType;
}

let items = $state<ToastItem[]>([]);
let nextId = 0;

export const toast = {
	get items() {
		return items;
	},

	push(message: string, type: ToastType = 'info', ms = 3000) {
		const id = nextId++;
		items.push({ id, message, type });
		setTimeout(() => {
			const idx = items.findIndex((t) => t.id === id);
			if (idx >= 0) items.splice(idx, 1);
		}, ms);
	},
};
