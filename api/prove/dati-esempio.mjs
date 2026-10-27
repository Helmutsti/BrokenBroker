// Crea due utenti di prova con dati simili a quelli del foglio Excel, per vedere
// l'app piena. Solo per l'ambiente locale: credenziali di prova, nessun dato vero.
// Uso: node api/prove/dati-esempio.mjs [indirizzo API]   (di base http://localhost:3000)
//
// Accesso di prova:  prova@brokenbroker.test  /  prova-brokenbroker-2026
// Seconda persona:   ele@brokenbroker.test    /  prova-brokenbroker-2026

const B = process.argv[2] ?? 'http://localhost:3000';
const PASSWORD = 'prova-brokenbroker-2026';

async function r(metodo, path, token, body) {
  const res = await fetch(B + path, { method: metodo, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await res.text();
  const j = t ? JSON.parse(t) : null;
  if (!res.ok) throw new Error(`${metodo} ${path}: ${res.status} ${j?.errore}`);
  return j;
}
async function entra(email, nome) {
  try { return (await r('POST', '/accesso/registrazione', null, { email, nome, password: PASSWORD })).token; }
  catch { return (await r('POST', '/accesso/accesso', null, { email, password: PASSWORD })).token; }
}

const M = await entra('prova@brokenbroker.test', 'Manuel');
const E = await entra('ele@brokenbroker.test', 'Ele');
if ((await r('GET', '/conti', M)).length) { console.log('Dati di prova già presenti.'); process.exit(0); }

const oggi = new Date();
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const giorno = (n) => { const d = new Date(oggi); d.setDate(d.getDate() - n); return iso(d); };
const meseFa = (n, g) => { const d = new Date(oggi.getFullYear(), oggi.getMonth() - n, g); return iso(d); };

await r('PATCH', '/profilo', M, { stipendio_netto: '1800', giorno_paga: 27, inizio_mese: 1 });
await r('PUT', '/regole', M, { max_rate_contemporanee: '2', tetto_rate_percentuale: '15', max_mensilita_debito: '3' });

const cat = await r('GET', '/categorie?formato=elenco', M);
// padre: nome della categoria padre; null = categoria principale; assente = la prima con quel nome.
const C = (nome, padre) => cat.find((c) => c.nome === nome && (padre === undefined || (padre === null ? !c.padre_id : cat.find((p) => p.id === c.padre_id)?.nome === padre))).id;

const conto = async (nome, tipo, saldo) => (await r('POST', '/conti', M, { nome, tipo, saldo_iniziale: saldo, data_saldo_iniziale: meseFa(6, 1) })).id;
const bper = await conto('BPER', 'corrente', '2400');
const intesa = await conto('Intesa', 'corrente', '3100');
const comune = await conto('Revolut comune', 'corrente', '900');
const revolut = await conto('Revolut', 'digitale', '600');
const paypal = await conto('PayPal', 'digitale', '0');
const tr = await conto('Trade Republic', 'investimenti', '1500');
await r('POST', '/condivisioni', M, { voce: 'conto', id: comune, email: 'ele@brokenbroker.test' });

const spesa = async (nome, importo, extra) => (await r('POST', '/spese-previste', M, { nome, importo, ...extra })).id;
const meta = async (id) => r('POST', '/condivisioni', M, { voce: 'spesa', id, email: 'ele@brokenbroker.test' });
const affitto = await spesa('Affitto casa', '612', { conto_id: bper, categoria_id: C('Affitto'), prossima_scadenza: meseFa(6, 1) }); await meta(affitto);
const box = await spesa('Affitto box', '165', { conto_id: bper, categoria_id: C('Parcheggio e box'), prossima_scadenza: meseFa(6, 1) }); await meta(box);
const luce = await spesa('Luce, gas, TIM', '117.80', { conto_id: bper, categoria_id: C('Bollette'), prossima_scadenza: meseFa(6, 5), note: 'Luce 50 · gas 40 · TIM 27,80' }); await meta(luce);
const spotify = await spesa('Spotify duo', '16.99', { conto_id: paypal, categoria_id: C('Musica'), prossima_scadenza: meseFa(6, 12) }); await meta(spotify);
await spesa('Claude', '21.96', { conto_id: intesa, categoria_id: C('Software', 'Abbonamenti'), prossima_scadenza: meseFa(6, 24) });
await spesa('Figma', '25', { conto_id: intesa, categoria_id: C('Software', 'Abbonamenti'), prossima_scadenza: meseFa(6, 26) });
await spesa('Adobe', '18.45', { conto_id: paypal, categoria_id: C('Software', 'Abbonamenti'), prossima_scadenza: meseFa(6, 27) });
const spesaB = await spesa('Spesa', '500', { tipo: 'budget', conto_id: comune, categoria_id: C('Cibo', null) }); await meta(spesaB);
await spesa('Budget personale', '200', { tipo: 'budget', conto_id: revolut, categoria_id: C('Pranzo fuori') });
const macchina = await spesa('Macchina', '70', { tipo: 'budget', conto_id: comune, categoria_id: C('Carburante') }); await meta(macchina);
await spesa('ETF MSCI World', '500', { tipo: 'investimento', conto_id: tr, categoria_id: C('Risparmio e investimenti'), prossima_scadenza: meseFa(6, 2) });
await spesa('Tari', '250', { ogni_mesi: 6, conto_id: bper, categoria_id: C('Tari'), prossima_scadenza: meseFa(-1, 20) });
await spesa('Assicurazione auto', '430.86', { ogni_mesi: 6, conto_id: intesa, categoria_id: C('Assicurazione'), prossima_scadenza: meseFa(-2, 15) });
await spesa('Vacanze invernali', '300', { ogni_mesi: 12, conto_id: revolut, categoria_id: C('Viaggi e vacanze'), prossima_scadenza: meseFa(-2, 20) });
await spesa('Bollo Aygo', '150.52', { ogni_mesi: 12, conto_id: intesa, categoria_id: C('Bollo'), prossima_scadenza: meseFa(-7, 10) });

// Movimenti degli ultimi mesi (entrate, spese di budget e spunte).
const mov = (conto_id, importo, esercente, categoria_id, data) => r('POST', '/movimenti', M, { conto_id, importo, esercente, categoria_id, data });
for (let m = 5; m >= 0; m--) {
  await mov(bper, '1800', 'Stipendio', C('Stipendio'), meseFa(m + 1, 27));
  for (const [c, imp, es, k, g] of [[comune, '-62.30', 'Esselunga', C('Supermercato'), 3], [comune, '-48.10', 'Coop', C('Supermercato'), 11], [comune, '-71.40', 'Esselunga', C('Supermercato'), 19],
    [revolut, '-12.50', 'Bar Centrale', C('Bar'), 6], [revolut, '-38', 'Pizzeria Da Gino', C('Ristoranti'), 14], [comune, '-40', 'Q8', C('Carburante'), 9], [intesa, '-34.99', 'Amazon', C('Tecnologia'), 16]]) {
    const d = meseFa(m, g); if (d <= iso(oggi)) await mov(c, imp, es, k, d);
  }
}
// Spunte del mese in corso per alcune spese fisse.
const mese = iso(oggi).slice(0, 7);
for (const id of [affitto, box, luce, spotify]) await r('POST', `/spese-previste/${id}/spunta`, M, { mese });
await r('POST', '/movimenti/trasferimento', M, { da_conto_id: intesa, a_conto_id: tr, importo: '500', data: giorno(1), descrizione: 'Versamento ETF' });

// Rate.
await r('POST', '/rate', M, { oggetto: 'American Express', finanziaria: 'Amex', importo_rata: '300', numero_rate: 10, prima_scadenza: meseFa(8, 15), conto_id: intesa, categoria_id: C('Rate') });
await r('POST', '/rate', M, { oggetto: 'Pinguino', finanziaria: 'Cofidis', importo_rata: '83.60', numero_rate: 5, prima_scadenza: meseFa(3, 10), conto_id: intesa, categoria_id: C('Rate') });
await r('POST', '/rate', M, { oggetto: 'Telefono', finanziaria: 'Findomestic', importo_rata: '69.25', ultima_scadenza: meseFa(-5, 5), prima_scadenza: meseFa(1, 5), conto_id: intesa, categoria_id: C('Rate') });

// Obiettivi: fondo di emergenza con traguardi di copertura, viaggio con sotto-obiettivi.
const fondo = await r('POST', '/obiettivi', M, { nome: 'Fondo emergenza', traguardo: '8000' });
await r('POST', `/obiettivi/${fondo.id}/versamenti`, M, { importo: '2500' });
for (const [n, i] of [['Un mese di spese', '1770'], ['Due mesi di spese', '3540'], ['Riparazione auto', '2000'], ['PC o telefono nuovo', '2000'], ['Elettrodomestico', '1500'], ['Occhiali', '500']])
  await r('POST', `/obiettivi/${fondo.id}/traguardi`, M, { nome: n, importo: i });
const viaggio = await r('POST', '/obiettivi', M, { nome: 'Viaggio insieme', scadenza: meseFa(-10, 1), crea_spesa: true });
await r('POST', '/condivisioni', M, { voce: 'obiettivo', id: viaggio.id, email: 'ele@brokenbroker.test' });
const parti = [];
for (const [n, t, v] of [['Volo', '600', '600'], ['Alloggio', '900', '300'], ['Spese sul posto', '500', null]]) parti.push([(await r('POST', '/obiettivi', M, { nome: n, padre_id: viaggio.id, traguardo: t })).id, v]);
for (const [id, v] of parti) if (v) await r('POST', `/obiettivi/${id}/versamenti`, M, { importo: v });
const annuali = await r('POST', '/obiettivi', M, { nome: 'Spese annuali', traguardo: '2391.99' });
await r('POST', `/obiettivi/${annuali.id}/versamenti`, M, { importo: '940.24' });
const nikon = await r('POST', '/obiettivi', M, { nome: 'Obiettivo Nikon', traguardo: '400' });
void nikon;

// Investimenti.
const vwce = await r('POST', '/investimenti/titoli', M, { isin: 'IE00BK5BQT80', ticker: 'VWCE', nome: 'Vanguard FTSE All-World', tipo: 'etf' });
const eimi = await r('POST', '/investimenti/titoli', M, { isin: 'IE00BKM4GZ66', ticker: 'EIMI', nome: 'iShares Core MSCI EM IMI', tipo: 'etf' });
// Un portafoglio vero, uno «di prova» (fuori dai totali) e un lotto per ogni acquisto.
const portafoglio = await r('POST', '/investimenti/portafogli', M, { nome: 'Trade Republic', icona: 'trending-up' });
await r('POST', '/investimenti/portafogli', M, { nome: 'Idee', conta_nel_patrimonio: false });
for (let m = 11; m >= 0; m--) {
  const p = (110 + (11 - m) * 1.6).toFixed(2);
  await r('POST', '/investimenti/lotti', M, { titolo_id: vwce.id, portafoglio_id: portafoglio.id, data: meseFa(m, 2), quantita: '3.5', prezzo: p });
  await r('PUT', `/investimenti/titoli/${vwce.id}/prezzi`, M, { data: meseFa(m, 28) > iso(oggi) ? iso(oggi) : meseFa(m, 28), prezzo: (Number(p) + 1.2).toFixed(2) });
}
await r('POST', '/investimenti/lotti', M, { titolo_id: eimi.id, portafoglio_id: portafoglio.id, data: meseFa(9, 2), quantita: '95', prezzo: '31.60' });
// Beni: uno non quotato e due con prezzo di mercato (valore = grammi fini × quotazione spot).
await r('POST', '/investimenti/beni', M, { portafoglio_id: portafoglio.id, nome: 'Fondo pensione', tipo: 'fondo_pensione', costo: '4200', valore: '4650', dove: 'Cometa' });
await r('POST', '/investimenti/beni', M, { portafoglio_id: portafoglio.id, catalogo: 'marengo', quantita: '2', costo: '480', dove: 'Cassetta di sicurezza' });
await r('POST', '/investimenti/beni', M, { portafoglio_id: portafoglio.id, catalogo: 'argento', quantita: '100', purezza: '999', costo: '75' });
await r('PUT', `/investimenti/titoli/${eimi.id}/prezzi`, M, { prezzo: '30.59' });
await r('PUT', `/investimenti/titoli/${vwce.id}/esposizioni`, M, { dimensione: 'area', voci: [{ voce: 'Stati Uniti', peso: '62' }, { voce: 'Europa', peso: '16' }, { voce: 'Giappone', peso: '6' }, { voce: 'Paesi emergenti', peso: '10' }, { voce: 'Altri', peso: '6' }] });
await r('PUT', `/investimenti/titoli/${eimi.id}/esposizioni`, M, { dimensione: 'area', voci: [{ voce: 'Paesi emergenti', peso: '100' }] });
await r('PUT', `/investimenti/titoli/${vwce.id}/esposizioni`, M, { dimensione: 'settore', voci: [{ voce: 'Tecnologia', peso: '25' }, { voce: 'Finanza', peso: '16' }, { voce: 'Salute', peso: '11' }, { voce: 'Industria', peso: '11' }, { voce: 'Altri', peso: '37' }] });
for (const t of [vwce, eimi]) await r('PUT', `/investimenti/titoli/${t.id}/esposizioni`, M, { dimensione: 'classe', voci: [{ voce: 'Azioni', peso: '100' }] });

console.log('Dati di prova creati: accesso con prova@brokenbroker.test');
