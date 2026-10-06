import { expect, test } from 'claude-code/testing'
import { MAX_HASHED_PATHS, commands, digest, fold, parseFlags, parseStatus } from '../lib/fingerprint.js'

const ok = (stdout) => ({ exitCode: 0, stdout, stderr: '' })
const clean = { head: ok('abc123\n'), index: ok('100644 h1 0\ta.js\0'), flags: ok('H a.js\0'), status: ok('') }

test('every git command disables fsmonitor and optional locks, and hashes raw bytes', () => {
  for (const argv of Object.values(commands)) {
    expect(argv.slice(0, 6)).toEqual(['git', '--no-optional-locks', '-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false'])
  }
  expect(commands.hash).toContain('--no-filters')
})

test('parseStatus lists ordinary, renamed, untracked and conflicted paths', () => {
  const out = [
    '1 .M N... 100644 100644 100644 h1 h2 src/a b.js',
    '2 R. N... 100644 100644 100644 h1 h2 R100 new.js', 'old.js',
    '? untracked.txt',
    'u UU N... 100644 100644 100644 100644 h1 h2 h3 conflict.js',
    '! ignored.log',
    '',
  ].join('\0')
  const r = parseStatus(out)
  expect(r.changed).toEqual(['src/a b.js', 'new.js', 'untracked.txt', 'conflict.js'])
  expect(r.reasons).toEqual(['unmerged conflict'])
})

test('a submodule entry and an unknown record each make the reading partial', () => {
  expect(parseStatus('1 .M SC.. 160000 160000 160000 h1 h2 sub\0').reasons).toEqual(['submodule'])
  expect(parseStatus('zzz\0').reasons).toEqual(['unparsed status record'])
})

test('parseFlags detects assume-unchanged and skip-worktree', () => {
  expect(parseFlags('H a\0h b\0')).toEqual(['assume-unchanged entries'])
  expect(parseFlags('S c\0')).toEqual(['skip-worktree entries'])
  expect(parseFlags('H a\0')).toEqual([])
})

test('a clean tree folds to a git-hybrid reading', () => {
  const r = fold(clean, [])
  expect(r.coverage).toBe('git-hybrid')
  expect(r.head).toBe('abc123')
  expect(r.reasons).toEqual([])
})

test('re-editing an already-dirty file changes the fingerprint', () => {
  const st = ok('1 .M N... 100644 100644 100644 h1 h1 a.js\0')
  const before = fold({ ...clean, status: st, hash: ok('aaaa\n') }, ['a.js'])
  const after = fold({ ...clean, status: st, hash: ok('bbbb\n') }, ['a.js'])
  expect(before.coverage).toBe('git-hybrid')
  expect(before.value).not.toBe(after.value)
})

test('an unborn HEAD is a reading, not a failure', () => {
  const r = fold({ ...clean, head: { exitCode: 1, stdout: '', stderr: '' } }, [])
  expect(r.head).toBe('unborn')
  expect(r.coverage).toBe('git-hybrid')
})

test('failures, timeouts and missing reads make the reading partial with reasons', () => {
  expect(fold({ ...clean, status: { error: 'timeout' } }, []).reasons).toContain('status: timeout')
  expect(fold({ ...clean, index: { exitCode: 128, stdout: '' } }, []).reasons).toContain('index: exit 128')
  expect(fold({ head: clean.head, index: clean.index, status: clean.status }, []).reasons).toContain('flags: not read')
  expect(fold({ ...clean, flags: ok('h a.js\0') }, []).coverage).toBe('partial')
  const st = ok('? x\0? y\0')
  expect(fold({ ...clean, status: st, hash: ok('only-one\n') }, ['x', 'y']).reasons).toContain('hash-object did not answer for every path')
})

test('too many changed paths is partial', () => {
  const many = Array.from({ length: MAX_HASHED_PATHS + 1 }, (_, i) => `f${i}`)
  const r = fold({ ...clean, hash: ok(many.slice(0, MAX_HASHED_PATHS).map(() => 'h').join('\n')) }, many)
  expect(r.reasons).toContain(`more than ${MAX_HASHED_PATHS} changed paths`)
})

test('digest is stable and distinguishes inputs', () => {
  expect(digest('abc')).toBe(digest('abc'))
  expect(digest('abc')).not.toBe(digest('abd'))
  expect(digest('')).toMatch(/^[0-9a-f]{16}$/)
})

test('regression: a missing or failed HEAD read is partial, never an unborn repository', () => {
  const { head, ...noHead } = clean
  void head
  const missing = fold(noHead, [])
  expect(missing.head).toBe('unknown')
  expect(missing.coverage).toBe('partial')
  expect(missing.reasons).toContain('head: not read')
  const notRepo = fold({ ...clean, head: { exitCode: 128, stdout: '', stderr: 'fatal: not a git repository' } }, [])
  expect(notRepo.head).toBe('unknown')
  expect(notRepo.reasons).toContain('head: exit 128')
  const thrown = fold({ ...clean, head: { error: 'timeout' } }, [])
  expect(thrown.coverage).toBe('partial')
})

test('T4: conflicts, submodules and unreadable paths each make fold partial', () => {
  const conflict = fold({ ...clean, status: ok('u UU N... 100644 100644 100644 100644 h1 h2 h3 c.js\0'), hash: ok('x\n') }, ['c.js'])
  expect(conflict.coverage).toBe('partial')
  expect(conflict.reasons).toContain('unmerged conflict')
  const sub = fold({ ...clean, status: ok('1 .M SC.. 160000 160000 160000 h1 h2 sub\0'), hash: ok('x\n') }, ['sub'])
  expect(sub.coverage).toBe('partial')
  expect(sub.reasons).toContain('submodule')
  const unreadable = fold({ ...clean, status: ok('? secret.bin\0'), hash: { exitCode: 128, stdout: '', stderr: 'fatal: could not open' } }, ['secret.bin'])
  expect(unreadable.coverage).toBe('partial')
  expect(unreadable.reasons).toContain('hash: exit 128')
})
