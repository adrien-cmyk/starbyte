/* Starbyte — mesure d'audience (Google Analytics 4), 25/10/2026.
   Rien n'est chargé tant que le visiteur n'a pas accepté (visiteurs de l'UE : RGPD ; Suisse : nLPD).
   - GA_ID vide = aucune mesure et aucun bandeau.
   - Le choix est gardé dans ce navigateur (localStorage « sb_mesure » : oui / non).
   - Le lien « Cookies » du pied de page (data-mesure) rouvre le bandeau pour changer d'avis. */
(function () {
  'use strict';
  var GA_ID = 'G-GSZD6MVCFC';   // identifiant de mesure GA4, ex. 'G-XXXXXXXXXX'
  if (!/^G-[A-Z0-9]+$/.test(GA_ID)) return;

  var KEY = 'sb_mesure';
  function get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function set(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }

  function load() {
    if (window.__sbGa) return;
    window.__sbGa = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    // Consent Mode v2 (mode « de base ») : la balise n'est chargée qu'après accord ;
    // tout est refusé par défaut, seule la mesure d'audience est accordée — jamais la publicité.
    window.gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied', functionality_storage: 'denied', personalization_storage: 'denied', security_storage: 'granted' });
    window.gtag('consent', 'update', { analytics_storage: 'granted' });
    window.gtag('js', new Date());
    window.gtag('config', GA_ID);
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(s);
  }

  function clearGaCookies() {
    document.cookie.split(';').forEach(function (c) {
      var n = c.split('=')[0].trim();
      if (/^_ga/.test(n)) {
        ['', '; domain=' + location.hostname, '; domain=.' + location.hostname.replace(/^www\./, '')].forEach(function (d) {
          document.cookie = n + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/' + d;
        });
      }
    });
  }

  var css = '' +
    '.sb-consent{position:fixed;left:16px;bottom:16px;z-index:120;max-width:380px;padding:18px 18px 16px;border-radius:14px;' +
    'background:var(--panel,#191122);border:1px solid var(--seam,#35283f);box-shadow:0 18px 50px rgba(0,0,0,.45);' +
    'font:400 15px/1.55 var(--f-ui,"Space Grotesk",Arial,sans-serif);color:var(--mute,#bfb5ca)}' +
    '.sb-consent b{display:block;margin-bottom:6px;font-weight:600;color:var(--ink,#f3eff5)}' +
    '.sb-consent a{color:var(--ink,#f3eff5)}' +
    '.sb-consent .row{display:flex;gap:10px;margin-top:14px}' +
    '.sb-consent button{flex:1;min-height:44px;border-radius:10px;font:600 15px/1 var(--f-ui,"Space Grotesk",Arial,sans-serif);cursor:pointer;' +
    'border:1px solid color-mix(in srgb,var(--violet,#8054d9) 55%,var(--seam,#35283f));background:transparent;color:var(--ink,#f3eff5)}' +
    '.sb-consent button.ok{background:var(--violet,#8054d9);border-color:var(--violet,#8054d9)}' +
    '@media (max-width:520px){.sb-consent{left:12px;right:12px;bottom:12px;max-width:none}}';

  function banner() {
    if (document.getElementById('sb-consent')) return;
    if (!document.getElementById('sb-consent-css')) {
      var st = document.createElement('style');
      st.id = 'sb-consent-css';
      st.textContent = css;
      document.head.appendChild(st);
    }
    var el = document.createElement('div');
    el.id = 'sb-consent';
    el.className = 'sb-consent';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Mesure d\'audience');
    el.innerHTML = '<b>Mesure d\'audience</b>' +
      'J\'aimerais savoir combien de personnes visitent le site, avec Google Analytics. ' +
      'Rien n\'est mesuré sans ton accord. <a href="cgv.html#donnees">En savoir plus</a>' +
      '<div class="row"><button type="button" data-v="non">Refuser</button><button type="button" class="ok" data-v="oui">Accepter</button></div>';
    el.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-v]');
      if (!b) return;
      var v = b.getAttribute('data-v');
      set(v);
      el.remove();
      if (v === 'oui') load();
      else if (window.__sbGa) { clearGaCookies(); location.reload(); }   // retrait de l'accord : on coupe tout
      else clearGaCookies();
    });
    document.body.appendChild(el);
  }

  function init() {
    document.querySelectorAll('[data-mesure]').forEach(function (a) {
      a.hidden = false;
      a.addEventListener('click', function (e) { e.preventDefault(); banner(); });
    });
    var v = get();
    if (v === 'oui') load();
    else if (v !== 'non') banner();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
