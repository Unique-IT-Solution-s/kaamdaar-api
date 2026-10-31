import "dotenv/config";
import {
  getApps,
  initializeApp,
  applicationDefault,
} from "firebase-admin/app";

import { getAuth } from "firebase-admin/auth";


const firebaseApp = getApps().length
  ? getApps()[0]
  : initializeApp({
      credential: applicationDefault(),
    });

export const adminAuth = getAuth(firebaseApp);

// console.log(
//   "Backend Firebase project ID:",
//   firebaseApp.options.projectId || "Not explicitly configured"
// );
