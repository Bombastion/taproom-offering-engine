import { FormEvent, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { api, ApiError } from '../api';
import { signIn, useCredentials } from '../auth';
import { MugIcon } from '../components/Icons';

export function LoginPage() {
  const credentials = useCredentials();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string; search?: string } } | null)?.from;
  const destination = from ? `${from.pathname}${from.search ?? ''}` : '/';

  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (credentials) return <Navigate to={destination} replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!username || !password) {
      setError('Enter the admin username and password.');
      return;
    }
    setBusy(true);
    setError(null);
    const attempt = { username, password };
    try {
      await api.checkCredentials(attempt);
      signIn(attempt, remember);
      navigate(destination, { replace: true });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setError("That username and password didn't work.");
      else if (e instanceof ApiError && e.status === 503) setError("The server's admin password isn't set up yet (TOE_ADMIN_PASSWORD).");
      else setError(e instanceof Error ? e.message : 'Something went wrong.');
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <div className="login-card">
        <div className="brand-mark brand-mark-lg" aria-hidden="true"><MugIcon /></div>
        <div className="page-header">
          <div className="eyebrow">Taproom Offering Engine</div>
          <h1 className="page-title">Sign in</h1>
          <p className="muted">Use the admin login set on the server.</p>
        </div>
        <form className="stack" onSubmit={submit} noValidate>
          <label className="field-label">
            Username
            <input className="field" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" />
          </label>
          <label className="field-label">
            Password
            <input className="field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" autoFocus />
          </label>
          <label className="check-row">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Keep me signed in on this device
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
