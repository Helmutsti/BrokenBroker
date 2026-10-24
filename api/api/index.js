// Punto d'ingresso della funzione Vercel: tutte le richieste arrivano qui (vedi vercel.json).
// È JavaScript di proposito: Node 24 esegue direttamente i .ts di src/ (come in Docker), senza compilazione.
export { default } from '../src/server.ts';
