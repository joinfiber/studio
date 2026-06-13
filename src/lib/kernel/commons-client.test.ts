import { describe, it, expect } from 'vitest';
import { timeoutMiddleware } from './commons-client.js';

describe('timeoutMiddleware', () => {
	it('attaches an abort signal that fires after the timeout', async () => {
		const req = timeoutMiddleware(10).onRequest({ request: new Request('https://example.com') });
		expect(req.signal.aborted).toBe(false);
		await new Promise((r) => setTimeout(r, 40));
		expect(req.signal.aborted).toBe(true);
	});

	it('does not abort before the timeout elapses', async () => {
		const req = timeoutMiddleware(10_000).onRequest({
			request: new Request('https://example.com'),
		});
		await new Promise((r) => setTimeout(r, 20));
		expect(req.signal.aborted).toBe(false);
	});

	it('still honours a caller-supplied abort signal (combined, not replaced)', () => {
		const ac = new AbortController();
		const req = timeoutMiddleware(10_000).onRequest({
			request: new Request('https://example.com', { signal: ac.signal }),
		});
		expect(req.signal.aborted).toBe(false);
		ac.abort();
		expect(req.signal.aborted).toBe(true);
	});

	it('preserves the request method and url', () => {
		const req = timeoutMiddleware(10_000).onRequest({
			request: new Request('https://example.com/x', { method: 'POST', body: '{}' }),
		});
		expect(req.method).toBe('POST');
		expect(req.url).toBe('https://example.com/x');
	});
});
