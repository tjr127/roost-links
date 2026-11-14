// ===================================================================
// Stats feed (added Nov 14, 2026). Stats > Stats: Everyone (sortable, by category) and Me (one player, trends).
// One row per player per night from GSPro Log (rows with a GSPro round only; phone-only rows just hold putts).
// GSPro Log: A Night, B GSPro round, C Player, D Hole, E Gross, F Putts, G Mulligans, H Sheet, I Updated, J Penalties,
// K Fairway, L GIR, M Sand chance, N Sand save, O Drive (yd), P Par, Q Putts by, R Shots (JSON, from Nov 14 agent).
// Shots = the strokes that count (mulligans left out), in order: [startLie, startYd, endLie, endYd, penaltyStrokes]
//   lies: T tee, F fairway (incl. GSPro semi rough, as ShotLink groups intermediate rough with fairway), R rough,
//   S sand, G green, X recovery/other, H holed (end only). Distances are yards to the pin.
// Scrambling (TheGrint / PGA): missed the green in regulation, still made par or better. Works from Nov 12 on.
// Approach (PGA Tour definitions as close as GSPro allows): a shot that starts more than 30 yards from the green's
//   edge (here: more than 40 yards from the pin, since GSPro doesn't give the green's edge) and isn't a tee shot on a
//   par 4 or 5, and finishes on the green, around it (within 40 yards of the pin) or in the hole.
//   Approach distance = yards to the pin before the shot; proximity = feet to the pin after it (0 if holed).
// Strokes gained vs PGA Tour (Broadie's ShotLink baseline, Interfaces 2012 Table B.1; putting = PGA TOUR 2010 baseline):
//   SG = expected strokes before - expected after - 1 - penalty strokes. Categories: OTT (tee shots on par 4/5),
//   APP (other shots from more than 40 yd), ARG (40 yd or less, off the green), PUTT (from the green).
// Feed: getBoardData (perf.gs) adds d.statFeed = statsFeed_() (cached with the board).
// ===================================================================
var SG_D_ = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 120, 140, 160, 180, 200, 220, 240, 260, 280, 300, 320, 340, 360, 380, 400, 420, 440, 460, 480, 500, 520, 540, 560, 580, 600];
var SG_BASE_ = {
  // Tee: Broadie lists tee values from 100 yards; shorter tee shots use the fairway values.
  T: [2.18, 2.40, 2.52, 2.60, 2.66, 2.70, 2.72, 2.75, 2.77, 2.92, 2.99, 2.97, 2.99, 3.05, 3.12, 3.17, 3.25, 3.45, 3.65, 3.71, 3.79, 3.86, 3.92, 3.96, 3.99, 4.02, 4.08, 4.17, 4.28, 4.41, 4.54, 4.65, 4.74, 4.79, 4.82],
  F: [2.18, 2.40, 2.52, 2.60, 2.66, 2.70, 2.72, 2.75, 2.77, 2.80, 2.85, 2.91, 2.98, 3.08, 3.19, 3.32, 3.45, 3.58, 3.69, 3.78, 3.84, 3.88, 3.95, 4.03, 4.11, 4.19, 4.27, 4.34, 4.42, 4.50, 4.58, 4.66, 4.74, 4.82, 4.89],
  R: [2.34, 2.59, 2.70, 2.78, 2.87, 2.91, 2.93, 2.96, 2.99, 3.02, 3.08, 3.15, 3.23, 3.31, 3.42, 3.53, 3.64, 3.74, 3.83, 3.90, 3.95, 4.02, 4.11, 4.21, 4.30, 4.40, 4.49, 4.58, 4.68, 4.77, 4.87, 4.96, 5.06, 5.15, 5.25],
  S: [2.43, 2.53, 2.66, 2.82, 2.92, 3.15, 3.21, 3.24, 3.24, 3.23, 3.21, 3.22, 3.28, 3.40, 3.55, 3.70, 3.84, 3.93, 4.00, 4.04, 4.12, 4.26, 4.41, 4.55, 4.69, 4.83, 4.97, 5.11, 5.25, 5.40, 5.54, 5.68, 5.82, 5.96, 6.10],
  X: [3.45, 3.51, 3.57, 3.71, 3.79, 3.83, 3.84, 3.84, 3.82, 3.80, 3.78, 3.80, 3.81, 3.82, 3.87, 3.92, 3.97, 4.03, 4.10, 4.20, 4.31, 4.44, 4.56, 4.66, 4.75, 4.84, 4.94, 5.03, 5.13, 5.22, 5.32, 5.41, 5.51, 5.60, 5.70]
};
// Inside 10 yards off the green (not in the published table): eased toward a long putt (2.0 at the pin).
var SG_NEAR0_ = { T: 2.0, F: 2.0, R: 2.1, S: 2.2, X: 3.3 };
// Putting (feet): PGA TOUR 2010 strokes-gained putting baseline; 90 and 120 ft extended along the same curve.
var SG_PUTT_FT_ = [1, 3, 5, 7, 10, 12, 15, 20, 25, 30, 40, 50, 60, 90, 120];
var SG_PUTT_ = [1.001, 1.046, 1.245, 1.440, 1.625, 1.701, 1.784, 1.874, 1.931, 1.977, 2.058, 2.138, 2.214, 2.40, 2.55];
var STAT_ARG_YD_ = 40;   // "around the green" = within 30 yards of the green's edge, taken as 40 yards from the pin

