// ===================================================================
// Board history (added Nov 22, 2026): pick a past night on the Board and see Head2Head, Team and Individual (basic).
// GET ?api=boardpast&night=yyyy-MM-dd -> { night, matches (same as nightly_), field: [{ player, gross, net, pts, putts }],
//                                          team: null | { game, scoring, lowWins, teams: [{ players, score }] } }
// Field comes from the Round Log (B player, AB gross, AC net, AD Stableford, AE putts).
// Team results are not kept by the sheet, so they are snapshotted to the "Team Log" tab when the 10-minute team
// alert goes out (notifyFinal_ calls teamSnapSave_ with faTeams_'s snap). Nights before Nov 26, 2026 have none.
// Run teamSnapNow() in the editor to save (or re-save) tonight's team results by hand, e.g. after fixing teams.
// Wired in apiGet_: else if (p.api === 'boardpast') out = boardPast_(p.night);
// ===================================================================
var TS_SHEET_ = 'Team Log';
var TS_HEAD_ = ['Night', 'Game', 'Scoring', 'Teams (JSON)', 'Saved'];

function teamSnapSheet_(ss) {
  var sh = ss.getSheetByName(TS_SHEET_);
  if (!sh) {
    sh = ss.insertSheet(TS_SHEET_);
    sh.getRange(1, 1, 1, TS_HEAD_.length).setValues([TS_HEAD_]).setFontWeight('bold');
    sh.getRange('A:A').setNumberFormat('@');
    sh.setFrozenRows(1);
  }
  return sh;
}

/** Save (or replace) one night's team results. snap = { game, scoring, lowWins, teams: [{ players, score }] } */
function teamSnapSave_(ss, nightKey, snap) {
  if (!snap || !nightKey) return;
  var sh = teamSnapSheet_(ss), last = sh.getLastRow(), row = 0;
  if (last > 1) sh.getRange(2, 1, last - 1, 1).getDisplayValues().forEach(function (r, i) { if (r[0] === nightKey) row = i + 2; });
  var vals = [[nightKey, snap.game || '', snap.scoring || '', JSON.stringify(snap), new Date()]];
  sh.getRange(row || last + 1, 1, 1, 5).setValues(vals);
}

function teamSnapGet_(ss, nightKey) {
  var sh = ss.getSheetByName(TS_SHEET_);
  if (!sh || sh.getLastRow() < 2) return null;
  var hit = null;
  sh.getRange(2, 1, sh.getLastRow() - 1, 4).getDisplayValues().forEach(function (r) {
    if (r[0] === nightKey) { try { hit = JSON.parse(r[3]); } catch (e) {} }
  });
  return hit;
}

/** Editor: save tonight's team results now (Tonight B1's date). */
function teamSnapNow() {
  var ss = SpreadsheetApp.getActive() || SpreadsheetApp.openById(LEAGUE_SHEET_ID);
  var d = ss.getSheetByName('Tonight').getRange('B1').getValue();
  if (!(d instanceof Date)) throw new Error('Tonight B1 has no date');
  var tm = faTeams_();
  if (!tm || !tm.snap) throw new Error('No team game on Tonight');
  var key = Utilities.formatDate(d, ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  teamSnapSave_(ss, key, tm.snap);
  Logger.log('Saved team results for ' + key + ': ' + JSON.stringify(tm.snap));
}

function boardPast_(night) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(night || ''))) return { ok: false, error: 'Pick a night.' };
  var ss = SpreadsheetApp.getActive() || SpreadsheetApp.openById(LEAGUE_SHEET_ID);
  var tz = ss.getSpreadsheetTimeZone();
  var rl = ss.getSheetByName('Round Log'), last = rl.getLastRow();
  var ts = ss.getSheetByName(TS_SHEET_), tsLast = ts ? ts.getLastRow() : 0;
  var cache = CacheService.getScriptCache(), ckey = 'bpast|' + last + '|' + tsLast + '|' + night;
  var hit = cache.get(ckey);
  if (hit) return JSON.parse(hit);

  var field = [];
  if (last > 1) rl.getRange(2, 1, last - 1, 31).getValues().forEach(function (r) {
    if (!(r[0] instanceof Date) || !r[1] || Utilities.formatDate(r[0], tz, 'yyyy-MM-dd') !== night) return;
    field.push({ player: String(r[1]), gross: r[27], net: r[28], pts: r[29], putts: r[30] });
  });
  var nl = nightly_(night);
  var out = {
    ok: true, night: night, field: field,
    matches: nl && nl.night === night ? nl.matches : [],
    team: teamSnapGet_(ss, night)
  };
  cache.put(ckey, JSON.stringify(out), 600);
  return out;
}
