import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AdminUser, api, errorMessage, UserStatus } from '../api';
import { useSessionState } from '../auth';
import { ADMIN_USERS_KEY, useAdminUsers } from '../usePendingUsers';
import { PageHeader, Screen } from '../components/Screen';
import { Loading, LoadError } from '../components/QueryState';
import { ConfirmSheet } from '../components/Sheet';
import { useToast } from '../components/Toast';

const TABS: { status: UserStatus; label: string; empty: string }[] = [
  { status: 'PENDING', label: 'Pending', empty: 'Nobody is waiting for approval.' },
  { status: 'ACTIVE', label: 'Active', empty: 'No active accounts.' },
  { status: 'DISABLED', label: 'Disabled', empty: 'No disabled accounts.' },
];

function nameOf(user: AdminUser): string {
  return user.displayName || user.email;
}

function day(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// What a confirmation sheet is asking about
type Pending =
  | { kind: 'reject' | 'disable'; user: AdminUser }
  | { kind: 'role'; user: AdminUser; role: 'USER' | 'ADMIN' };

// Admin only (see RequireAdmin in app.tsx): approving requests and managing accounts. Admins
// don't get to see anyone's menus or items; this is all the extra they can do.
export function UsersPage() {
  const users = useAdminUsers();
  const session = useSessionState();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<UserStatus | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Pending | null>(null);

  const me = session.status === 'signedIn' ? session.user.id : null;
  const counts = users.data?.counts;
  // Opens on the pending requests when there are any, since that's what an admin comes here for
  const shown: UserStatus = tab ?? ((counts?.PENDING ?? 0) > 0 ? 'PENDING' : 'ACTIVE');
  const list = users.data?.users.filter((u) => u.status === shown) ?? [];
  // Newest requests last, as they came in; the others by name
  if (shown !== 'PENDING') list.sort((a, b) => nameOf(a).localeCompare(nameOf(b)));

  const refresh = () => queryClient.invalidateQueries({ queryKey: ADMIN_USERS_KEY });

  const run = async (user: AdminUser, action: () => Promise<unknown>, done: string) => {
    setBusyId(user.id);
    try {
      await action();
      await refresh();
      toast(done);
    } catch (e) {
      toast(errorMessage(e), 'error');
      // The list may be out of date (somebody else got there first)
      void refresh();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Screen barTitle="Users" parent="/">
      <div className="page">
        <PageHeader eyebrow="Admin" title="Users" sub="Approve requests for accounts and manage who can sign in. Everyone has their own menus, items and pour sizes; admins don't see anyone else's." />

        {users.isPending && <Loading />}
        {users.isError && <LoadError error={users.error} onRetry={() => users.refetch()} />}
        {users.data && (
          <>
            <div className="chip-row" role="tablist" aria-label="Accounts">
              {TABS.map(({ status, label }) => (
                <button
                  key={status}
                  type="button"
                  role="tab"
                  aria-selected={shown === status}
                  className={`chip${shown === status ? ' chip-on' : ''}`}
                  onClick={() => setTab(status)}
                >
                  {label} ({users.data.counts[status]})
                </button>
              ))}
            </div>

            <div className="stack-sm">
              {list.length === 0 && <div className="empty">{TABS.find((t) => t.status === shown)!.empty}</div>}
              {list.map((user) => {
                const isMe = user.id === me;
                const busy = busyId === user.id;
                return (
                  <div key={user.id} className="card card-top user-card">
                    <div className="card-main">
                      <div className="card-title-row">
                        <div className="card-title">{nameOf(user)}</div>
                        {user.role === 'ADMIN' && <span className="badge">Admin</span>}
                        {isMe && <span className="badge badge-quiet">You</span>}
                      </div>
                      {user.displayName && <div className="card-meta">{user.email}</div>}
                      <div className="card-meta">
                        {user.status === 'PENDING' || !user.approvedAt ? `Requested ${day(user.createdAt)}` : `Approved ${day(user.approvedAt)}`}
                      </div>
                      {!isMe && (
                        <div className="user-actions">
                          {user.status === 'PENDING' && (
                            <>
                              <button type="button" className="chip chip-accent" disabled={busy} onClick={() => run(user, () => api.approveUser(user.id), `Approved ${nameOf(user)}`)}>
                                Approve
                              </button>
                              <button type="button" className="chip chip-danger" disabled={busy} onClick={() => setConfirming({ kind: 'reject', user })}>
                                Reject
                              </button>
                            </>
                          )}
                          {user.status === 'ACTIVE' && (
                            <>
                              <button type="button" className="chip" disabled={busy} onClick={() => setConfirming({ kind: 'role', user, role: user.role === 'ADMIN' ? 'USER' : 'ADMIN' })}>
                                {user.role === 'ADMIN' ? 'Make regular user' : 'Make admin'}
                              </button>
                              <button type="button" className="chip chip-danger" disabled={busy} onClick={() => setConfirming({ kind: 'disable', user })}>
                                Disable
                              </button>
                            </>
                          )}
                          {user.status === 'DISABLED' && (
                            <button type="button" className="chip chip-accent" disabled={busy} onClick={() => run(user, () => api.enableUser(user.id), `Enabled ${nameOf(user)}`)}>
                              Enable
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {confirming?.kind === 'reject' && (
        <ConfirmSheet
          title="Reject this request?"
          message={`${nameOf(confirming.user)} won't be able to sign in, and ${confirming.user.email} can't be used to ask again. You can still enable the account later.`}
          confirmLabel="Reject"
          onClose={() => setConfirming(null)}
          onConfirm={async () => {
            await api.rejectUser(confirming.user.id);
            await refresh();
            setConfirming(null);
            toast(`Rejected ${nameOf(confirming.user)}`);
          }}
        />
      )}
      {confirming?.kind === 'disable' && (
        <ConfirmSheet
          title="Disable this account?"
          message={`${nameOf(confirming.user)} will be signed out and won't be able to sign in. Their menus and items are kept, and you can enable the account again.`}
          confirmLabel="Disable"
          onClose={() => setConfirming(null)}
          onConfirm={async () => {
            await api.disableUser(confirming.user.id);
            await refresh();
            setConfirming(null);
            toast(`Disabled ${nameOf(confirming.user)}`);
          }}
        />
      )}
      {confirming?.kind === 'role' && (
        <ConfirmSheet
          title={confirming.role === 'ADMIN' ? 'Make this person an admin?' : 'Make this person a regular user?'}
          message={
            confirming.role === 'ADMIN'
              ? `${nameOf(confirming.user)} will be able to approve and disable accounts and make other people admins. They still can't see anyone else's menus or items.`
              : `${nameOf(confirming.user)} will no longer be able to manage accounts.`
          }
          confirmLabel={confirming.role === 'ADMIN' ? 'Make admin' : 'Make regular user'}
          tone={confirming.role === 'ADMIN' ? 'primary' : 'danger'}
          onClose={() => setConfirming(null)}
          onConfirm={async () => {
            await api.setUserRole(confirming.user.id, confirming.role);
            await refresh();
            setConfirming(null);
            toast(confirming.role === 'ADMIN' ? `${nameOf(confirming.user)} is now an admin` : `${nameOf(confirming.user)} is now a regular user`);
          }}
        />
      )}
    </Screen>
  );
}
