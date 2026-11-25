// ===================================================================
// Cursed putts: push alert to everyone on a 4-putt or 5-putt — written Nov 24, 2026.
// NOT LIVE YET. Goes in with the rest of the cursed-putts work on the sim PC (see project doc cursed-putts.md).
// The Golf Score Agent sends `cursed` (4 or 5) and `firstPuttFt` on a hole; agentSave_ calls
// notifyCursed_ once the hole is saved. Every league member gets it, plus anyone on Tonight's card (guests).
// Casual nights too (Ty: "notification to everyone if anyone 4 putts or 5 putts").
// Sent once per night + player + hole, so the agent's repeat posts never re-send it.
// ===================================================================

/** Call from agentSave_ after a hole with h.cursed is saved. night = Tonight B1 key (yyyy-MM-dd). */
function notifyCursed_(ss, night, h, sheetName) {
  var n = Number(h.cursed);
  if (n !== 4 && n !== 5) return false;
  var who = sheetName || h.player;
  var ft = Math.round(Number(h.firstPuttFt) || 0);
  var from = ft > 0 ? ' from ' + ft + (ft === 1 ? ' foot' : ' feet') : '';
  var heading, msg;
  if (n === 5) {
    heading = '🚨💀 FIVE-PUTT ALERT 💀🚨';
    msg = who + ' just FIVE-PUTTED hole ' + h.hole + from + '. GSPro says 3. The golf gods say 5. Make a ' + h.gross + '. Someone check on him.';
  } else {
    heading = '💀 4-PUTT ALERT 💀';
    msg = who + ' just four-putted hole ' + h.hole + from + '. Screen says 3-putt. Reality says 4. That\'s a ' + h.gross + '.';
  }
  return notifyOnce_('cursed:' + night + ':' + who + ':' + h.hole, heading, msg, cursedRecipients_(ss));
}

/** League members + everyone on Tonight's card (guests included), no duplicates. */
function cursedRecipients_(ss) {
  var names = [].concat(teeLeague_(ss) || []);
  var rows = ss.getSheetByName('Tonight').getRange('A10:A25').getValues();
  rows.forEach(function (r) { if (r[0]) names.push(String(r[0])); });
  return names.filter(function (v, i, a) { return v && a.indexOf(v) === i; });
}

/** Editor test: sends a fake 4-putt alert to Ty only. */
function notifyCursedTest() {
  Logger.log(notify_('💀 4-PUTT ALERT 💀 (test)', 'Ty just four-putted hole 7 from 38 feet. Screen says 3-putt. Reality says 4. That\'s a 7.', ['Ty']));
}
