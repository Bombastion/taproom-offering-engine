import { FormEvent, useState } from 'react';
import { api, errorMessage } from '../api';
import { MIN_PASSWORD_LENGTH, useSessionState } from '../auth';
import { useSignOut } from '../useSignOut';
import { PageHeader, Screen } from '../components/Screen';
import { useToast } from '../components/Toast';

export function AccountPage() {
  const session = useSessionState();
  const signOut = useSignOut();
  const toast = useToast();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (session.status !== 'signedIn') return null;
  const { user } = session;

  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    if (!current) {
      setError('Enter your current password.');
      return;
    }
    if (next.length < MIN_PASSWORD_LENGTH) {
      setError(`Use a new password of at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (next !== confirm) {
      setError("The two new passwords don't match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.changePassword(current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
      toast('Password changed');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen barTitle="Account" parent="/">
      <div className="page">
        <PageHeader eyebrow="Account" title={user.displayName || user.email} sub={user.displayName ? user.email : undefined} />

        <div className="list-panel">
          <div className="lib-row account-row">
            <span>Role</span>
            <span className="muted">{user.role === 'ADMIN' ? 'Admin' : 'Member'}</span>
          </div>
        </div>

        <form className="stack" onSubmit={changePassword} noValidate aria-labelledby="change-password-heading">
          <h2 id="change-password-heading" className="section-title">Change password</h2>
          <label className="field-label">
            Current password
            <input className="field" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
          </label>
          <label className="field-label">
            New password
            <input className="field" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" aria-describedby="new-password-hint" />
          </label>
          <p id="new-password-hint" className="muted-sm">At least {MIN_PASSWORD_LENGTH} characters. Changing it signs you out everywhere else.</p>
          <label className="field-label">
            Confirm new password
            <input className="field" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Change password'}
          </button>
        </form>

        <button
          type="button"
          className="btn-secondary"
          onClick={async () => {
            try {
              await signOut();
            } catch (e) {
              toast(errorMessage(e), 'error');
            }
          }}
        >
          Sign out
        </button>
      </div>
    </Screen>
  );
}
