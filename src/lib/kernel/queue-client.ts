/**
 * Client helper for saving import candidates to the persistent review queue
 * (POST /api/queue). Browser-safe — no server imports. Throws on failure so
 * the caller can toast the message.
 */
export async function saveToQueue(candidates: unknown[], organizer: string): Promise<number> {
	const res = await fetch('/api/queue', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ candidates, organizer }),
	});
	if (!res.ok) {
		const j = (await res.json().catch(() => ({}))) as { error?: string };
		throw new Error(j.error ?? `Save failed (${res.status}).`);
	}
	const j = (await res.json()) as { saved?: number };
	return j.saved ?? 0;
}
