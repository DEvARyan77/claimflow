import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useSession } from '../session.jsx';
import { initials, ROLE_NAMES } from '../format.js';
import { LogoMark, PlusIcon } from './Icons.jsx';
import ThemeToggle from './ThemeToggle.jsx';
import AiToggle from './AiToggle.jsx';

const NAV = {
  POLICYHOLDER: [['/', 'My claims'], ['/coverage', 'Coverage'], ['/hospitals', 'Hospitals'], ['/assistant', 'Policy assistant']],
  HOSPITAL: [['/', 'Claims'], ['/assistant', 'Policy assistant']],
  OFFICER: [['/', 'Review queue'], ['/claims', 'All claims'], ['/hospitals', 'Hospitals'], ['/assistant', 'Policy assistant']],
  ADMIN: [['/', 'Dashboard'], ['/claims', 'Claims'], ['/policies', 'Policies'], ['/people', 'People'], ['/hospitals', 'Hospitals']],
};

const NEW_BUTTON = { POLICYHOLDER: 'New claim', HOSPITAL: 'Cashless claim' };

export default function Header({ user, patient }) {
  const { signOut } = useSession();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => setNavOpen(false), [pathname]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const close = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setMenuOpen(false);
    };
    const onKey = (e) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const logOut = () => {
    setMenuOpen(false);
    signOut();
    navigate('/login');
  };

  const links = NAV[user.role] ?? [];
  const newLabel = NEW_BUTTON[user.role];

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <div className="site-header-left">
          <button type="button" className="nav-burger" aria-label="Menu" aria-expanded={navOpen} aria-controls="main-nav"
            onClick={() => setNavOpen((o) => !o)}>
            <span /><span /><span />
          </button>
          <Link to="/" className="brand" aria-label="ClaimFlow home">
            <LogoMark />
            <span>ClaimFlow</span>
          </Link>
          <nav aria-label="Main" id="main-nav" className={`main-nav${navOpen ? ' is-open' : ''}`}>
            {links.map(([to, label]) => (
              <NavLink key={to} to={to} end>{label}</NavLink>
            ))}
          </nav>
        </div>
        <div className="site-header-right">
          <AiToggle />
          <ThemeToggle />
          {newLabel && (
            <Link to="/new" className="btn btn-primary btn-pill new-claim-btn" aria-label={newLabel}>
              <PlusIcon /> <span className="new-claim-text">{newLabel}</span>
            </Link>
          )}
          <div className="account" ref={menuRef}>
            <button type="button" className="avatar" aria-haspopup="menu" aria-expanded={menuOpen}
              aria-label={`Account: ${user.name}`} onClick={() => setMenuOpen((open) => !open)}>
              {initials(user.name)}
            </button>
            {menuOpen && (
              <div className="account-menu" role="menu">
                <div className="account-menu-head">
                  <strong>{user.name}</strong>
                  <span>{patient ? `Policy ${patient.policyNumber}` : ROLE_NAMES[user.role]}</span>
                  <span>{user.email}</span>
                </div>
                <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); navigate('/profile'); }}>
                  Profile & settings
                </button>
                <button type="button" role="menuitem" onClick={logOut}>
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
