import { useQuery } from '@tanstack/react-query';
import { api } from './api';

// Whether people can request accounts (the server's TOE_SIGNUP_ENABLED). Assumed yes until the
// server says otherwise, so a slow or failed lookup never hides the option from anyone: the server
// refuses a request that isn't allowed anyway.
export function useSignupEnabled(): boolean {
  const config = useQuery({ queryKey: ['auth', 'config'], queryFn: api.authConfig, staleTime: 60_000 });
  return config.data?.signupEnabled ?? true;
}
