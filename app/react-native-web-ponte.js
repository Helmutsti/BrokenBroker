// Sul web "react-native" è react-native-web. Alcune librerie (react-native-svg)
// importano anche pezzi solo nativi, usati solo su iPhone: qui esistono vuoti
// perché il pacchetto web si costruisca.
export * from 'react-native-web';
export const TurboModuleRegistry = { get: () => null, getEnforcing: () => ({}) };
export const codegenNativeComponent = () => null;
