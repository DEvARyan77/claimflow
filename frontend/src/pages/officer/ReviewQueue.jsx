import { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../api.js';
import { firstName, formatINR } from '../../format.js';
import ClaimTable, { providerMap, StatTiles } from '../../components/ClaimTable.jsx';

/** Claims officer's home: flagged claims, riskiest first. */
export default function ReviewQueue() {
  const { user } = useOutletContext();
  const [queue, setQueue] = useState(null);
  const [stats, setStats] = useState(null);
  const [providers, setProviders] = useState({});
  const [error, setError] = useState(null);

  const load = useCallback(async (quiet = false) => {
    try {
      const [q, s] = await Promise.all([api.reviewQueue({ quiet }), api.claimStats({ quiet: true }).catch(() => null)]);
      setQueue(q);
      setStats(s);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
    api.providers({ quiet: true }).then((l) => setProviders(providerMap(l))).catch(() => {});
    const t = setInterval(() => load(true), 10000);
    return () => clearInterval(t);
  }, [load]);

  const high = (queue ?? []).filter((c) => c.fraud?.level === 'HIGH').length;
  const waitingOnOthers = (queue ?? []).filter((c) => c.status === 'INFO_REQUESTED').length;
  const atStake = (queue ?? []).reduce((s, c) => s + Number(c.amount), 0);

  return (
    <div className="stack-lg">
      <div>
        <h1>Good to see you, {firstName(user.name)} 👋</h1>
        <p className="lead">
          {queue === null ? 'Loading the review queue…'
            : queue.length === 0 ? 'The queue is empty. Every claim has been decided. 🎉'
              : `${queue.length} claim${queue.length === 1 ? '' : 's'} need${queue.length === 1 ? 's' : ''} your decision. The riskiest are at the top.`}
        </p>
      </div>
      {error && <div className="banner banner-error" role="alert"><p>{error}</p></div>}

      <StatTiles tiles={[
        { emoji: '🕵️', label: 'In the queue', value: queue?.length ?? '…' },
        { emoji: '🚩', label: 'High risk', value: high, tone: high ? 'bad' : undefined },
        { emoji: '⏳', label: 'Waiting for a reply', value: waitingOnOthers, tone: waitingOnOthers ? 'warn' : undefined },
        { emoji: '💰', label: 'Amount under review', value: formatINR(atStake) },
        ...(stats ? [{ emoji: '📊', label: 'Claims in total', value: stats.total }] : []),
      ]} />

      <ClaimTable claims={queue} providers={providers} showRisk showFilters={(queue?.length ?? 0) > 3}
        empty="Nothing to review. Flagged claims will appear here." />
    </div>
  );
}
