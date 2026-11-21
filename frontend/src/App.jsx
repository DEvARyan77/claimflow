import { useCallback, useEffect, useState } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { api } from './api.js';
import { useSession } from './session.jsx';
import Header from './components/Header.jsx';
import Login from './pages/auth/Login.jsx';
import Register from './pages/auth/Register.jsx';
import ForgotPassword from './pages/auth/ForgotPassword.jsx';
import ResetPassword from './pages/auth/ResetPassword.jsx';
import MyClaims from './pages/MyClaims.jsx';
import NewClaim from './pages/NewClaim.jsx';
import Coverage from './pages/Coverage.jsx';
import Hospitals from './pages/Hospitals.jsx';
import NotFound from './pages/NotFound.jsx';
import PolicyAssistant from './pages/PolicyAssistant.jsx';
import Profile from './pages/Profile.jsx';
import ClaimDetail from './pages/ClaimDetail.jsx';
import HospitalHome from './pages/hospital/HospitalHome.jsx';
import CashlessClaim from './pages/hospital/CashlessClaim.jsx';
import ReviewQueue from './pages/officer/ReviewQueue.jsx';
import AllClaims from './pages/officer/AllClaims.jsx';
import AdminHome from './pages/admin/AdminHome.jsx';
import People from './pages/admin/People.jsx';
import Policies from './pages/admin/Policies.jsx';

export default function App() {
  const { user } = useSession();
  const role = user?.role;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/register" element={user ? <Navigate to="/" replace /> : <Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/welcome" element={<Navigate to="/login" replace />} />

      <Route element={user ? <SignedInLayout /> : <ToLogin />}>
        {role === 'POLICYHOLDER' && (
          <>
            <Route index element={<MyClaims />} />
            <Route path="claims/:claimId" element={<MyClaims />} />
            <Route path="new" element={<NewClaim />} />
            <Route path="coverage" element={<Coverage />} />
          </>
        )}
        {role === 'HOSPITAL' && (
          <>
            <Route index element={<HospitalHome />} />
            <Route path="new" element={<CashlessClaim />} />
            <Route path="claims/:claimId" element={<ClaimDetail />} />
          </>
        )}
        {role === 'OFFICER' && (
          <>
            <Route index element={<ReviewQueue />} />
            <Route path="claims" element={<AllClaims />} />
            <Route path="claims/:claimId" element={<ClaimDetail />} />
          </>
        )}
        {role === 'ADMIN' && (
          <>
            <Route index element={<AdminHome />} />
            <Route path="claims" element={<AllClaims />} />
            <Route path="claims/:claimId" element={<ClaimDetail />} />
            <Route path="people" element={<People />} />
            <Route path="policies" element={<Policies />} />
          </>
        )}
        {role !== 'HOSPITAL' && <Route path="hospitals" element={<Hospitals />} />}
        <Route path="assistant" element={<PolicyAssistant />} />
        <Route path="profile" element={<Profile />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

/** Not signed in: go to the sign-in page and come back here afterwards. */
function ToLogin() {
  const { pathname, search } = useLocation();
  return <Navigate to="/login" replace state={{ from: pathname + search }} />;
}

/**
 * Shares the signed-in user with every page (Outlet context). Policyholders also get their policy
 * (patient), loaded once and refreshed by the pages.
 */
function SignedInLayout() {
  const { user } = useSession();
  const { pathname } = useLocation();
  const [patient, setPatient] = useState(null);
  const [error, setError] = useState(null);
  const needsPatient = user.role === 'POLICYHOLDER';

  // quiet = background refresh: no red pop-up if it fails
  const refreshPatient = useCallback(async (quiet = false) => {
    if (!needsPatient) return;
    try {
      setPatient(await api.patient(user.patientId, { quiet }));
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, [needsPatient, user.patientId]);

  useEffect(() => {
    refreshPatient();
  }, [refreshPatient]);

  const ready = !needsPatient || patient;
  return (
    <div className="app">
      <Header user={user} patient={patient} />
      <main className="container page-enter" id="main" key={pathname}>
        {error && !ready && (
          <div className="banner banner-error" role="alert">
            <p>{error}</p>
            <button type="button" className="btn btn-secondary" onClick={() => refreshPatient()}>Try again</button>
          </div>
        )}
        {!error && !ready && <p className="muted loading">Loading your account…</p>}
        {ready && <Outlet context={{ user, patient, refreshPatient }} />}
      </main>
    </div>
  );
}
