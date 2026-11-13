// ===================================================================
// Past rounds (added Nov 13, 2026): scorecards for earlier nights, rebuilt from the Round Log.
// GET ?api=rounds            -> { nights: [{ night, label, course, nine, type, players }] } newest first
// GET ?api=rounds&night=yyyy-MM-dd -> { night, label, course, nine, cards: [ same shape as getBoardData cards ] }
// Strokes use the same rule as Tonight rows 29-45 (course hcp spread by stroke order within the round's holes),
// net = gross - strokes, Stableford from Settings B5:C10. Putts, penalties and mulligans per hole come from
// GSPro Log rows for that night (Night = "Thu Nov 12, 2026", the Tonight B1 text).
// Checked Nov 13 against every posted round (Nov 5, Nov 12): per-hole net and Stableford add up to the Round Log totals.
// Wired in apiGet_: else if (p.api === 'rounds') out = pastRounds_(p.night);
// ===================================================================
function pastRounds_(night) {
  var ss = SpreadsheetApp.getActive() || SpreadsheetApp.openById(LEAGUE_SHEET_ID);
  var rl = ss.getSheetByName('Round Log');
  var last = rl.getLastRow();
  var cache = CacheService.getScriptCache();
  var key = 'past|' + last + '|' + (night || 'list');
  var hit = cache.get(key);
  if (hit) return JSON.parse(hit);

  var tz = ss.getSpreadsheetTimeZone();
  var rows = last > 1 ? rl.getRange(2, 1, last - 1, 36).getValues() : [];
  var byNight = {}, order = [];
  rows.forEach(function (r) {
    if (!(r[0] instanceof Date) || !r[1]) return;          // imported rows have no date
    var k = Utilities.formatDate(r[0], tz, 'yyyy-MM-dd');
    if (!byNight[k]) { byNight[k] = { date: r[0], rows: [] }; order.push(k); }
    byNight[k].rows.push(r);
  });
  order.sort().reverse();

  function label(k) {
    var f = byNight[k].rows[0];
    var nine = String(f[4] || ''), type = String(f[2] || '');
    return Utilities.formatDate(byNight[k].date, tz, 'EEE MMM d') + ' · ' + f[3] +
      (nine === 'Front' || nine === 'Back' ? ' ' + nine + ' 9' : '') + (type === 'Casual' ? ' (casual)' : '');
  }

  var out;
  if (!night) {
    out = { ok: true, nights: order.map(function (k) {
      var f = byNight[k].rows[0];
      return { night: k, label: label(k), course: String(f[3]), nine: String(f[4]), type: String(f[2]),
               players: byNight[k].rows.map(function (r) { return String(r[1]); }) };
    }) };
  } else {
    var nt = byNight[night];
    if (!nt) return { ok: false, error: 'No posted round on ' + night };
    var f0 = nt.rows[0], course = String(f0[3]), nine = String(f0[4]);
    var cs = ss.getSheetByName('Courses');
    var cnames = cs.getRange(1, 1, cs.getLastRow(), 1).getDisplayValues().map(function (x) { return x[0]; });
    var crow = cnames.indexOf(course) + 1;
    var cv = crow ? cs.getRange(crow, 1, 1, 37).getValues()[0] : [];
    var par = cv.slice(1, 19), idx = cv.slice(19, 37);
    var holes = nine === 'Back' ? [10, 11, 12, 13, 14, 15, 16, 17, 18] : nine === 'Front' ? [1, 2, 3, 4, 5, 6, 7, 8, 9]
              : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
    var nh = holes.length;
    // stroke order = rank of the hole's index among the round's holes (Tonight row 8)
    var rank = {};
    holes.forEach(function (h) {
      var c = 0; holes.forEach(function (o) { if (Number(idx[o - 1]) <= Number(idx[h - 1])) c++; });
      rank[h] = c;
    });
    var pts = ss.getSheetByName('Settings').getRange('B5:C10').getValues();
    var minD = Number(pts[0][0]), maxD = Number(pts[pts.length - 1][0]);
    function stbf(d) {
      d = Math.max(minD, Math.min(maxD, d));
      for (var i = 0; i < pts.length; i++) if (Number(pts[i][0]) === d) return Number(pts[i][1]);
      return '';
    }
    // GSPro Log extras for that night
    var nightText = Utilities.formatDate(nt.date, tz, 'EEE MMM d, yyyy');
    var gl = ss.getSheetByName('GSPro Log'), extra = {};
    if (gl && gl.getLastRow() > 1) {
      gl.getRange(2, 1, gl.getLastRow() - 1, 10).getDisplayValues().forEach(function (r) {
        if (r[0] !== nightText) return;
        extra[r[2].toLowerCase() + '|' + r[3]] = { pt: r[5], m: r[6], pen: r[9] };
      });
    }
    var hy = tpHoleYards_(ss, course);
    var cards = nt.rows.map(function (r) {
      var name = String(r[1]), tees = String(r[6] || ''), ch = r[8] === '' ? '' : Number(r[8]);
      // Week 1 (Nov 5) stored the 18-hole course hcp for a 9-hole round. When every hole has a score,
      // the strokes actually used are gross - net, so spread those instead.
      var full = holes.every(function (h) { return r[8 + h] !== ''; });
      if (full && r[27] !== '' && r[28] !== '') ch = Number(r[27]) - Number(r[28]);
      var t = hy[tees];
      var tee = t ? { tee: tees, color: t.color, holes: t.yards,
                      yards: holes.reduce(function (a, h) { return a + (Number(t.yards[h - 1]) || 0); }, 0) } : null;
      return {
        name: name, tees: tees, hcp: ch, tee: tee,
        puttsTotal: r[30] === '' ? '' : r[30],
        gross: r[27], net: r[28], points: r[29],
        holes: holes.map(function (h) {
          var g = r[8 + h], p = par[h - 1];
          var s = ch === '' ? '' : Math.floor(ch / nh) + (rank[h] <= (((ch % nh) + nh) % nh) ? 1 : 0);
          var nv = g === '' || s === '' ? '' : Number(g) - s;
          var x = extra[name.toLowerCase() + '|' + h] || {};
          return { hole: h, par: p, idx: idx[h - 1], g: g, s: s, n: nv,
                   p: nv === '' || p === '' ? '' : stbf(nv - Number(p)),
                   pt: x.pt == null ? '' : x.pt, m: x.m || '', pen: x.pen || '' };
        })
      };
    });
    out = { ok: true, night: night, label: label(night), course: course, nine: nine, type: String(f0[2]), cards: cards };
  }
  try { cache.put(key, JSON.stringify(out), 600); } catch (e) {}
  return out;
}
