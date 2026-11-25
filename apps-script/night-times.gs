// ===================================================================
// Per-night tee times (added Nov 24, 2026, Ty: Nov 28 moved to a Saturday with 3 PM / 6 PM groups).
// Season tab, optional columns on each night's row:
//   G "Early"          e.g. 3:00 PM   (blank = 6:00 PM)
//   H "Late"           e.g. 6:00 PM   (blank = 8:00 PM)
//   I "Sign-up closes" e.g. 12:00 PM  (blank = 3 hours before Early, i.e. 3 PM on a normal night)
//   J "Sign-up opens"  date and time, e.g. 11/24/2026 8:30 PM (blank = 8 AM the day before)
// Sign-up still opens at 8 AM the day before; the reminder still goes at 8 AM on the night.
// Alerts name the night's weekday instead of "Thursday".
// Paste at the END of Web.gs: it replaces teeNight_ (casual-tees.gs), notifyOpen_ (notifications.gs),
// notifyGroups_ and teeRemind_ (league-tees.gs). The later definition wins in Apps Script.
// ===================================================================

/** "3:00 PM", "3 PM", "15:00", or a sheet time value → {h, m}; null if blank/unreadable. */
function ntParse_(v) {
  var s = String(v || '').trim().toUpperCase();
  var m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/);
  if (!m) return null;
  var h = Number(m[1]), mi = Number(m[2] || 0);
  if (m[3] === 'PM' && h < 12) h += 12;
  if (m[3] === 'AM' && h === 12) h = 0;
  if (h > 23 || mi > 59) return null;
  return { h: h, m: mi };
}

function ntLabel_(t) {
  var h = t.h % 12 || 12;
  return h + ':' + ('0' + t.m).slice(-2) + ' ' + (t.h < 12 ? 'AM' : 'PM');
}

/** Adds this night's tee times and sign-up close from the Season tab to a league night. */
function ntApply_(ss, night) {
  if (!night || night.casual) return night;
  var tz = ss.getSpreadsheetTimeZone();
  var rows = ss.getSheetByName('Season').getRange('A2:J60').getValues();
  var disp = ss.getSheetByName('Season').getRange('A2:J60').getDisplayValues();
  var early = { h: 18, m: 0 }, late = { h: 20, m: 0 }, close = null;
  for (var i = 0; i < rows.length; i++) {
    var d = rows[i][1];
    if (!(d instanceof Date) || Utilities.formatDate(d, tz, 'yyyy-MM-dd') !== night.key) continue;
    early = ntParse_(disp[i][6]) || early;
    late = ntParse_(disp[i][7]) || late;
    close = ntParse_(disp[i][8]);
    if (rows[i][9] instanceof Date) night.opens = rows[i][9];
    break;
  }
  if (!close) close = { h: Math.max(0, early.h - 3), m: early.m };
  var off = Utilities.formatDate(night.date, tz, 'Z');
  night.closes = new Date(night.key + 'T' + ('0' + close.h).slice(-2) + ':' + ('0' + close.m).slice(-2) + ':00' +
    off.slice(0, 3) + ':' + off.slice(3));
  night.times = { Early: ntLabel_(early), Late: ntLabel_(late) };
  night.closeLabel = ntLabel_(close);
  night.day = Utilities.formatDate(night.date, tz, 'EEEE');
  // Older code reads these globals (teeTimes0_ sends TEE_TIMES_ to the app).
  TEE_TIMES_ = night.times;
  TEE_CLOSE_ = { daysBefore: 0, hour: close.h };
  return night;
}

/** The night the tee times card is for: today's casual round if one is loaded, else the next league night. */
function teeNight_(ss) {
  return teeCasual_(ss) || ntApply_(ss, teeNight0_(ss));
}

/** Alert 1: tee-time sign-up is open. */
function notifyOpen_(ss) {
  var night = teeNight_(ss);
  if (!night || night.casual) return;
  var now = new Date();
  if (now < night.opens || now >= night.closes || now - night.opens > 2 * 3600 * 1000) return;
  if (apiProps_().getProperty('teeConf:' + night.key)) return;
  notifyOnce_('open:' + night.key, 'Roost Golf', 'Request Your Early or Late Tee Time and Pick Your Tees for ' +
    (night.day || 'Thursday') + ' Night League Now!', teeLeague_(ss));
}

/** Groups alert with each player's tees and this night's times. */
function notifyGroups_(ss, night, early, late) {
  if ((night && night.casual) || teeCasual_(ss)) return;
  var times = (night && night.times) || TEE_TIMES_;
  var tees = teeTeesFor_(ss, night.key);
  function list(g) { return g.length ? g.map(function (n) { return n + (tees[n] ? ' (' + tees[n] + ')' : ''); }).join(', ') : 'nobody'; }
  var msg = 'Early (' + times.Early.replace(':00', '') + '): ' + list(early) +
    '\nLate (' + times.Late.replace(':00', '') + '): ' + list(late);
  notify_((night.day || 'Thursday') + ' groups and tees are set', msg, teeLeague_(ss));
}

/** 8 AM on the night: nudge anyone with a match who hasn't picked a tee time. */
function teeRemind_(ss) {
  var night = teeNight_(ss);
  if (!night || night.casual) return;
  var now = new Date();
  var off = Utilities.formatDate(night.date, ss.getSpreadsheetTimeZone(), 'Z');
  var at = new Date(night.key + 'T' + ('0' + TEE_REMIND_HOUR_).slice(-2) + ':00:00' + off.slice(0, 3) + ':' + off.slice(3));
  if (now < at || now >= night.closes || now - at > 2 * 3600 * 1000) return;
  if (apiProps_().getProperty('teeConf:' + night.key)) return;
  var t = teeTimes0_(ss);
  if (!t) return;
  var sched = {};
  t.pairs.forEach(function (p) { sched[p[0]] = true; sched[p[1]] = true; });
  var any = Object.keys(sched).length > 0;
  var names = t.players.filter(function (p) { return !p.choice && (!any || sched[p.name]); }).map(function (p) { return p.name; });
  if (!names.length) return;
  notifyOnce_('remind:' + night.key, 'Roost Golf', 'You haven\'t picked your tee time and tees for tonight yet. Sign-up closes at ' +
    (night.closeLabel || '3:00 PM').replace(':00', '') + '!', names);
}
