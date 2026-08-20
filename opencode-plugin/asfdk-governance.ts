// ASFDK Governance Plugin for OpenCode
// Monitors tool execution through the ASFDK solidarity framework
// Does NOT block actions - observation only

export default async function () {
  return {
    "tool.execute.before": async (input: any, output: any) => {
      // ASFDK governance observation - log tool calls without blocking
      if (input.tool) {
        // console.log("[ASFDK] tool.execute.before:", input.tool)
      }
    },
  };
}
