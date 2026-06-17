import type { AgentCycle } from './agents/agentCycle';
import type { NexusDB } from './agents/database';
import type { BitgetRESTClient } from './services/bitgetREST';
import type { BitgetWebSocket } from './services/bitgetWS';

export let agent: AgentCycle;
export let db: NexusDB;
export let bitgetREST: BitgetRESTClient;
export let bitgetWS: BitgetWebSocket;

export function initState(
  a: AgentCycle,
  d: NexusDB,
  r: BitgetRESTClient,
  w: BitgetWebSocket
) {
  agent = a;
  db = d;
  bitgetREST = r;
  bitgetWS = w;
}
