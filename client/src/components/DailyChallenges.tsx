import { useEffect, useState } from 'react';
import {
  claimDailyChallenge,
  readDailyChallenges,
  type DailyChallengeSnapshot,
} from '../challenges';

export default function DailyChallenges({ onReward }: { onReward: (gems: number) => void }) {
  const [snapshot, setSnapshot] = useState<DailyChallengeSnapshot>(readDailyChallenges);
  const [expanded, setExpanded] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const refresh = () => setSnapshot(readDailyChallenges());
    window.addEventListener('fn-daily-challenge-change', refresh);
    window.addEventListener('storage', refresh);
    const timer = window.setInterval(refresh, 60_000);
    return () => {
      window.removeEventListener('fn-daily-challenge-change', refresh);
      window.removeEventListener('storage', refresh);
      window.clearInterval(timer);
    };
  }, []);

  const readyCount = snapshot.challenges.filter(
    (challenge) =>
      snapshot.progress[challenge.metric] >= challenge.target &&
      !snapshot.claimed.includes(challenge.id),
  ).length;

  return (
    <aside className="fn-daily-challenges" aria-label="Daily challenges">
      <button
        className="fn-daily-challenges-toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <span>Daily challenges</span>
        <strong>{readyCount ? `${readyCount} ready` : '3 today'}</strong>
        <span aria-hidden="true">{expanded ? '−' : '+'}</span>
      </button>
      {expanded && (
        <div className="fn-daily-challenges-content">
          <p>Complete up to three tasks for local demo gems. Progress resets each day.</p>
          {snapshot.challenges.map((challenge) => {
            const progress = snapshot.progress[challenge.metric];
            const complete = progress >= challenge.target;
            const claimed = snapshot.claimed.includes(challenge.id);
            return (
              <article key={challenge.id} className="fn-daily-challenge">
                <div>
                  <strong>{challenge.title}</strong>
                  <span>
                    {Math.min(progress, challenge.target)} / {challenge.target} · {challenge.reward}{' '}
                    gems
                  </span>
                </div>
                <progress
                  value={Math.min(progress, challenge.target)}
                  max={challenge.target}
                  aria-label={`${challenge.title}: ${Math.min(progress, challenge.target)} of ${challenge.target}`}
                />
                {claimed ? (
                  <small>Reward collected</small>
                ) : complete ? (
                  <button
                    onClick={() => {
                      const reward = claimDailyChallenge(challenge.id);
                      if (reward === null) {
                        setNotice(
                          'This challenge reward was already collected or could not be saved.',
                        );
                        return;
                      }
                      onReward(reward);
                      setNotice(`+${reward} demo gems added to your balance.`);
                      setSnapshot(readDailyChallenges());
                    }}
                  >
                    Collect {challenge.reward} gems
                  </button>
                ) : (
                  <small>Keep exploring</small>
                )}
              </article>
            );
          })}
          {notice && (
            <p className="fn-daily-challenge-notice" role="status">
              {notice}
            </p>
          )}
          <small>
            Device-only progress and rewards; browser storage can be changed or cleared.
          </small>
        </div>
      )}
    </aside>
  );
}
