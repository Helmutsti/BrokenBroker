import express from 'express';
import { autentica } from './accesso.ts';
import { pool } from './db.ts';
import { gestoreErrori } from './errori.ts';
import { rotteAccesso } from './rotte/accesso.ts';
import { rotteAnalisi } from './rotte/analisi.ts';
import { rotteCategorie } from './rotte/categorie.ts';
import { rotteCeste } from './rotte/ceste.ts';
import { rotteCondivisioni, rottePersone } from './rotte/condivisioni.ts';
import { rotteConti } from './rotte/conti.ts';
import { rotteGruppi } from './rotte/gruppi.ts';
import { rotteInvestimenti } from './rotte/investimenti.ts';
import { rotteMovimenti } from './rotte/movimenti.ts';
import { rotteProfilo } from './rotte/profilo.ts';
import { rotteRate } from './rotte/rate.ts';
import { rotteSaldo } from './rotte/saldo.ts';
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
app.use('/gruppi', autentica, rotteGruppi);
app.use('/saldo', autentica, rotteSaldo);
app.use('/categorie', autentica, rotteCategorie);
app.use('/spese-previste', autentica, rotteSpese);
app.use('/movimenti', autentica, rotteMovimenti);
app.use('/condivisioni', autentica, rotteCondivisioni);
app.use('/persone', autentica, rottePersone);
app.use('/salvadanai', autentica, rotteCeste);
app.use('/ceste', autentica, rotteCeste);
app.use('/rate', autentica, rotteRate);
app.use('/investimenti', autentica, rotteInvestimenti);
app.use('/analisi', autentica, rotteAnalisi);

app.use((_req, res) => {
  res.status(404).json({ errore: 'Indirizzo non trovato' });
});
app.use(gestoreErrori);

// Su Vercel l'app è esportata come funzione (api/api/index.ts) e non ascolta su una porta.
if (!process.env.VERCEL) {
  const porta = Number(process.env.PORT ?? 3000);
  app.listen(porta, () => console.log(`API in ascolto sulla porta ${porta}`));
}

export default app;
