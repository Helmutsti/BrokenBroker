-- Salvadanai a mano (decisione di Manuel del 2026-10-24): le spese annuali non entrano più da
-- sole in un salvadanaio e la spunta di un promemoria è solo un segno. I soldi si versano a
-- mano (anche con "Aggiungi quota mensile"); quel versamento spunta il promemoria del mese.
alter table utenti drop column annuali_usate;
-- Se il versamento si cancella, si toglie anche la spunta; se si toglie la spunta, il versamento resta.
alter table versamenti add column promemoria_spunta_id uuid references spunte (id) on delete set null;
