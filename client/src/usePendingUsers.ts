import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { useSessionState } from './auth';

export const ADMIN_USERS_KEY = ['admin', 'users'] as const;

// Whether the signed-in user is an admin (the only ones who see and manage other accounts)
export function useIsAdmin(): boolean {
  const session = useSessionState();
  return session.status === 'signedIn' && session.user.role === 'ADMIN';
}

// The user list for admins (nothing is asked of the server for anyone else). The Users screen and
// the "waiting for approval" badge share it, so approving someone updates both.
export function useAdminUsers() {
  const isAdmin = useIsAdmin();
  return useQuery({ queryKey: ADMIN_USERS_KEY, queryFn: api.adminUsers, enabled: isAdmin });
}

// How many accounts are waiting for approval; 0 for non-admins and until it's known
export function usePendingCount(): number {
  return useAdminUsers().data?.counts.PENDING ?? 0;
}
