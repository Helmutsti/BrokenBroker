import { useWindowDimensions } from 'react-native';

// Un solo punto di rottura per tutta l'app: sotto questa larghezza (telefono) la barra
// laterale diventa una barra in basso e le righe affiancate si impilano.
export const LARGHEZZA_COMPATTA = 720;
export const useCompatto = () => useWindowDimensions().width < LARGHEZZA_COMPATTA;
