
// ===================================================================
// Push notifications through OneSignal — added Nov 11, 2026.
// Players opt in on the app; the app logs them in to OneSignal with their sheet name
// (external_id), so alerts go to league members by name.
// Alerts (each once per night; tee-off and last-hole alerts skipped on Casual nights):
//   1. Sign-up opens (Wed 8 AM)      2. Ty confirms the groups
//   3. First score on Tonight          4. Early group starts the last hole
// Key: Script Property ONESIGNAL_API_KEY (League menu > "Set OneSignal key…"). Not stored in code.
// A 5-minute timer (League menu > "Turn on alerts") catches the Wednesday alert and scores typed in the sheet;
// phone and GSPro scores check straight away.
// ===================================================================
var NOTIFY_APP_ID_ = '922b7773-264b-4ac8-b72b-0b0b9f108769';
var NOTIFY_URL_ = 'https://tjr127.github.io/roost-links/';

/** Send one push to these sheet names. Returns a short status string. */
function notify_(heading, message, names) {
  var key = apiProps_().getProperty('ONESIGNAL_API_KEY');
  if (!key) return 'no key';
  names = (names || []).filter(String);
  if (!names.length) return 'nobody';
  var res = UrlFetchApp.fetch('https://api.onesignal.com/notifications?c=push', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Key ' + key },
    payload: JSON.stringify({
      app_id: NOTIFY_APP_ID_, target_channel: 'push',
      include_aliases: { external_id: names },
      headings: { en: heading }, contents: { en: message }, url: NOTIFY_URL_
    })
  });
  return res.getResponseCode() + ' ' + res.getContentText().slice(0, 200);
}

/** Send once per key (e.g. 'open:2026-11-12'); remembers what was sent in Script Properties. */
function notifyOnce_(flag, heading, message, names) {
  var props = apiProps_(), k = 'ntf:' + flag;
  if (props.getProperty(k)) return false;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return false;
  try {
    if (props.getProperty(k)) return false;
    var r = notify_(heading, message, names);
    if (r === 'no key') return false;
    props.setProperty(k, new Date().toISOString() + ' ' + r.slice(0, 60));
    return true;
  } finally { lock.releaseLock(); }
}

/** Alert 1: tee-time sign-up is open. */
function notifyOpen_(ss) {
  var night = teeNight_(ss);
  if (!night) return;
  var now = new Date();
  // Only in the first 2 hours after sign-up opens, so reopening sign-up later doesn't re-send it.
  if (now < night.opens || now >= night.closes || now - night.opens > 2 * 3600 * 1000) return;
  if (apiProps_().getProperty('teeConf:' + night.key)) return;   // groups already set: no point asking
  notifyOnce_('open:' + night.key, 'Roost Golf', 'Request Your Early or Late Tee Time and Pick Your Tees for Thursday Night League Now!', teeLeague_(ss));
}

/** Alert 2: Ty confirmed the groups. */
function notifyGroups_(ss, night, early, late) {
  var msg = 'Early (' + TEE_TIMES_.Early.replace(':00', '') + '): ' + (early.length ? early.join(', ') : 'nobody') +
    '\nLate (' + TEE_TIMES_.Late.replace(':00', '') + '): ' + (late.length ? late.join(', ') : 'nobody');
  // Not "once": if Ty reopens and confirms again, players get the new groups.
  notify_('Thursday groups are confirmed', msg, teeLeague_(ss));
}

/** Alerts 3 and 4, from what's on the Tonight tab. League nights only, and only on the night itself. */
function notifyTonight_(ss) {
  var t = ss.getSheetByName('Tonight');
  var top = t.getRange('B1:B7').getValues();
  if (String(top[6][0] || 'League') === 'Casual') return;
  if (!(top[0][0] instanceof Date)) return;
  var tz = ss.getSpreadsheetTimeZone();
  var key = Utilities.formatDate(top[0][0], tz, 'yyyy-MM-dd');
  if (key !== Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd')) return;
  var props = apiProps_();
  var sentTee = !!props.getProperty('ntf:teeoff:' + key), sentLast = !!props.getProperty('ntf:last:' + key);
  if (sentTee && sentLast) return;
  var rows = t.getRange('A10:X25').getValues();   // name, ..., hole scores E:V (4-21), thru X (23)
  var holes = Number(top[3][0]) || 0;
  var league = teeLeague_(ss);
  var anyScore = rows.some(function (r) { return r[0] && r.slice(4, 22).some(function (v) { return v !== '' && v !== null; }); });
  if (anyScore && !sentTee) notifyOnce_('teeoff:' + key, 'Roost Golf', 'The first Thursday night group has teed off!', league);
  if (!sentLast && holes > 1) {
    var conf = props.getProperty('teeConf:' + key);
    var early = conf ? JSON.parse(conf).early : null;   // without confirmed groups: whoever is furthest along
    var onLast = rows.some(function (r) {
      return r[0] && (!early || early.indexOf(String(r[0])) >= 0) && Number(r[23]) >= holes - 1;
    });
    if (onLast) notifyOnce_('last:' + key, 'Roost Golf', 'The early group just started their last hole', league);
  }
}

/** Every 5 minutes (timer from the League menu). */
function notifyTick() {
  var ss = SpreadsheetApp.getActive() || SpreadsheetApp.openById(LEAGUE_SHEET_ID);
  try { notifyOpen_(ss); } catch (e) { console.error(e); }
  try { notifyTonight_(ss); } catch (e) { console.error(e); }
}

/** League menu: store the OneSignal REST API key. */
function notifySetKey() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt('OneSignal key', 'Paste the REST API key from OneSignal (Settings > API keys and IDs):', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK || !r.getResponseText().trim()) return;
  apiProps_().setProperty('ONESIGNAL_API_KEY', r.getResponseText().trim());
  ui.alert('Saved. Next: League > Turn on alerts.');
}

/** League menu: start the 5-minute alert timer (safe to run again). */
function notifyInstall() {
  ScriptApp.getProjectTriggers().forEach(function (tr) { if (tr.getHandlerFunction() === 'notifyTick') ScriptApp.deleteTrigger(tr); });
  ScriptApp.newTrigger('notifyTick').timeBased().everyMinutes(5).create();
  var key = apiProps_().getProperty('ONESIGNAL_API_KEY');
  SpreadsheetApp.getUi().alert('Alerts are on.' + (key ? '' : '\n\nThe OneSignal key is still missing: League > Set OneSignal key…'));
}

/** League menu: send a test alert to Ty only. */
function notifyTest() {
  var r = notify_('Roost Golf', 'Test alert: notifications are working.', API_ADMINS_);
  SpreadsheetApp.getUi().alert(r === 'no key' ? 'Set the OneSignal key first (League > Set OneSignal key…).' : 'Sent. OneSignal replied: ' + r);
}
