# Word Genius → Study Deck sync

`WordGenius.gs` is a Google Apps Script that runs once a day in your own Google account. It:

1. Finds Word Genius "Word of the Day" emails from the last 30 days that it hasn't handled yet.
2. Reads the word, part of speech, and definition from each email, so cards use the sense Word Genius taught.
3. Adds them to your synced vocabulary (the same place as words you add in the app). If an email's layout ever changes and the definition can't be read, the word is queued instead, and the app looks it up in the dictionary.
4. Labels each handled email `flashcards-added` so it's never processed twice.

It skips words already in your list or queue, and words you've deleted. Words that are also built-in cards are hidden in the app, so nothing is studied twice. The app picks up new cards on its next sync (when you open it or return to the tab).

## One-time setup (about 5 minutes)

1. Go to <https://script.google.com>, signed in to the Gmail account that receives Word Genius, and click **New project**. Name it "Word Genius sync".
2. Delete the placeholder code, paste in the whole of `WordGenius.gs`, and click **Save** (💾).
3. Get a refresh token for the script (preferred over storing your password). On your computer, in this repo:

   ```sh
   npm run auth:login -- --print
   ```

   It asks for your app password (not saved or echoed) and prints a refresh token for a **new session used only by this script**. Don't paste in the token from `.flashcard-refresh-token` or from the browser: Supabase rotates a refresh token every time it is used, so two places sharing one session would keep invalidating each other.
4. Open **Project Settings** (⚙️ in the left sidebar) and, under **Script Properties**, add these (Claude can copy the first two to your clipboard from `.env.local`):

   | Property | Value |
   |---|---|
   | `SUPABASE_URL` | `VITE_SUPABASE_URL` from `.env.local` |
   | `SUPABASE_ANON_KEY` | `VITE_SUPABASE_ANON_KEY` from `.env.local` |
   | `FLASHCARD_REFRESH_TOKEN` | the token from step 3 |

   Each run exchanges the token for a session and writes the new, rotated token back to `FLASHCARD_REFRESH_TOKEN` itself, so the value you see there changes daily; that's expected.

   *Fallback:* instead of a token you can set `FLASHCARD_EMAIL` and `FLASHCARD_PASSWORD` (your app login). If both are set, the password is used only when the token is rejected. A token is better: it can be revoked without changing your password, and the password isn't sitting in the project.

   Script Properties are visible to anyone with edit access to the Apps Script project, so **don't share the project** (or add collaborators to it). Whoever can read the token or password can read and change your synced data.
5. Back in the **Editor**, choose `checkRecentEmails` in the function dropdown and click **Run**. Google will ask you to authorize access to Gmail and external requests. Approve it (you may need to click **Advanced → Go to Word Genius sync**). The log should list recent words with their definitions; nothing is written yet.
6. Choose `syncWordGenius` and click **Run** to add the recent words now.
7. Choose `installDailyTrigger` and click **Run** once. From then on it runs every morning between 9 and 10 (in the script's time zone, under Project Settings).

## Checking on it

- **Executions** (▶️☰ in the sidebar) shows each daily run and its log ("Added: … | Skipped: …").
- To stop it, open **Triggers** (⏰) and delete the trigger.
- If a run fails with "FLASHCARD_REFRESH_TOKEN Script Property was rejected" (the session was revoked, e.g. by "sign out everywhere", or it expired under your Supabase session settings), run `npm run auth:login -- --print` again and paste the new token in.
- To revoke the script's access, sign out all sessions for your user (Supabase dashboard → Authentication → Users), then give it a new token.
- If you use the password fallback and change your app password, update `FLASHCARD_PASSWORD` in Script Properties.

### Moving from the password to a token

If you set this up with `FLASHCARD_PASSWORD`: paste the latest `WordGenius.gs` into the editor, add `FLASHCARD_REFRESH_TOKEN` (step 3), run `syncWordGenius` once to check it works, then delete the `FLASHCARD_EMAIL` and `FLASHCARD_PASSWORD` properties.

## Development

The parsing, merging and sign-in functions at the top of `WordGenius.gs` don't use Apps Script services and are unit tested in `WordGenius.test.mjs` (run with the normal `npm test`). If you change the file, paste the new version into the Apps Script editor.
