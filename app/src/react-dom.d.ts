// react-dom c'è già (lo porta react-native-web): serve solo il tipo di createPortal.
declare module 'react-dom' {
  export function createPortal(figli: import('react').ReactNode, nodo: Element): import('react').ReactElement;
}
