import { readFileSync } from "node:fs";
import { validatePrBody } from "./validate-pr-body.mjs";

const [file] = process.argv.slice(2);
const eventPath = process.env.GITHUB_EVENT_PATH;
if (!file && !eventPath) {
  console.error("Usage: npm run check:pr-template -- <pr-body.md>");
  process.exitCode = 1;
} else {
  const body = file
    ? readFileSync(file, "utf8")
    : JSON.parse(readFileSync(eventPath, "utf8")).pull_request?.body;
  const errors = validatePrBody(body);
  if (errors.length) {
    errors.forEach((error) => console.error(error));
    process.exitCode = 1;
  } else {
    console.log("PR description follows the agent contribution template.");
  }
}
