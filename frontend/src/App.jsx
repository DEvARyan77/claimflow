import { useCallback, useEffect, useState } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { api } from './api.js';
import { useSession } from './session.jsx';
import Header from './components/Header.jsx';
import DemoBanner from './components/DemoBanner.jsx';
import ChoosePatient from './pages/ChoosePatient.jsx';
import MyClaims from './pages/MyClaims.jsx';
import NewClaim from './pages/NewClaim.jsx';
import Coverage from './pages/Coverage.jsx';
import Hospitals from './pages/Hospitals.jsx';
import NotFound from './pages/NotFound.jsx';
import PolicyAssistant from './pages/PolicyAssistant.jsx';

export default function App() {
  const { patientId } = useSession();

  return (
    <Routes>
      <Route path="/welcome" element={<ChoosePatient />} />
      <Route element={patientId ? <SignedInLayout /> : <Navigate to="/welcome" replace />}>
        <Route index element={<MyClaims />} />
        <Route path="new" element={<NewClaim />} />
        <Route path="coverage" element={<Coverage />} />
        <Route path="hospitals" element={<Hospitals />} />
        <Route path="assistant" element={<PolicyAssistant />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

/** Loads the signed-in patient once and shares it with every page through the Outlet context. */
function SignedInLayout() {
  const { patientId, signOut } = useSession();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [patient, setPatient] = useState(null);
  const [error, setError] = useState(null);

  // quiet = background refresh: no red pop-up if it fails
  const refreshPatient = useCallback(async (quiet = false) => {
    try {
      const data = await api.patient(patientId, { quiet });
      setPatient(data);
      setError(null);
    } catch (e) {
      if (e.status === 404) {
        signOut();
        navigate('/welcome', { replace: true });
      } else {
        setError(e.message);
      }
    }
  }, [patientId, signOut, navigate]);

  useEffect(() => {
    refreshPatient();
  }, [refreshPatient]);

  return (
    <div className="app">
      <DemoBanner />
      <Header patient={patient} />
      <main className="container page-enter" id="main" key={pathname}>
        {error && !patient && (
          <div className="banner banner-error" role="alert">
            <p>{error}</p>
            <button type="button" className="btn btn-secondary" onClick={() => refreshPatient()}>
              Try again
            </button>
          </div>
        )}
        {!error && !patient && <p className="muted loading">Loading your account…</p>}
        {patient && <Outlet context={{ patient, refreshPatient }} />}
      </main>
    </div>
  );
}
