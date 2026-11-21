import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import ClaimTable, { providerMap } from '../../components/ClaimTable.jsx';

export default function AllClaims() {
  const [claims, setClaims] = useState(null);
  const [providers, setProviders] = useState({});
  const [error, setError] = useState(null);

  useEffect(() => {
    api.allClaims().then(setClaims).catch((e) => setError(e.message));
    api.providers({ quiet: true }).then((l) => setProviders(providerMap(l))).catch(() => {});
  }, []);

  return (
    <div className="stack-lg">
      <div>
        <h1>All claims</h1>
        <p className="lead">Every claim, newest first. Open one to see its fraud check and history.</p>
      </div>
      {error && <div className="banner banner-error" role="alert"><p>{error}</p></div>}
      <ClaimTable claims={error ? [] : claims} providers={providers} showRisk />
    </div>
  );
}
