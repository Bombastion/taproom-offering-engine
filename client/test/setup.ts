import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { signOut } from '../src/auth';

// jsdom doesn't implement scrolling; Screen scrolls each new screen back to the top
if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => {};
}

afterEach(() => {
  cleanup();
  // Sign-in state lives in a module-level variable as well as in storage
  signOut();
  localStorage.clear();
  sessionStorage.clear();
});
