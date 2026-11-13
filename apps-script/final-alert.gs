// ===================================================================
// Alert 7: end of the night (added Nov 12, 2026, 9 PM).
// Three alerts, each sent once: League results as soon as every player on Tonight has played
// every hole of tonight's round, Low net / putts 2 minutes later, Team game 10 minutes after the end
// (League nights only, Tonight's date = today). Sent to league members with alerts on.
// Body: head-to-head results with trash talk, low net, most/fewest putts (only if putts were tracked).
// Wiring: the original notifyTonight_ was renamed notifyTonight0_; notifyTonight_ below runs it,
// then notifyFinal_. notifyTonight_ already runs after phone saves, GSPro agent posts and the 5-minute timer.
// ===================================================================
function notifyTonight_(ss) {
  try { notifyTonight0_(ss); } catch (e) { console.error(e); }
  try { notifyFinal_(ss); } catch (e) { console.error(e); }
}

var FA_DELAY_MS_ = 10 * 60 * 1000;   // team results: 10 minutes after the last player finishes (time to fix teams)
var FA_GAP_MS_ = 2 * 60 * 1000;      // low net and putts: 2 minutes after the league results, so phones don't stack them

function notifyFinal_(ss) {
  var c = finalAlert_(ss, false, true);   // cheap check: everyone finished and something still unsent?
  if (!c) return;
  var props = apiProps_(), to = teeLeague_(ss);
  var k = 'ntf:finalAt:' + c.key, at = Number(props.getProperty(k) || 0);   // when the team results are due
  if (!at) {
    // The night just ended: start the clock and set one-off timers for the 2- and 10-minute sends.
    at = Date.now() + FA_DELAY_MS_;
    props.setProperty(k, String(at));
    try {
      ScriptApp.newTrigger('notifyFinalTick').timeBased().after(FA_GAP_MS_ + 20000).create();
      ScriptApp.newTrigger('notifyFinalTick').timeBased().after(FA_DELAY_MS_ + 20000).create();
    } catch (e) { console.error(e); }
  }
  var now = Date.now(), ended = at - FA_DELAY_MS_;
  var need1 = !props.getProperty('ntf:final:' + c.key), need2 = !props.getProperty('ntf:final2:' + c.key);
  var due2 = now >= ended + FA_GAP_MS_;
  // League results right away; low net and putts 2 minutes later. Built at send time.
  if (need1 || (need2 && due2)) {
    var f = finalAlert_(ss, false, false, false);
    if (f) f.msgs.forEach(function (m) {
      if (m.flag === 'final2' && !due2) return;
      notifyOnce_(m.flag + ':' + f.key, m.heading, m.body, to);
    });
  }
  // Team results: 10 minutes after the end, built then so team fixes are included.
  if (props.getProperty('ntf:final3:' + c.key) || now < at) return;
  var tm = faTeams_();
  if (tm) notifyOnce_('final3:' + c.key, tm.heading, tm.body, to);
}

/** One-off timers set when the night ends (2 and 10 minutes); the 5-minute notifyTick is the backup. */
function notifyFinalTick(e) {
  var ss = SpreadsheetApp.getActive() || SpreadsheetApp.openById(LEAGUE_SHEET_ID);
  try { notifyFinal_(ss); } finally {
    var uid = e && e.triggerUid;
    ScriptApp.getProjectTriggers().forEach(function (tr) {
      if (tr.getHandlerFunction() === 'notifyFinalTick' && (!uid || tr.getUniqueId() === uid)) ScriptApp.deleteTrigger(tr);
    });
  }
}

/** Run from the editor to see tonight's final alert text without sending it (ignores "everyone finished"). */
function finalAlertPreview() {
  var ss = SpreadsheetApp.getActive() || SpreadsheetApp.openById(LEAGUE_SHEET_ID);
  var f = finalAlert_(ss, true, false);
  Logger.log(f ? f.msgs.map(function (m) { return '[' + m.flag + '] ' + m.heading + '\n' + m.body; }).join('\n\n')
              : 'Nothing to send (casual night, not today, or no players).');
}

