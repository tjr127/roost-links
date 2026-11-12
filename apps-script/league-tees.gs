
// ===================================================================
// League-night tees on the tee times card (added Nov 12, 2026).
// Players pick their tees together with Early / Late / Either / Can't play on the Schedule tab.
// Same window as the tee times (Wed 8 AM to Thu 3 PM). Picks go on the Tee Choices tab (Tonight reads them);
// no pick = the player's tees on the Players tab. Confirming the groups locks tees too (Reopen unlocks).
// At 3 PM sign-up closes by itself: if Ty hasn't confirmed, his saved arrangement (or the suggestion)
// is confirmed automatically and the groups alert goes out. Thursday 8 AM: a reminder to anyone with a
// match that night who hasn't picked a tee time yet.
// Wrappers: teeTimes_ -> teeTimes0_, apiTee_ -> apiTee0_, notifyGroups_ -> notifyGroups0_ (unused), notifyTick -> notifyTick0_.
// ===================================================================
var TEE_REMIND_HOUR_ = 8;   // Thursday 8:00 AM reminder

function teeTimes_(ss) {
  var t = teeTimes0_(ss);
  if (t) { try { t.tees = tpLeague_(ss); } catch (e) { console.error(e); } }
  return t;
}

/** App: tee time pick (choice) and/or tees for the next league night. */
function apiTee_(req) {
  if (req.choice !== undefined) {
    var r = apiTee0_(req);
    if (!r.ok) return r;
  }
  if (req.tees !== undefined) {
    var r2 = apiTeeTees_(req);
    if (!r2.ok) return r2;
  }
  return { ok: true };
}

function apiTeeTees_(req) {
  var user = apiUser_(req.token);
  if (!user) return { ok: false, code: 'auth', error: 'Please sign in again.' };
  var name = String(req.name || ''), tees = String(req.tees || '');
  if (name !== user.name && !user.admin) return { ok: false, code: 'denied', error: 'You can only pick your own tees.' };
  if (tees !== '' && TP_TEES_.indexOf(tees) < 0) return { ok: false, error: 'Pick Tips, Long, Medium or Short.' };
  var ss = SpreadsheetApp.getActive() || SpreadsheetApp.openById(LEAGUE_SHEET_ID);
  var night = teeNight_(ss);
  if (!night) return { ok: false, error: 'No league night coming up.' };
  if (teeLeague_(ss).indexOf(name) < 0) return { ok: false, error: name + ' is not a league member.' };
  var state = teeState_(night);
  if (state === 'confirmed') return { ok: false, code: 'locked', error: 'Groups and tees are set. Ask Ty if you need to change.' };
  if (!user.admin && state !== 'open') return { ok: false, code: 'locked', error: state === 'before' ? 'Sign-up opens ' + Utilities.formatDate(night.opens, ss.getSpreadsheetTimeZone(), "EEE 'at' h:mm a") + '.' : 'Sign-up is closed. Ask Ty if you need to change.' };
  tpWrite_(ss, night.key, name, tees, user.name === name ? 'Player' : user.name);
  return { ok: true };
}

/** Each league member's tees for a night: their pick, else their Players-tab tees. */
function teeTeesFor_(ss, nightKey) {
  var picks = tpRows_(ss, nightKey), out = {};
  ss.getSheetByName('Players').getRange('A2:D40').getDisplayValues().forEach(function (r) {
    if (r[0]) out[r[0]] = (picks[r[0]] && picks[r[0]].tees) || r[3] || '';
  });
  return out;
}

/** Groups alert, now with each player's tees. */
function notifyGroups_(ss, night, early, late) {
  var tees = teeTeesFor_(ss, night.key);
  function list(g) { return g.length ? g.map(function (n) { return n + (tees[n] ? ' (' + tees[n] + ')' : ''); }).join(', ') : 'nobody'; }
  var msg = 'Early (' + TEE_TIMES_.Early.replace(':00', '') + '): ' + list(early) +
    '\nLate (' + TEE_TIMES_.Late.replace(':00', '') + '): ' + list(late);
  notify_('Thursday groups and tees are set', msg, teeLeague_(ss));
}

