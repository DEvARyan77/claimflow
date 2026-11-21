import { createContext, useCallback, useContext, useEffect, useState } from 'react';

/**
 * The signed-in user: { token, user } from POST /auth/login, kept in localStorage.
 * The token is a JWT; when it expires (or the API says 401) the user is signed out.
 */
const STORAGE_KEY = 'claimflow.auth';
export const SIGNED_OUT_EVENT = 'claimflow:signed-out';
const SessionContext = createContext(null);

function tokenExpired(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' && payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

function readStored() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved?.token && saved?.user && !tokenExpired(saved.token)) return saved;
  } catch {
    // corrupted or blocked storage: signed out
  }
  return null;
}

/** For api.js, which runs outside React. */
export function currentToken() {
  return readStored()?.token ?? null;
}

function store(value) {
  try {
    if (value) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage unavailable (private mode): the session lasts until the page reloads
  }
}

export function SessionProvider({ children }) {
  const [auth, setAuth] = useState(readStored);

  const signIn = useCallback((loginResponse) => {
    store(loginResponse);
    setAuth(loginResponse);
  }, []);

  const signOut = useCallback(() => {
    store(null);
    setAuth(null);
  }, []);

  /** After editing the profile: keep the token, replace the user. */
  const updateUser = useCallback((user) => {
    setAuth((current) => {
      if (!current) return current;
      const next = { ...current, user };
      store(next);
      return next;
    });
  }, []);

  // api.js fires this when the server says the login is no longer valid
  useEffect(() => {
    const onSignedOut = () => setAuth(null);
    window.addEventListener(SIGNED_OUT_EVENT, onSignedOut);
    return () => window.removeEventListener(SIGNED_OUT_EVENT, onSignedOut);
  }, []);

  return (
    <SessionContext.Provider value={{ token: auth?.token ?? null, user: auth?.user ?? null, signIn, signOut, updateUser }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}

export function signOutEverywhere() {
  store(null);
  window.dispatchEvent(new Event(SIGNED_OUT_EVENT));
}
