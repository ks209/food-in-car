// Minimal passthrough — no caching/offline behavior. Its only job is to
// exist: Chrome's PWA install-eligibility check (beforeinstallprompt) has
// historically required an active service worker with a fetch handler,
// separate from having a valid manifest.json.
self.addEventListener('fetch', () => {});
