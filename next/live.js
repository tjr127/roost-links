/*
 * Live board (Nov 23, 2026): tonight's scorecards and the Board's Individual list come from Supabase,
 * pushed to the phone the moment a score is saved (Realtime). Everything else still comes from the
 * league sheet's feed (Apps Script), which keeps its normal refresh.
 *
 * How scores get to Supabase: every save (phone, GSPro agent, old page) still goes through the sheet,
 * and the sheet mirrors Tonight to Supabase straight away (apps-script supabase-sync.gs, called from boardBust_).
 *
 * Off switches: Supabase table app_config, key live_board = false (all phones), or ?live=0 / localStorage roostLive=0
 * (one phone). If Supabase is slow or down the page just shows the sheet's numbers.
 * Test on a night that isn't today: ?livetest=1.
 */
(function () {
  var SUPA_URL = 'https://mrnoxorwnhudckkipuzj.supabase.co';
  var SUPA_KEY = 'sb_publishable_RjEOU1CRWGx2p8wyZW4z_g_-o-crpD0'; // read-only public key
  var SUPA_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
  var st = { night: null, rows: null, lastD: null, lastOk: null, client: null, chan: null, chanNight: null, timer: null, active: false };

  function qs(k) { return new RegExp('[?&]' + k + '=1').test(location.search); }
  function localOff() {
    if (/[?&]live=0/.test(location.search)) return true;
    try { return localStorage.getItem('roostLive') === '0'; } catch (e) { return false; }
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function today() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function str(v) { return v === null || v === undefined ? '' : String(v); }
  function rest(path) {
    return fetch(SUPA_URL + '/rest/v1/' + path, { headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY }, cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('supabase ' + r.status); return r.json(); });
  }
  function timeout(p, ms) {
    return Promise.race([p, new Promise(function (_, no) { setTimeout(function () { no(new Error('timeout')); }, ms); })]);
  }

  // Returns the rows for the open night, or null when the live board shouldn't be used.
  function fetchBoard() {
    return Promise.all([
      rest('app_config?key=eq.live_board&select=value'),
      rest('nights?status=eq.open&select=id,night_date&order=night_date.desc&limit=1')
    ]).then(function (a) {
      var on = !a[0].length || a[0][0].value !== false;
      st.night = a[1][0] || null;
      if (!on || !st.night) return null;
      if (st.night.night_date !== today() && !qs('livetest')) return null;
      return rest('board_scores?night_id=eq.' + st.night.id +
        '&select=name,tees,course_handicap,hole,par,stroke_index,strokes,gross,net,points,putts,penalties,mulligans&order=name,hole');
    });
  }

  // Sheet feed + Supabase rows -> the same shapes the page already draws (data.cards, data.field).
  function merge(d0, rows) {
    var d = JSON.parse(JSON.stringify(d0));
    var by = {}, order = [];
    rows.forEach(function (r) {
      if (!by[r.name]) { by[r.name] = {}; order.push(r.name); }
      by[r.name][r.hole] = r;
    });
    function hole(h, r) {
      if (!r) return h;
      var has = r.gross !== null && r.gross !== undefined;
      h.g = str(r.gross);
      h.s = str(r.strokes);
      h.n = has ? str(r.net) : '';
      h.p = has ? str(r.points) : '';
      h.pt = r.putts === null || r.putts === undefined ? '' : r.putts;
      h.m = r.mulligans || '';
      h.pen = r.penalties || '';
      return h;
    }
    var seen = {};
    d.cards = (d.cards || []).map(function (c) {
      var mine = by[c.name];
      if (!mine) return c;
      seen[c.name] = true;
      c.holes = (c.holes || []).map(function (h) { return hole(h, mine[h.hole]); });
      return c;
    });
    order.forEach(function (name) {   // on Supabase's card but not yet in the sheet's feed
      if (seen[name]) return;
      var hs = Object.keys(by[name]).map(function (k) { return by[name][k]; }).sort(function (a, b) { return a.hole - b.hole; });
      d.cards.push({
        name: name, tees: hs[0].tees, hcp: str(hs[0].course_handicap),
        holes: hs.map(function (r) { return hole({ hole: r.hole, par: str(r.par), idx: str(r.stroke_index) }, r); })
      });
    });
    d.field = order.map(function (name) {
      var hs = Object.keys(by[name]).map(function (k) { return by[name][k]; }).filter(function (r) { return r.gross !== null && r.gross !== undefined; });
      if (!hs.length) return null;
      var sum = function (k) { return hs.reduce(function (a, r) { return a + (Number(r[k]) || 0); }, 0); };
      var anyPutts = hs.some(function (r) { return r.putts !== null && r.putts !== undefined; });
      return { player: name, thru: String(hs.length), net: String(sum('net')), pts: String(sum('points')), putts: anyPutts ? String(sum('putts')) : '' };
    }).filter(Boolean);
    d.liveSource = 'supabase';
    return d;
  }

  function badge(on) {
    var el = document.getElementById('rl-live');
    if (!el) {
      var f = document.querySelector('footer');
      if (!f) return;
      f.insertAdjacentHTML('beforeend', '<div id="rl-live" class="rl-who"></div>');
      el = document.getElementById('rl-live');
    }
    el.textContent = on ? 'Live scores ⚡' : '';
  }

  // Realtime: one channel per open night; any change to its scores or players re-draws from the latest sheet feed.
  function loadLib() {
    if (window.supabase && window.supabase.createClient) return Promise.resolve();
    return new Promise(function (ok, no) {
      var s = document.createElement('script');
      s.src = SUPA_JS; s.async = true; s.onload = ok; s.onerror = no;
      document.head.appendChild(s);
    });
  }
  function subscribe() {
    if (!st.night || st.chanNight === st.night.id) return;
    loadLib().then(function () {
      if (!st.client) st.client = window.supabase.createClient(SUPA_URL, SUPA_KEY);
      if (st.chan) { st.client.removeChannel(st.chan); st.chan = null; }
      var nid = st.night.id;
      st.chanNight = nid;
      st.chan = st.client.channel('board-' + nid)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'hole_scores', filter: 'night_id=eq.' + nid }, refresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'night_players', filter: 'night_id=eq.' + nid }, refresh)
        .subscribe();
    }).catch(function () { st.chanNight = null; });
  }
  function refresh() {
    clearTimeout(st.timer);
    st.timer = setTimeout(function () {
      if (!st.lastD || !st.lastOk || document.hidden) return;
      fetchBoard().then(function (rows) {
        if (!rows) { st.active = false; badge(false); return; }
        st.rows = rows;
        st.lastOk(merge(st.lastD, rows));
      }).catch(function () {});
    }, 250);
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden && st.active) refresh(); });

  window.RLLive = {
    // Called by app.js with every sheet feed. Resolves with the feed, live-merged when the live board is on.
    apply: function (d, ok) {
      st.lastD = d; st.lastOk = ok;
      if (localOff()) { badge(false); return Promise.resolve(d); }
      return timeout(fetchBoard(), 2500).then(function (rows) {
        if (!rows) { st.active = false; badge(false); return d; }
        st.rows = rows; st.active = true; badge(true); subscribe();
        return merge(d, rows);
      }, function () { st.active = false; badge(false); return d; });
    },
    _merge: merge,
    state: function () { return { active: st.active, night: st.night, rows: st.rows ? st.rows.length : 0, channel: st.chan ? st.chan.state : null }; }
  };
})();
