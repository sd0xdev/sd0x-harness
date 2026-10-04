import { expect, test } from 'claude-code/testing'
import { CAPS, displayPath, sanitize } from '../lib/sanitize.js'

test('a token passed as a flag argument is redacted, in both flag forms', () => {
  expect(sanitize('gh api --token ghp_abcdef123456 repos')).toBe('gh api --token <redacted> repos')
  expect(sanitize('tool --api-key=sk-live-xyz run')).toBe('tool --api-key=<redacted> run')
})

test('URL userinfo, query and fragment are redacted; host and path stay', () => {
  expect(sanitize('git clone https://user:s3cret@github.com/o/r.git'))
    .toBe('git clone https://<redacted>@github.com/o/r.git')
  expect(sanitize('curl https://api.example.com/v1?access_token=abc#frag'))
    .toBe('curl https://api.example.com/v1?<redacted>#<redacted>')
})

test('an scp-like remote with a user part is redacted', () => {
  expect(sanitize('git push tok123@github.com:o/r.git')).toBe('git push <redacted>@github.com:o/r.git')
})

test('secret-named assignments are redacted; ordinary ones are kept', () => {
  expect(sanitize('API_KEY=abc DATABASE_PASSWORD="p w" NODE_ENV=test npm test'))
    .toBe('API_KEY=<redacted> DATABASE_PASSWORD=<redacted> NODE_ENV=test npm test')
})

test('authorization headers and bearer tokens are redacted', () => {
  expect(sanitize('curl -H "Authorization: Bearer eyJhbGciOi.payload.sig" x')).toMatch(/Authorization: Bearer <redacted>/)
  expect(sanitize('token is Bearer abcdefghijklmnop')).toBe('token is Bearer <redacted>')
})

test('text over the cap is truncated with an ellipsis; null and undefined become empty', () => {
  const long = 'x'.repeat(CAPS.requested + 50)
  const out = sanitize(long)
  expect(out.length).toBe(CAPS.requested)
  expect(out.endsWith('…')).toBe(true)
  expect(sanitize(undefined)).toBe('')
  expect(sanitize(null)).toBe('')
  expect(sanitize('abc', 2)).toBe('a…')
})

test('displayPath shows worktree paths relative and others under ~, never in full', () => {
  const ctx = { worktree: '/Users/u/repo', home: '/Users/u' }
  expect(displayPath('/Users/u/repo/src/a.ts', ctx)).toBe('src/a.ts')
  expect(displayPath('/Users/u/repo', ctx)).toBe('.')
  expect(displayPath('/Users/u/.kube/config', ctx)).toBe('~/.kube/config')
  expect(displayPath('/etc/hosts', ctx)).toBe('/etc/hosts')
  expect(displayPath(undefined, ctx)).toBe('')
})

test('regression: space-separated and equals key flags are redacted, other flags are kept', () => {
  expect(sanitize('cat --private-key demo-secret file')).toBe('cat --private-key <redacted> file')
  expect(sanitize('tool --key demo-secret')).toBe('tool --key <redacted>')
  expect(sanitize('tool --password=hunter2 -n 5')).toBe('tool --password=<redacted> -n 5')
  expect(sanitize('git log -n 5 --format=%h')).toBe('git log -n 5 --format=%h')
  expect(sanitize('tool --token -v')).toBe('tool --token -v')
})

test('regression: a secret flag inside a quoted value of an ordinary flag is redacted', () => {
  expect(sanitize('sh -c "tool --token demo-secret"')).toBe('sh -c "tool --token <redacted>"')
  expect(sanitize("bash -c 'curl https://u:pw@h/x'")).toBe("bash -c 'curl https://<redacted>@h/x'")
  expect(sanitize('env -S "API_KEY=abc run"')).toBe('env -S "API_KEY=<redacted> run"')
})

test('the reason and hand-over caps hold at their limits', () => {
  const r = sanitize('r'.repeat(CAPS.reason + 10), CAPS.reason)
  expect(r.length).toBe(CAPS.reason)
  expect(r.endsWith('…')).toBe(true)
  expect(sanitize('r'.repeat(CAPS.reason), CAPS.reason)).toBe('r'.repeat(CAPS.reason))
  expect(CAPS.handoff).toBe(16 * 1024)
})
