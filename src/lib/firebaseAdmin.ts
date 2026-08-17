// Lazy-loaded firebase-admin: we dynamically import it inside the functions
// so build-time tracing tools (Vercel nft / Netlify plugin) don't try to
// symlink-bundle the heavy firebase-admin package. This keeps local builds
// working on environments where symlink creation is restricted (some Windows
// setups) while still function correctly at runtime on the server.

type AdminApp = Awaited<ReturnType<typeof import("firebase-admin/app").initializeApp>>;
type AdminFirestore = Awaited<ReturnType<typeof import("firebase-admin/firestore").getFirestore>>;

let firebaseApp: AdminApp | null = null;
let firestore: AdminFirestore | null = null;

async function getFirebaseAdmin(): Promise<AdminApp> {
  if (firebaseApp) return firebaseApp;

  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountKey) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY not set");
  }

  let serviceAccount: import("firebase-admin/app").ServiceAccount;
  try {
    serviceAccount = JSON.parse(serviceAccountKey) as import("firebase-admin/app").ServiceAccount;
  } catch {
    throw new Error("Invalid FIREBASE_SERVICE_ACCOUNT_KEY format");
  }

  const { initializeApp, cert } = await import("firebase-admin/app");
  firebaseApp = initializeApp({
    credential: cert(serviceAccount),
    projectId: "mule-detection-model",
  });

  return firebaseApp;
}

export async function getFirestoreAdmin(): Promise<AdminFirestore> {
  if (firestore) return firestore;
  const app = await getFirebaseAdmin();
  const { getFirestore } = await import("firebase-admin/firestore");
  firestore = getFirestore(app);
  return firestore;
}

export async function getFieldValue(): Promise<typeof import("firebase-admin/firestore").FieldValue> {
  const { FieldValue } = await import("firebase-admin/firestore");
  return FieldValue;
}
