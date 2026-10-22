// Avvio della pagina web: stessa app, disegnata da react-native-web.
import { AppRegistry } from 'react-native';
import App from './App';

AppRegistry.registerComponent('BrokenBroker', () => App);
AppRegistry.runApplication('BrokenBroker', { rootTag: document.getElementById('radice') as never, initialProps: {} });
