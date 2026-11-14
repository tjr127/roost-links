// Find/replace edits to apply to the live Web.gs (each find must match exactly 'count' times), then append casual-tees.gs.
// Format: [find, replace, count]. Applied and checked against the reference copies on Nov 13.
module.exports = [
 ['function teeNight_(ss) {', 'function teeNight0_(ss) {', 1],
 ['function teeState_(night) {', 'function teeState0_(night) {', 1],
 ['  var league = teeLeague_(ss);\n  var rows = teeRows_(ss, night.key);', '  var league = teePlayers_(ss);\n  var rows = teeRows_(ss, night.key);', 1],
 ['var pairs = teePairs_(ss, night.key).filter', 'var pairs = (night.casual ? [] : teePairs_(ss, night.key)).filter', 1],
 ["if (teeLeague_(ss).indexOf(name) < 0) return { ok: false, error: name + ' is not a league member.' };", "if (teePlayers_(ss).indexOf(name) < 0) return { ok: false, error: name + ' is not a league member.' };", 2],
 ["Refresh and try again.' };\n  var league = teeLeague_(ss);", "Refresh and try again.' };\n  var league = teePlayers_(ss);", 1],
 ['if (t) { try { t.tees = tpLeague_(ss); }', 'if (t) { t.casual = !!teeCasual_(ss); try { t.tees = tpLeague_(ss); }', 1],
 ['function notifyGroups_(ss, night, early, late) {\n  var tees = teeTeesFor_(ss, night.key);', 'function notifyGroups_(ss, night, early, late) {\n  if ((night && night.casual) || teeCasual_(ss)) return;   // no alerts for casual rounds\n  var tees = teeTeesFor_(ss, night.key);', 1],
 ['  var night = teeNight_(ss);\n  if (!night) return;\n  var now = new Date();', '  var night = teeNight_(ss);\n  if (!night || night.casual) return;\n  var now = new Date();', 3],
 ["if (!night || teeState_(night) !== 'open') return null;", "if (!night || night.casual || teeState_(night) !== 'open') return null;", 1],
 ["var tz = ss.getSpreadsheetTimeZone(), nine = '';\n  ss.getSheetByName('Season')", "var tz = ss.getSpreadsheetTimeZone(), nine = n.casual ? n.nine : '';\n  if (!n.casual) ss.getSheetByName('Season')", 1],
];
