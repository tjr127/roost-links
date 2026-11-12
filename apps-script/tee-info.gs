
// ===================================================================
// Tonight's tees (added Nov 11, 2026): tee color and 18-hole yards for Long / Medium / Short,
// from the Courses tab row Tonight B6 points at. Colors come from the Notes column ("Long = White").
// ===================================================================
function teeInfo_(ss) {
  var row = Number(ss.getSheetByName('Tonight').getRange('B6').getValue()) || 0;
  if (!row) return null;
  var cs = ss.getSheetByName('Courses');
  var head = cs.getRange(1, 1, 1, cs.getLastColumn()).getDisplayValues()[0];
  var vals = cs.getRange(row, 1, 1, head.length).getDisplayValues()[0];
  var notes = vals[head.indexOf('Notes')] || '';
  var tees = ['Long', 'Medium', 'Short'].map(function (t) {
    var y = vals[head.indexOf(t + ' yards')];
    var m = notes.match(new RegExp(t + '\\s*=\\s*([A-Za-z]+)'));
    return { tee: t, yards: y ? Number(String(y).replace(/,/g, '')) || '' : '', color: m ? m[1] : '' };
  });
  return { course: vals[0], tees: tees };
}
