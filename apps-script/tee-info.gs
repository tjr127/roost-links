
// ===================================================================
// Tonight's tees (added Nov 11, 2026): tee color and yards for Tips / Long / Medium / Short (tonight's nine; holes = 18 hole yardages from Hole Yards, Nov 12),
// from the Courses tab row Tonight B6 points at. Colors come from the Notes column ("Long = White").
// ===================================================================
function teeInfo_(ss) {
  var t = ss.getSheetByName('Tonight');
  var row = Number(t.getRange('B6').getValue()) || 0;
  if (!row) return null;
  var nine = t.getRange('B3').getDisplayValue();
  var cs = ss.getSheetByName('Courses');
  var head = cs.getRange(1, 1, 1, cs.getLastColumn()).getDisplayValues()[0];
  var vals = cs.getRange(row, 1, 1, head.length).getDisplayValues()[0];
  var notes = vals[head.indexOf('Notes')] || '';
  var hy = tpHoleYards_(ss, vals[0]);
  var from = nine === 'Back' ? 9 : 0, to = nine === 'Front' ? 9 : 18;
  var tees = TP_TEES_.map(function (tee) {
    var y = vals[head.indexOf(tee + ' yards')];
    var m = notes.match(new RegExp(tee + '\\s*=\\s*([A-Za-z]+)'));
    var h = hy[tee], total = y ? Number(String(y).replace(/,/g, '')) || '' : '';
    var part = '';
    if (h) { part = 0; for (var i = from; i < to; i++) part += Number(h.yards[i]) || 0; }
    return { tee: tee, yards: part !== '' ? part : total, total: total, color: (h && h.color) || (m ? m[1] : ''), holes: h ? h.yards : null };
  }).filter(function (x) { return x.yards || x.color; });
  return { course: vals[0], nine: nine, tees: tees };
}
