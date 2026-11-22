import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useSession } from '../session.jsx';
import { IS_DEMO } from '../demo/isDemo.js';

let gisLoading = null;
function loadGoogleScript() {
  gisLoading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error("Couldn't load Google sign-in"));
    document.head.appendChild(s);
  });
  return gisLoading;
}

/**
 * "Continue with Google": signs in, or creates a policyholder account with a new policy.
 * Shown only when the server has a Google client ID.
 */
export default function GoogleButton({ onSignedIn, onError }) {
  const { signIn } = useSession();
  const [clientId, setClientId] = useState(null);
  const [busy, setBusy] = useState(false);
  const box = useRef(null);

  useEffect(() => {
    api.socialConfig().then((c) => setClientId(c?.google ?? null)).catch(() => setClientId(null));
  }, []);

  // Re-draw Google's button when the light/dark theme changes, so it always matches the page
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === 'dark');
  useEffect(() => {
    const watch = new MutationObserver(() => setDark(document.documentElement.dataset.theme === 'dark'));
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => watch.disconnect();
  }, []);

  useEffect(() => {
    if (!clientId || !box.current) return;
    let cancelled = false;
    loadGoogleScript()
      .then(() => {
        if (cancelled || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: async ({ credential }) => {
            setBusy(true);
            try {
              const result = await api.googleSignIn(credential);
              signIn(result);
              onSignedIn?.(result);
            } catch (e) {
              onError?.(e.message);
            } finally {
              setBusy(false);
            }
          },
        });
        const width = Math.min(box.current.offsetWidth || 320, 400);
        box.current.innerHTML = '';
        window.google.accounts.id.renderButton(box.current, { theme: dark ? 'filled_black' : 'outline', size: 'large', text: 'continue_with', shape: 'pill', width });
      })
      .catch((e) => onError?.(e.message));
    return () => {
      cancelled = true;
    };
  }, [clientId, dark]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!clientId) return null;
  return (
    <div className="social-signin">
      <div className="or-line"><span>or</span></div>
      <div ref={box} className={`google-box${busy ? ' is-busy' : ''}`} />
      {IS_DEMO && <p className="small muted">On this demo, Google sign-in creates a demo policyholder account in your browser.</p>}
    </div>
  );
}
