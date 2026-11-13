// ===================================================================
// Admin > Message (added Nov 13, 2026): Ty writes a push alert and sends it to the whole league or to players he picks.
// - Recipients: '*' = every league member (Players type League, Active); or a list of active player names (guests allowed).
// - Saved to the News tab like every other alert (newsAdd_): "Everyone" shows to all, a picked list shows only to them.
// - Reports who couldn't get it: players with no push subscription turned on (OneSignal user lookup, one per player).
// Wiring (in Web.gs doPost, perf.gs part): a body with action 'message' goes to apiMessage_ (clears the board in finally).
// ===================================================================
var MSG_MAX_TITLE_ = 60, MSG_MAX_BODY_ = 500;

/** Admin action: { action: 'message', token, title?, body, to: '*' | ['Name', ...] }. */
function apiMessage_(b) {
  var user = apiUser_(b.token);
  if (!user) return { ok: false, code: 'auth', error: 'Please sign in again.' };
  if (!user.admin) return { ok: false, code: 'denied', error: 'Only Ty can send messages.' };
  var title = String(b.title || '').trim().slice(0, MSG_MAX_TITLE_) || 'Roost Golf';
  var body = String(b.body || '').trim();
  if (!body) return { ok: false, error: 'Write a message first.' };
  if (body.length > MSG_MAX_BODY_) return { ok: false, error: 'Keep it under ' + MSG_MAX_BODY_ + ' characters.' };
  var ss = SpreadsheetApp.getActive() || SpreadsheetApp.openById(LEAGUE_SHEET_ID);
  var names;
  if (b.to === '*') names = teeLeague_(ss);
  else {
    var active = apiPlayers_().map(function (p) { return p.name; });
    var want = [].concat(b.to || []).map(String);
    names = active.filter(function (n) { return want.indexOf(n) >= 0; });
  }
  if (!names.length) return { ok: false, error: 'Pick at least one player.' };
  var key = apiProps_().getProperty('ONESIGNAL_API_KEY');
  if (!key) return { ok: false, error: 'The OneSignal key is missing (League menu > Set OneSignal key…).' };

  var res = UrlFetchApp.fetch('https://api.onesignal.com/notifications?c=push', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Key ' + key },
    payload: JSON.stringify({
      app_id: NOTIFY_APP_ID_, target_channel: 'push',
      include_aliases: { external_id: names },
      headings: { en: title }, contents: { en: body }, url: NOTIFY_URL_
    })
  });
  var code = res.getResponseCode(), j = {};
  try { j = JSON.parse(res.getContentText()); } catch (e) {}
  if (code >= 300) return { ok: false, error: 'OneSignal refused it (' + code + '). Try again.' };
  var missing = msgUnreachable_(key, names, j);
  // Save to News even if some (or all) phones had alerts off, so everyone picked can still read it in the app.
  try { newsAdd_(title, body, names); } catch (e) { console.error(e); }
  return { ok: true, sent: names.length - missing.length, to: names, missing: missing };
}

/** Names with no push subscription that's turned on. Asks OneSignal about each person (one user can have several
 *  subscriptions, e.g. an old install, and the send response lists the name once per dead one). If a lookup fails,
 *  that name falls back to the send response's invalid_aliases (de-duplicated). */
function msgUnreachable_(key, names, sendRes) {
  var bad = {};
  if (sendRes) {
    var errs = sendRes.errors;
    if (!sendRes.id || Array.isArray(errs)) names.forEach(function (n) { bad[n] = 1; });
    else ((errs && errs.invalid_aliases && errs.invalid_aliases.external_id) || []).forEach(function (n) { bad[String(n)] = 1; });
  }
  var codes = [], out = [];
  var resps;
  try {
    resps = UrlFetchApp.fetchAll(names.map(function (n) {
      return { url: 'https://api.onesignal.com/apps/' + NOTIFY_APP_ID_ + '/users/by/external_id/' + encodeURIComponent(n),
        headers: { Authorization: 'Key ' + key }, muteHttpExceptions: true };
    }));
  } catch (e) { console.error(e); resps = []; }
  names.forEach(function (n, i) {
    var r = resps[i], code = r ? r.getResponseCode() : 0, live = null;
    codes.push(n + ' ' + code);
    if (code === 404) live = false;
    else if (code === 200) {
      try {
        var subs = JSON.parse(r.getContentText()).subscriptions || [];
        live = subs.some(function (s) { return /Push$/.test(String(s.type)) && s.enabled !== false && !(Number(s.notification_types) < 0); });
      } catch (e) {}
    }
    if (live === null) live = !bad[n];   // lookup failed: trust the send response
    if (!live) out.push(n);
  });
  console.log('OneSignal lookups: ' + codes.join(', '));
  return out;
}

/** Editor check (sends nothing): logs who has alerts on, per OneSignal. */
function msgCheck() {
  var ss = SpreadsheetApp.getActive() || SpreadsheetApp.openById(LEAGUE_SHEET_ID);
  var key = apiProps_().getProperty('ONESIGNAL_API_KEY'), names = teeLeague_(ss);
  var off = msgUnreachable_(key, names, null);
  console.log('League: ' + names.join(', ') + '\nAlerts off: ' + (off.join(', ') || 'nobody'));
}
