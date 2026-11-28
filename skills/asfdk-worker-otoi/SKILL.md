---
name: asfdk-worker-otoi
description: Use when asked to review, update, or verify the live ASFDK Governance Agent Worker's OTOI charter in Cloudflare Workers KV.
---

# Update the live Worker OTOI

The `asfdk-governance-agent` Worker's MCP handler reads key `otoi` from its
`GOVERNANCE` binding at harness startup and falls back to `ASFDK_OTOI_CONTENT`
if the key is absent. This charter applies across MCP callers. Use an
authenticated Cloudflare operator connection with access to the deployed
binding. `asfdk_protocol_status` reports runtime loading and diagnostics.

## Prepare

1. Identify the exact approved candidate file or the requested charter change.
   Draft any changes in a separate candidate file and show the diff for review.
   Confirm the deployed Worker and the namespace behind its `GOVERNANCE` binding.
2. Parse the candidate with the same ASFDK SDK parser used by the Worker.
   In the harness checkout with dependencies installed, run:

   ```bash
   node --input-type=module -e '
     import { readFileSync } from "node:fs";
     import { otoi } from "@neurolift-technologies/asfdk";
     otoi.parseCharter(JSON.parse(readFileSync(process.argv[1], "utf8")));
     console.log("OTOI schema valid");
   ' -- "$candidate"
   ```

3. Review source URIs and any pinned hashes against the deployment. Schema
   validation alone does not establish that the Worker can resolve those sources.
   Record the SHA-256 of the candidate. Read the current remote value into a
   private rollback file and record its SHA-256. Use
   `npx wrangler kv key get otoi --binding GOVERNANCE --remote` with stdout
   redirected to the private file. If the key is confirmed absent,
   record that rollback means restoring absence. Stop on ambiguous read errors.
4. Get the human maintainer's approval for the exact candidate and production
   target before uploading. Re-read the current value immediately before the
   write. If it differs from the rollback baseline, stop and review the change.

## Apply and verify

With `candidate` set to the approved file and Wrangler authenticated to the
verified production account, run from the harness checkout:

```bash
npx wrangler kv key put otoi --binding GOVERNANCE --path "$candidate" --remote
```

1. Read the remote `otoi` back and compare it byte-for-byte with the approved
   candidate. Keep the charter and rollback copy out of logs and version control.
2. Call `asfdk_protocol_status` and check for `otoi-honor-resolution`, charter
   diagnostics, and any observable fields that distinguish the new charter from
   the old one. Report KV verification separately from runtime verification.
   Workers KV can take time to propagate, and a warm Worker retains its cached
   harness. If the fields do not identify the changed charter, report runtime
   activation as unverified.
3. If the change needs rollback, use the saved prior value or restore the prior
   absence with the maintainer's approval. Recheck KV and runtime status.
