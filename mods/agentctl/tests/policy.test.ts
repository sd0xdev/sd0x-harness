import { expect, test } from 'claude-code/testing'
import { classify, normalizePath, tokenize, validateTask } from '../lib/policy.js'
import { parseTaskNotification } from '../lib/notices.js'

const task = {
  goal: 'investigate',
  worktree: '/w/repo',
  allow: ['edit'],
  editRoots: ['src', 'tests'],
  forbid: ['terraform apply'],
  executors: [{ argv: ['npm', 'test'], check: true }, { argv: ['make', 'lint'], check: false }],
  needsUser: [['npm', 'publish']],
  tools: ['mcp__docs__search'],
}
const bash = (command) => classify(task, { tool: 'Bash', command })
// The deny-list reading of an outcome: a call the mod cannot classify passes to the host, marked.
const kind = (r) => (r.delegated ? 'delegated' : r.outcome)

test('no bound task: the built-in classes still refuse; everything else goes to the host', () => {
  expect(classify(null, { tool: 'Bash', command: 'rm -rf /' }).outcome).toBe('pass')
  expect(classify(null, { tool: 'Bash', command: 'git push origin feat/x' })).toEqual({ outcome: 'deny', rule: 'remote-git-write' })
  expect(classify(null, { tool: 'Bash', command: 'gh pr merge 28 --squash' })).toEqual({ outcome: 'deny', rule: 'remote-git-write' })
  expect(classify(null, { tool: 'Bash', command: 'kubectl --context prod delete pod x' }).outcome).toBe('deny')
  expect(classify(null, { tool: 'Edit', file_path: '/anywhere' }).outcome).toBe('pass')
})

test('scripts and compound fences are delegated to the host, never classified or approved by the mod', () => {
  // Best-effort by construction: a push inside a script or a fence is not seen (disclosed limit).
  for (const c of ['/bin/bash -p /tmp/push.sh', 'bash scripts/run-skill.sh push-ci x', 'X=1; git push origin main', 'cd . && git push']) {
    const r = classify(null, { tool: 'Bash', command: c })
    expect([c, r.outcome]).toEqual([c, 'pass'])
    expect(r.rule).not.toMatch(/approved|authorized/)
  }
  expect(kind(bash('/bin/bash -p /tmp/push.sh'))).toBe('delegated')
  expect(kind(bash('X=1; git push origin main'))).toBe('delegated')
})

test('observational adapters pass', () => {
  for (const c of ['git status', 'git --no-pager log --oneline -n 5', 'git diff --stat --no-ext-diff --no-textconv HEAD~1', 'git branch -a', 'git rev-parse --abbrev-ref HEAD', 'ls -la src', 'cat README.md', 'head -n 20 a.txt', 'wc -l a.txt', 'rg --no-config -n "foo" src', 'grep -rn foo src', 'git log --oneline | head -n 5']) {
    expect(bash(c)).toEqual(expect.objectContaining({ outcome: 'pass' }))
  }
})

test('authorized executors pass and say their effects are unclassified', () => {
  const r = bash('npm test -- --watch=false')
  expect(r.outcome).toBe('pass')
  expect(r.rule).toMatch(/authorized executor: npm test/)
  expect(r.executor.check).toBe(true)
})

test('hard and task-forbidden classes are denied by name, even when options or wrappers sit between the words', () => {
  expect(bash('kubectl rollout restart deploy/api')).toEqual({ outcome: 'deny', rule: 'production-write' })
  expect(bash('kubectl --context prod -n api rollout restart deploy/api').outcome).toBe('deny')
  expect(bash('git -C . push origin main')).toEqual({ outcome: 'deny', rule: 'remote-git-write' })
  expect(bash('sudo helm upgrade x y').outcome).toBe('deny')
  expect(bash('terraform apply -auto-approve')).toEqual({ outcome: 'deny', rule: 'task-forbid: terraform apply' })
  expect(bash('git log | git push').outcome).toBe('deny')
})

