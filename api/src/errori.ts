import type { ErrorRequestHandler } from 'express';

export class ErroreApi extends Error {
  status: number;
  constructor(status: number, messaggio: string) {
    super(messaggio);
    this.status = status;
  }
}

export const nonTrovato = (cosa: string) => new ErroreApi(404, `${cosa} non trovato`);

// Traduce gli errori del database in risposte comprensibili.
const erroriPostgres: Record<string, [number, string]> = {
  '23505': [409, 'Esiste già una voce con questi dati'],
  '23503': [409, 'La voce è collegata ad altri dati o fa riferimento a una voce inesistente'],
  '23514': [400, 'Valore non ammesso'],
  '23502': [400, 'Manca un campo obbligatorio'],
  '22P02': [400, 'Formato non valido'],
  '22003': [400, 'Numero fuori dai limiti'],
  '42501': [403, 'Operazione non permessa'],
};

export const gestoreErrori: ErrorRequestHandler = (errore, _req, res, _next) => {
  if (errore instanceof ErroreApi) {
    res.status(errore.status).json({ errore: errore.message });
    return;
  }
  if (errore?.type === 'entity.parse.failed') {
    res.status(400).json({ errore: 'JSON non valido' });
    return;
  }
  const noto = typeof errore?.code === 'string' ? erroriPostgres[errore.code] : undefined;
  if (noto) {
    res.status(noto[0]).json({ errore: noto[1] });
    return;
  }
  console.error(errore);
  res.status(500).json({ errore: 'Errore interno' });
};
