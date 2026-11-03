// Google Analytics : arrivée, refus, accord, retrait, depuis des sessions vierges. Lecture seule.
// Les envois de mesure vers Google sont bloqués et comptés, pour ne pas fausser les statistiques du site.
// Variables : SITE (https://starbyte.online), JEU (https://play.starbyte.online). JEU=off saute le contrôle du jeu.
const { chromium } = require('playwright');
const { report } = require('./lib');

const SITE = (process.env.SITE || 'https://starbyte.online').replace(/\/$/, '');
const JEU = (process.env.JEU || 'https://play.starbyte.online').replace(/\/$/, '');
const COLLECTE = /(^|\.)(google-analytics\.com|analytics\.google\.com|doubleclick\.net)$/;
const ADS = /(^|\.)(doubleclick\.net|googleadservices\.com|googlesyndication\.com)$/;
const GTM = /(^|\.)googletagmanager\.com$/;
const STUB_GA = `document.cookie='_ga=GA1.1.test; path=/; max-age=3600';document.cookie='_ga_TEST=GS1.1.test; path=/; max-age=3600';`;

const hostOf = (u) => { try { return new URL(u).hostname; } catch (e) { return ''; } };
const r = report('Consentement et Google Analytics');
let stubUtilise = false;

async function session(browser, base) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', locale: 'fr-CH' });
  const seen = { gtm: 0, collecte: 0, ads: 0, hosts: new Set() };
  const self = hostOf(base);
  await ctx.route('**/*', async (route) => {
    const u = route.request().url();
    const h = hostOf(u);
    if (!/^https?:/.test(u)) return route.continue();
    if (h && h !== self) seen.hosts.add(h);
    if (COLLECTE.test(h)) { seen.collecte++; if (ADS.test(h)) seen.ads++; return route.abort(); }
    if (GTM.test(h)) {
      seen.gtm++;
      // le vrai script de Google quand il est joignable ; sinon un substitut qui pose les mêmes cookies
      try { const res = await route.fetch({ timeout: 10000 }); return route.fulfill({ response: res }); }
      catch (e) { stubUtilise = true; return route.fulfill({ contentType: 'application/javascript', body: STUB_GA }); }
    }
    return route.continue().catch(() => {});
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  return { ctx, page, seen };
}
const ouvrir = async (page, url) => { await page.goto(url, { waitUntil: 'load', timeout: 45000 }); await page.waitForTimeout(2500); };
const cookiesGa = async (ctx) => (await ctx.cookies()).filter((c) => /^(_ga|_gid|_gat|_gcl)/.test(c.name)).map((c) => c.name);
const mesure = (page) => page.evaluate(() => { try { return localStorage.getItem('sb_mesure'); } catch (e) { return null; } });
const bandeau = (page) => page.locator('#sb-consent').isVisible();
const bouton = (page, v) => page.locator(`#sb-consent button[data-v="${v}"]`).click();

(async () => {
  const browser = await chromium.launch();

  // 1. Arrivée, sans aucun choix, sur chaque page du site
  for (const p of ['/', '/cgv.html', '/soutenir.html']) {
    const { ctx, page, seen } = await session(browser, SITE);
    await ouvrir(page, SITE + p);
    const ck = await cookiesGa(ctx);
    r.check(seen.gtm === 0 && seen.collecte === 0 && ck.length === 0, `Avant tout choix, ${p} : rien vers Google Analytics`, `script ${seen.gtm}, envois ${seen.collecte}, cookies ${ck.length}`);
    if (p === '/') {
      r.check(await bandeau(page), 'Le bandeau de choix s\'affiche à l\'arrivée');
      r.check(await page.locator('#sb-consent button[data-v="non"]').isVisible() && await page.locator('#sb-consent button[data-v="oui"]').isVisible(), 'Refuser et Accepter sont proposés au même niveau');
      const lien = await page.locator('#sb-consent a').getAttribute('href').catch(() => '');
      r.check(/cgv\.html#donnees/.test(lien || ''), 'Le bandeau renvoie à la politique de confidentialité', lien);
      const autres = [...seen.hosts].sort();
      const fonts = autres.filter((h) => /fonts\.(googleapis|gstatic)\.com$/.test(h));
      const cdn = autres.filter((h) => /jsdelivr\.net$/.test(h));
      const inconnus = autres.filter((h) => !fonts.includes(h) && !cdn.includes(h));
      if (fonts.length) r.alerte('Google Fonts est appelé avant tout choix (adresse IP transmise à Google)', fonts.join(', ')); else r.ok('Aucun appel à Google Fonts avant tout choix');
      if (cdn.length) r.alerte('jsDelivr est appelé avant tout choix (adresse IP transmise)', cdn.join(', ')); else r.ok('Aucun appel à jsDelivr avant tout choix');
      r.check(inconnus.length === 0, 'Aucun autre service tiers non déclaré avant tout choix', inconnus.join(', ') || 'aucun');
    }
    await ctx.close();
  }

  // 2. Refus, puis retour sur le site
  {
    const { ctx, page, seen } = await session(browser, SITE);
    await ouvrir(page, SITE + '/');
    await bouton(page, 'non'); await page.waitForTimeout(2000);
    r.check(seen.gtm === 0 && seen.collecte === 0 && (await cookiesGa(ctx)).length === 0, 'Après un refus : rien vers Google Analytics', `script ${seen.gtm}, envois ${seen.collecte}`);
    r.check((await mesure(page)) === 'non', 'Le refus est mémorisé');
    await ouvrir(page, SITE + '/');
    r.check(!(await bandeau(page)) && seen.gtm === 0 && seen.collecte === 0, 'Au retour : le refus tient, sans rien vers Google Analytics');
    await ctx.close();
  }

  // 3. Accord, puis retrait
  {
    const { ctx, page, seen } = await session(browser, SITE);
    await ouvrir(page, SITE + '/');
    await bouton(page, 'oui'); await page.waitForTimeout(4000);
    r.check(seen.gtm >= 1, 'Après l\'accord : Google Analytics se charge', `script ${seen.gtm}, envois tentés ${seen.collecte}`);
    r.check(seen.ads === 0, 'Après l\'accord : aucun appel publicitaire', `appels ${seen.ads}`);
    const consent = await page.evaluate(() => {
      const out = {}; for (const e of window.dataLayer || []) { if (e && e[0] === 'consent') Object.assign(out, e[2] || {}); } return out;
    });
    r.check(consent.ad_storage === 'denied' && consent.ad_user_data === 'denied' && consent.ad_personalization === 'denied', 'La publicité reste refusée dans les réglages Google', JSON.stringify(consent));
    const avant = await cookiesGa(ctx);
    if (stubUtilise) r.alerte('Le vrai script de Google n\'était pas joignable : cookies contrôlés avec un substitut');
    if (avant.length) r.ok('Après l\'accord : cookies de mesure posés', avant.join(', ')); else r.alerte('Après l\'accord : aucun cookie de mesure observé', 'à vérifier dans le relevé suivant');
    const lien = page.locator('[data-mesure]').first();
    r.check(await lien.isVisible(), 'Le lien « Cookies » permet de changer d\'avis');
    await lien.click(); await page.waitForSelector('#sb-consent');
    seen.gtm = 0; seen.collecte = 0;
    await Promise.all([page.waitForNavigation({ waitUntil: 'load', timeout: 45000 }).catch(() => {}), bouton(page, 'non')]);
    await page.waitForTimeout(2500);
    const apres = await cookiesGa(ctx);
    r.check(apres.length === 0, 'Après le retrait : cookies de mesure effacés', apres.join(', ') || 'aucun');
    r.check(seen.gtm === 0 && seen.collecte === 0, 'Après le retrait : plus rien vers Google Analytics', `script ${seen.gtm}, envois ${seen.collecte}`);
    r.check((await mesure(page)) === 'non', 'Le retrait est mémorisé');
    await ctx.close();
  }

  // 4. Le jeu : il annonce ne pas utiliser Google Analytics. Supabase est bloqué : aucune écriture, aucun compte créé.
  if (JEU !== 'off') {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', locale: 'fr-CH' });
    const hosts = new Set();
    let ga = 0;
    const self = hostOf(JEU);
    await ctx.route('**/*', (route) => {
      const u = route.request().url(), h = hostOf(u);
      if (!/^https?:/.test(u)) return route.continue();
      if (h && h !== self) hosts.add(h);
      if (COLLECTE.test(h) || GTM.test(h)) { ga++; return route.abort(); }
      if (/supabase\.co$/.test(h)) return route.abort();
      return route.continue().catch(() => {});
    });
    const page = await ctx.newPage();
    let charge = true;
    await page.goto(JEU + '/', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => { charge = false; });
    await page.waitForTimeout(6000);
    r.check(charge, 'Le jeu s\'ouvre pour le contrôle');
    r.check(ga === 0, 'Le jeu n\'appelle pas Google Analytics au lancement', `appels ${ga}`);
    const autres = [...hosts].filter((h) => !/supabase\.co$/.test(h)).sort();
    if (autres.length) r.alerte('Services tiers appelés par le jeu au lancement', autres.join(', ')); else r.ok('Aucun service tiers au lancement du jeu, hors Supabase');
    await ctx.close();
  }

  await browser.close();
  r.end('consentement');
})().catch((e) => { r.ko('Le test n\'a pas pu aller au bout', e.message); r.end('consentement'); });
