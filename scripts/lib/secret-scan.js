'use strict';

// A small secret scanner for text this plugin is about to send OUTSIDE the repository — a Jira
// description, a PR body. It is not `commit-msg-guard.sh`: that one is an attribution guard and
// says nothing about secrets. Findings carry the rule name and a line number, never the matched
// text (rules/security.md: a token must not reach a log). A miss is possible — the patterns are a
// floor, not a proof — which is why the task contract also limits WHAT may go into the text.

const RULES = [
  ['private-key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['aws-access-key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})\b/],
  ['slack-token', /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/],
  ['anthropic-or-openai-key', /\bsk-(?:ant-)?[A-Za-z0-9_-]{20,}\b/],
  ['google-api-key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['jwt', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/],
  ['bearer', /\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*/i],
  ['url-credentials', /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@/i],
  ['assignment', /\b(?:password|passwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|token)\s*[:=]\s*["']?[^\s"']{6,}/i],
];

function scanSecrets(text) {
  const findings = [];
  String(text ?? '').split('\n').forEach((line, i) => {
    for (const [rule, re] of RULES) if (re.test(line)) findings.push({ rule, line: i + 1 });
  });
  return findings;
}

module.exports = { scanSecrets, RULES };
