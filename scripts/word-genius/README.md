# Word Genius → FlashcardApp sync

`WordGenius.gs` is a Google Apps Script that runs once a day in your own Google account. It:

1. Finds Word Genius "Word of the Day" emails from the last 30 days that it hasn't handled yet.
2. Reads the word, part of speech, and definition from each email, so cards use the sense Word Genius taught.
3. Adds them to your synced vocabulary (the same place as words you add in the app). If an email's layout ever changes and the definition can't be read, the word is queued instead, and the app looks it up in the dictionary.
4. Labels each handled email `flashcards-added` so it's never processed twice.

It skips words already in your list or queue, and words you've deleted. Words that are also built-in cards are hidden in the app, so nothing is studied twice. The app picks up new cards on its next sync (when you open it or return to the tab).

## One-time setup (about 5 minutes)

1. Go to <https://script.google.com>, signed in to the Gmail account that receives Word Genius, and click **New project**. Name it "Word Genius sync".
2. Delete the placeholder code, paste in the whole of `WordGenius.gs`, and click **Save** (💾).
3. Open **Project Settings** (⚙️ in the left sidebar) and, under **Script Properties**, add these four (Claude can copy them to your clipboard from `.env.local`):

   | Property | Value |
   |---|---|
   | `SUPABASE_URL` | `VITE_SUPABASE_URL` from `.env.local` |
   | `SUPABASE_ANON_KEY` | `VITE_SUPABASE_ANON_KEY` from `.env.local` |
   | `FLASHCARD_EMAIL` | your app login email |
   | `FLASHCARD_PASSWORD` | your app password |

   Script Properties are visible only to you.
4. Back in the **Editor**, choose `checkRecentEmails` in the function dropdown and click **Run**. Google will ask you to authorize access to Gmail and external requests. Approve it (you may need to click **Advanced → Go to Word Genius sync**). The log should list recent words with their definitions; nothing is written yet.
5. Choose `syncWordGenius` and click **Run** to add the recent words now.
6. Choose `installDailyTrigger` and click **Run** once. From then on it runs every morning between 9 and 10 (in the script's time zone, under Project Settings).

## Checking on it

- **Executions** (▶️☰ in the sidebar) shows each daily run and its log ("Added: … | Skipped: …").
- To stop it, open **Triggers** (⏰) and delete the trigger.
- If you change your app password, update `FLASHCARD_PASSWORD` in Script Properties.

## Development

The parsing and merging functions at the top of `WordGenius.gs` are pure and unit tested in `WordGenius.test.mjs` (run with the normal `npm test`). If you change the file, paste the new version into the Apps Script editor.
