# Sinfonie
play it as it lays
#  — a Drive-powered, ad-free music player

This is a small PWA (installable web app) that lists and streams the audio
files sitting in your own Google Drive. No ad breaks, because there's no
ad-supported middleman — it's just you and your files.

**Why this has to be a real hosted app and not a Claude-chat preview:**
Google's login screen and the Drive API will only talk to a real website
address that you've registered with them ahead of time. So this needs
about 10 minutes of one-time setup on your end before it works.

## 1. Create a Google Cloud OAuth Client ID (one-time, ~5 min)

1. Go to [console.cloud.google.com](https://console.cloud.google.com/) and create a new project (or reuse one).
2. In **APIs & Services → Library**, search for **Google Drive API** and click **Enable**.
3. In **APIs & Services → OAuth consent screen**: choose **External**, fill in an app name and your email, and add your own Google account under **Test users** (this keeps it private to you — no Google review needed).
4. In **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**
   - **Authorized JavaScript origins**: add the exact URL you'll host this at (see step 2) — e.g. `https://yourname.github.io`
   - Save, then copy the **Client ID** it gives you.

## 2. Host the files somewhere with a real URL

Pick whichever is easiest for you:

- **GitHub Pages** (free): create a repo, upload these 5 files, turn on Pages in repo settings. You'll get a URL like `https://yourname.github.io/crate/`.
- **Netlify / Vercel** (free): drag-and-drop this folder in their dashboard.
- Any static host you already use works too.

Whatever URL you land on, go back to step 1 and make sure it's listed as
an **Authorized JavaScript origin** for your OAuth client — it must match exactly
(scheme + domain, no trailing path needed).

## 3. Drop in your Client ID

Open `app.js` and replace the very first constant:

```js
const CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';
```

with the Client ID you copied in step 1. Re-upload/redeploy.

## 4. Install it on your phone

Open the hosted URL in your phone's browser, then:
- **iOS Safari**: Share → *Add to Home Screen*
- **Android Chrome**: menu (⋮) → *Add to Home screen* / *Install app*

It'll behave like a normal app icon from then on.

## How it works

- Sign-in uses Google's own login screen (via Google Identity Services) — this app never sees your password.
- It requests **read-only** Drive access (`drive.readonly`), so it can list and download files but never edit or delete anything in your Drive.
- The access token is kept only in the browser tab's session storage, never sent anywhere but Google.
- Tracks are named `Artist - Title.mp3` when possible for nicer display; otherwise the filename is used as-is. Rename files in Drive if you want cleaner titles.
- The library reads every audio file in your entire Drive (any folder). If you'd rather scope it to one folder, that's a small change to the Drive query in `app.js` — ask and I can add a folder picker.

## Known limitations (kept intentionally simple for a first pass)

- No offline caching of the actual audio (Drive requires you to be online to stream/download a track — this is Drive's constraint, not the app's).
- No album art — each track instead gets a small generated color identity.
- No editable playlists yet, just your whole library, searchable and sortable.
- Large files download fully before playing rather than streaming in chunks, so very large lossless files may take a moment to start.

Happy to extend any of these — just say which one.
