/* Starbyte — mise à jour automatique (PATCH_2510_MAJ)
   Problème : une page restée ouverte (Chrome Android garde l'onglet en vie, l'app installée aussi)
   continue d'exécuter l'ancien code pendant des jours, puisque rien ne la recharge.
   Solution : on retient l'empreinte de index.html au démarrage (ETag / Last-Modified / taille,
   requête HEAD légère, qui ne passe pas par le service worker), on la revérifie quand le joueur revient
   dans le jeu et toutes les 15 min. Si elle a changé, une nouvelle version est en ligne : on recharge
   au retour dans le jeu, après avoir sauvegardé, sauf en plein match-3, tutoriel ou cinématique. */
(function () {
  'use strict';
  if (/^(localhost|127\.|192\.168\.|10\.)/.test(location.hostname) || location.protocol === 'file:') return;
  var PAGE = location.pathname.replace(/[^/]*$/, '') + 'index.html';
  var base = null, pending = false, hiddenAt = 0, lastCheck = 0;

  function stamp() {
    return fetch(PAGE + '?maj=' + Date.now(), { method: 'HEAD', cache: 'no-store', credentials: 'same-origin' })
      .then(function (r) {
        if (!r.ok) return null;
        var h = r.headers;
        var s = [h.get('etag'), h.get('last-modified'), h.get('content-length')].filter(Boolean).join('|');
        return s || null;
      })
      .catch(function () { return null; });
  }

  function busy() {
    try {
      if (window.__sbCinema) return true;
      if (window.SBTuto && SBTuto.active && SBTuto.active()) return true;
      var m3 = document.getElementById('scr-m3');
      if (m3 && !m3.classList.contains('hidden')) return true;
      if (document.querySelector('#sb-move, #mp-choose')) return true;
    } catch (e) {}
    return false;
  }

  function reloadNow() {
    if (busy()) return false;
    try { if (typeof saveGame === 'function') saveGame(); } catch (e) {}
    try { if (window.SBCloud && SBCloud.flush) SBCloud.flush(); } catch (e) {}
    try { sessionStorage.setItem('sb_maj', String(Date.now())); } catch (e) {}
    setTimeout(function () { location.reload(); }, 700);   // laisse partir la dernière sauvegarde cloud
    return true;
  }

  function check() {
    if (pending || base === null) return Promise.resolve(pending);
    if (Date.now() - lastCheck < 60e3) return Promise.resolve(false);
    lastCheck = Date.now();
    return stamp().then(function (s) {
      if (s && s !== base) pending = true;
      return pending;
    });
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
    var away = hiddenAt ? Date.now() - hiddenAt : 0;
    check().then(function (isNew) {
      if (isNew && away > 20e3) reloadNow();     // le joueur revient : recharger ne le coupe dans rien
    });
  });

  // joueur qui ne quitte jamais l'écran : on vérifie de temps en temps, et on recharge dès qu'il est
  // sur un écran calme (pas de match-3, pas de cinématique) depuis au moins 2 minutes sans toucher l'écran
  var lastTouch = Date.now();
  ['pointerdown', 'keydown'].forEach(function (ev) { document.addEventListener(ev, function () { lastTouch = Date.now(); }, { passive: true, capture: true }); });
  setInterval(function () {
    if (document.visibilityState !== 'visible') return;
    check().then(function (isNew) { if (isNew && Date.now() - lastTouch > 120e3) reloadNow(); });
  }, 15 * 60e3);

  window.addEventListener('load', function () {
    setTimeout(function () { stamp().then(function (s) { base = s; }); }, 4000);
  });

  window.SBMaj = { check: function () { lastCheck = 0; return check(); }, get pending() { return pending; }, get base() { return base; } };
})();
