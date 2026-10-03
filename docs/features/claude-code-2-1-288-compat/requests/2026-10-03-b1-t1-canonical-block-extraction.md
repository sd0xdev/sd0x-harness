# Canonical Anchor block extraction in the AGENTS.md generator (task 1)

> **Doc class**: Request ticket (date-prefixed non-lifecycle — per `@rules/docs-numbering.md`). Per-task work breakdown unit for progress tracking. **Not** a feature-level requirements doc — for that see the tech spec.
> **Created**: 2026-10-03
> **Status**: Candidate Complete
> **Priority**: P0
> **Tech Spec**: [2-tech-spec.md](../2-tech-spec.md) <- Technical detail (primary source)

## Background

Claude Code ≥ 2.1.277 can load `AGENTS.md` natively, and the kernel `/codex-setup` generates carries
no Anchor text. The generator must embed the canonical Anchor blocks byte-for-byte from the plugin's
own `rules/` (tech spec § 3.1–3.3, intent INV-001).

## Requirements

- `extractCanonicalBlocks(rulesDir)` returns the five blocks of tech spec § 3.2 (`anchor-register`,
  `register-4`, `security`, `never-log`, `redaction`) with the boundaries stated there
- A boundary that matches zero or more than one region exits 1 with `Error: canonical block <id> …`
- The assembled output places the blocks under one `## Anchors (verbatim from sd0x-dev-flow rules)`
  heading, each after a one-line source citation; `{PROJECT_NAME}` `{VERSION}` `{TEST_COMMAND}`
  substitution never runs inside a block
- New `--rules-dir <dir>` flag; default is the `rules/` directory beside the script's plugin root
- `BYTE_LIMIT` (24,576) still enforced on the assembled output

## Scope

| Scope | Description |
| ----- | ----------- |
| In | `scripts/build-codex-artifacts.js`, `test/scripts/build-codex-artifacts.test.js` |
| Out | Kernel remainder wording (task 2); `doctor` rows (task 3) |

## Related Files

| File | Action | Description |
| ---- | ------ | ----------- |
| `scripts/build-codex-artifacts.js` | Modify | Extraction, assembly, `--rules-dir`, failure modes |
| `test/scripts/build-codex-artifacts.test.js` | Modify | Byte equality, failure modes, substitution boundary |

## Acceptance Criteria

- [x] Each extracted block is byte-equal to its source region in the plugin's `rules/`
- [x] A rules fixture with a block boundary missing, and one with it duplicated, each exits 1 naming the block id
- [x] A `{PROJECT_NAME}` token planted inside a source block survives assembly unsubstituted; the same token outside a block is substituted
- [x] `--rules-dir` selects the source directory; an unreadable directory exits 1
- [x] Assembled output of the repo fixture is ≤ 24,576 bytes; an oversized fixture still exits 1
- [x] `/codex-review-fast` ✅ Ready → `/precommit` ✅ PASS

## Progress

| Phase | Status | Note |
| ----- | ------ | ---- |
| Analysis | Done | tech spec § 3.2–3.3 |
| Development | Done | `extractCanonicalBlocks`, `assemble`, `--rules-dir`; generated kernel for this repo is 10,282 bytes |
| Testing | Done | Byte equality, missing/duplicated boundary, placeholder boundary and `--rules-dir` tests; a weakened duplicate guard makes the duplicate test fail |
| Acceptance | Done | `/codex-review-fast` ✅ Ready (2 rounds, no finding) → `/precommit` `## Overall: ✅ PASS`. `--verify-ac` 2026-10-03: 5/6 ACs Complete at High; the gate AC is Inconclusive — review verdicts are not stored per commit, only the current tree's state — so Status stays Candidate Complete (Phase 2.5 rule 5) |

## References

- Tech Spec: [2-tech-spec.md](../2-tech-spec.md) § 3.2, § 3.3, § 5 task 1
- Intent: [intent-claude-code-2-1-288-compat.md](../intent-claude-code-2-1-288-compat.md) INV-001, INV-002
