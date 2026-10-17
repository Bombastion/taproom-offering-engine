import { FormEvent, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../api';
import { setSignedIn } from '../auth';
import { useSession } from '../session';
import { MugIcon } from '../components/Icons';
import { Loading } from '../components/QueryState';

export function LoginPage() {
  const session = useSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string; search?: string } } | null)?.from;
  const destination = from ? `${from.pathname}${from.search ?? ''}` : '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (session.status === 'signedIn') return <Navigate to={destination} replace />;
  // Still finding out whether the browser is already signed in
  if (session.status === 'loading') return <Loading />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { user } = await api.login(email.trim(), password, remember);
      // Start clean, so nothing cached for a previous user shows up for this one
      queryClient.clear();
      setSignedIn(user);
      navigate(destination, { replace: true });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setError("That email and password didn't work.");
      // Pending approval, or disabled: the server's own wording says which
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
          <p className="muted">Use the email and password for your account.</p>
        </div>
        <form className="stack" onSubmit={submit} noValidate>
          <label className="field-label">
            Email
            <input className="field" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoCapitalize="none" autoFocus />
          </label>
          <label className="field-label">
            Password
            <input className="field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
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
