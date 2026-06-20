import { useState } from 'react';
import { useInterval } from './useInterval';
import { formatDuration } from '../lib/utils';

export function useRelativeTime(ts: number | null): string {
  const [, forceTick] = useState(0);
  useInterval(() => forceTick((t) => t + 1), 5000);

  if (!ts) return 'just now';
  return formatDuration(Date.now() - ts);
}
