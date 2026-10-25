import { FormEvent, useState } from 'react';
import { Link, Navigate } from 'react-router';
import { api, errorMessage } from '../api';
import { MIN_PASSWORD_LENGTH } from '../auth';
import { useSession } from '../session';
import { MugIcon } from '../components/Icons';
import { Loading } from '../components/QueryState';

// Asking for an account. Nothing is created that can be used yet: an admin has to approve the
// request first, and there's no email, so the person finds out by trying to sign in later.
export function SignupPage() {
  const session = useSession();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  if (session.status === 'signedIn') return <Navigate to="/" replace />;
  if (session.status === 'loading') return <Loading />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Use a password of at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.signup(email.trim(), password, name.trim() || null);
      setSent(true);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <div className="login-card">
        <div className="brand-mark brand-mark-lg" aria-hidden="true"><MugIcon /></div>
        {sent ? (
          <>
            <div className="page-header">
              <div className="eyebrow">Taproom Offering Engine</div>
              <h1 className="page-title">Request sent</h1>
              <p className="muted">
                An admin needs to approve your account before you can sign in. There's no email
                about it, so try signing in again later.
              </p>
            </div>
            <Link to="/login" className="btn-primary">Back to sign in</Link>
          </>
        ) : (
          <>
            <div className="page-header">
              <div className="eyebrow">Taproom Offering Engine</div>
              <h1 className="page-title">Request an account</h1>
              <p className="muted">An admin will review your request. You can sign in once it's approved.</p>
            </div>
            <form className="stack" onSubmit={submit} noValidate>
              <label className="field-label">
                Your name (optional)
                <input className="field" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={100} />
              </label>
              <label className="field-label">
                Email
                <input className="field" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoCapitalize="none" />
              </label>
              <label className="field-label">
                Password
                <input className="field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" aria-describedby="password-hint" />
              </label>
              <p id="password-hint" className="muted-sm">At least {MIN_PASSWORD_LENGTH} characters.</p>
              <label className="field-label">
                Confirm password
                <input className="field" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
              </label>
              {error && <p className="form-error" role="alert">{error}</p>}
              <button type="submit" className="btn-primary" disabled={busy}>
                {busy ? 'Sending…' : 'Request account'}
              </button>
            </form>
            <p className="muted login-alt">
              Already have an account? <Link to="/login">Sign in</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
