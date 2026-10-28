-- Lo storico dei prezzi dei titoli (decisione 65): per disegnare il guadagno nel tempo servono i prezzi passati, che l'app scarica
-- dalla fonte (un prezzo di chiusura al giorno) da quando il titolo è stato comprato. `storico_dal` dice da che giorno lo storico è
-- già scaricato: se un acquisto più vecchio lo anticipa, si scarica di nuovo da lì.
alter table titoli add column storico_dal date;
