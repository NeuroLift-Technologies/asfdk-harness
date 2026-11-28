import { readFileSync } from "node:fs";

const template = readFileSync(
  new URL("../PULL_REQUEST_TEMPLATE/agent-contribution.md", import.meta.url),
  "utf8",
);
const headings = [...template.matchAll(/^#{2,3} .+$/gm)].map(([heading]) => heading.trim());
const placeholders = [
  "[Name / platform]",
  "[Branch / session ID]",
  "[Repository name]",
  "None / [Description]",
];

export function validatePrBody(body) {
  if (typeof body !== "string" || !body.trim()) return ["PR description is empty."];

  const lines = body.replace(/<!--[\s\S]*?-->/g, "").split(/\r?\n/);
  const headingRank = (line) => /^\s*(#{1,6})\s/.exec(line)?.[1].length ?? Infinity;
  const errors = [];
  let previous = -1;

  for (const heading of headings) {
    const index = lines.findIndex((line) => line.trim() === heading);
    if (index === -1) {
      errors.push(`Missing heading: ${heading}`);
    } else if (index <= previous) {
      errors.push(`Heading out of order: ${heading}`);
    } else {
      const rank = headingRank(heading);
      const next = lines.findIndex((line, number) => number > index && headingRank(line) <= rank);
      const section = lines.slice(index + 1, next === -1 ? undefined : next);
      if (!section.some((line) => line.trim() && line.trim() !== "---" && headingRank(line) === Infinity)) {
        errors.push(`Empty section: ${heading}`);
      }
      previous = index;
    }
  }

  for (const field of ["Agent", "Session", "Governed by", "Working repo"]) {
    const label = `**${field}:**`;
    if (!lines.some((line) => line.startsWith(label) && line.slice(label.length).trim())) {
      errors.push(`Missing field: ${field}`);
    }
  }

  for (const placeholder of placeholders) {
    if (lines.some((line) => line.includes(placeholder))) {
      errors.push(`Fill in template placeholder: ${placeholder}`);
    }
  }
  return errors;
}
