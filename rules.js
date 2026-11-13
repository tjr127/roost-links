/*
 * Team game rules (Nov 13, 2026). Plain-language explanations for every game on the Team Game tab,
 * shown when a player taps "Rules ›" on the game card (Board > Team).
 * window.gameRules(game, scoring, minPlayers, counted) returns HTML.
 * Matches the sheet's math: Team Game tab, rows 7-41, and Team Game Y:AA.
 */
(function () {
  function e(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // What one player's number on a hole is, by scoring type.
  var SCORING = {
    Net: 'Each player\'s number on a hole is their <b>net score</b>: gross minus any handicap strokes they get on that hole.',
    Stableford: 'Each player\'s number on a hole is their <b>Stableford points</b>: net double bogey or worse 0, net bogey 1, net par 2, net birdie 3, net eagle 4, net double eagle 5.'
  };

  // Each game: summary (one line), how (team score on a hole), example, and optional extra notes.
  var GAMES = {
    'Min': {
      sum: 'Best ball: only the team\'s lowest number on each hole counts.',
      how: 'On every hole, take the <b>lowest</b> number on the team. That\'s the team\'s score for the hole. Everyone else is off the hook.',
      ex: { Net: 'Net 4, 5 and 6 → team scores <b>4</b>.', Stableford: 'Points 3, 2 and 0 → team scores <b>0</b>. (In Stableford, Min really means the lowest points, so the weakest score counts. It\'s a "nobody gets carried" game.)' }
    },
    'Max': {
      sum: 'Only the team\'s highest number on each hole counts.',
      how: 'On every hole, take the <b>highest</b> number on the team.',
      ex: { Net: 'Net 4, 5 and 6 → team scores <b>6</b>. (In Net, that\'s the worst ball, so everyone has to show up.)', Stableford: 'Points 3, 2 and 0 → team scores <b>3</b>. (In Stableford, that\'s the best ball.)' }
    },
    'Sum': {
      sum: 'Every player\'s number counts, added together.',
      how: 'On every hole, <b>add up</b> everyone\'s number.',
      ex: { Net: 'Net 4, 5 and 6 → team scores <b>15</b>.', Stableford: 'Points 3, 2 and 0 → team scores <b>5</b>.' },
      note: 'Bigger teams pile up bigger numbers, so Sum is fairest when every team has the same number of players.'
    },
    'Avg': {
      sum: 'The team\'s average number on each hole.',
      how: 'On every hole, <b>average</b> everyone\'s number.',
      ex: { Net: 'Net 4, 5 and 6 → team scores <b>5</b>.', Stableford: 'Points 3, 2 and 0 → team scores <b>1.7</b>.' },
      note: 'Averaging keeps it fair when teams have different numbers of players.'
    },
    'Alt-Min-Max': {
      sum: 'Low ball on even holes, high ball on odd holes.',
      how: 'On <b>even</b> holes (10, 12, 14…) the team takes its <b>lowest</b> number. On <b>odd</b> holes (11, 13, 15…) it takes its <b>highest</b>.',
      ex: { Net: 'Hole 12, net 4 and 6 → <b>4</b>. Hole 13, net 4 and 6 → <b>6</b>.', Stableford: 'Hole 12, points 3 and 1 → <b>1</b>. Hole 13, points 3 and 1 → <b>3</b>.' },
      note: 'The hole-by-hole view tags each hole "Low" or "High" so you know which one counts.'
    },
    'Min-Max': {
      sum: 'High ball on even holes, low ball on odd holes (the flip side of Alt-Min-Max).',
      how: 'On <b>even</b> holes the team takes its <b>highest</b> number. On <b>odd</b> holes it takes its <b>lowest</b>.',
      ex: { Net: 'Hole 12, net 4 and 6 → <b>6</b>. Hole 13, net 4 and 6 → <b>4</b>.', Stableford: 'Hole 12, points 3 and 1 → <b>3</b>. Hole 13, points 3 and 1 → <b>1</b>.' },
      note: 'The hole-by-hole view tags each hole "Low" or "High".'
    },
    'Vegas': {
      sum: 'Two numbers become one: low score in front, high score behind.',
      how: 'On every hole, put the team\'s <b>lowest</b> number in front and its <b>highest</b> number behind it to make one number (low × 10 + high).',
      ex: { Net: 'Net 4 and 5 → <b>45</b>. Net 4 and 10 → <b>50</b> (4 × 10 + 10). One blow-up hole hurts.', Stableford: 'Points 1 and 3 → <b>13</b>.' },
      lowAlways: true,
      note: 'With more than two players, only the lowest and highest count. The middle scores are free.'
    },
    'Reverse Vegas': {
      sum: 'Vegas backwards: high score in front, low score behind.',
      how: 'On every hole, put the team\'s <b>highest</b> number in front and its <b>lowest</b> behind it (high × 10 + low).',
      ex: { Net: 'Net 4 and 5 → <b>54</b>. Net 4 and 7 → <b>74</b>. Your worst score sets the tens digit, so keep the big numbers off the card.', Stableford: 'Points 1 and 3 → <b>31</b>.' },
      lowAlways: true
    },
    '3 Man Vegas': {
      sum: 'Vegas with three numbers: a three-digit team score.',
      how: 'On every hole, line up three numbers: the team\'s <b>lowest</b>, then its <b>second-highest</b>, then its <b>highest</b> (low × 100 + second-highest × 10 + high).',
      ex: { Net: 'Net 4, 5 and 6 → <b>456</b>. Net 4, 5 and 9 → <b>459</b>.', Stableford: 'Points 0, 2 and 3 → <b>23</b> (023).' },
      lowAlways: true,
      note: 'With four players, the second-lowest score doesn\'t count (it\'s greyed out in the hole-by-hole view).'
    },
    'Vegas Bird Flip': {
      sum: 'Vegas, plus a twist: a team birdie flips everyone else\'s number.',
      how: 'Score it like Vegas: low × 10 + high on every hole. Then the twist: if <b>every player on a team</b> makes a net birdie on a hole, <b>every other team\'s number flips</b> to high-first on that hole.',
      ex: { Net: 'You have net 4 and 6 (46). Another team both make net birdie, so your 46 becomes <b>64</b>. Ouch.', Stableford: 'A team birdie means everyone on the team scored 3+ points. Your 13 becomes <b>31</b>.' },
      lowAlways: true,
      note: 'A team that made the team birdie itself is never flipped, even if another team also made one. The hole-by-hole view tags "🐦 Birdie" and "Flipped".'
    }
  };

  window.gameRules = function (game, scoring, minPlayers, counted) {
    var g = GAMES[game];
    if (!g) return '<p>No write-up for this game yet.</p>';
    var sc = scoring === 'Stableford' ? 'Stableford' : 'Net';
    var lowWins = sc === 'Net' || g.lowAlways;
    var min = Number(minPlayers) || 1;
    var html = '<p class="glead">' + e(g.sum) + '</p>' +
      '<h4>Each hole</h4><p>' + SCORING[sc] + '</p><p>' + g.how + '</p>' +
      '<h4>Example</h4><p>' + (g.ex[sc] || g.ex.Net) + '</p>' +
      (g.note ? '<p>' + g.note + '</p>' : '') +
      '<h4>Winning</h4><p>Add up the team\'s hole scores. <b>' + (lowWins ? 'Lowest' : 'Highest') + ' total wins</b>' +
      (g.lowAlways && sc === 'Stableford' ? ' (every Vegas game is low-wins, even with Stableford points)' : '') + '.</p>' +
      '<h4>Fine print</h4><ul>' +
      '<li>A team\'s hole score shows up once <b>everyone</b> on the team has finished that hole.</li>' +
      (min > 1 ? '<li>Teams need at least <b>' + min + ' players</b>. A short-handed team gets no score until Ty adds someone.</li>' : '') +
      (counted && counted !== 'Total' ? '<li>Tonight only <b>' + e(counted.toLowerCase()) + '</b> count (teams get reshuffled every 6 holes).</li>' : '') +
      '<li>Handicap strokes come from each player\'s course handicap for tonight\'s nine, same as the match play.</li>' +
      '</ul>';
    return html;
  };
})();
