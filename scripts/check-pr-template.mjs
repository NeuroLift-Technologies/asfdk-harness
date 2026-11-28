import { readFileSync } from "node:fs";
import { validatePrBody } from "./validate-pr-body.mjs";

const [file] = process.argv.slice(2);
if (!file) {
  console.error("Usage: npm run test:pr-template -- <pr-body.md>");
  process.exitCode = 1;
} else {
  const errors = validatePrBody(readFileSync(file, "utf8"));
  if (errors.length) {
    errors.forEach((error) => console.error(error));
    process.exitCode = 1;
  } else {
    console.log("PR description follows the agent contribution template.");
  }
}
