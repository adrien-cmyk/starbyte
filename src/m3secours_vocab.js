// ═══ PATCH_2110_SECOURS_VOCAB — en mission « Secours », le vocabulaire du forage devient celui des soins.
// (Retrouvé le 08/11/2026 depuis le fichier déployé : ces patchs avaient été posés directement dans assets/match3.js minifié.)
var __m3SecV = [
  ['Continuer le forage', 'Continuer de soigner'],
  ['Extraire maintenant', 'Terminer les secours'],
  ['EXTRAIRE MAINTENANT', 'TERMINER LES SECOURS'],
  ['FORAGE PROLONGÉ', 'SOINS PROLONGÉS'],
  ['VEINE PROFONDE OUVERTE', 'LES ÉQUIPES ONT TOUT DONNÉ'],
  ['CHARGE DE FORAGE', "TROUSSE D'URGENCE"],
  ['NOYAU INSTABLE', 'HÔPITAL DE CAMPAGNE'],
  ['RENDEMENT +20%', 'SOINS +20%'],
  ['RENDEMENT +50%', 'SOINS +50%'],
  ['EXTRACTION ACCÉLÉRÉE ×2', 'TRIAGE ACCÉLÉRÉ ×2'],
  ['RÉSONANCE GÉOLOGIQUE ×3', 'ÉLAN DE SOLIDARITÉ ×3'],
  ['La veine profonde est ouverte : chaque coup restant est du bonus.', 'Les équipes ont tout donné : chaque coup restant est du bonus.'],
  ['Continuer peut ouvrir le rendement optimal (', 'Continuer peut passer aux soins intensifs ('],
  [') puis la veine profonde (', ') puis au dévouement total ('],
  ['Continuer peut ouvrir la veine profonde (', 'Continuer peut mener au dévouement total ('],
  ['mais le sous-sol devient instable.', "mais la fatigue des équipes s'accumule."],
  ['gains sécurisés', 'soins acquis'],
  ['unités extraites', 'blessés pris en charge'],
  ['Coups épuisés', 'Plus de coups · relève des équipes'],
  ['Exploitation interrompue', 'Secours interrompus'],
  ['Extraction sécurisée', 'Mission de secours terminée'],
  ['Rendement final', 'Efficacité des secours'],
  ['Aucune ressource extraite.', 'Aucun blessé pris en charge.'],
  ['Palier I · Extraction minimale à atteindre', 'Palier I · Premiers soins à atteindre'],
  ['Ressources versées dans tes stocks.', ''],
  ['atteins la veine profonde (palier III)', 'atteins le palier III'],
  ['veine profonde atteinte', 'palier III atteint'],
  ['Extraire 1 artefact', 'Récupérer 1 artefact'],
  ['Forger une charge', "Préparer une trousse d'urgence"],
  ['Extraire ', 'Récupérer '],
  ['Veine profonde (palier III)', 'Palier III · dévouement total'],
  ['Extraction minimale', 'Premiers soins'],
  ['Rendement optimal', 'Soins intensifs'],
  ['Veine profonde', 'Dévouement total'],
  ['<div class="m3v2-k">Extraction</div>', '<div class="m3v2-k">Soins</div>'],
  ['PRESSION CROISSANTE', 'FATIGUE CROISSANTE'],
  ['INSTABILITÉ MOYENNE', 'ÉQUIPES FATIGUÉES'],
  ['INSTABILITÉ ÉLEVÉE', 'ÉQUIPES À BOUT'],
  ['>STABLE<', '>ÉQUIPES FRAÎCHES<']
];
function __m3Sec() { try { return !!(window.SBMatch3 && SBMatch3.s && SBMatch3.s.context === 'Secours'); } catch (e) { return !1; } }
function __m3V(x) {
  if (typeof x !== 'string' || !__m3Sec()) return x;
  if (x === 'STABLE') return 'ÉQUIPES FRAÎCHES';
  if (x.indexOf('Ressources versées dans tes stocks.') >= 0) {
    var _t = SBMatch3.s.tier | 0;
    x = x.split('Ressources versées dans tes stocks.').join([
      "Sans le palier I, la planète n'est pas soulagée.",
      'Premiers soins : la planète respire un peu mieux.',
      'Soins intensifs : la planète se remet nettement.',
      'Dévouement total : les équipes ont tout donné, la planète se relève.'
    ][Math.min(3, _t)]);
  }
  for (const [a, b] of __m3SecV) x = x.split(a).join(b);
  return x;
}
function __m3VO(o) {
  if (!__m3Sec()) return o;
  return Object.assign({}, o, { title: 'Arrêter les secours ?', body: "Les blessés déjà soignés le restent, mais sans le palier I la planète n'est pas soulagée.", confirmLabel: 'Arrêter' });
}
