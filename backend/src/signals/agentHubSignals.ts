import type { AgentHubClient, AgentHubResult } from '../services/agentHubClient';
import type { SignalReading, SignalType } from '../types';
import { scoreToStrength, clamp } from '../types/helpers';

interface SkillConfig {
  skill: string;
  type: SignalType;
  label: string;
}

// Skills that map directly to a SignalReading (technical-analysis is handled
// separately below since it gets blended with the local technical signal).
const HUB_SKILLS: SkillConfig[] = [
  { skill: 'macro-analyst', type: 'macro', label: 'Macro Conditions' },
  { skill: 'market-intel', type: 'onchain', label: 'On-Chain Activity' },
  { skill: 'news-briefing', type: 'news', label: 'News & Events' },
  { skill: 'sentiment-analyst', type: 'sentiment', label: 'Market Sentiment' },
];

function toSignalReading(type: SignalType, label: string, result: AgentHubResult): SignalReading {
  const isReal = result.score !== 0;
  return {
    type,
    score: result.score,
    strength: scoreToStrength(result.score),
    confidence: isReal ? 0.72 : 0.35,
    label,
    source: isReal ? 'agent_hub' : 'mock',
    details: result.details,
    timestamp: Date.now(),
  };
}

/**
 * Calls all 5 Bitget Agent Hub skills (via Promise.allSettled internally,
 * inside hubClient.callAllSkills), maps the 4 non-technical skills to
 * SignalReadings, and blends the Agent Hub technical-analysis result with
 * the locally computed technical signal.
 *
 * Always returns exactly 5 SignalReadings in order:
 * [technical, macro, sentiment, onchain, news]
 */
export async function computeAgentHubSignals(
  hubClient: AgentHubClient,
  symbol: string,
  localTechSignal: SignalReading
): Promise<SignalReading[]> {
  const results = await hubClient.callAllSkills(symbol);

  const [macro, onchain, news, sentiment] = HUB_SKILLS.map(({ skill, type, label }) =>
    toSignalReading(type, label, results[skill])
  );

  // ── Blend Agent Hub technical-analysis with the local technical signal ──
  let technicalSignal = localTechSignal;
  const hubTech = results['technical-analysis'];
  if (hubTech && hubTech.score !== 0) {
    const blendedScore = clamp(localTechSignal.score * 0.6 + hubTech.score * 0.4, -1, 1);
    const blendedConfidence = clamp(localTechSignal.confidence * 0.6 + hubTech.confidence * 0.4, 0, 1);
    technicalSignal = {
      ...localTechSignal,
      score: blendedScore,
      strength: scoreToStrength(blendedScore),
      confidence: blendedConfidence,
      source: 'agent_hub',
    };
  }

  return [technicalSignal, macro, sentiment, onchain, news];
}
