/*
 * ‹ › arrows (and left/right swipes) to flip through players on Scorecards and Handicaps,
 * like the team detail view. Works on the existing player dropdowns, so the shared "me" pick follows along.
 */
(function () {
  function names(sel) { return Array.prototype.filter.call(sel.options, function (o) { return o.value !== ''; }).map(function (o) { return o.value; }); }
  function step(id, dir) {
    var sel = document.getElementById(id);
    var list = names(sel);
    if (!list.length) return;
    var i = list.indexOf(sel.value);
    var next = i < 0 ? (dir > 0 ? 0 : list.length - 1) : (i + dir + list.length) % list.length;
    sel.value = list[next];
    sel.dispatchEvent(new Event('change'));
    update(id);
  }
  function update(id) {
    var sel = document.getElementById(id), box = document.getElementById(id + '-flip');
    if (!sel || !box) return;
    var list = names(sel), i = list.indexOf(sel.value);
    box.querySelector('.flip-count').textContent = list.length ? (i >= 0 ? (i + 1) + ' of ' + list.length : list.length + ' players') : '';
    box.querySelectorAll('button').forEach(function (b) { b.disabled = list.length < 2 && i >= 0; });
  }
  function wire(id, bodyId) {
    var sel = document.getElementById(id);
    if (!sel) return;
    var wrap = document.createElement('div');
    wrap.className = 'flip-row'; wrap.id = id + '-flip';
    sel.parentNode.insertBefore(wrap, sel);
    wrap.innerHTML = '<button type="button" class="flip-btn" aria-label="Previous player">‹</button>';
    wrap.appendChild(sel);
    wrap.insertAdjacentHTML('beforeend', '<button type="button" class="flip-btn" aria-label="Next player">›</button>');
    sel.insertAdjacentHTML('afterend', '');
    var count = document.createElement('div');
    count.className = 'flip-count';
    wrap.parentNode.insertBefore(count, wrap.nextSibling);
    // keep the count inside the box we query
    wrap.appendChild(count);
    var btns = wrap.querySelectorAll('.flip-btn');
    btns[0].addEventListener('click', function () { step(id, -1); });
    btns[1].addEventListener('click', function () { step(id, 1); });
    sel.addEventListener('change', function () { update(id); });
    // Swipe left/right on the player's sheet to flip.
    var body = document.getElementById(bodyId), x0 = null, y0 = null;
    if (body) {
      body.addEventListener('touchstart', function (e) { var t = e.touches[0]; x0 = t.clientX; y0 = t.clientY; }, { passive: true });
      body.addEventListener('touchend', function (e) {
        if (x0 === null) return;
        var t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0;
        x0 = null;
        if (Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(dy) && !e.target.closest('.hc-plot')) step(id, dx < 0 ? 1 : -1);
      }, { passive: true });
    }
    update(id);
  }
  wire('cardwho', 'cardbody');
  wire('hcpwho', 'hcpbody');
  // The lists fill in when data arrives and refresh every minute: keep the "3 of 7" line current.
  var base = window.renderCard, baseH = window.renderHcp;
  window.renderCard = function () { base(); update('cardwho'); };
  window.renderHcp = function () { baseH(); update('hcpwho'); };
})();
