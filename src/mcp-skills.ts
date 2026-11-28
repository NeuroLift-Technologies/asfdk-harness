import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const skillFiles = {
  "asfdk-governance": ["SKILL.md"],
  "nlt-document-governance": ["SKILL.md", "nlt-document-governance-templates.md"],
  "nlt-learn": ["SKILL.md", "nlt-learn-references.md"],
  "personal-toi": ["SKILL.md"],
  "solidarity-framework": ["SKILL.md", "solidarity-framework-reference.md"],
} as const;

const signedToiReference = {
  plugin: "ASFDK",
  path: "skills/personal-toi/approved-personal.toi",
  access: "Read in the private ASFDK plugin.",
} as const;

const bundleSchema = z.record(z.string(), z.string().refine((text) => text.trim().length > 0));
const skillPaths = Object.entries(skillFiles).flatMap(([skill, files]) =>
  files.map((file) => `${skill}/${file}`),
);

export function registerMcpSkills(server: McpServer, bundle: unknown): void {
  const result = bundleSchema.safeParse(bundle);
  if (!result.success) return;

  const documents = new Map<string, string>();
  for (const path of skillPaths) {
    const text = result.data[path];
    if (text) documents.set(path, text);
  }
  if (documents.size !== skillPaths.length) return;

  server.registerTool(
    "asfdk_skills",
    {
      title: "ASFDK Skills",
      description:
        "List the ASFDK skill catalog or read a skill or reference by its catalog path. " +
        "Includes ASFDK governance, NLT document governance, NLT Learn, personal TOI guidance, and the Solidarity Framework.",
      inputSchema: z.object({ path: z.enum(skillPaths).optional() }).strict(),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ path }) => {
      if (path) {
        return { content: [{ type: "text", text: documents.get(path)! }] };
      }
      const skills = Object.entries(skillFiles).map(([name, files]) => ({
        name,
        ...(name === "personal-toi" ? { signedToiReference } : {}),
        paths: files.map((file) => `${name}/${file}`),
      }));
      return {
        content: [{ type: "text", text: JSON.stringify(skills) }],
        structuredContent: { skills },
      };
    },
  );
}
