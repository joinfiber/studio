# Submissions

Moderate user-generated content from an app you operate. Studio reads the app's
pending queue, shows each item in the **Review → Submissions** tab, and posts
your approve/reject decision back. The app owns the data and performs any
downstream publish (e.g., to the Commons) on approval — Studio is the
moderation interface, so the submitter's identity never enters Studio.

This is a **baseline** capability: any deployment can wire its own app's queue.
It ships unconfigured and stays hidden behind a setup guide until you set
`SUBMISSIONS_API_URL` + `SUBMISSIONS_API_KEY`.

## Expected upstream contract

`client.ts` is a reference adapter. It expects the upstream app to expose:

- `GET {SUBMISSIONS_API_URL}/api/studio/community-events?status=under_review`
  → `{ data: CommunitySubmission[] }`
- `PATCH {SUBMISSIONS_API_URL}/api/studio/community-events/:id/status`
  with `{ status: 'published' | 'rejected', reason?: string }`

Both authenticate with the shared secret in the `X-Studio-Key` header
(`SUBMISSIONS_API_KEY`).

If your app's API differs, edit `client.ts` — the request shapes and the
`CommunitySubmission` type are the only app-specific parts. The review chrome
(`src/routes/+page.svelte`) consumes the generic shape.

## Why the app publishes, not Studio

A submission carries an end-user identity that belongs in your app, not in the
Commons. Keeping the publish on the app side means the contributor on the
Commons record is the app itself (via its own service key), and the submitter
never crosses into Studio. Studio only ever sees the moderation queue.
