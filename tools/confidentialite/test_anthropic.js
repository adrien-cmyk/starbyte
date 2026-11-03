// Ce qui part vers Anthropic, relevé avec un faux service : rien n'est appelé pour de vrai et aucune clé n'est nécessaire.
// Couvre le filtre des logos (logo-upload), l'assistant (chat.php) et la ligne de contexte du jeu (assistance.js).
// Prérequis : esbuild (npm) et PHP avec curl.
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), vm = require('vm');
const { spawn } = require('child_process');
const esbuild = require('esbuild');
const { report } = require('./lib');

const ROOT = path.resolve(__dirname, '../..');
const r = report('Données envoyées à Anthropic');
const S = { uid: 'SENTINELLE-ID-JOUEUR', email: 'sentinelle@joueur.example', pseudo: 'SENTINELLE-PSEUDO', adresse: 'SENTINELLE-ADRESSE', question: 'SENTINELLE-QUESTION' };
const contient = (txt, ...ms) => ms.filter((m) => txt.includes(m));

// ── 1. Filtre des logos ─────────────────────────────────────────────────────────────
function fauxSupabase() {
  const db = { bm_purchases: [{ user_id: S.uid, status: 'paid', category: 'dread' }], bm_logo_blocked: [], bm_logos: [], bm_logo_attempts: [] };
  const stockage = [];
  class Q {
    constructor(t) { this.t = t; this.f = []; this.op = 'select'; }
    select() { return this; }
    eq(k, v) { this.f.push((x) => x[k] === v); return this; }
    in(k, a) { this.f.push((x) => a.includes(x[k])); return this; }
    gt() { return this; }
    update(v) { this.op = 'update'; this.v = v; return this; }
    insert(v) { this.op = 'insert'; this.v = v; return this; }
    single() { this.one = true; return this; }
    maybeSingle() { this.one = true; return this; }
    then(ok) {
      const T = db[this.t];
      if (this.op === 'insert') { const n = { id: 'l' + T.length, status: 'ok', ...this.v }; T.push(n); return ok({ data: this.one ? n : [n], error: null }); }
      const rows = T.filter((x) => this.f.every((f) => f(x)));
      if (this.op === 'update') { rows.forEach((x) => Object.assign(x, this.v)); return ok({ data: rows, error: null }); }
      ok({ data: this.one ? rows[0] || null : rows, count: rows.length, error: null });
    }
  }
  return {
    db, stockage,
    client: { from: (t) => new Q(t), auth: { getUser: async () => ({ data: { user: { id: S.uid, email: S.email } }, error: null }) },
      storage: { from: () => ({ upload: async (p) => { stockage.push(p); return { error: null }; } }) } },
  };
}
const png = (n) => { const b = Buffer.alloc(40); Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(b); b.writeUInt32BE(13, 8); b.write('IHDR', 12); b.writeUInt32BE(64, 16); b.writeUInt32BE(64, 20); b[39] = n; return b.toString('base64'); };

