/**
 * Word Genius → FlashcardApp
 *
 * A Google Apps Script that runs once a day in your Google account. It finds
 * new Word Genius "Word of the Day" emails, reads the word, part of speech and
 * definition from each one, and adds them to your synced vocabulary. Words it
 * can't parse are queued instead, and the app looks them up in the dictionary.
 *
 * Setup is in scripts/word-genius/README.md. In short: paste this file into a
 * new Apps Script project, set the four Script Properties, run checkRecentEmails
 * to preview, then run installDailyTrigger once.
 *
 * The pure functions at the top (no Google or network calls) are unit tested in
 * WordGenius.test.mjs; keep them free of Apps Script services.
 */

var SEARCH_QUERY = 'from:mail@wordgenius.com subject:"Word of the Day" -label:flashcards-added newer_than:30d';
var DONE_LABEL = 'flashcards-added';
var PARTS_OF_SPEECH = ['noun', 'verb', 'adjective', 'adverb', 'interjection', 'preposition', 'conjunction', 'pronoun', 'phrase'];

// ---------------------------------------------------------------- pure logic

/** The word from a subject like "Word of the Day: Melomaniac", or null. */
function wordFromSubject(subject) {
  var match = /Word of the Day:\s*(.+?)\s*$/i.exec(String(subject || ''));
  return match ? match[1] : null;
}

/** HTML email body → plain text with single spaces (tags, styles and entities removed). */
function htmlToText(html) {
  return String(html || '')
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|td|tr|h\d|li)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&mdash;/g, '—')
    .replace(/&#(\d+);/g, function (_, code) { return String.fromCharCode(Number(code)); })
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

/**
 * Parse a Word of the Day email. Returns { word, partOfSpeech?, definition? }
 * or null if the subject isn't a Word of the Day. A missing definition means
 * the layout changed; the word is then queued for a dictionary lookup.
 */
function parseWordGeniusEmail(subject, bodyText) {
  var word = wordFromSubject(subject);
  if (!word) return null;
  var text = String(bodyText || '').replace(/\s+/g, ' ');
  var result = { word: word };

  var pos = /Part of Speech\s*:?\s*([A-Za-z]+)/i.exec(text);
  if (pos && PARTS_OF_SPEECH.indexOf(pos[1].toLowerCase()) !== -1) result.partOfSpeech = pos[1].toLowerCase();

  // "Definition: Tony (North American) Fashionable among wealthy or stylish people. Let's Play ..."
  var escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  var def = new RegExp('Definition\\s*:?\\s*(?:' + escaped + ')?\\s*(.+?)(?=\\s*(?:Let.s Play|Test your vocab|Our Favorite Words|Learn:|Email Preferences|$))', 'i').exec(text);
  if (def) {
    var definition = def[1].trim();
    // Guard against grabbing a whole newsletter if the layout changes
    if (definition.length >= 3 && definition.length <= 400) result.definition = definition;
  }
  return result;
}

/** Stable id per word, so reruns and other devices agree on it. */
function wordGeniusId(word) {
  return 'wg-' + String(word).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Add parsed entries to a user_vocabulary object. Entries with a definition
 * become cards; others become queued words. Words already in your list or
 * queue (any case), or ones you deleted, are skipped. Returns the new
 * vocabulary (null if nothing changed) plus what was added and skipped.
 * Mirrors toCardFields in src/lib/storage.ts.
 */
function addWordsToVocabulary(vocab, entries, now) {
  vocab = vocab && typeof vocab === 'object' ? vocab : {};
  var words = Array.isArray(vocab.words) ? vocab.words.slice() : [];
  var pending = Array.isArray(vocab.pending) ? vocab.pending.slice() : [];
  var deleted = {};
  (Array.isArray(vocab.deletedIds) ? vocab.deletedIds : []).forEach(function (id) { deleted[id] = true; });
  var known = {};
  words.concat(pending).forEach(function (w) { if (w && w.word) known[String(w.word).trim().toLowerCase()] = true; });

  var added = [];
  var skipped = [];
  entries.forEach(function (entry) {
    var key = String(entry.word).trim().toLowerCase();
    var id = wordGeniusId(entry.word);
    if (!key || known[key] || deleted[id]) { skipped.push(entry.word); return; }
    known[key] = true;
    if (entry.definition) {
      var card = {
        id: id, type: 'vocabulary', isUserAdded: true,
        word: entry.word, definition: entry.definition,
        front: entry.word, back: entry.definition, updatedAt: now,
      };
      if (entry.partOfSpeech) card.partOfSpeech = entry.partOfSpeech;
      words.push(card);
    } else {
      pending.push({ id: id, word: entry.word, addedAt: now, status: 'queued' });
    }
    added.push(entry.word);
  });

  if (added.length === 0) return { vocabulary: null, added: added, skipped: skipped };
  var next = {};
  Object.keys(vocab).forEach(function (k) { next[k] = vocab[k]; });
  next.words = words;
  next.pending = pending;
  if (!next.deletedIds) next.deletedIds = [];
  next.lastUpdated = now;
  return { vocabulary: next, added: added, skipped: skipped };
}

// ---------------------------------------------------------- Apps Script glue

/** Daily entry point: add new Word of the Day emails to the deck, then label them. */
function syncWordGenius() {
  var found = findWordGeniusEmails_();
  if (found.length === 0) { Logger.log('No new Word of the Day emails.'); return; }
  var entries = found.map(function (f) { return f.entry; });
  var result = updateVocabulary_(entries);
  Logger.log('Added: ' + (result.added.join(', ') || 'none') + ' | Skipped (already there): ' + (result.skipped.join(', ') || 'none'));
  var label = GmailApp.getUserLabelByName(DONE_LABEL) || GmailApp.createLabel(DONE_LABEL);
  found.forEach(function (f) { f.thread.addLabel(label); });
}

/** Preview what the next sync would add, without writing anything. Run this first. */
function checkRecentEmails() {
  findWordGeniusEmails_().forEach(function (f) {
    Logger.log(JSON.stringify(f.entry));
  });
}

/** Run once to schedule syncWordGenius every day around 9–10 a.m. (script time zone). */
function installDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncWordGenius') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncWordGenius').timeBased().everyDays(1).atHour(9).create();
  Logger.log('Daily trigger installed.');
}

