/*
============================================================
 FIREBASE CONFIGURATION
 
 SETUP INSTRUCTIONS:
 1. Go to https://console.firebase.google.com
 2. Click "Create a project" (or use existing)
 3. Name it (e.g., "marvel-jeopardy")
 4. Go to Project Settings (gear icon)
 5. Scroll to "Your apps" and click the web icon (</>)
 6. Register app and copy the config values below
 7. Go to "Realtime Database" in sidebar
 8. Click "Create Database"
 9. Choose "Start in test mode" for development
 10. Copy the database URL to databaseURL below
============================================================
*/

const firebaseConfig = {
    apiKey: "AIzaSyAJVnaswMY3Z8wizus42hVG8sjPd6t8gGU",
    authDomain: "marvel-jeopardy.firebaseapp.com",
    databaseURL: "https://marvel-jeopardy-default-rtdb.firebaseio.com",
    projectId: "marvel-jeopardy",
    storageBucket: "marvel-jeopardy.firebasestorage.app",
    messagingSenderId: "949870707970",
    appId: "1:949870707970:web:bfed4284047181d7706e1b"
};

// Check if Firebase is configured
function isFirebaseConfigured() {
    return firebaseConfig.apiKey && 
           firebaseConfig.apiKey.startsWith("AIza") && 
           firebaseConfig.databaseURL && 
           firebaseConfig.databaseURL.includes("firebaseio.com");
}
