import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="card empty">
      <h1>Page not found</h1>
      <p className="muted">The page you're looking for doesn't exist.</p>
      <Link to="/" className="btn btn-primary btn-pill">
        Go to my claims
      </Link>
    </div>
  );
}
