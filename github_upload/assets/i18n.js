/* Starbyte — i18n (PATCH_2510_I18N)
   Système de traduction. Chargé en tout premier dans <head>, avant tout autre script.

   UTILISATION — toujours I18N.t(…) : beaucoup de fonctions du jeu ont déjà une variable locale « t »
     I18N.t('raid.lance')                          → texte de la langue active
     I18N.t('raid.pille', { n: 3, lieu: 'Ahar' })  → remplace {n} et {lieu}
     I18N.t('flotte.vaisseaux', { n })             → pluriel si l'entrée est { one, other }
     I18N.t('cle.nouvelle', null, 'Texte FR')      → 3e argument = texte de secours (pendant la migration)
     I18N.de('Ahar') → « d'Ahar » ; I18N.de('Brest') → « de Brest »  (anglais : « of … »)
     I18N.num(12500) → « 12 500 » ; I18N.date(ts, { day:'2-digit', month:'short' })
     <span data-i18n="cle"></span> dans le HTML → rempli par I18N.apply()

   RÈGLES
   - Le français est la langue de référence : si une clé manque dans une autre langue, on affiche le français ;
     si elle manque partout, le texte de secours, puis la clé elle-même (jamais de vide, jamais d'erreur).
   - Une clé = un sens, pas un mot : 'raid.bouton_lancer', pas 'lancer'.
   - Les phrases restent entières avec des {variables} : jamais 'Tu as ' + n + ' vaisseaux'.
   - Pas de pluriel bricolé (n > 1 ? 's' : '') : une entrée { one: '…', other: '…' }.
   - Tant que seule la langue 'fr' est dans SUPPORTED, rien ne change pour les joueurs. */
(function () {
  'use strict';
  var REF = 'fr';
  var SUPPORTED = ['fr'];            // ajouter 'en' quand le dictionnaire anglais sera prêt
  var LOCALES = { fr: 'fr-CH', en: 'en-GB' };
  var STRINGS = { fr: {}, en: {} };
  var missing = {};

  function pickLang() {
    var saved = null;
    try { saved = localStorage.getItem('sb_lang'); } catch (e) {}
    if (saved && SUPPORTED.indexOf(saved) >= 0) return saved;
    var nav = ((navigator.languages && navigator.languages[0]) || navigator.language || '').slice(0, 2).toLowerCase();
    return SUPPORTED.indexOf(nav) >= 0 ? nav : REF;
  }
  var lang = pickLang();

  var plural = {};
  function pluralCat(l, n) {
    try { return (plural[l] || (plural[l] = new Intl.PluralRules(LOCALES[l] || l))).select(n); }
    catch (e) { return n === 1 ? 'one' : 'other'; }
  }

  function lookup(l, key) { var d = STRINGS[l]; return d && Object.prototype.hasOwnProperty.call(d, key) ? d[key] : undefined; }

  function interp(s, vars) {
    if (!vars) return s;
    return s.replace(/\{(\w+)\}/g, function (m, k) {
      if (!Object.prototype.hasOwnProperty.call(vars, k) || vars[k] == null) return m;
      var v = vars[k];
      return typeof v === 'number' ? num(v) : String(v);
    });
  }

  function t(key, vars, fallback) {
    var l = lang, v = lookup(l, key);
    if (v === undefined && l !== REF) { v = lookup(REF, key); l = REF; }
    if (v === undefined) {
      if (!missing[key]) { missing[key] = 1; }
      v = fallback != null ? fallback : key;
    }
    if (v && typeof v === 'object') {          // { zero?, one, other } — pluriels
      var n = vars && typeof vars.n === 'number' ? vars.n : 0;
      v = (n === 0 && v.zero != null) ? v.zero : (v[pluralCat(l, n)] != null ? v[pluralCat(l, n)] : v.other);
    }
    return interp(String(v), vars);
  }

  function num(n, opts) {
    try { return Number(n).toLocaleString(LOCALES[lang] || lang, opts); } catch (e) { return String(n); }
  }
  function date(ts, opts) {
    try { return new Date(ts).toLocaleString(LOCALES[lang] || lang, opts); } catch (e) { return String(ts); }
  }

  // Élision « de » devant un nom propre (français) ; « of » en anglais
  function de(name) {
    name = String(name == null ? '' : name);
    if (lang === 'fr') return (/^[aeiouyhàâéèêëîïôûùœ]/i.test(name) ? "d'" : 'de ') + name;
    if (lang === 'en') return 'of ' + name;
    return name;
  }

  // Remplit les éléments statiques : data-i18n (texte), data-i18n-html, data-i18n-ph (placeholder), data-i18n-title
  function apply(root) {
    root = root || document;
    if (!root.querySelectorAll) return;
    var els = root.querySelectorAll('[data-i18n],[data-i18n-html],[data-i18n-ph],[data-i18n-title],[data-i18n-aria]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i], k;
      if ((k = el.getAttribute('data-i18n'))) el.textContent = t(k, null, el.textContent);
      if ((k = el.getAttribute('data-i18n-html'))) el.innerHTML = t(k, null, el.innerHTML);
      if ((k = el.getAttribute('data-i18n-ph'))) el.setAttribute('placeholder', t(k, null, el.getAttribute('placeholder')));
      if ((k = el.getAttribute('data-i18n-title'))) el.setAttribute('title', t(k, null, el.getAttribute('title')));
      if ((k = el.getAttribute('data-i18n-aria'))) el.setAttribute('aria-label', t(k, null, el.getAttribute('aria-label')));
    }
  }

  // Les modules ajoutent leurs textes : I18N.add('fr', { 'raid.lance': 'Raid lancé' })
  function add(l, dict) {
    if (!STRINGS[l]) STRINGS[l] = {};
    for (var k in dict) if (Object.prototype.hasOwnProperty.call(dict, k)) STRINGS[l][k] = dict[k];
  }

  function setLang(l) {
    if (SUPPORTED.indexOf(l) < 0) return false;
    try { localStorage.setItem('sb_lang', l); } catch (e) {}
    lang = l;
    try { document.documentElement.lang = l; } catch (e) {}
    apply();
    try { window.dispatchEvent(new CustomEvent('sb:lang', { detail: l })); } catch (e) {}
    return true;
  }

  window.I18N = {
    t: t, add: add, apply: apply, setLang: setLang, de: de, num: num, date: date,
    get lang() { return lang; },
    get locale() { return LOCALES[lang] || lang; },
    supported: function () { return SUPPORTED.slice(); },
    missing: function () { return Object.keys(missing); },   // clés appelées sans traduction (outil de migration)
    _strings: STRINGS
  };
  try { document.documentElement.lang = lang; } catch (e) {}
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { apply(); });
  else apply();
})();

/* ─── Dictionnaire français (langue de référence) ───
   Rempli zone par zone pendant le découpage du monolithe. */
I18N.add('fr', {
  'app.nom': 'Starbyte',
  'app.telecharger': "Télécharger l'app",
  'commun.ok': 'OK',
  'commun.annuler': 'Annuler',
  'commun.fermer': 'Fermer',
  'commun.confirmer': 'Confirmer',
  'commun.retour': 'Retour',
  'commun.chargement': 'Chargement…'
});
