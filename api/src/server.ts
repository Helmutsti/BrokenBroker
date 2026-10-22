import express from 'express';
import { autentica } from './accesso.ts';
import { pool } from './db.ts';
import { gestoreErrori } from './errori.ts';
import { rotteAccesso } from './rotte/accesso.ts';
import { rotteAnalisi } from './rotte/analisi.ts';
import { rotteCategorie } from './rotte/categorie.ts';
import { rotteCondivisioni, rottePersone } from './rotte/condivisioni.ts';
import { rotteConti } from './rotte/conti.ts';
import { rotteInvestimenti } from './rotte/investimenti.ts';
import { rotteMovimenti } from './rotte/movimenti.ts';
import { rotteObiettivi } from './rotte/obiettivi.ts';
import { rotteProfilo } from './rotte/profilo.ts';
import { rotteRate } from './rotte/rate.ts';
import { rotteRegole } from './rotte/regole.ts';
import { rotteSpese } from './rotte/spese.ts';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

app.get('/salute', async (_req, res) => {
  await pool.query('select 1');
  res.json({ stato: 'ok' });
});

app.use('/accesso', rotteAccesso);
app.use('/profilo', autentica, rotteProfilo);
app.use('/conti', autentica, rotteConti);
app.use('/categorie', autentica, rotteCategorie);
app.use('/movimenti', autentica, rotteMovimenti);
app.use('/spese-previste', autentica, rotteSpese);
app.use('/condivisioni', autentica, rotteCondivisioni);
app.use('/persone', autentica, rottePersone);
app.use('/obiettivi', autentica, rotteObiettivi);
app.use('/rate', autentica, rotteRate);
app.use('/regole', autentica, rotteRegole);
app.use('/investimenti', autentica, rotteInvestimenti);
app.use('/analisi', autentica, rotteAnalisi);

app.use((_req, res) => {
  res.status(404).json({ errore: 'Indirizzo non trovato' });
});
app.use(gestoreErrori);

const porta = Number(process.env.PORT ?? 3000);
app.listen(porta, () => console.log(`API in ascolto sulla porta ${porta}`));
