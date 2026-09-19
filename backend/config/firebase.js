import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

// Verifying Firebase ID tokens only needs the project ID (Google's public keys
// are fetched automatically) — no service-account credentials required.
const projectId = process.env.FIREBASE_PROJECT_ID;

const app = projectId
  ? (getApps()[0] || initializeApp({ projectId }))
  : null;

export const firebaseAuth = app ? getAuth(app) : null;
