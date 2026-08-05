import express from 'express';

const configRouter = express.Router();

// Public, tiny — feature flags the frontend needs before any auth exists.
// Nothing sensitive belongs here (this is unauthenticated, world-readable).
configRouter.get('/', (req, res) => {
    res.json({
        // Testing the PWA "Add to Home Screen" flow before rolling it out to
        // every customer — flip on in backend/.env, no redeploy of the
        // frontend needed to toggle it back off.
        pwaInstallButtonEnabled: process.env.PWA_INSTALL_BUTTON_ENABLED === 'true',
    });
});

export default configRouter;
