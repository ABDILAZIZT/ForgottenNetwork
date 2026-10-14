export type ChallengeMetric = 'draw' | 'explore' | 'place';

export interface DailyChallenge {
  id: string;
  metric: ChallengeMetric;
  title: string;
  target: number;
  reward: number;
}

export interface DailyChallengeSnapshot {
  day: string;
  challenges: DailyChallenge[];
  progress: Record<ChallengeMetric, number>;
  claimed: string[];
  visited: string[];
}

const STORAGE_KEY = 'fn_daily_challenges_v1';
const templates: Record<ChallengeMetric, DailyChallenge[]> = {
  draw: [
    { id: 'draw-50', metric: 'draw', title: 'Draw 50 pixels', target: 50, reward: 30 },
    { id: 'draw-100', metric: 'draw', title: 'Draw 100 pixels', target: 100, reward: 40 },
    { id: 'draw-200', metric: 'draw', title: 'Draw 200 pixels', target: 200, reward: 50 },
  ],
  explore: [
    {
      id: 'explore-10',
      metric: 'explore',
      title: 'Visit 10 new neighborhoods',
      target: 10,
      reward: 40,
    },
    {
      id: 'explore-20',
      metric: 'explore',
      title: 'Visit 20 new neighborhoods',
      target: 20,
      reward: 45,
    },
    {
      id: 'explore-30',
      metric: 'explore',
      title: 'Visit 30 new neighborhoods',
      target: 30,
      reward: 50,
    },
  ],
  place: [
    { id: 'place-3', metric: 'place', title: 'Place 3 creations', target: 3, reward: 40 },
    { id: 'place-5', metric: 'place', title: 'Place 5 creations', target: 5, reward: 45 },
    { id: 'place-8', metric: 'place', title: 'Place 8 creations', target: 8, reward: 50 },
  ],
};

const metrics: ChallengeMetric[] = ['draw', 'explore', 'place'];

export function localDayKey(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function hash(value: string) {
  let result = 2166136261;
  for (const character of value) {
    result ^= character.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function challengesFor(day: string) {
  return metrics.map((metric) => {
    const choices = templates[metric];
    return choices[hash(`${day}:${metric}`) % choices.length];
  });
}

function emptySnapshot(day: string): DailyChallengeSnapshot {
  return {
    day,
    challenges: challengesFor(day),
    progress: { draw: 0, explore: 0, place: 0 },
    claimed: [],
    visited: [],
  };
}

function readSnapshot(now = new Date()): DailyChallengeSnapshot {
  const day = localDayKey(now);
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!value || typeof value !== 'object' || (value as { day?: unknown }).day !== day)
      return emptySnapshot(day);
    const stored = value as Partial<DailyChallengeSnapshot>;
    const progress = stored.progress;
    return {
      day,
      challenges: challengesFor(day),
      progress: {
        draw: validProgress(progress?.draw),
        explore: validProgress(progress?.explore),
        place: validProgress(progress?.place),
      },
      claimed: Array.isArray(stored.claimed)
        ? [...new Set(stored.claimed.filter((id): id is string => typeof id === 'string'))]
        : [],
      visited: Array.isArray(stored.visited)
        ? [
            ...new Set(
              stored.visited.filter((place): place is string => typeof place === 'string'),
            ),
          ].slice(-100)
        : [],
    };
  } catch {
    return emptySnapshot(day);
  }
}

function validProgress(value: unknown) {
  return Number.isSafeInteger(value) && (value as number) >= 0
    ? Math.min(value as number, 1_000_000)
    : 0;
}

function saveSnapshot(snapshot: DailyChallengeSnapshot) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        day: snapshot.day,
        progress: snapshot.progress,
        claimed: snapshot.claimed,
        visited: snapshot.visited,
      }),
    );
  } catch {
    return false;
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('fn-daily-challenge-change'));
  return true;
}

export function readDailyChallenges(now = new Date()): DailyChallengeSnapshot {
  return readSnapshot(now);
}

export function recordDailyChallengeProgress(
  metric: ChallengeMetric,
  amount: number,
  now = new Date(),
) {
  if (!Number.isSafeInteger(amount) || amount <= 0) return false;
  const snapshot = readSnapshot(now);
  const target = snapshot.challenges.find((challenge) => challenge.metric === metric)?.target;
  if (!target) return false;
  const next = Math.min(target, snapshot.progress[metric] + amount);
  if (next === snapshot.progress[metric]) return false;
  snapshot.progress[metric] = next;
  return saveSnapshot(snapshot);
}

export function recordDailyChallengeExplore(neighborhood: string, now = new Date()) {
  if (!neighborhood || neighborhood.length > 80) return false;
  const snapshot = readSnapshot(now);
  if (snapshot.visited.includes(neighborhood)) return false;
  snapshot.visited.push(neighborhood);
  snapshot.visited = snapshot.visited.slice(-100);
  const target = snapshot.challenges.find((challenge) => challenge.metric === 'explore')?.target;
  if (!target) return false;
  snapshot.progress.explore = Math.min(target, snapshot.progress.explore + 1);
  return saveSnapshot(snapshot);
}

export function claimDailyChallenge(id: string, now = new Date()) {
  const snapshot = readSnapshot(now);
  const challenge = snapshot.challenges.find((item) => item.id === id);
  if (
    !challenge ||
    snapshot.progress[challenge.metric] < challenge.target ||
    snapshot.claimed.includes(challenge.id)
  )
    return null;
  snapshot.claimed.push(challenge.id);
  return saveSnapshot(snapshot) ? challenge.reward : null;
}
