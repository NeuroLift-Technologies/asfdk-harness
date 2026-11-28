import { test } from "node:test";
import assert from "node:assert/strict";
import { validatePrBody } from "../scripts/validate-pr-body.mjs";

const completedBody = `## Agent Contribution Checklist
**Agent:** Codex
**Session:** codex/example
**Governed by:** ORG-DEV-OTOI-1.0.4
**Working repo:** example/repo

### Before Merging
- [ ] Validation pending

### Scope Declaration
No new directories.

### Commit Format Used
[CODEX] test(ci): verify template

### Changes Summary
Update validation.

### Tests
- [x] Tests pass

### Escalations
None.

### Handoff Notes
Review the validation output.
`;

test("PR template accepts a completed description with pending checklist items", () => {
  assert.deepEqual(validatePrBody(completedBody), []);
});

test("PR template rejects empty and custom descriptions", () => {
  assert.deepEqual(validatePrBody(null), ["PR description is empty."]);
  assert.ok(validatePrBody("Custom summary").includes("Missing heading: ### Tests"));
});

test("PR template rejects unchanged placeholders and sections filled only by comments", () => {
  const body = completedBody
    .replace("**Agent:** Codex", "**Agent:** [Name / platform]")
    .replace("- [x] Tests pass", "<!-- test notes -->");
  assert.ok(validatePrBody(body).includes("Fill in template placeholder: [Name / platform]"));
  assert.ok(validatePrBody(body).includes("Empty section: ### Tests"));
});