async function testLogos() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'logos-'));
  const src = fs.readFileSync(path.join(ROOT, 'github_upload/server/logo-upload/index.ts'), 'utf8')
    .replace(/import \{ createClient \} from 'npm:@supabase\/supabase-js@2';/, 'const createClient = () => globalThis.__sb.client;');
  const out = path.join(dir, 'fn.mjs');
  await esbuild.build({ stdin: { contents: src, loader: 'ts' }, outfile: out, format: 'esm', logLevel: 'silent' });
  const sb = fauxSupabase();
  globalThis.__sb = sb;
  const env = { ANTHROPIC_API_KEY: 'cle-factice', SUPABASE_URL: 'http://x', SUPABASE_SERVICE_ROLE_KEY: 'y' };
  let handler;
  globalThis.Deno = { env: { get: (k) => env[k] }, serve: (h) => { handler = h; } };
  await import('file://' + out);
  const appels = [];
  let accepte = true;
  const fetchOrig = globalThis.fetch;
  globalThis.fetch = async (u, o) => {
    appels.push({ url: String(u), headers: Object.keys(o.headers || {}).map((k) => k.toLowerCase()), body: String(o.body) });
    return new Response(JSON.stringify({ content: [{ type: 'tool_use', input: { ok: accepte } }] }));
  };
  const envoi = (n) => handler(new Request('http://x', { method: 'POST', headers: { Authorization: 'Bearer t' }, body: JSON.stringify({ image: png(n) }) }));
  const res = await envoi(1);
  r.check(res.status === 200 && appels.length === 1, 'Logo : le filtre est appelé une fois', `statut ${res.status}`);
  const a = appels[0] || { url: '', headers: [], body: '{}' };
  const corps = JSON.parse(a.body);
  r.check(new URL(a.url).hostname === 'api.anthropic.com', 'Logo : seule l\'API d\'Anthropic reçoit l\'image', new URL(a.url).hostname);
  const permis = new Set(['model', 'max_tokens', 'system', 'tools', 'tool_choice', 'messages']);
  const champs = Object.keys(corps);
  r.check(champs.every((k) => permis.has(k)), 'Logo : aucun champ inattendu, comme metadata', champs.join(', '));
  r.check(a.headers.every((h) => ['x-api-key', 'anthropic-version', 'content-type'].includes(h)), 'Logo : en-têtes limités au nécessaire', a.headers.join(', '));
  const fuites = contient(a.body, S.uid, S.email);
  r.check(!fuites.length, 'Logo : ni identifiant ni email du joueur', fuites.length ? 'trouvé' : 'absents');
  const blocs = (corps.messages || []).flatMap((m) => m.content).map((c) => c.type);
  r.check(blocs.filter((t) => t === 'image').length === 1 && blocs.every((t) => t === 'image' || t === 'text'), 'Logo : le message contient l\'image et sa consigne, rien d\'autre', blocs.join(', '));

  accepte = false;
  const avant = sb.stockage.length, lignes = sb.db.bm_logos.length;
  const refus = await envoi(2);
  r.check(refus.status === 422 && sb.stockage.length === avant && sb.db.bm_logos.length === lignes, 'Logo refusé : ni fichier ni ligne conservés par Starbyte', `statut ${refus.status}`);
  globalThis.fetch = fetchOrig;
}

