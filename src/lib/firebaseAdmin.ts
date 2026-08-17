import { initializeApp, cert, App, ServiceAccount } from "firebase-admin/app";
import { getFirestore, Firestore, FieldValue } from "firebase-admin/firestore";

let firebaseApp: App | null = null;

export function getFirebaseAdmin(): App {
  if (firebaseApp) return firebaseApp;

  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountKey) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY not set");
  }

  let serviceAccount: ServiceAccount;
  try {
    serviceAccount = JSON.parse(serviceAccountKey) as ServiceAccount;
  } catch {
    throw new Error("Invalid FIREBASE_SERVICE_ACCOUNT_KEY format");
  }

  firebaseApp = initializeApp({
    credential: cert(serviceAccount),
    projectId: "mule-detection-model",
  });

  return firebaseApp;
}

export function getFirestoreAdmin(): Firestore {
  const app = getFirebaseAdmin();
  return getFirestore(app);
}

export { FieldValue };