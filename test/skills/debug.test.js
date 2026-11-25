const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const { resolve } = require('node:path');

const root = resolve(__dirname, '../..');
const skillPath = resolve(root, 'skills/debug/SKILL.md');
const refTaxonomy = resolve(root, 'skills/debug/references/failure-taxonomy.md');
const refProtocol = resolve(root, 'skills/debug/references/probe-protocol.md');
const refReport = resolve(root, 'skills/debug/references/report-template.md');

// --- File existence ---

test('debug skill directory and files exist', () => {
  assert.ok(existsSync(skillPath), 'SKILL.md should exist');
  assert.ok(existsSync(refTaxonomy), 'failure-taxonomy.md should exist');
  assert.ok(existsSync(refProtocol), 'probe-protocol.md should exist');
  assert.ok(existsSync(refReport), 'report-template.md should exist');
});

// --- SKILL.md frontmatter ---

test('debug SKILL.md has correct frontmatter', () => {
  const content = readFileSync(skillPath, 'utf8');
  assert.match(content, /^---\s*\n/, 'should start with frontmatter');
  assert.match(content, /name:\s*debug/, 'name should be debug');
  assert.match(content, /description:/, 'should have description');
  assert.match(content, /allowed-tools:.*Read, Grep, Glob, Edit, Write, Bash/, 'should have base tools');
  assert.match(content, /allowed-tools:.*Skill/, 'should include Skill for sub-skill dispatch');
  // Corrected twice: this skill held MCP grants, and my first re-pin swapped them for the adapter
  // grant. A doc reviewer showed both were wrong — `debug` dispatches nothing itself. Phase 2 goes
  // through `/codex-brainstorm` and Phase 3 through `/seek-verdict`, both via the Skill tool, so it
  // is a router and `codex-transport.md` § Permission gives a router no transport grant.
  assert.match(content, /allowed-tools:.*\bSkill\b/, 'it routes through other skills');
  assert.doesNotMatch(content, /allowed-tools:.*Bash\(node:\*\)/, 'a router gets no adapter grant');
  assert.doesNotMatch(content, /mcp__codex/, 'the MCP grants are retired');
});

// --- SKILL.md structure ---

test('debug SKILL.md has Prohibited Actions block', () => {
  const content = readFileSync(skillPath, 'utf8');
  assert.match(content, /Prohibited Actions/, 'should have Prohibited Actions section');
  assert.match(content, /git add.*git commit.*git push/, 'should prohibit git operations');
});

test('debug SKILL.md has all 6 phases (0-5)', () => {
  const content = readFileSync(skillPath, 'utf8');
  assert.match(content, /Phase 0.*Intake/i, 'should have Phase 0');
  assert.match(content, /Phase 1.*Classify/i, 'should have Phase 1');
  assert.match(content, /Phase 2.*Probe/i, 'should have Phase 2');
  assert.match(content, /Phase 3.*Root Cause/i, 'should have Phase 3');
  assert.match(content, /Phase 4.*Fix/i, 'should have Phase 4');
  assert.match(content, /Phase 5.*Report/i, 'should have Phase 5');
});

test('debug SKILL.md has Probe Safety Rules', () => {
  const content = readFileSync(skillPath, 'utf8');
  assert.match(content, /Probe Safety Rules/, 'should have safety rules section');
  assert.match(content, /Read-first default/, 'should have read-first rule');
  assert.match(content, /Deny list/, 'should have deny list');
  assert.match(content, /Redaction/, 'should have redaction rule');
  assert.match(content, /Timeout/, 'should have timeout rule');
});

test('debug SKILL.md has mandatory /seek-verdict integration', () => {
  const content = readFileSync(skillPath, 'utf8');
  assert.match(content, /seek-verdict.*--intent confirm/, 'should reference seek-verdict with confirm intent');
  assert.match(content, /Mandatory/i, 'should mark as mandatory');
  assert.match(content, /Anti-anchoring/, 'should specify anti-anchoring contract');
  assert.match(content, /Fresh thread/, 'should require fresh thread');
});

test('debug SKILL.md has /codex-brainstorm escalation', () => {
  const content = readFileSync(skillPath, 'utf8');
  assert.match(content, /codex-brainstorm/, 'should reference codex-brainstorm');
  assert.match(content, /competing hypotheses|競爭假設/i, 'should describe escalation condition');
});

test('debug SKILL.md has --export option', () => {
  const content = readFileSync(skillPath, 'utf8');
  assert.match(content, /--export/, 'should document --export flag');
});

test('debug SKILL.md has auto-loop and Doc Sync references', () => {
  const content = readFileSync(skillPath, 'utf8');
  assert.match(content, /auto-loop/, 'should reference auto-loop');
  assert.match(content, /Doc Sync/, 'should have Doc Sync section');
});

test('debug SKILL.md verification checklist includes no-git', () => {
  const content = readFileSync(skillPath, 'utf8');
  assert.match(content, /No.*git add\/commit\/push/, 'should have no-git checklist item');
});

test('debug SKILL.md references all reference files', () => {
  const content = readFileSync(skillPath, 'utf8');
  assert.match(content, /references\/failure-taxonomy\.md/, 'should reference failure-taxonomy');
  assert.match(content, /references\/probe-protocol\.md/, 'should reference probe-protocol');
  assert.match(content, /references\/report-template\.md/, 'should reference report-template');
});

// --- Failure Taxonomy ---

test('failure-taxonomy.md covers 6 problem types', () => {
  const content = readFileSync(refTaxonomy, 'utf8');
  assert.match(content, /Script Bug/, 'should have Script Bug');
  assert.match(content, /API Error/, 'should have API Error');
  assert.match(content, /Config Issue/, 'should have Config Issue');
  assert.match(content, /Silent Failure/, 'should have Silent Failure');
  assert.match(content, /Race Condition/, 'should have Race Condition');
  assert.match(content, /Dependency Issue/, 'should have Dependency Issue');
});