// ── 2. Assistant (chat.php), avec le vrai PHP et un faux Anthropic local ───────────────
function ecoute(srv, port = 0) { return new Promise((ok) => srv.listen(port, '127.0.0.1', () => ok(srv.address().port))); }
async function testChat() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-'));
  const api = path.join(dir, 'api');
  fs.cpSync(path.join(ROOT, 'site/api'), api, { recursive: true });
  const recu = [];
  const faux = http.createServer((req, res) => {
    let b = ''; req.on('data', (d) => { b += d; });
    req.on('end', () => { recu.push({ url: req.url, headers: Object.keys(req.headers), body: b }); res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ content: [{ type: 'text', text: 'réponse factice' }] })); });
  });
  const pf = await ecoute(faux);
  fs.writeFileSync(path.join(api, '_config.php'), `<?php return ['anthropic_key' => 'cle-factice', 'api_url' => 'http://127.0.0.1:${pf}/v1/messages'];`);
  const portPhp = 18000 + Math.floor(Math.random() * 2000);
  const php = spawn('php', ['-S', `127.0.0.1:${portPhp}`, '-t', dir], { stdio: 'ignore' });
  try {
    await new Promise((o) => setTimeout(o, 900));
    const res = await fetch(`http://127.0.0.1:${portPhp}/api/chat.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://play.starbyte.online', 'User-Agent': 'SENTINELLE-NAVIGATEUR', 'X-Forwarded-For': '203.0.113.77' },
      body: JSON.stringify({ messages: [{ role: 'user', content: S.question }], context: 'planète niveau 3', email: S.email, pseudo: S.pseudo, user_id: S.uid }),
    });
    r.check(res.status === 200 && recu.length === 1, 'Assistant : la question arrive au service', `statut ${res.status}`);
    const a = recu[0] || { body: '{}', headers: [] };
    const corps = JSON.parse(a.body);
    const permis = new Set(['model', 'max_tokens', 'thinking', 'system', 'messages']);
    const champs = Object.keys(corps);
    r.check(champs.every((k) => permis.has(k)), 'Assistant : aucun champ inattendu, comme metadata', champs.join(', '));
    const fuites = contient(a.body, S.uid, S.email, S.pseudo, 'SENTINELLE-NAVIGATEUR', '203.0.113.77', '127.0.0.1');
    r.check(!fuites.length, 'Assistant : ni identifiant, ni email, ni pseudo, ni navigateur, ni adresse IP', fuites.length ? 'trouvé : ' + fuites.join(', ') : 'absents');
    r.check(a.headers.filter((h) => /forwarded|user-id|cookie/.test(h)).length === 0, 'Assistant : aucun en-tête d\'identification transmis', a.headers.join(', '));
    r.check(a.body.includes(S.question), 'Assistant : la question est bien transmise, comme annoncé');
    const data = path.join(api, '_data');
    let trace = '';
    if (fs.existsSync(data)) for (const f of fs.readdirSync(data)) trace += f + ' ' + fs.readFileSync(path.join(data, f), 'latin1');
    const local = contient(trace, S.question, S.email, S.pseudo, '127.0.0.1', '203.0.113.77');
    r.check(!local.length, 'Assistant : ni question ni adresse IP en clair dans les fichiers du serveur', local.length ? 'trouvé : ' + local.join(', ') : 'absentes');
    r.alerte('Assistant : le joueur peut écrire des données personnelles dans sa question, et elles partent telles quelles', 'annoncé dans l\'article 9 : « N\'y mets pas d\'informations sensibles »');
    r.alerte('Hébergement : les journaux propres à Infomaniak ne sont pas couverts par ce test', 'à vérifier dans le Manager');
  } finally {
    php.kill(); faux.close();
  }
}

// ── 3. Contexte de partie envoyé depuis le jeu ─────────────────────────────────────────
function testContexte() {
  const src = fs.readFileSync(path.join(ROOT, 'github_upload/assets/assistance.js'), 'utf8');
  const debut = src.indexOf('function context()');
  const fin = src.indexOf('\n  function card()', debut);
  if (debut < 0 || fin < 0) return r.ko('Contexte du jeu : fonction introuvable', 'le test est à mettre à jour');
  const code = `const fmt=(n)=>String(n);${src.slice(debut, fin)};context();`;
  const G = {
    pseudo: S.pseudo, email: S.email, userId: S.uid, address: S.adresse, name: S.pseudo,
    res: { metal: { v: 100, max: 200 } }, skills: { capitalLevel: 2 },
    planet: { level: 3, name: S.pseudo, address: S.adresse, parcels: [{ building: 'mine', lvl: 2 }] },
  };
  const txt = vm.runInNewContext(code, { G, window: { G } });
  r.check(/planète niveau 3/.test(txt), 'Contexte du jeu : la ligne se construit', txt.slice(0, 120));
  const fuites = contient(txt, S.pseudo, S.email, S.uid, S.adresse);
  r.check(!fuites.length, 'Contexte du jeu : ni pseudo, ni email, ni identifiant, ni adresse de monde', fuites.length ? 'trouvé : ' + fuites.join(', ') : 'absents');
}

(async () => {
  const etapes = [['Filtre des logos', testLogos], ['Assistant', testChat], ['Contexte du jeu', testContexte]];
  for (const [nom, f] of etapes) {
    try { await f(); } catch (e) { r.ko(`${nom} : le test n'a pas pu aller au bout`, e.message); }
  }
  r.end('anthropic');
  setTimeout(() => process.exit(process.exitCode || 0), 100);
})();
