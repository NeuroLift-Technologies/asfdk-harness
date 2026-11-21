import { AsfdkHarness } from './src/harness.ts';
import { createMcpServer } from './src/mcp-server.ts';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

const harness = new AsfdkHarness();
await harness.start();
const server = createMcpServer(harness);
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
await server.connect(serverTransport);
const client = new Client({ name: 'test-client', version: '1.0.0' });
await client.connect(clientTransport);
const toolsResult = await client.listTools();
console.log('Tools:', toolsResult.tools.map(t => t.name));

const interopResult = await client.callTool({ name: 'asfdk_interop_protocols', arguments: {} });
console.log('Interop result:', JSON.stringify(interopResult, null, 2));

await client.close();
await server.close();
await harness.shutdown();