test('an authorized executor that also matches a forbidden class is denied', () => {
  const t = { ...task, executors: [{ argv: ['kubectl'], check: false }] }
  expect(classify(t, { tool: 'Bash', command: 'kubectl rollout restart x' }).outcome).toBe('deny')
  expect(classify(t, { tool: 'Bash', command: 'kubectl get pods' }).outcome).toBe('pass')
})

test('needs-user entries yield needs-user', () => {
  expect(bash('npm publish --dry-run')).toEqual({ outcome: 'needs-user', rule: 'needs-user: npm publish' })
})

test('write forms and program-running options of adapter commands are not observational: delegated', () => {
  for (const c of ['git branch -D topic', 'git branch new-name', 'git diff --output=x.patch', 'git diff HEAD', 'rg --no-config --pre=./x foo', 'rg foo src', 'git -c core.pager=evil log', 'git checkout main', 'git commit -m x', 'ls --color=always', 'grep --include=*.js foo']) {
    expect([c, kind(bash(c))]).toEqual([c, 'delegated'])
  }
})

test('shell syntax beyond words, quotes and pipes is delegated to the host', () => {
  for (const c of ['echo $(id)', 'echo `id`', 'cat a > b', 'cat < a', 'ls; rm x', 'ls && rm x', 'ls || true', 'sleep 1 &', 'sh -c "ls"', 'bash -c ls', 'echo "$HOME"', "cat 'a", 'ls\nrm x', 'ls *.js', 'cat ~/.ssh/id_rsa', '']) {
    expect([c, kind(bash(c))]).toEqual([c, 'delegated'])
  }
})

test('inline environment assignments are not classified as adapters or executors', () => {
  expect(kind(bash('GIT_EXTERNAL_DIFF=evil git diff --no-ext-diff --no-textconv'))).toBe('delegated')
  expect(kind(bash('CI=1 npm test'))).toBe('delegated')
  expect(bash('CI=1 npm test').executor).toBeUndefined()
  expect(bash('X=1 kubectl delete pod x').outcome).toBe('deny')
})

test('anything else is delegated to the host', () => {
  expect(kind(bash('python3 script.py'))).toBe('delegated')
  expect(kind(bash('npm run build'))).toBe('delegated')
})

test('executors are matched before adapters, so a declared observational check is still a check', () => {
  const t = { ...task, executors: [{ argv: ['git', 'status'], check: true }] }
  expect(classify(t, { tool: 'Bash', command: 'git status' }).executor).toEqual({ argv: ['git', 'status'], check: true })
})

test('non-Bash rules: Read inside the worktree only', () => {
  expect(classify(task, { tool: 'Read', file_path: '/w/repo/src/a.ts' }).outcome).toBe('pass')
  expect(classify(task, { tool: 'Read', file_path: 'src/a.ts' }).outcome).toBe('pass')
  expect(classify(task, { tool: 'Read', file_path: '/w/repo/../other/secret' }).outcome).toBe('deny')
  expect(classify(task, { tool: 'Read', file_path: '/etc/passwd' }).outcome).toBe('deny')
})

test('non-Bash rules: edits only when allowed and inside an allowed root', () => {
  expect(classify(task, { tool: 'Edit', file_path: '/w/repo/src/a.ts' }).outcome).toBe('pass')
  expect(classify(task, { tool: 'Write', file_path: '/w/repo/deploy/k8s.yaml' }).outcome).toBe('deny')
  expect(classify(task, { tool: 'NotebookEdit', notebook_path: '/w/repo/tests/n.ipynb' }).outcome).toBe('pass')
  expect(classify({ ...task, allow: [] }, { tool: 'Edit', file_path: '/w/repo/src/a.ts' })).toEqual({ outcome: 'deny', rule: 'edits not allowed by this task' })
  expect(classify(task, { tool: 'Edit', file_path: '/w/repo/src/../../x' }).outcome).toBe('deny')
})

test('non-Bash rules: MCP and other tools are delegated unless the task names them', () => {
  expect(kind(classify(task, { tool: 'mcp__docs__search' }))).toBe('pass')
  expect(kind(classify(task, { tool: 'mcp__prod__write' }))).toBe('delegated')
  expect(kind(classify(task, { tool: 'WebFetch' }))).toBe('delegated')
})