function findWordGeniusEmails_() {
  var found = [];
  GmailApp.search(SEARCH_QUERY, 0, 50).forEach(function (thread) {
    thread.getMessages().forEach(function (message) {
      var entry = parseWordGeniusEmail(message.getSubject(), htmlToText(message.getBody()));
      if (entry) found.push({ thread: thread, entry: entry });
    });
  });
  return found;
}

function config_() {
  var props = PropertiesService.getScriptProperties();
  var keys = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'FLASHCARD_EMAIL', 'FLASHCARD_PASSWORD'];
  var config = {};
  keys.forEach(function (k) {
    config[k] = props.getProperty(k);
    if (!config[k]) throw new Error('Missing Script Property ' + k + ' (Project Settings → Script Properties).');
  });
  config.SUPABASE_URL = config.SUPABASE_URL.replace(/\/+$/, '');
  return config;
}

function fetchJson_(url, options) {
  options.muteHttpExceptions = true;
  var response = UrlFetchApp.fetch(url, options);
  var code = response.getResponseCode();
  var body = response.getContentText();
  if (code >= 300) throw new Error('HTTP ' + code + ' from ' + url.split('?')[0] + ': ' + body);
  return body ? JSON.parse(body) : null;
}

/** Sign in, then merge the entries into the cloud row with compare-and-swap, retrying if it changed. */
function updateVocabulary_(entries) {
  var c = config_();
  var auth = fetchJson_(c.SUPABASE_URL + '/auth/v1/token?grant_type=password', {
    method: 'post', contentType: 'application/json',
    headers: { apikey: c.SUPABASE_ANON_KEY },
    payload: JSON.stringify({ email: c.FLASHCARD_EMAIL, password: c.FLASHCARD_PASSWORD }),
  });
  var headers = { apikey: c.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + auth.access_token };
  var rowUrl = c.SUPABASE_URL + '/rest/v1/user_progress?user_id=eq.' + auth.user.id;

  for (var attempt = 0; attempt < 3; attempt++) {
    var rows = fetchJson_(rowUrl + '&select=user_vocabulary,updated_at', { method: 'get', headers: headers });
    if (!rows || rows.length === 0) throw new Error('No synced data for this account yet; open the app once while signed in.');
    var now = new Date().toISOString();
    var result = addWordsToVocabulary(rows[0].user_vocabulary, entries, now);
    if (!result.vocabulary) return result;
    var written = fetchJson_(rowUrl + '&updated_at=eq.' + encodeURIComponent(rows[0].updated_at), {
      method: 'patch', contentType: 'application/json',
      headers: Object.assign({ Prefer: 'return=representation' }, headers),
      payload: JSON.stringify({ user_vocabulary: result.vocabulary, updated_at: now }),
    });
    if (written && written.length > 0) return result;
    // The app synced in between; re-read and merge again so nothing is overwritten
  }
  throw new Error('The row kept changing during the update. It will try again tomorrow.');
}
