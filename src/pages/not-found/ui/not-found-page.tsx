import { Link } from '@tanstack/react-router';

export function NotFoundPage() {
  return (
    <main>
      <h1>Page not found</h1>
      <p>The page you requested does not exist.</p>
      <Link to="/">Back to home</Link>
    </main>
  );
}
