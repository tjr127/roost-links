
// ===================================================================
// Casual-round tee times (added Nov 13, 2026, Ty).
// When Tonight is a casual round for today (Tonight B1 = today, B7 = Casual), the tee times card is for
// that round and opens right away: everyone active (league members and guests) can pick Early / Late /
// Either / Can't play and their tees. It locks when the first score goes on Tonight (same rule as casual
// tees on the Handicaps card). Ty can still confirm, move people and change picks.
// No alerts on casual nights: no sign-up alert, no 8 AM reminder, no 3 PM auto-close, no groups alert,
// and tee time defaults from Settings are not filled in.
// Wrappers in Web.gs: teeNight_ -> teeNight0_, teeState_ -> teeState0_.
// Other edits in Web.gs: teeTimes0_, apiTee0_, apiTeeTees_, apiTeeConfirm_ use teePlayers_ instead of
// teeLeague_; teeTimes0_ uses no head-to-head pairs on casual nights; tpLeague_ uses Tonight's nine;
// notifyOpen_, notifyGroups_, teeRemind_, teeAutoClose_ and setCtx_ skip casual nights.
// ===================================================================
var TEE_CASUAL_;   // per-execution cache: undefined = not checked yet, null = no casual round today

/** Today's casual round on Tonight, shaped like teeNight0_'s league night (plus casual: true), or null. */
function teeCasual_(ss) {
  if (TEE_CASUAL_ !== undefined) return TEE_CASUAL_;
  TEE_CASUAL_ = null;
  ss = ss || SpreadsheetApp.getActive() || SpreadsheetApp.openById(LEAGUE_SHEET_ID);
  var tz = ss.getSpreadsheetTimeZone();
  var top = ss.getSheetByName('Tonight').getRange('B1:B7').getValues();
  var d = top[0][0];
  if (!(d instanceof Date) || String(top[6][0]) !== 'Casual') return null;
  var key = Utilities.formatDate(d, tz, 'yyyy-MM-dd');
  if (key !== Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd')) return null;
  var off = Utilities.formatDate(d, tz, 'Z');
  function at(hm) { return new Date(key + 'T' + hm + ':00' + off.slice(0, 3) + ':' + off.slice(3)); }
  TEE_CASUAL_ = {
    key: key, date: d, type: 'Casual', casual: true,
    course: String(top[1][0] || ''), nine: String(top[2][0] || ''),
    label: 'Casual round, ' + Utilities.formatDate(d, tz, 'EEE, MMM d'),
    opens: at('00:00'), closes: at('23:59')
  };
  return TEE_CASUAL_;
}

/** The night the tee times card is for: today's casual round if one is loaded, else the next league night. */
function teeNight_(ss) {
  return teeCasual_(ss) || teeNight0_(ss);
}

/** Casual: open until the first score goes on Tonight, then closed (Ty can still change). */
function teeState_(night) {
  if (night && night.casual) {
    if (apiProps_().getProperty('teeConf:' + night.key)) return 'confirmed';
    var ss = SpreadsheetApp.getActive() || SpreadsheetApp.openById(LEAGUE_SHEET_ID);
    return tpTeedOff_(ss) ? 'closed' : 'open';
  }
  return teeState0_(night);
}

/** Who can pick on the card: league members on league nights; every active player (guests too) on a casual round. */
function teePlayers_(ss) {
  if (!teeCasual_(ss)) return teeLeague_(ss);
  var rows = ss.getSheetByName('Players').getRange('A2:C40').getDisplayValues()
    .filter(function (r) { return r[0] && r[2] === 'TRUE'; });
  return rows.filter(function (r) { return r[1] === 'League'; }).map(function (r) { return r[0]; })
    .concat(rows.filter(function (r) { return r[1] !== 'League'; }).map(function (r) { return r[0]; }));
}
