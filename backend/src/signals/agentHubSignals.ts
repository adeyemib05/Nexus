import type { AgentHubClient } from '../services/agentHubClient';
import type { SignalReading, SignalType } from '../types';
import { scoreToStrength, clamp } from '../types/helpers';
import { computeMcpMacro, computeMcpSentiment, computeMcpOnchain, computeMcpNews } from './mcpSignals';
import type { McpSignalResult } from './mcpSignals';

function toSignalReading(type: SignalType, label: string, result: McpSignalResult): SignalReading {
  const isReal = !result.details?.error;
  return {
    type,
    score: result.score,
    strength: scoreToStrength(result.score),
    confidence: result.confidence,
    label,
    source: isReal ? 'agent_hub' : 'mock',
    details: result.details,
    timestamp: Date.now(),
  };
}

/**
 * Computes macro / sentiment / on-chain / news using Bitget Agent Hub's real
 * market-data MCP server, and blends in the local technical signal.
 *
 * `hubClient` is no longer used for the live HTTP calls (those endpoints
 * never existed — see marketDataMcp.ts for the real mechanism) but the
 * parameter is kept so callers in signalFusion.ts don't need to change.
 */
export async function computeAgentHubSignals(
  _hubClient: AgentHubClient,
  symbol: string,
  localTechSignal: SignalReading
): Promise<SignalReading[]> {
  const [macroResult, sentimentResult, onchainResult, newsResult] = await Promise.all([
    computeMcpMacro(),
    computeMcpSentiment(symbol),
    computeMcpOnchain(),
    computeMcpNews(),
  ]);

  const macro = toSignalReading('macro', 'Macro Conditions', macroResult);
  const sentiment = toSignalReading('sentiment', 'Market Sentiment', sentimentResult);
  const onchain = toSignalReading('onchain', 'On-Chain Activity', onchainResult);
  const news = toSignalReading('news', 'News & Events', newsResult);

  // Technical stays exactly as computed locally — the MCP server's own
  // technical_analysis tool would be redundant with what we already compute
  // from real Bitget candle data in technicalSignal.ts.
  const technicalSignal: SignalReading = {
    ...localTechSignal,
    score: clamp(localTechSignal.score, -1, 1),
  };

  return [technicalSignal, macro, sentiment, onchain, news];
}
