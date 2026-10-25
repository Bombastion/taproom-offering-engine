import { useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { setSignedOut } from './auth';

// Signs out on the server (rather than just forgetting the session here) and wipes everything
// cached, so nothing from this session lingers for whoever signs in next. Throws if the server
// couldn't be reached, in which case the user is still signed in.
export function useSignOut(): () => Promise<void> {
  const queryClient = useQueryClient();
  return async () => {
    await api.logout();
    queryClient.clear();
    setSignedOut();
  };
}
