// Copy this file to config.local.js for your own deployment.
// Do NOT put a Firebase service-account/private key here.
// These values are client-side Firebase configuration and are safe to expose
// when Firestore Security Rules are correctly configured.

export const CONFIG = {
  GOOGLE_SHEET_ID: "YOUR_GOOGLE_SHEET_ID",
  GOOGLE_SHEET_NAME: "Garba",

  // Required Firebase Web App config.
  FIREBASE: {
    apiKey: "YOUR_FIREBASE_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
  }
};
