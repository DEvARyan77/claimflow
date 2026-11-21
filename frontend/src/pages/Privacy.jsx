import { Link } from 'react-router-dom';
import { LogoMark } from '../components/Icons.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';

/** Public privacy policy (also linked from Google's sign-in screen). */
export default function Privacy() {
  return (
    <main className="privacy">
      <ThemeToggle className="welcome-theme" />
      <article className="card privacy-card">
        <Link to="/login" className="brand"><LogoMark /><span>ClaimFlow</span></Link>
        <h1>Privacy policy</h1>
        <p className="muted small">Last updated: 21 November 2026</p>
        <p>
          ClaimFlow is a portfolio project that demonstrates health-insurance claims: policyholders, hospitals (cashless claims),
          claims officers and admins. This page explains what it stores and why.
        </p>
        <h2>What we collect</h2>
        <ul>
          <li>Account details: name, email, optional alternate email, phone and a hashed password.</li>
          <li>Policy details: policy number, cover, and the policy documents you upload to the Policy Assistant.</li>
          <li>Claims: treatment, hospital, dates, amounts, review notes and payments.</li>
        </ul>
        <h2>Sign in with Google</h2>
        <p>
          If you choose Google, we receive only your name and email address to create or open your account. We don't get your
          password, contacts or any other data, and we don't act on your behalf.
        </p>
        <h2>How it is used</h2>
        <p>
          Only to run the app: deciding and tracking claims, showing them to you and the staff handling them, and sending emails
          about your claims and account (with a copy to your alternate email if you add one). Uploaded policies and flagged claims
          may be sent to Google Gemini to answer your questions or summarise a claim for an officer. We don't sell or share your data,
          and we don't use it for advertising.
        </p>
        <h2>Where it is stored</h2>
        <p>
          On the live demo site, your data is kept in your own browser. When the full system runs, it is stored in MongoDB.
          Emails are sent through Brevo.
        </p>
        <h2>Your choices</h2>
        <p>
          You can clear the demo data at any time with "Reset demo data" on the sign-in page. Please don't enter real medical or
          insurance information: this is a demonstration project. To ask for your data to be deleted, write to us.
        </p>
        <h2>Contact</h2>
        <p>Questions: <a href="mailto:devaryan7766@gmail.com">devaryan7766@gmail.com</a></p>
      </article>
    </main>
  );
}
