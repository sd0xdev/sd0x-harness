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

test('no bound task: the mod only observes', () => {
  expect(classify(null, { tool: 'Bash', command: 'rm -rf /' }).outcome).toBe('pass')
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

test('write forms and program-running options of adapter commands are refused', () => {
  for (const c of ['git branch -D topic', 'git branch new-name', 'git diff --output=x.patch', 'git diff HEAD', 'rg --no-config --pre=./x foo', 'rg foo src', 'git -c core.pager=evil log', 'git checkout main', 'git commit -m x', 'ls --color=always', 'grep --include=*.js foo']) {
    expect(bash(c).outcome).not.toBe('pass')
  }
})

test('shell syntax beyond words, quotes and pipes is unknown', () => {
  for (const c of ['echo $(id)', 'echo `id`', 'cat a > b', 'cat < a', 'ls; rm x', 'ls && rm x', 'ls || true', 'sleep 1 &', 'sh -c "ls"', 'bash -c ls', 'echo "$HOME"', "cat 'a", 'ls\nrm x', 'ls *.js', 'cat ~/.ssh/id_rsa', '']) {
    expect(bash(c).outcome).toBe('unknown')
  }
})

test('inline environment assignments are not classified as adapters or executors', () => {
  expect(bash('GIT_EXTERNAL_DIFF=evil git diff --no-ext-diff --no-textconv').outcome).toBe('unknown')
  expect(bash('CI=1 npm test').outcome).toBe('unknown')
  expect(bash('X=1 kubectl delete pod x').outcome).toBe('deny')
})

test('anything else is unknown', () => {
  expect(bash('python3 script.py').outcome).toBe('unknown')
  expect(bash('npm run build').outcome).toBe('unknown')
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

test('non-Bash rules: MCP and other tools are unknown unless the task names them', () => {
  expect(classify(task, { tool: 'mcp__docs__search' }).outcome).toBe('pass')
  expect(classify(task, { tool: 'mcp__prod__write' }).outcome).toBe('unknown')
  expect(classify(task, { tool: 'WebFetch' }).outcome).toBe('unknown')
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
    [{ tool: 'Bash', command: 'python3 x.py' }, 'unknown'],
    [{ tool: 'Bash', command: 'echo $(id)' }, 'unknown'],
    [{ tool: 'Read', file_path: '/w/repo/a' }, 'pass'],
    [{ tool: 'Read', file_path: '/etc/hosts' }, 'deny'],
    [{ tool: 'Edit', file_path: '/w/repo/src/a.ts' }, 'pass'],
    [{ tool: 'Edit', file_path: '/w/repo/deploy/x' }, 'deny'],
    [{ tool: 'mcp__docs__search' }, 'pass'],
    [{ tool: 'mcp__other__x' }, 'unknown'],
    [{ tool: 'AskUserQuestion' }, 'pass'],
  ]
  for (const [call, outcome] of table) expect([call, classify(task, call).outcome]).toEqual([call, outcome])
})
