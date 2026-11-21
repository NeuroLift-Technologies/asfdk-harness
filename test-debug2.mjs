import { AsfdkHarness } from './src/harness.ts';
const harness = new AsfdkHarness();
await harness.start();
const snapshot = await harness.protocolSnapshot();
console.log('Keys:', Object.keys(snapshot));
console.log('TOI keys:', snapshot.toi ? Object.keys(snapshot.toi) : 'none');
console.log('OTOI keys:', snapshot.otoi ? Object.keys(snapshot.otoi) : 'none');
await harness.shutdown();