/** Builds the alert. Returns null unless it should go out now (force = preview). */
function finalAlert_(ss, force, checkOnly, withTeams) {
  var t = ss.getSheetByName('Tonight');
  var top = t.getRange('B1:B7').getValues();
  if (String(top[6][0] || 'League') === 'Casual') return null;
  if (!(top[0][0] instanceof Date)) return null;
  var tz = ss.getSpreadsheetTimeZone();
  var key = Utilities.formatDate(top[0][0], tz, 'yyyy-MM-dd');
  if (!force && key !== Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd')) return null;
  var pr = apiProps_();
  if (!force && pr.getProperty('ntf:final:' + key) && pr.getProperty('ntf:final2:' + key) && pr.getProperty('ntf:final3:' + key)) return null;
  var holes = Number(top[3][0]) || 0;
  if (!holes) return null;

  // Tonight A10:AA25: name 0, putts W 22, thru X 23, gross Y 24, net Z 25, Stableford AA 26
  var rows = t.getRange('A10:AA25').getValues().filter(function (r) { return String(r[0]).trim(); });
  if (!rows.length) return null;
  var done = rows.every(function (r) { return Number(r[23]) >= holes; });
  if (!done && !force) return null;
  if (checkOnly) return { key: key };

  var P = {};
  rows.forEach(function (r) {
    P[String(r[0]).trim()] = { pts: faNum_(r[26]), net: faNum_(r[25]), putts: faNum_(r[22]), done: Number(r[23]) >= holes };
  });

  var lines = [], lines2 = [];

  // Head-to-head: tonight's Matches rows (no makeup dates), plus makeups played tonight.
  var tonightTxt = Utilities.formatDate(top[0][0], tz, 'EEE MMM d');
  var m = ss.getSheetByName('Matches').getRange('A2:F200').getDisplayValues();
  m.forEach(function (r) {
    var a = String(r[2]).trim(), b = String(r[3]).trim();
    if (!a || !b) return;
    var regularTonight = r[0] === tonightTxt && !r[4] && !r[5];
    var makeupTonight = r[4] === tonightTxt || r[5] === tonightTxt;
    if (!regularTonight && !makeupTonight) return;
    if (!P[a] || !P[b] || P[a].pts === null || P[b].pts === null) return;
    var oneWay = /one/i.test(r[1]) ? ' (one-way)' : '';
    lines.push(faMatch_(a, P[a].pts, b, P[b].pts) + oneWay);
  });

  // Low net (finished players only).
  var fin = Object.keys(P).filter(function (n) { return P[n].done && P[n].net !== null; });
  if (fin.length) {
    var low = Math.min.apply(null, fin.map(function (n) { return P[n].net; }));
    var lows = fin.filter(function (n) { return P[n].net === low; });
    lines2.push(lows.length > 1 ? faJoin_(lows) + ' tied for low net with ' + low
                               : lows[0] + ' won low net with ' + low);
  }

  // Putts, only when tracked for at least two finished players.
  var pf = fin.filter(function (n) { return P[n].putts !== null && P[n].putts > 0; });
  if (pf.length >= 2) {
    var hi = Math.max.apply(null, pf.map(function (n) { return P[n].putts; }));
    var lo = Math.min.apply(null, pf.map(function (n) { return P[n].putts; }));
    if (hi !== lo) {
      var his = pf.filter(function (n) { return P[n].putts === hi; });
      var los = pf.filter(function (n) { return P[n].putts === lo; });
      lines2.push('Fewest putts: ' + faJoin_(los) + ' (' + lo + ')');
      lines2.push('Most putts: ' + faJoin_(his) + ' (' + hi + '). ' + faPick_(FA_PUTT_, his.join()));
    }
  }

  var course = String(top[1][0] || '');
  var msgs = [];
  if (lines.length) msgs.push({ flag: 'final', heading: 'League results' + (course ? ' at ' + course : ''), body: lines.join('\n') });
  if (lines2.length) msgs.push({ flag: 'final2', heading: 'Low net and putts', body: lines2.join('\n') });
  var tm = withTeams === false ? null : faTeams_();
  if (tm) msgs.push({ flag: 'final3', heading: tm.heading, body: tm.body });
  return msgs.length ? { key: key, msgs: msgs } : null;
}

/** Team game summary from the board feed (getBoardData: teamGame + teams). */
function faTeams_() {
  boardBust_();   // the last score may have just landed: build from fresh data
  var d = getBoardData();
  var g = d.teamGame || {}, teams = (d.teams || []).filter(function (t) { return t.players; });
  if (!teams.length || !g.game) return null;
  var lowWins = String(g.scoring) === 'Net' || /vegas/i.test(String(g.game));
  var ok = teams.filter(function (t) { return t.score !== '' && t.score !== null && !isNaN(Number(t.score)); });
  var out = teams.filter(function (t) { return ok.indexOf(t) < 0; });
  ok.sort(function (a, b) { return lowWins ? a.score - b.score : b.score - a.score; });
  var who = function (t) { return t.team + ' (' + faJoin_(String(t.players).split(/\s*,\s*/)) + ')'; };
  var lines = [];
  ok.forEach(function (t, i) { lines.push((i + 1) + '. ' + who(t) + ': ' + Number(t.score)); });
  out.forEach(function (t) { lines.push(who(t) + ': no score (not enough players)'); });
  if (ok.length >= 2) {
    var w = ok[0], s = ok[1], last = ok[ok.length - 1];
    var gap = Math.abs(Number(w.score) - Number(s.score));
    lines.push(gap === 0 ? w.team + ' and ' + s.team + ' tied for first. ' + faPick_(FA_TIE_, w.team + s.team)
      : w.team + ' wins by ' + gap + '. ' + faPick_(FA_TEAMWIN_, w.team + gap));
    if (ok.length >= 3 || gap > 0) lines.push(last.team + ' brought up the rear. ' + faPick_(FA_TEAMLAST_, last.team + last.score));
  }
  return { heading: 'Team game: ' + g.game + ' (' + g.scoring + ')', body: lines.join('\n') };
}

var FA_BIG_ = ['slaughtered', 'demolished', 'took a flamethrower to', 'sent home crying', 'embarrassed'];
var FA_MID_ = ['handled', 'schooled', 'took care of business against', 'outclassed', 'had no trouble with'];
var FA_CLOSE_ = ['edged', 'squeaked past', 'nipped', 'survived', 'snuck past'];
var FA_TIE_ = ["Nobody's buying.", 'Kiss your sister.', 'Rematch pending.'];
var FA_TEAMWIN_ = ['Carried or carrying? You decide.', 'Dream team.', 'Somebody frame this.', 'Chemistry.'];
var FA_TEAMLAST_ = ["Drinks are on them.", 'Teamwork makes the dream... not work.', 'Thoughts and prayers.', 'Group text is going to be brutal.'];
var FA_PUTT_ = ['Buy a new putter.', 'The greens send their regards.', 'Lag putting is a skill, look it up.', 'Three-jack city.'];

function faMatch_(a, ap, b, bp) {
  if (ap === bp) return a + ' and ' + b + ' halved it ' + ap + '-' + bp + '. ' + faPick_(FA_TIE_, a + b);
  var w = ap > bp ? a : b, l = ap > bp ? b : a, wp = Math.max(ap, bp), lp = Math.min(ap, bp), d = wp - lp;
  var list = d >= 8 ? FA_BIG_ : d >= 4 ? FA_MID_ : FA_CLOSE_;
  return w + ' ' + faPick_(list, w + l) + ' ' + l + ' ' + wp + '-' + lp;
}

function faPick_(list, seed) {
  var h = 0, s = String(seed);
  for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 100003;
  return list[h % list.length];
}

function faJoin_(n) { return n.length < 2 ? (n[0] || '') : n.slice(0, -1).join(', ') + ' and ' + n[n.length - 1]; }

function faNum_(v) { return v === '' || v === null || isNaN(Number(v)) ? null : Number(v); }
