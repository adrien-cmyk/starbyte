// STARBYTE — fonction serveur « bm-checkout » (Blackmarket, v31)
// Le jeu envoie seulement { item_id } et le jeton de session du joueur.
// Le prix et le plafond sont lus dans la base (bm_catalog / bm_categories), jamais dans la demande du jeu.
// Réponse : { url } — la page de paiement Stripe vers laquelle le jeu redirige.
// Le joueur doit avoir accepté les CGV et la livraison immédiate (case à cocher) : son accord est gardé dans Stripe.
// Secret requis (Supabase → Edge Functions → Secrets) : STRIPE_SECRET_KEY (sk_live_… en réel, sk_test_… en test).

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const SITE = 'https://play.starbyte.online/';
const CGV_VERSION = '2026-11-03';   // à changer quand la section Achats des CGV change

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!stripeKey) return json({ error: 'stripe_not_configured' }, 500);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  // qui achète
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'not_signed_in' }, 401);
  const { data: who, error: authErr } = await admin.auth.getUser(jwt);
  if (authErr || !who?.user) return json({ error: 'not_signed_in' }, 401);
  const user = who.user;

  // quoi
  let itemId = '', consent = false;
  try { const b = await req.json(); itemId = String(b.item_id || ''); consent = b.consent === true; } catch (_) { /* corps vide */ }
  if (!/^[a-z0-9-]{2,40}$/.test(itemId)) return json({ error: 'bad_item' }, 400);
  if (!consent) return json({ error: 'consent_required' }, 400);
  const { data: item, error: e1 } = await admin.from('bm_catalog').select('item_id, category, name, price_cents, active').eq('item_id', itemId).maybeSingle();
  if (e1) return json({ error: e1.message }, 500);
  if (!item || !item.active) return json({ error: 'unknown_item' }, 404);

  // plafond (re-vérifié par bm-webhook au moment du paiement)
  const { data: cat } = await admin.from('bm_categories').select('cap, label').eq('category', item.category).maybeSingle();
  const { count } = await admin.from('bm_purchases').select('id', { count: 'exact', head: true })
    .eq('user_id', user.id).eq('category', item.category).eq('status', 'paid');
  if (cat && (count || 0) >= cat.cap) return json({ error: 'cap_reached', cap: cat.cap, label: cat.label }, 409);
  // v34 : TAXI — 100 exemplaires en tout
  if (item.category === 'arche') {
    const { count: sold } = await admin.from('bm_purchases').select('id', { count: 'exact', head: true }).eq('category', 'arche').eq('status', 'paid');
    if ((sold || 0) >= 100) return json({ error: 'sold_out' }, 409);
  }

  // page de paiement Stripe (API REST, sans dépendance)
  const f = new URLSearchParams();
  f.set('mode', 'payment');
  f.set('locale', 'fr');
  f.set('client_reference_id', user.id);
  f.set('metadata[user_id]', user.id);
  f.set('metadata[item_id]', item.item_id);
  f.set('payment_intent_data[metadata][user_id]', user.id);
  f.set('payment_intent_data[metadata][item_id]', item.item_id);
  // preuve de l'accord : CGV acceptées et livraison immédiate demandée (renonciation à la rétractation)
  const consentAt = new Date().toISOString();
  for (const k of ['metadata', 'payment_intent_data[metadata]']) {
    f.set(`${k}[cgv_version]`, CGV_VERSION);
    f.set(`${k}[consent_at]`, consentAt);
  }
  f.set('custom_text[submit][message]', 'Contenu numérique livré dans ton jeu dès le paiement confirmé.');
  f.set('line_items[0][quantity]', '1');
  f.set('line_items[0][price_data][currency]', 'chf');
  f.set('line_items[0][price_data][unit_amount]', String(item.price_cents));
  f.set('line_items[0][price_data][product_data][name]', `${item.name} — Starbyte`);
  f.set('line_items[0][price_data][product_data][description]', `${cat?.label || 'Vaisseau'} du Blackmarket`);
  if (user.email) {
    f.set('customer_email', user.email);
    f.set('payment_intent_data[receipt_email]', user.email);   // reçu de Stripe par email
  }
  f.set('success_url', `${SITE}?bm=ok&item=${encodeURIComponent(item.item_id)}`);
  f.set('cancel_url', `${SITE}?bm=annule`);

  const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: f,
  });
  const s = await r.json();
  if (!r.ok || !s.url) return json({ error: 'stripe', detail: s?.error?.message || r.status }, 502);
  return json({ url: s.url, test: !s.livemode });
});
