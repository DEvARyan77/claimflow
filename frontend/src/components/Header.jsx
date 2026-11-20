import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useSession } from '../session.jsx';
import { initials } from '../format.js';
import { LogoMark, PlusIcon } from './Icons.jsx';
import ThemeToggle from './ThemeToggle.jsx';

export default function Header({ patient }) {
  const { signOut } = useSession();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const close = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  const switchPatient = () => {
    setMenuOpen(false);
    signOut();
    navigate('/welcome');
  };

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <div className="site-header-left">
          <Link to="/" className="brand" aria-label="ClaimFlow home">
            <LogoMark />
            <span>ClaimFlow</span>
          </Link>
          <nav aria-label="Main" className="main-nav">
            <NavLink to="/" end>My claims</NavLink>
            <NavLink to="/coverage">Coverage</NavLink>
            <NavLink to="/hospitals">Hospitals</NavLink>
            <NavLink to="/assistant">Policy assistant</NavLink>
          </nav>
        </div>
        <div className="site-header-right">
          <ThemeToggle />
          <Link to="/new" className="btn btn-primary btn-pill new-claim-btn" aria-label="New claim">
            <PlusIcon /> <span className="new-claim-text">New claim</span>
          </Link>
          <div className="account" ref={menuRef}>
            <button
              type="button"
              className="avatar"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label={patient ? `Account: ${patient.name}` : 'Account'}
              onClick={() => setMenuOpen((open) => !open)}
            >
              {patient ? initials(patient.name) : '…'}
            </button>
            {menuOpen && patient && (
              <div className="account-menu" role="menu">
                <div className="account-menu-head">
                  <strong>{patient.name}</strong>
                  <span>Policy {patient.policyNumber}</span>
                </div>
                <button type="button" role="menuitem" onClick={switchPatient}>
                  Switch patient
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