test('tokenize keeps quoted words and splits pipelines', () => {
  expect(tokenize(`rg --no-config 'a b' "c d" | wc -l`)).toEqual({ ok: true, segments: [['rg', '--no-config', 'a b', 'c d'], ['wc', '-l']] })
  expect(tokenize('a | | b').ok).toBe(false)
  expect(tokenize('|').ok).toBe(false)
})

test('normalizePath resolves dot segments and refuses escaping the root', () => {
  expect(normalizePath('a/./b/../c', '/w')).toBe('/w/a/c')
  expect(normalizePath('../../..', '/w')).toBe(null)
  expect(normalizePath('', '/w')).toBe(null)
})

test('task validation rejects overlaps and malformed entries', () => {
  expect(validateTask(task)).toEqual({ ok: true, errors: [] })
  const bad = validateTask({ ...task, executors: [{ argv: ['kubectl', 'apply', '-f', 'x'] }], needsUser: [['git', 'push']] })
  expect(bad.ok).toBe(false)
  expect(bad.errors.join('\n')).toMatch(/executor kubectl apply -f x overlaps/)
  expect(bad.errors.join('\n')).toMatch(/needsUser git push overlaps/)
  expect(validateTask({ goal: '', worktree: 'rel' }).errors).toEqual(['goal is required', 'worktree must be an absolute path'])
  expect(validateTask(null).ok).toBe(false)
  expect(validateTask({ ...task, executors: [{ argv: [] }] }).ok).toBe(false)
})

test('regression: non-array task fields are validation errors, not exceptions', () => {
  const r = validateTask({ goal: 'g', worktree: '/w', forbid: 42, executors: 'npm test' })
  expect(r.ok).toBe(false)
  expect(r.errors).toEqual(['executors must be an array', 'forbid must be an array'])
})

test('regression: a task id is a bounded identifier and never carries a credential', () => {
  expect(validateTask({ id: 'API_TOKEN=SYNTHETIC_TOKEN', goal: 'g', worktree: '/w' }).ok).toBe(false)
  expect(validateTask({ id: 'a b', goal: 'g', worktree: '/w' }).ok).toBe(false)
  expect(validateTask({ id: 'x'.repeat(65), goal: 'g', worktree: '/w' }).ok).toBe(false)
  expect(validateTask({ id: 42, goal: 'g', worktree: '/w' }).ok).toBe(false)
  expect(validateTask({ id: 'T-24.quiz_refactor', goal: 'g', worktree: '/w' }).ok).toBe(true)
  expect(validateTask({ goal: 'g', worktree: '/w' }).ok).toBe(true)
})

test('live finding: notification parsing takes only terminal statuses with an id', () => {
  expect(parseTaskNotification('<task-notification><task-id>b1</task-id><status>completed</status></task-notification>')).toEqual({ id: 'b1', status: 'completed' })
  expect(parseTaskNotification('<task-id>b1</task-id><status>running</status>')).toBe(null)
  expect(parseTaskNotification('<status>failed</status>')).toBe(null)
  expect(parseTaskNotification(undefined)).toBe(null)
})

test('outcome table: each row is one call and its exact outcome', () => {
  const table = [
    [{ tool: 'Bash', command: 'git status' }, 'pass'],
    [{ tool: 'Bash', command: 'npm test' }, 'pass'],
    [{ tool: 'Bash', command: 'npm publish' }, 'needs-user'],
    [{ tool: 'Bash', command: 'kubectl delete pod x' }, 'deny'],
    [{ tool: 'Bash', command: 'terraform apply' }, 'deny'],
    [{ tool: 'Bash', command: 'python3 x.py' }, 'delegated'],
    [{ tool: 'Bash', command: 'echo $(id)' }, 'delegated'],
    [{ tool: 'Read', file_path: '/w/repo/a' }, 'pass'],
    [{ tool: 'Read', file_path: '/etc/hosts' }, 'deny'],
    [{ tool: 'Edit', file_path: '/w/repo/src/a.ts' }, 'pass'],
    [{ tool: 'Edit', file_path: '/w/repo/deploy/x' }, 'deny'],
    [{ tool: 'mcp__docs__search' }, 'pass'],
    [{ tool: 'mcp__other__x' }, 'delegated'],
    [{ tool: 'AskUserQuestion' }, 'pass'],
  ]
  for (const [call, outcome] of table) expect([call, kind(classify(task, call))]).toEqual([call, outcome])
})

