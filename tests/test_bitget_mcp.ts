/**
 * Test Suite: NEXUS Official Bitget Agent Hub MCP Integration
 * Run with tsx: npx tsx tests/test_bitget_mcp.ts
 */

import {
  parseMcpTransport,
  textOfMcpResult,
  clearMcpSession,
  getCachedMcpSession,
  MCP_PROTOCOL_VERSION,
  BITGET_MCP_ENDPOINT,
} from '../api/mcp/client';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ ${message}`);
  }
}

console.log('═══════════════════════════════════════════════════════════════');
console.log('NEXUS BITGET AGENT HUB MCP TEST SUITE');
console.log('═══════════════════════════════════════════════════════════════\n');

// ── TEST 1: Plain application/json Transport Parsing ─────────────────────────
console.log('Test 1: Plain application/json Transport Parsing');
const plainJson = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  result: {
    serverInfo: { name: 'bitget-mcp-server', version: '4.0.3' },
  },
});
const parsed1 = parseMcpTransport(plainJson, 'application/json');
assert(parsed1 !== null, 'Test 1 parsed object must not be null');
assert(parsed1?.result?.serverInfo?.name === 'bitget-mcp-server', 'Test 1 serverInfo.name must match');
assert(parsed1?.result?.serverInfo?.version === '4.0.3', 'Test 1 serverInfo.version must match');
console.log('');

// ── TEST 2: Multi-Line Server-Sent Events (SSE) Transport Parsing ────────────
console.log('Test 2: Multi-Line Server-Sent Events (SSE) Transport Parsing');
const multiLineSse = `event: message
data: {
data:   "jsonrpc": "2.0",
data:   "id": 1,
data:   "result": {
data:     "content": [
data:       { "type": "text", "text": "{\\"results\\":[{\\"symbol\\":\\"NVDA\\",\\"last_price\\":120.50}]}" }
data:     ]
data:   }
data: }

`;
const parsed2 = parseMcpTransport(multiLineSse, 'text/event-stream; charset=utf-8');
assert(parsed2 !== null, 'Test 2 multi-line SSE must parse successfully');
assert(parsed2?.jsonrpc === '2.0', 'Test 2 jsonrpc must be 2.0');
const innerText = textOfMcpResult(parsed2?.result);
assert(innerText.includes('NVDA'), 'Test 2 inner content text must contain NVDA');
const innerPayload = JSON.parse(innerText);
assert(innerPayload.results[0].last_price === 120.50, 'Test 2 last_price must equal 120.50');
console.log('');

// ── TEST 3: Windows CRLF Line Endings in SSE Stream ─────────────────────────
console.log('Test 3: Windows CRLF (\\r\\n) in SSE Stream');
const crlfSse = 'event: message\r\ndata: {"jsonrpc":"2.0","result":{"ok":true}}\r\n\r\n';
const parsed3 = parseMcpTransport(crlfSse, 'text/event-stream');
assert(parsed3 !== null, 'Test 3 CRLF SSE must parse');
assert(parsed3?.result?.ok === true, 'Test 3 result.ok must be true');
console.log('');

// ── TEST 4: Malformed and Edge-case Payload Resilience ──────────────────────
console.log('Test 4: Malformed and Edge-case Payloads');
assert(parseMcpTransport('', 'application/json') === null, 'Test 4 empty string yields null');
assert(parseMcpTransport('not a json at all', 'application/json') === null, 'Test 4 invalid JSON yields null');
assert(parseMcpTransport('data:   \n', 'text/event-stream') === null, 'Test 4 empty SSE yields null');
console.log('');

// ── TEST 5: Session Cache Lifecycle & Invalidation ──────────────────────────
console.log('Test 5: Session Cache Lifecycle');
clearMcpSession();
assert(getCachedMcpSession() === null, 'Test 5 initial session must be null after clear');
console.log('');

// ── TEST 6: Protocol Version & Endpoint Integrity ───────────────────────────
console.log('Test 6: Protocol Version & Endpoint Constants');
assert(MCP_PROTOCOL_VERSION === '2025-06-18', 'Protocol version must match official Bitget specification 2025-06-18');
assert(BITGET_MCP_ENDPOINT.includes('agent.bitget.com/mcp'), 'Default endpoint must target agent.bitget.com/mcp');
console.log('');

// ── TEST 7: Content Block Text Extraction ───────────────────────────────────
console.log('Test 7: Content Block Text Extraction');
const textResult = textOfMcpResult({
  content: [
    { type: 'text', text: 'Category: Crypto (40 entries)' },
    { type: 'text', text: 'Category: Equity (21 entries)' },
  ],
});
assert(textResult.includes('Crypto (40 entries)'), 'Must extract first text block');
assert(textResult.includes('Equity (21 entries)'), 'Must extract second text block');
console.log('');

console.log('═══════════════════════════════════════════════════════════════');
console.log('ALL 7 BITGET AGENT HUB MCP PROTOCOL TESTS PASSED! 🚀');
console.log('═══════════════════════════════════════════════════════════════');
