// STARBYTE — fonction serveur « bm-webhook » (Blackmarket, v31)
// Stripe appelle cette adresse après un paiement. C'est le SEUL endroit qui écrit un achat.
//  · la signature Stripe est vérifiée (sinon n'importe qui pourrait s'offrir un vaisseau) ;
//  · un paiement = un achat (Stripe peut renvoyer le même avis plusieurs fois) ;
//  · plafond dépassé (deux paiements lancés en même temps) → achat marqué over_cap et remboursé automatiquement ;
//  · remboursement fait dans Stripe → l'achat passe en refunded (le vaisseau est retiré) ;
//  · contestation bancaire → l'achat passe en disputed (vaisseau retiré), et revient en paid si elle se conclut en faveur du vendeur.
// À déployer SANS vérification JWT (Stripe n'a pas de session Supabase).
// Secrets requis : STRIPE_SECRET_KEY et STRIPE_WEBHOOK_SECRET (whsec_…).
// Événements à cocher dans Stripe : checkout.session.completed, charge.refunded, charge.dispute.created, charge.dispute.closed.

import { createClient } from 'npm:@supabase/supabase-js@2';

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');

async function verify(payload: string, header: string, secret: string): Promise<boolean> {
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]).filter((p) => p.length === 2));
  const t = Number(parts.t);
  const sigs = header.split(',').filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  if (!t || !sigs.length) return false;
  if (Math.abs(Date.now() / 1000 - t) > 300) return false;          // avis de plus de 5 min : refusé (rejeu)
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = hex(await crypto.subtle.sign('HMAC', key, enc.encode(`${t}.${payload}`)));
  return sigs.some((s) => s.length === mac.length && [...s].every((c, i) => c === mac[i]));
}

async function refund(stripeKey: string, paymentIntent: string) {
  const f = new URLSearchParams({ payment_intent: paymentIntent, reason: 'requested_by_customer' });
  f.set('metadata[raison]', 'plafond_blackmarket');
  await fetch('https://api.stripe.com/v1/refunds', {
    method: 'POST', headers: { Authorization: `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: f,
  });
}

// Contestation levée : le vaisseau revient. Si son numéro de TAXI a été repris entre-temps, il reçoit le suivant libre.
async function restore(admin: any, paymentIntent: string) {
  const { data: rows, error } = await admin.from('bm_purchases').select('id, category')
    .eq('payment_intent', paymentIntent).eq('status', 'disputed');
  if (error) return error;
  for (const r of rows || []) {
    const { error: e1 } = await admin.from('bm_purchases').update({ status: 'paid' }).eq('id', r.id);
    if (!e1) continue;
    if (e1.code !== '23505' || r.category !== 'arche') return e1;
    const { data: top } = await admin.from('bm_purchases').select('edition_no').eq('category', 'arche').eq('status', 'paid')
      .order('edition_no', { ascending: false }).limit(1).maybeSingle();
    const { error: e2 } = await admin.from('bm_purchases').update({ status: 'paid', edition_no: (top?.edition_no || 0) + 1 }).eq('id', r.id);
    if (e2) return e2;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method', { status: 405 });
  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET'), stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!secret || !stripeKey) return new Response('not configured', { status: 500 });

  const payload = await req.text();
  if (!(await verify(payload, req.headers.get('stripe-signature') || '', secret))) return new Response('bad signature', { status: 400 });
  const evt = JSON.parse(payload);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  if (evt.type === 'checkout.session.completed') {
    const s = evt.data.object;
    if (s.payment_status !== 'paid') return new Response('ignored (unpaid)', { status: 200 });
    const userId = s.metadata?.user_id || s.client_reference_id, itemId = s.metadata?.item_id;
    if (!userId || !itemId) return new Response('ignored (no metadata)', { status: 200 });
    const { data: item } = await admin.from('bm_catalog').select('category').eq('item_id', itemId).maybeSingle();
    if (!item) return new Response('unknown item', { status: 200 });

    const { data: ins, error } = await admin.from('bm_purchases').upsert({
      user_id: userId, item_id: itemId, category: item.category, amount_cents: s.amount_total, currency: s.currency,
      stripe_session_id: s.id, payment_intent: s.payment_intent, livemode: !!s.livemode, status: 'paid',
    }, { onConflict: 'stripe_session_id', ignoreDuplicates: true }).select('id');
    if (error) return new Response(error.message, { status: 500 });   // Stripe réessaiera
    if (!ins || !ins.length) return new Response('duplicate', { status: 200 });

    // v34 : TAXI — édition de 100 épuisée (le déclencheur a mis over_cap) → remboursé
    const { data: row } = await admin.from('bm_purchases').select('status').eq('id', ins[0].id).maybeSingle();
    if (row && row.status === 'over_cap') { if (s.payment_intent) await refund(stripeKey, s.payment_intent); return new Response('sold out, refunded', { status: 200 }); }

    // plafond : si ce paiement fait dépasser, il est annulé et remboursé
    const { data: cat } = await admin.from('bm_categories').select('cap').eq('category', item.category).maybeSingle();
    const { data: rows } = await admin.from('bm_purchases').select('id').eq('user_id', userId).eq('category', item.category)
      .eq('status', 'paid').order('created_at', { ascending: true });
    if (cat && rows && rows.length > cat.cap && rows.slice(cat.cap).some((r) => r.id === ins[0].id)) {
      await admin.from('bm_purchases').update({ status: 'over_cap' }).eq('id', ins[0].id);
      if (s.payment_intent) await refund(stripeKey, s.payment_intent);
    }
    return new Response('ok', { status: 200 });
  }

  if (evt.type === 'charge.refunded') {
    const c = evt.data.object;
    if (c.payment_intent && c.refunded) {
      await admin.from('bm_purchases').update({ status: 'refunded' }).eq('payment_intent', c.payment_intent).eq('status', 'paid');
    }
    return new Response('ok', { status: 200 });
  }

  if (evt.type === 'charge.dispute.created') {
    const d = evt.data.object;
    if (d.payment_intent) {
      const { error } = await admin.from('bm_purchases').update({ status: 'disputed' }).eq('payment_intent', d.payment_intent).eq('status', 'paid');
      if (error) return new Response(error.message, { status: 500 });   // Stripe réessaiera
    }
    return new Response('ok', { status: 200 });
  }

  if (evt.type === 'charge.dispute.closed') {
    const d = evt.data.object;
    if (d.payment_intent && (d.status === 'won' || d.status === 'warning_closed')) {
      const err = await restore(admin, d.payment_intent);
      if (err) return new Response(err.message, { status: 500 });   // Stripe réessaiera
    }
    return new Response('ok', { status: 200 });
  }
  return new Response('ignored', { status: 200 });
});
