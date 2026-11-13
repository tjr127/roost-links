// ===================================================================
// Season stats (added Nov 13, 2026): Stats > Stats shows a "Season stats" card under "Tonight's stats".
// Built from every GSPro Log row the agent wrote (rows with a GSPro round; phone-only rows just hold putts).
// GSPro Log columns: A Night, B GSPro round, C Player, D Hole, E Gross, F Putts, G Mulligans, H Sheet, I Updated,
// J Penalties, K Fairway, L GIR, M Sand chance, N Sand save, O Drive (yd), P Par, Q Putts by.
// Per player: FW % (fairways / par-4-and-5 holes), GIR % (greens / holes), Sand % (saves / chances),
// average drive and longest drive (fairway drives only, as GSPro Log records them), penalties and mulligans totals.
// Wiring: getBoardData (perf.gs) adds d.seasonStats = seasonStats_() (cached with the board).
// ===================================================================
function seasonStats_() {
  var ss = SpreadsheetApp.getActive() || SpreadsheetApp.openById(LEAGUE_SHEET_ID);
  var sh = ss.getSheetByName('GSPro Log');
  if (!sh || sh.getLastRow() < 2) return { players: [], longest: '' };
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, 17).getValues();
  var by = {}, nights = {};
  function num(v) { var n = Number(v); return isNaN(n) ? 0 : n; }
  function yes(v) { return v === true || String(v).toUpperCase() === 'TRUE' || v === 1 || v === '1'; }
  vals.forEach(function (r) {
    var player = String(r[2] || ''), round = String(r[1] || '');
    if (!player || !round) return;
    var p = by[player] || (by[player] = { player: player, holes: 0, fw: 0, fwn: 0, gir: 0, sandS: 0, sandC: 0, drSum: 0, drN: 0, ld: '', pen: 0, mull: 0, nights: {} });
    var par = num(r[15]);
    p.holes++;
    p.nights[String(r[0])] = true;
    if (par >= 4) { p.fwn++; if (yes(r[10])) p.fw++; }
    if (yes(r[11])) p.gir++;
    p.sandC += num(r[12]); p.sandS += num(r[13]);
    var d = r[14] === '' || r[14] === null ? null : Number(r[14]);
    if (d !== null && !isNaN(d) && d > 0) { p.drSum += d; p.drN++; if (p.ld === '' || d > p.ld) p.ld = d; }
    p.pen += num(r[9]); p.mull += num(r[6]);
  });
  var longest = '';
  var players = Object.keys(by).map(function (k) {
    var p = by[k];
    if (p.ld !== '' && (longest === '' || p.ld > longest)) longest = p.ld;
    return {
      player: p.player, holes: p.holes, rounds: Object.keys(p.nights).length,
      fw: p.fw, fwn: p.fwn, gir: p.gir, sandS: p.sandS, sandC: p.sandC,
      drAvg: p.drN ? Math.round(p.drSum / p.drN * 10) / 10 : '', drN: p.drN,
      ld: p.ld === '' ? '' : Math.round(p.ld * 10) / 10, pen: p.pen, mull: p.mull
    };
  });
  players.sort(function (a, b) { return b.holes - a.holes || (a.player < b.player ? -1 : 1); });
  return { players: players, longest: longest === '' ? '' : Math.round(longest * 10) / 10 };
}
