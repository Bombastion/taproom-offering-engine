import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

// public/preview-frame.html is what the designer draws the print menu into. It needs a real browser to
// run (it rewrites its own document), which these tests are not; they keep its few important properties
// from being edited away. It was checked in Chromium with the app's real content policies.

const page = fs.readFileSync(path.join(import.meta.dirname, '..', 'public', 'preview-frame.html'), 'utf8');
const script = page.match(/<script>([\s\S]*?)<\/script>/)![1];

describe('the preview frame page', () => {
  it('only takes what the app that embeds it sends', () => {
    expect(script).toContain('event.source !== window.parent');
    expect(script).toContain("message.type !== 'toe-preview'");
    expect(script).toContain("typeof message.html !== 'string'");
  });

  it('listens again after each write, since writing a document removes its listeners', () => {
    const write = script.indexOf('document.close()');
    expect(write).toBeGreaterThan(-1);
    expect(script.slice(write)).toMatch(/listen\(\);/);
  });

  it('has no doctype of its own to pass on, and reaches out to nothing', () => {
    expect(script).not.toMatch(/fetch|XMLHttpRequest|WebSocket|importScripts|location|eval\(|innerHTML/);
    expect(page).not.toMatch(/<(link|img|iframe)\b|src=|href=/i);
  });

  it('has a content policy that is sandboxed and allows only what the menu itself needs', () => {
    const policy = fs.readFileSync(path.join(import.meta.dirname, '..', 'docker', 'security-headers-preview.conf'), 'utf8')
      .match(/add_header Content-Security-Policy "([^"]*)"/)![1];
    const directives = Object.fromEntries(policy.split(';').map((d) => d.trim().split(/\s+(.*)/)).map(([name, value]) => [name, value ?? '']));
    expect(directives.sandbox).toBe('allow-scripts');
    expect(directives['default-src']).toBe("'none'");
    expect(directives['img-src']).toBe('data:');
    expect(directives['font-src']).toBe("'self'");
    // Nothing may be fetched from anywhere (no connect-src, so default-src's 'none' applies), nor framed, nor submitted
    expect(directives['connect-src']).toBeUndefined();
    expect(directives['form-action']).toBe("'none'");
  });

  // (The Dockerfile that copies the policy into the image isn't in the test image, so that line isn't checked here)
  it('is served with that policy, and only this file is', () => {
    const nginx = fs.readFileSync(path.join(import.meta.dirname, '..', 'docker', 'nginx.conf'), 'utf8');
    expect(nginx).toMatch(/location = \/admin\/preview-frame\.html \{[^}]*security-headers-preview\.conf/);
  });
});