/** Confirm groups as `by` (same writes as Ty's Confirm groups) and send the alert. */
function teeConfirmAs_(ss, night, early, late, by) {
  var league = teeLeague_(ss);
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    if (apiProps_().getProperty('teeConf:' + night.key)) return false;
    var sh = teeSheet_(ss), rows = teeRows_(ss, night.key);
    league.forEach(function (n) {
      var g = early.indexOf(n) >= 0 ? 'Early' : late.indexOf(n) >= 0 ? 'Late' : '';
      var r = rows[n];
      if (r) sh.getRange(r.row, 6).setValue(g);
      else if (g) sh.getRange(sh.getLastRow() + 1, 1, 1, 6).setValues([[night.key, n, '', new Date(), by, g]]);
    });
    apiProps_().deleteProperty('teeDraft:' + night.key);
    apiProps_().setProperty('teeConf:' + night.key, JSON.stringify({
      early: early, late: late, by: by,
      at: Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), "EEE h:mm a")
    }));
  } finally { lock.releaseLock(); }
  boardBust_();
  try { notifyGroups_(ss, night, early, late); } catch (e) { console.error(e); }
  return true;
}

/** 3 PM: if Ty hasn't confirmed, confirm his saved arrangement (or the suggestion). Once per night, so Reopen sticks. */
function teeAutoClose_(ss) {
  var night = teeNight_(ss);
  if (!night) return;
  var now = new Date();
  if (now < night.closes || now - night.closes > 6 * 3600 * 1000) return;
  var props = apiProps_(), flag = 'ntf:autoclose:' + night.key;
  if (props.getProperty(flag) || props.getProperty('teeConf:' + night.key)) return;
  var t = teeTimes0_(ss);
  if (!t) return;
  var playing = t.players.filter(function (p) { return p.choice === 'Early' || p.choice === 'Late' || p.choice === 'Either'; }).map(function (p) { return p.name; });
  // Scheduled players who never picked are placed too (Ty, Nov 12).
  (t.suggested.nopick || []).forEach(function (n) { if (playing.indexOf(n) < 0) playing.push(n); });
  props.setProperty(flag, now.toISOString());
  if (!playing.length) return;
  var g = t.draft || t.suggested;
  var early = (g.early || []).filter(function (n) { return playing.indexOf(n) >= 0; });
  var late = (g.late || []).filter(function (n) { return playing.indexOf(n) >= 0 && early.indexOf(n) < 0; });
  playing.forEach(function (n) { if (early.indexOf(n) < 0 && late.indexOf(n) < 0) (t.suggested.late.indexOf(n) >= 0 ? late : early).push(n); });
  teeConfirmAs_(ss, night, early, late, 'auto at 3 PM');
}

/** Thursday 8 AM: nudge anyone with a match that night who hasn't picked a tee time. */
function teeRemind_(ss) {
  var night = teeNight_(ss);
  if (!night) return;
  var now = new Date();
  var at = new Date(night.closes.getTime() - (TEE_CLOSE_.hour - TEE_REMIND_HOUR_) * 3600 * 1000);
  if (now < at || now >= night.closes || now - at > 2 * 3600 * 1000) return;
  if (apiProps_().getProperty('teeConf:' + night.key)) return;
  var t = teeTimes0_(ss);
  if (!t) return;
  var sched = {};
  t.pairs.forEach(function (p) { sched[p[0]] = true; sched[p[1]] = true; });
  var any = Object.keys(sched).length > 0;
  var names = t.players.filter(function (p) { return !p.choice && (!any || sched[p.name]); }).map(function (p) { return p.name; });
  if (!names.length) return;
  notifyOnce_('remind:' + night.key, 'Roost Golf', 'You haven\'t picked your tee time and tees for tonight yet. Sign-up closes at 3 PM!', names);
}

/** Every 5 minutes. */
function notifyTick() {
  notifyTick0_();
  var ss = SpreadsheetApp.getActive() || SpreadsheetApp.openById(LEAGUE_SHEET_ID);
  try { teeRemind_(ss); } catch (e) { console.error(e); }
  try { teeAutoClose_(ss); } catch (e) { console.error(e); }
}
