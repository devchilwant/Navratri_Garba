# Garba Entry Verification — GitHub Pages + Google Sheet + Firebase

A simple centralized, device-independent entry system for a society Garba event.

## What it does

- Reads the **original Google Sheet in read-only mode**.
- Uses the sheet to determine:
  - Flat number
  - Allowed member count
  - Whether Cultural Fund is paid
- Stores only **today's approved entry count** in Firebase Firestore.
- Does **not modify the original Google Sheet**.
- Shows for each flat:
  - Original Count
  - Approved Today
  - Remaining
- Daily reset happens automatically because entry records are stored with the current date.
- Firestore transactions prevent two devices from approving beyond the allowed count at the same time.
- Frontend can be hosted for free on GitHub Pages.

## Google Sheet format

Make the source sheet accessible for reading ("Anyone with the link → Viewer").

Use a header row like:

| Flat | Count | Paid |
|---|---:|---|
| A-101 | 4 | Yes |
| A-102 | 3 | No |
| A-103 | 5 | Yes |

The code accepts common variations such as `Flat No`, `Members`, `Member Count`, `Payment Status`, etc.

**Important:** The website only reads the sheet. It never writes entry counts back to the sheet.

## 1. Create Firebase project

1. Open Firebase Console.
2. Create a new project.
3. Add a Web App.
4. Copy the Web App configuration.
5. Create a Firestore database.
6. In Firestore Rules, use the contents of `firestore.rules`.

For a society event, the included rules are deliberately simple. For a production system, use Firebase Authentication and allow writes only to authenticated staff.

## 2. Configure the website

Copy:

`config.local.example.js` → `config.local.js`

Fill:

- `GOOGLE_SHEET_ID`: the ID between `/d/` and `/edit` in the Google Sheet URL.
- `GOOGLE_SHEET_NAME`: tab name, e.g. `Garba`.
- Firebase Web App configuration.

Example:

```js
export const CONFIG = {
  GOOGLE_SHEET_ID: "1AbCdEf...",
  GOOGLE_SHEET_NAME: "Garba",
  FIREBASE: {
    apiKey: "...",
    authDomain: "my-project.firebaseapp.com",
    projectId: "my-project",
    storageBucket: "my-project.appspot.com",
    messagingSenderId: "...",
    appId: "..."
  }
};
```

## 3. Test locally

Because ES modules do not work reliably from `file://`, run a small local server.

Python:

```bash
python -m http.server 8080
```

Then open:

`http://localhost:8080`

## 4. Publish on GitHub Pages

1. Create a GitHub repository.
2. Upload all files.
3. IMPORTANT: upload `config.local.js` too if the repository is private. If the repository is public, understand that Firebase Web App config is not a secret, but your Firestore rules must protect the database appropriately.
4. GitHub → Settings → Pages.
5. Source: **Deploy from a branch**.
6. Select `main` and `/root`.
7. Save.
8. GitHub will give you a free HTTPS URL.

## Daily operation

Staff opens the same GitHub Pages URL on any phone/laptop.

1. Enter flat number.
2. Click Verify.
3. Website reads the current source-sheet status.
4. If Cultural Fund is unpaid → entry blocked.
5. If paid and remaining count > 0 → Approve 1 Entry.
6. Firebase increments today's approved count.
7. All other devices see the updated count after refresh.

At midnight in the event's local timezone, the app starts using a new date key, so all flats start with their original Google Sheet count again.

## Recommended next improvements

For a larger event, add:
- Staff login/PIN
- QR-code scanning
- Individual visitor names
- Entry timestamp/history
- Admin dashboard
- Export of daily entry report
- Offline queue for poor network conditions

## Important security note

This starter version is intentionally simple and uses public client access to Firestore. For a real event with many volunteers, add Firebase Authentication and make only authenticated staff users able to approve entries. Never put a Firebase service-account private key in this repository.