function sgInterp_(xs, ys, x) {
  if (x <= xs[0]) return ys[0];
  for (var i = 1; i < xs.length; i++) if (x <= xs[i]) return ys[i - 1] + (ys[i] - ys[i - 1]) * (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
  var n = xs.length - 1;
  return ys[n] + (ys[n] - ys[n - 1]) * (x - xs[n]) / (xs[n] - xs[n - 1]);
}
function sgExpected_(lie, yd) {
  if (lie === 'H') return 0;
  if (lie === 'G') return sgInterp_(SG_PUTT_FT_, SG_PUTT_, Math.max(0, yd * 3));
  var t = SG_BASE_[lie] || SG_BASE_.X;
  if (yd < 10) return SG_NEAR0_[lie] + (t[0] - SG_NEAR0_[lie]) * Math.max(0, yd) / 10;
  return sgInterp_(SG_D_, t, yd);
}
// One hole's shots -> approach list and strokes gained by category.
function statHole_(shots, par) {
  var out = { ap: [], sg: { ott: 0, app: 0, arg: 0, putt: 0 } };
  shots.forEach(function (s, i) {
    var sl = String(s[0]), sd = Number(s[1]) || 0, el = String(s[2]), ed = Number(s[3]) || 0, pen = Number(s[4]) || 0;
    var cat = sl === 'G' ? 'putt' : (i === 0 && par >= 4) ? 'ott' : sd > STAT_ARG_YD_ ? 'app' : 'arg';
    out.sg[cat] += sgExpected_(sl, sd) - sgExpected_(el, ed) - 1 - pen;
    if (cat === 'app' && (el === 'H' || el === 'G' || ed <= STAT_ARG_YD_)) out.ap.push([sd, el === 'H' ? 0 : ed * 3]);
  });
  return out;
}

function statsFeed_() {
  var ss = SpreadsheetApp.getActive() || SpreadsheetApp.openById(LEAGUE_SHEET_ID);
  var tz = ss.getSpreadsheetTimeZone();
  var sh = ss.getSheetByName('GSPro Log');
  if (!sh || sh.getLastRow() < 2) return { nights: [], rows: [] };
  var w = Math.min(sh.getLastColumn(), 18);
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, w).getValues();
  function num(v) { var n = Number(v); return isNaN(n) ? 0 : n; }
  function yes(v) { return v === true || String(v).toUpperCase() === 'TRUE' || v === 1 || v === '1'; }
  function nk(v) { var d = v instanceof Date ? v : new Date(String(v)); return isNaN(d) ? String(v) : Utilities.formatDate(d, tz, 'yyyy-MM-dd'); }
  var by = {}, nights = {};
  vals.forEach(function (r) {
    var player = String(r[2] || ''), round = String(r[1] || '');
    if (!player || !round) return;
    var night = nk(r[0]);
    nights[night] = true;
    var k = player + '|' + night;
    var a = by[k] || (by[k] = { p: player, n: night, holes: 0, fw: 0, fwn: 0, gir: 0, sandC: 0, sandS: 0, drSum: 0, drN: 0, ld: 0,
      pen: 0, mull: 0, putts: 0, three: 0, scrC: 0, scrS: 0, gross: 0, par: 0, apN: 0, apYd: 0, apFt: 0, sgH: 0, ott: 0, app: 0, arg: 0, putt: 0 });
    var par = num(r[15]), gross = num(r[4]), putts = num(r[5]);
    a.holes++; a.gross += gross; a.par += par;
    if (par >= 4) { a.fwn++; if (yes(r[10])) a.fw++; }
    var gir = yes(r[11]);
    if (gir) a.gir++;
    else if (gross && par) { a.scrC++; if (gross <= par) a.scrS++; }
    a.sandC += num(r[12]); a.sandS += num(r[13]);
    var d = r[14] === '' || r[14] === null ? 0 : Number(r[14]);
    if (d > 0) { a.drSum += d; a.drN++; if (d > a.ld) a.ld = d; }
    a.pen += num(r[9]); a.mull += num(r[6]);
    a.putts += putts; if (putts >= 3) a.three++;
    var shots = null;
    if (w >= 18 && r[17]) { try { shots = JSON.parse(String(r[17])); } catch (e) { shots = null; } }
    if (shots && shots.length) {
      var hs = statHole_(shots, par);
      a.sgH++; a.ott += hs.sg.ott; a.app += hs.sg.app; a.arg += hs.sg.arg; a.putt += hs.sg.putt;
      hs.ap.forEach(function (x) { a.apN++; a.apYd += x[0]; a.apFt += x[1]; });
    }
  });
  var r2 = function (x) { return Math.round(x * 100) / 100; };
  var cols = ['p', 'n', 'holes', 'fw', 'fwn', 'gir', 'sandC', 'sandS', 'drSum', 'drN', 'ld', 'pen', 'mull', 'putts', 'three', 'scrC', 'scrS', 'gross', 'par', 'apN', 'apYd', 'apFt', 'sgH', 'ott', 'app', 'arg', 'putt'];
  var rows = Object.keys(by).map(function (k) {
    var a = by[k];
    return cols.map(function (c) { var v = a[c]; return typeof v === 'number' ? r2(v) : v; });
  });
  var keys = Object.keys(nights).sort();
  var labels = {};
  keys.forEach(function (k) { var d = new Date(k + 'T12:00:00'); labels[k] = isNaN(d) ? k : Utilities.formatDate(d, tz, 'MMM d'); });
  var t = ss.getSheetByName('Tonight').getRange('B1').getValue();
  return { cols: cols, rows: rows, nights: keys, labels: labels, tonight: t ? nk(t) : '' };
}
