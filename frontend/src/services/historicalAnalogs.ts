import { EquityData, StressScenario, ShockSeverity, HistoricalAnalog } from '../types';
import { HISTORICAL_BLACK_SWANS } from '../data/blackSwans';

export function findClosestAnalogs(
  equity: EquityData,
  scenario: StressScenario,
  _severity: ShockSeverity
): HistoricalAnalog[] {
  return HISTORICAL_BLACK_SWANS.map((analog) => {
    let score = analog.similarityScore;

    // Adjust similarity score based on equity traits
    if (equity.beta > 2.0 && analog.id === 'yen_carry_2024') {
      score = Math.min(99, score + 4);
    }
    if (equity.tokenizedChain && analog.id === 'svb_collapse_2023') {
      score = Math.min(98, score + 5);
    }
    if (scenario.category === 'Tech' && analog.id === 'fed_jumbo_2022') {
      score = Math.min(96, score + 6);
    }
    if (scenario.category === 'Liquidity' && analog.id === 'covid_flash_2020') {
      score = Math.min(95, score + 8);
    }

    // Custom transmission note tailored to the current equity
    let tailoredTransmission = analog.keyTransmission;
    if (analog.id === 'yen_carry_2024') {
      tailoredTransmission = `${equity.symbol}'s high beta (${equity.beta}x) mirrors the tech basket that suffered rapid -15.8% forced margin liquidation during Asian hours.`;
    } else if (analog.id === 'svb_collapse_2023') {
      tailoredTransmission = `Because ${equity.name} trades 7x24 on ${equity.tokenizedChain}, weekend price discovery can suffer a ${equity.weekendSpreadBps * 3} bps spread widening like in SVB.`;
    } else if (analog.id === 'fed_jumbo_2022') {
      tailoredTransmission = `Multiple de-rating from P/E ${equity.peRatio} down to sector average, with recovery averaging ${analog.recoveryDays} trading sessions.`;
    }

    return {
      ...analog,
      similarityScore: score,
      keyTransmission: tailoredTransmission,
    };
  }).sort((a, b) => b.similarityScore - a.similarityScore);
}
