import { beforeEach, vi } from 'vitest';

// Route handlers log every error they turn into a 4xx/5xx response, and the in-memory data
// provider logs "TODO" notices for dangling IDs. Keep the test output readable; tests that care
// about logging can still inspect these spies.
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
