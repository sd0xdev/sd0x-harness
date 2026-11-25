const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const root = resolve(__dirname, '../..');
const read = (rel) => readFileSync(resolve(root, rel), 'utf8');
const skill = read('skills/doc-refactor/SKILL.md');
const agent = read('agents/doc-refactor.md');
const writingRule = read('rules/docs-writing.md');
const numberingRule = read('rules/docs-numbering.md');
const flat = (text) => text.replace(/\s+/g, ' ');

test('functional documents → no line budget in the skill, the agent or the rule', () => {
  assert.match(skill, /\| \*\*Functional document\*\* — `skills\/\*\*` and their `references\/`, `agents\/`, `commands\/`, `rules\/\*\.md`, `CLAUDE\.md`, templates, fixtures \| Decision fidelity \(below\) \| \*\*None\.\*\*/);
  assert.match(agent, /\| Functional document \| `skills\/\*\*`, `agents\/`, `commands\/`, `rules\/\*\.md`, `CLAUDE\.md`, templates, fixtures \| \*\*No line budget\.\*\*/);
  assert.match(flat(numberingRule), /Functional documents are exempt: `skills\/\*\*` with their `references\/`, `agents\/`, `commands\/`/, 'the rule both of them defer to');
  assert.match(flat(writingRule), /Condensing a \*\*functional document\*\* is judged by decision fidelity, not length/);
});

test('retired line targets → gone from every surface that used to state them', () => {
  for (const [name, text] of [['SKILL.md', skill], ['agents/doc-refactor.md', agent]]) {
    assert.doesNotMatch(text, /<\s*(?:30|40|50)\b/, `${name} states no per-file line target`);
    assert.doesNotMatch(text, /Target Lines|Size Standards|Line count reduced|Reduction: Z%/, name);
  }
  assert.match(agent, /Line count is not a goal and not a measure/);
});

test('live feature prose → still bounded, by the existing prune / merge / split order', () => {
  assert.match(skill, /\| Live feature prose under `docs\/features\/` — a document whose role is \*\*Current authority\*\*: it states what is true now \| Remove bloat: prune what is dead, merge what is duplicated, split what remains \| ~500 lines is a signal to act, judged per file \|/);
  assert.match(agent, /\| Live feature prose \| `docs\/features\/\*\*` documents whose role is Current authority — they state what is true now \| Prune what is dead, merge what is duplicated, split what remains/);
});

test('records → never pruned, merged, split or rewritten, in skill and agent', () => {
  assert.match(skill, /\| Record — request ticket, review log, ADR: what was decided or done at a point in time \| \*\*None beyond formatting\.\*\* Never pruned, merged, split or rewritten; a superseded decision stays in the record \| None \|/);
  assert.match(agent, /\| Record \| Request tickets, review logs, ADRs — what was decided or done at a point in time \| \*\*Not pruned, merged, split or rewritten\.\*\* Fix formatting only; a superseded decision stays \|/);
  assert.match(flat(numberingRule), /records are exempt/i, 'the rule the exemption comes from');
});

test('feature document of unknown role → treated as a record, because the filename does not decide', () => {
  assert.match(flat(skill), /\*\*For a document under `docs\/features\/`, the role decides, not the filename\.\*\*/);
  assert.match(flat(skill), /If the role cannot be established, treat the document as a \*\*record\*\* — formatting only — and say so in the report/);
  assert.match(flat(agent), /Role unknown → treat it as a record \(formatting only\) and say so\./);
});

test('other prose → has a class of its own, with no line budget', () => {
  assert.match(skill, /\| Other prose — any other `\.md` \(`CONTRIBUTING\.md`, a guide\) \| Preserve content; tables and diagrams where they help \| None \|/);
  assert.match(agent, /\| Other prose \| Any other `\.md` \(`CONTRIBUTING\.md`, a guide\) \| Preserve content; tables and diagrams where they help\. No line budget \|/);
});

test('decision fidelity → normal, boundary and insufficient-evidence cases plus one held out', () => {
  const fidelity = skill.slice(skill.indexOf('## Decision Fidelity'), skill.indexOf('## Never Traded Away'));

  assert.match(flat(fidelity), /reaches the \*\*same action, with the same evidence\*\*/);
  assert.match(fidelity, /one \*\*normal\*\* case, one \*\*boundary\*\* case .* one \*\*insufficient-evidence\*\* case/);
  assert.match(fidelity, /\| 2\. Hold one out \| Add a fourth case and set it aside\. Do not look at it while rewriting/);
  assert.match(fidelity, /For each case, including the held-out one, the short version must direct the same action and require the same evidence\. Any difference → restore the text that carried it, or drop the edit/);
  assert.match(flat(fidelity), /A rewrite that fails a case is not finished because it is shorter\. A rewrite that passes and is not shorter is still correct/);
});

test('hard conditions, exceptions, handoff data and permissions → never traded away, in skill and agent', () => {
  const never = skill.slice(skill.indexOf('## Never Traded Away'), skill.indexOf('## Techniques'));

  for (const item of ['Hard conditions', 'Exceptions', 'Handoff data', 'Permissions']) {
    assert.match(never, new RegExp(`- \\*\\*${item}\\*\\*`), item);
  }
  assert.match(agent, /Never trade away hard conditions, exceptions, handoff data or permissions \(frontmatter and `allowed-tools` included\)/);
});

test('measurement → input tokens with a named tokenizer or a labelled estimate, never lines', () => {
  assert.match(flat(skill), /Report input tokens before and after with the tokenizer named\. If no tokenizer is available, report a \*\*labelled estimate\*\* \(state the method, e\.g\. characters ÷ 4\) — never an unlabelled number, and never lines as the measure/);
  assert.match(skill, /- Input tokens: X → Y \(tokenizer: <name>, or "estimate: <method>"\)/);
  assert.match(agent, /- Input tokens: X → Y \(tokenizer: <name>, or "estimate: <method>"\)/);
  assert.doesNotMatch(skill, /Original: X lines/);
});

test('established terminology → only where it replaces repeated text', () => {
  assert.match(skill, /An \*\*established term\*\* the reader already knows, or one defined once in the file \| Only where it replaces repeated text\. A term added without removing an explanation is decoration — leave it out \|/);
  assert.match(agent, /\| A concept re-explained at each use \| An established term, only where it replaces the repeated text \|/);
});

test('output → carries the four-case fidelity table', () => {
  const output = skill.slice(skill.indexOf('## Output'));

  for (const row of ['Normal', 'Boundary', 'Insufficient evidence', 'Held-out']) {
    assert.match(output, new RegExp(`\\| ${row} \\|`), row);
  }
});

test('contract unchanged → frontmatter grants and the agent dispatch stay as they were', () => {
  assert.match(skill, /^allowed-tools: Read, Grep, Glob, Edit, Agent$/m);
  assert.match(skill, /subagent_type: "doc-refactor"/);
  assert.match(agent, /^tools: Read, Grep, Glob, Edit$/m);
  assert.match(agent, /^model: opus$/m);
  assert.match(agent, /^effort: high$/m);
});
