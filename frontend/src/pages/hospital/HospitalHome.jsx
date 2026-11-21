import { useCallback, useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { api } from '../../api.js';
import { formatINR } from '../../format.js';
import ClaimTable, { providerMap, StatTiles } from '../../components/ClaimTable.jsx';
import { PlusIcon } from '../../components/Icons.jsx';

/** Hospital dashboard: its cashless claims, what's waiting, and what has been paid. */
export default function HospitalHome() {
  const { user } = useOutletContext();
  const [claims, setClaims] = useState(null);
  const [payments, setPayments] = useState([]);
  const [providers, setProviders] = useState({});
  const [error, setError] = useState(null);

  const load = useCallback(async (quiet = false) => {
    try {
      const [list, paid] = await Promise.all([
        api.claimsForProvider(user.providerId, { quiet }),
        api.paymentsForProvider(user.providerId, { quiet: true }).catch(() => []),
      ]);
      setClaims(list);
      setPayments(paid);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, [user.providerId]);

  useEffect(() => {
    load();
    api.providers({ quiet: true }).then((l) => setProviders(providerMap(l))).catch(() => {});
    const t = setInterval(() => load(true), 8000);
    return () => clearInterval(t);
  }, [load]);

  const hospital = providers[user.providerId];
  const count = (...s) => (claims ?? []).filter((c) => s.includes(c.status)).length;
  const received = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const needsReply = count('INFO_REQUESTED');

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <h1>{hospital?.name ?? user.name}</h1>
          <p className="lead">Raise cashless claims for insured patients and follow them until you’re paid.</p>
        </div>
        <Link to="/new" className="btn btn-primary btn-pill btn-large"><PlusIcon /> New cashless claim</Link>
      </div>

      {error && <div className="banner banner-error" role="alert"><p>{error}</p></div>}

      {needsReply > 0 && (
        <div className="callout callout-warning">
          <strong>Action needed: </strong>
          {needsReply === 1 ? 'A claim is' : `${needsReply} claims are`} waiting for information from you. Open it to reply.
        </div>
      )}

      <StatTiles tiles={[
        { label: 'Claims raised', value: claims?.length ?? '…' },
        { label: 'With the insurer', value: count('SUBMITTED', 'UNDER_REVIEW', 'INFO_REQUESTED') },
        { label: 'Approved or paid', value: count('APPROVED', 'PAID'), tone: 'good' },
        { label: 'Received', value: formatINR(received), sub: `${payments.length} payments`, tone: 'good' },
      ]} />

      <section className="stack-md">
        <h2 className="section-title">Your claims</h2>
        <ClaimTable claims={claims} providers={providers} empty="No claims yet. Raise your first cashless claim." />
      </section>
    </div>
  );
}
