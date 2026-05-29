# Operator modules

Admin-only features — anything that needs an **admin service key** from Commons (`api_keys.is_admin=true`), which bypasses per-key scoping and acts across the whole Commons. Standard service keys never hold this.

The folder is structurally separate from `tools/` so the open-source build seam is folder-level:

- **OSS distribution** can omit this folder entirely — clones get the baseline tools and nothing here.
- **Operator deployment** ships the folder and gates each route behind `isAdminInstance()` from `lib/kernel/auth` (a 404, not a 403, so non-admin instances can't detect the feature exists).

The baseline ships no operator modules — this is the reserved seam for genuinely admin-only tools. (Moderating your own app's user submissions is *not* one: it needs only a shared key to your app, so it ships as a baseline tool in [`../tools/submissions/`](../tools/submissions/README.md).)
