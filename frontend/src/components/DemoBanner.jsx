import { IS_DEMO, REPO_URL, resetDemoData } from '../demo/isDemo.js';

/** Thin bar on the free demo site explaining that everything runs in the browser. */
export default function DemoBanner() {
  if (!IS_DEMO) return null;
  return (
    <div className="demo-banner" role="note">
      <span>
        <strong>Live demo</strong> · runs in your browser with sample data. The full version is 9 Spring Boot microservices.
      </span>
      <span className="demo-banner-actions">
        {REPO_URL && (
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            Source code
          </a>
        )}
        <button
          type="button"
          className="link-button"
          onClick={() => {
            if (window.confirm('Reset the demo? Your patients and claims in this browser will go back to the sample data.')) resetDemoData();
          }}
        >
          Reset demo data
        </button>
      </span>
    </div>
  );
}