// --- Probe Protocol ---

test('probe-protocol.md has termination criteria', () => {
  const content = readFileSync(refProtocol, 'utf8');
  assert.match(content, /Termination/, 'should have termination section');
  assert.match(content, /stagnation/i, 'should mention stagnation');
  assert.match(content, /max rounds/i, 'should mention max rounds');
});

// --- Trigger keyword conflict check ---

test('debug trigger keywords do not overlap with bug-fix or issue-analyze', () => {
  const debugContent = readFileSync(skillPath, 'utf8');
  // debug should NOT trigger on issue-analyze keywords
  const debugTrigger = debugContent.match(/## Trigger[\s\S]*?## /)?.[0] || '';
  assert.doesNotMatch(debugTrigger, /analyze issue/i, 'should not overlap with issue-analyze');
  assert.doesNotMatch(debugTrigger, /triage review/i, 'should not overlap with issue-analyze');
});

// --- Hypothesis tie: observe before debating ---

test('hypothesis tie → a cheap, safe, discriminating observation comes before /codex-brainstorm', () => {
  const content = readFileSync(skillPath, 'utf8');
  const tie = content.slice(content.indexOf('### When Hypotheses Tie'), content.indexOf('## Phase 3: Root Cause Confirmation'));

  assert.ok(tie.indexOf('cheap, safe observation') < tie.indexOf('### `/codex-brainstorm` Integration'), 'the probe is described first');
  assert.match(tie, /whose possible outcomes lead to \*\*different next actions\*\* — e\.g\. read the effective config/);
  assert.match(tie, /If every outcome leads to the same next action, the observation does not discriminate/);
  assert.match(tie, /Only when no suitable probe is available .* → `\/codex-brainstorm`/);
  assert.match(tie, /Reached from step 4 above — never as the first response to a tie/);
});

test('hypothesis tie → the termination tables in SKILL.md and the protocol both route to the probe first', () => {
  const skill = readFileSync(skillPath, 'utf8');
  const protocol = readFileSync(refProtocol, 'utf8');

  assert.match(skill, /\| ≥2 競爭假設無法區分（tie） \| \*\*Tie-break probe first\*\* → .*找不到合適 probe 才 \*\*Brainstorm\*\*/);
  assert.match(protocol, /\| 多個競爭假設（≥2 同等可信） \| \*\*Tie-break probe first\*\*（§ Tie-Break）；沒有合適的 probe 才 \*\*Brainstorm\*\*/);
  assert.doesNotMatch(skill, /無法區分 \| \*\*Brainstorm\*\*/, 'no row sends a tie straight to debate');
  assert.doesNotMatch(protocol, /同等可信） \| \*\*Brainstorm\*\*/, 'no row sends a tie straight to debate');
});

test('no suitable probe → the debate designs an experiment instead of picking a hypothesis', () => {
  const skill = readFileSync(skillPath, 'utf8').replace(/\s+/g, ' ');
  const protocol = readFileSync(refProtocol, 'utf8');

  assert.match(skill, /topic = \*\*design an experiment\*\* that would separate the hypotheses .* not "which hypothesis is right"/);
  assert.match(protocol, /topic = \*\*設計一個能區分各假設的實驗\*\*.*不是「哪個假設才對」/);
  assert.match(protocol, /需要 `\[WRITE_PROBE\]` 的觀察不算安全的 tie-break probe/);
});

test('debate consensus → never a root cause without execution evidence', () => {
  const skill = readFileSync(skillPath, 'utf8');
  const protocol = readFileSync(refProtocol, 'utf8');

  assert.match(skill, /\*\*Consensus alone cannot establish cause\.\*\*/);
  assert.match(protocol, /\*\*共識不能確立因果。\*\*/);
  assert.match(skill, /Root cause has ≥1 execution evidence — a debate consensus is not one/);
  assert.doesNotMatch(skill, /Nash equilibrium result as new primary hypothesis/);
  assert.doesNotMatch(protocol, /以收斂結果作為新的主假設/);
});

test('tie handling → evidence-based closure and bounded escalation are unchanged', () => {
  const skill = readFileSync(skillPath, 'utf8');
  const protocol = readFileSync(refProtocol, 'utf8');

  assert.match(skill, /\| 根因已定位 \+ ≥1 執行結果佐證 \| \*\*Stop\*\* → Phase 3 \|/);
  assert.match(skill, /\| 連續 2 輪無新資訊 \| \*\*Escalate\*\* → `⚠️ Need Human` \|/);
  assert.match(skill, /\| Max rounds \(6\) reached \| \*\*Escalate\*\* → `⚠️ Need Human` \|/);
  assert.match(skill, /it is journaled and counts toward `debug\.max_probe_rounds`/);
  assert.match(skill.replace(/\s+/g, ' '), /the debate adds no probe rounds, and 2 rounds without new information or `debug\.max_probe_rounds` still escalate to `⚠️ Need Human`/);
  assert.match(protocol, /辯論不增加 probe rounds；連續 2 輪無新資訊或達到 max rounds 仍然 `⚠️ Need Human`/);
});

test('tie-break probe → journaled with its outcome-to-next-action mapping', () => {
  const protocol = readFileSync(refProtocol, 'utf8');

  assert.match(protocol, /- \*\*Outcome → Next action\*\*: <結果 1> → <下一步 A>；<結果 2> → <下一步 B>/);
  assert.match(protocol, /若所有結果都導向同一個下一步，這個觀察沒有鑑別力/);
});
