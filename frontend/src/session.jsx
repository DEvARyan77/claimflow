import { createContext, useCallback, useContext, useState } from 'react';

// Demo "sign in": we only remember which patient you picked. No passwords.
const STORAGE_KEY = 'claimflow.patientId';
const SessionContext = createContext(null);

function readStoredId() {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value || null;   // MongoDB ids are strings, e.g. "673f1c2a9b..."
  } catch {
    return null;
  }
}

export function SessionProvider({ children }) {
  const [patientId, setPatientId] = useState(readStoredId);

  const signIn = useCallback((id) => {
    setPatientId(id);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(id));
    } catch {
      // storage unavailable (private mode); the choice lasts until the page reloads
    }
  }, []);

  const signOut = useCallback(() => {
    setPatientId(null);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  return (
    <SessionContext.Provider value={{ patientId, signIn, signOut }}>{children}</SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}