test('adversarial finding: an absolute or upper-case program path does not hide a built-in class', () => {
  for (const c of ['/usr/bin/git push', '/usr/bin/gh pr merge 1', '/usr/local/bin/kubectl apply -f x', '/opt/homebrew/bin/helm upgrade a b', 'GIT push', 'sudo /usr/bin/git -C . push']) {
    expect([c, classify(null, { tool: 'Bash', command: c }).outcome]).toEqual([c, 'deny'])
    expect([c, bash(c).outcome]).toEqual([c, 'deny'])
  }
  // Only the program word is reduced: a path argument that ends in a class word stays a path.
  expect(kind(bash('git add src/push'))).toBe('delegated')
  // The same matcher guards declared executors.
  expect(validateTask({ ...task, executors: [{ argv: ['/usr/bin/git', 'push'] }] }).errors.join(' ')).toMatch(/overlaps forbidden class \(remote-git-write\)/)
})

test('adversarial finding: edit roots outside the worktree are refused, and a stored one grants nothing', () => {
  for (const r of ['../other', '/etc', 'src/../../x']) {
    expect(validateTask({ ...task, editRoots: [r] }).errors.join(' ')).toMatch(/outside the worktree/)
  }
  expect(validateTask({ ...task, editRoots: ['src/../tests'] }).ok).toBe(true)
  const stored = { ...task, editRoots: ['../other'] }
  expect(classify(stored, { tool: 'Write', file_path: '/w/other/f' })).toEqual({ outcome: 'deny', rule: 'edit outside the allowed roots' })
})

test('adversarial finding: with no task, an unclassified command is marked delegated, an adapter is not', () => {
  expect(kind(classify(null, { tool: 'Bash', command: 'bash push.sh' }))).toBe('delegated')
  expect(kind(classify(null, { tool: 'Bash', command: 'git status' }))).toBe('pass')
})

test('review finding: a task forbid written as a path matches both spellings, and blocks an overlapping executor', () => {
  const t = { ...task, forbid: ['/usr/bin/git commit'] }
  for (const c of ['/usr/bin/git commit -m x', 'git commit -m x', '/opt/git/bin/git commit']) {
    expect([c, classify(t, { tool: 'Bash', command: c })]).toEqual([c, { outcome: 'deny', rule: 'task-forbid: /usr/bin/git commit' }])
  }
  expect(validateTask({ ...t, executors: [{ argv: ['/usr/bin/git', 'commit'] }] }).errors.join(' ')).toMatch(/overlaps forbidden class/)
  const plain = { ...task, forbid: ['git commit'] }
  expect(classify(plain, { tool: 'Bash', command: '/usr/bin/git commit -m x' }).outcome).toBe('deny')
})

test('review finding: an argument path whose basename names a program is never reduced', () => {
  const t = { ...task, forbid: ['python /tmp/terraform', '/usr/bin/terraform apply', 'rm /tmp/git'] }
  expect(classify(t, { tool: 'Bash', command: 'python /tmp/terraform' }).outcome).toBe('deny')
  expect(classify(t, { tool: 'Bash', command: 'rm /tmp/git' }).outcome).toBe('deny')
  expect(classify(t, { tool: 'Bash', command: '/usr/bin/terraform apply -auto-approve' }).outcome).toBe('deny')
  expect(validateTask({ ...t, executors: [{ argv: ['python', '/tmp/terraform'] }] }).errors.join(' ')).toMatch(/overlaps forbidden class/)
  // And an argument named like a program does not start a match on its own.
  expect(classify(null, { tool: 'Bash', command: 'cat /tmp/git push.txt' }).outcome).not.toBe('deny')
})
