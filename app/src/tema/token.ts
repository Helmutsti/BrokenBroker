// Token del design system, copiati dalla libreria Figma (collezioni Colore e
// Dimensioni). Nomi come in Figma con "-" al posto di "/" (AGENTS.md).
// Si aggiornano rileggendo le variabili dalla libreria: non si scrivono a mano.

export const colori = {
  chiaro: {
    'sfondo-pagina': '#FFFFFF', 'sfondo-barra-laterale': '#F5F5F5', 'sfondo-scheda': '#FFFFFF', 'sfondo-tenue': '#F0F0F0',
    'sfondo-accento': '#3B5B7A', 'sfondo-accento-tenue': '#EEF2F6', 'sfondo-ok-tenue': '#F0FDF4', 'sfondo-attenzione-tenue': '#FFF7ED',
    'sfondo-errore-tenue': '#FEF2F2', 'sfondo-velo': '#00000066', 'sfondo-accento-hover': '#2F4A64', 'sfondo-hover': '#F2F2F2',
    'sfondo-controllo-spento': '#8C8C8C', 'sfondo-pomello': '#FFFFFF',
    'testo-primario': '#1A1A1A', 'testo-secondario': '#525252', 'testo-terziario': '#6B6B6B', 'testo-su-accento': '#FFFFFF',
    'testo-accento': '#3B5B7A', 'testo-ok': '#15803D', 'testo-attenzione': '#C2410C', 'testo-errore': '#B91C1C',
    'bordo-scheda': '#D9D9D9', 'bordo-controllo': '#8C8C8C', 'bordo-separatore': '#EBEBEB', 'bordo-errore': '#DC2626', 'bordo-focus': '#3B5B7A',
    'icona-predefinita': '#525252', 'icona-tenue': '#6B6B6B', 'icona-su-accento': '#FFFFFF', 'icona-accento': '#3B5B7A',
    'icona-ok': '#15803D', 'icona-attenzione': '#C2410C', 'icona-errore': '#B91C1C',
    'avanzamento-traccia': '#EBEBEB', 'avanzamento-accento': '#3B5B7A', 'avanzamento-ok': '#15803D', 'avanzamento-attenzione': '#C2410C',
    'avanzamento-errore': '#DC2626',
  },
  scuro: {
    'sfondo-pagina': '#111315', 'sfondo-barra-laterale': '#16191D', 'sfondo-scheda': '#1B1F24', 'sfondo-tenue': '#262B31',
    'sfondo-accento': '#8FB0CF', 'sfondo-accento-tenue': '#22303D', 'sfondo-ok-tenue': '#12291A', 'sfondo-attenzione-tenue': '#2F1D10',
    'sfondo-errore-tenue': '#2E1517', 'sfondo-velo': '#00000099', 'sfondo-accento-hover': '#B4CBE0', 'sfondo-hover': '#262B31',
    'sfondo-controllo-spento': '#6E7781', 'sfondo-pomello': '#F2F2F2',
    'testo-primario': '#F2F2F2', 'testo-secondario': '#B3B3B3', 'testo-terziario': '#8F96A0', 'testo-su-accento': '#0F1A24',
    'testo-accento': '#9DBAD6', 'testo-ok': '#4ADE80', 'testo-attenzione': '#FB923C', 'testo-errore': '#F87171',
    'bordo-scheda': '#2E343B', 'bordo-controllo': '#6E7781', 'bordo-separatore': '#262B31', 'bordo-errore': '#F87171', 'bordo-focus': '#9DBAD6',
    'icona-predefinita': '#B3B3B3', 'icona-tenue': '#8F96A0', 'icona-su-accento': '#0F1A24', 'icona-accento': '#9DBAD6',
    'icona-ok': '#4ADE80', 'icona-attenzione': '#FB923C', 'icona-errore': '#F87171',
    'avanzamento-traccia': '#2E343B', 'avanzamento-accento': '#8FB0CF', 'avanzamento-ok': '#22C55E', 'avanzamento-attenzione': '#F97316',
    'avanzamento-errore': '#EF4444',
  },
} as const;

export type NomeColore = keyof typeof colori.chiaro;

export const dimensioni = {
  'spazio-testo': 4, 'spazio-elenco': 4, 'spazio-icona': 8, 'spazio-pillole': 8, 'spazio-colonne': 12, 'spazio-blocco': 16, 'spazio-gruppo': 24,
  'margine-pagina': 32, 'margine-barra-laterale': 16, 'margine-scheda': 24, 'margine-finestra': 32,
  'margine-riquadro-v': 12, 'margine-riquadro-h': 16, 'margine-controllo-v': 8, 'margine-controllo-h': 12,
  'margine-voce-v': 8, 'margine-voce-h': 12, 'margine-pulsante-v': 8, 'margine-pulsante-h': 16,
  'margine-etichetta-v': 4, 'margine-etichetta-h': 8, 'margine-riga-v': 12, 'margine-gruppo-controlli': 4,
  'raggio-controllo': 8, 'raggio-controllo-interno': 4, 'raggio-scheda': 12, 'raggio-finestra': 16, 'raggio-pillola': 999,
  'misura-icona-piccola': 16, 'misura-icona-media': 20, 'misura-icona-grande': 24,
  'misura-tessera-piccola': 28, 'misura-tessera-media': 32, 'misura-tessera-grande': 40,
  'misura-bersaglio': 24, 'misura-avanzamento': 8, 'misura-bordo': 1, 'misura-bordo-forte': 2,
  'misura-interruttore-larghezza': 36, 'misura-interruttore-altezza': 20, 'misura-pomello': 16, 'misura-pomello-margine': 2,
  'misura-spunta': 20, 'misura-avatar-piccolo': 32, 'misura-avatar-grande': 48,
  'misura-rientro-albero': 32, 'misura-rientro-albero-doppio': 64,
  'larghezza-barra-laterale': 256, 'larghezza-finestra': 600, 'larghezza-accesso': 448,
  'durata-rapida': 120, 'durata-normale': 200, 'opacita-disattivato': 0.45,
} as const;

export const carattere = 'IBM Plex Sans';

// Stili di testo (classi .stile-<nome> nel codice web).
export const stiliTesto = {
  'titolo-pagina': { fontSize: 30, lineHeight: 36, fontWeight: '700' },
  'numero-grande': { fontSize: 24, lineHeight: 29, fontWeight: '700' },
  'logo': { fontSize: 20, lineHeight: 24, fontWeight: '700' },
  'titolo-scheda': { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  'corpo-normale': { fontSize: 14, lineHeight: 21, fontWeight: '400' },
  'corpo-forte': { fontSize: 14, lineHeight: 21, fontWeight: '600' },
  'dettaglio-normale': { fontSize: 12, lineHeight: 17, fontWeight: '400' },
  'dettaglio-forte': { fontSize: 12, lineHeight: 17, fontWeight: '500' },
  'etichetta-gruppo': { fontSize: 12, lineHeight: 17, fontWeight: '600', letterSpacing: 0.48, textTransform: 'uppercase' },
} as const;

export type NomeStile = keyof typeof stiliTesto;

export const ombre = {
  comparsa: { offsetY: 8, blur: 24, colore: '#0000000F' },
  finestra: { offsetY: 12, blur: 40, colore: '#0000002E' },
} as const;
