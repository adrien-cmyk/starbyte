-- Starbyte — Blackmarket : à exécuter une seule fois, juste avant d'ouvrir le Blackmarket aux joueurs.
-- Un TAXI acheté en mode test occupe un numéro et un exemplaire sur les 100 de l'édition, et apparaît au tableau des légendes.
-- Ce script le sort de l'édition sans rien effacer. Les vaisseaux de combat de test restent sur tes comptes.

-- 1. Regarder d'abord (lecture seule) : tous les achats de test
select w.pseudo, p.item_id, p.category, p.status, p.edition_no, p.taxi_used_at, p.created_at
from public.bm_purchases p
left join public.worlds w on w.user_id = p.user_id
where p.livemode = false
order by p.created_at;

-- 2. Sortir les TAXI de test de l'édition (retour possible : remettre status = 'paid')
update public.bm_purchases
   set status = 'archive_test'
 where livemode = false and status = 'paid' and category = 'arche';

-- 3. Contrôle : le compteur doit afficher 100 exemplaires restants s'il n'y a encore aucun achat réel
select 100 - count(*) as taxi_restants
from public.bm_purchases
where category = 'arche' and status = 'paid';
