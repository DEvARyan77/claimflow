/** true on the free demo site (built with `npm run build:demo`), where the browser plays the backend. */
export const IS_DEMO = import.meta.env.VITE_DEMO === 'true';
/** Optional link to the source code, shown in the demo banner (set VITE_REPO_URL in .env.demo). */
export const REPO_URL = import.meta.env.VITE_REPO_URL || '';

/** Wipes everything the demo saved in this browser and starts again from the sample data. */
export function resetDemoData() {
  try {
    localStorage.removeItem('claimflow-demo-v1');
    localStorage.removeItem('claimflow.patientId');
  } catch {
    // storage blocked: nothing was saved anyway
  }
  window.location.href = '/welcome';
}
