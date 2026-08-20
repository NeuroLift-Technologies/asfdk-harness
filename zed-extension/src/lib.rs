use std::env;

use zed_extension_api::settings::{CommandSettings, ContextServerSettings};
use zed_extension_api::{
    self as zed, serde_json, Command, ContextServerConfiguration, ContextServerId, Project,
    Result,
};

const CONTEXT_SERVER_ID: &str = "asfdk-harness";
const LOCAL_MCP_ENTRYPOINT: &str = "../dist/mcp-server.js";

struct AsfdkHarnessExtension;

impl AsfdkHarnessExtension {
    fn local_dev_command(&self) -> Result<Option<Command>> {
        let entrypoint = env::current_dir()
            .map_err(|err| format!("failed to resolve extension working directory: {err}"))?
            .join(LOCAL_MCP_ENTRYPOINT);

        if entrypoint
            .metadata()
            .is_ok_and(|metadata| metadata.is_file())
        {
            return Ok(Some(Command {
                command: zed::node_binary_path()?,
                args: vec![entrypoint.to_string_lossy().into_owned()],
                env: Vec::new(),
            }));
        }

        Ok(None)
    }

    fn default_command(&self) -> Result<Command> {
        if let Some(command) = self.local_dev_command()? {
            return Ok(command);
        }

        Ok(Command {
            command: "asfdk-harness-mcp".to_string(),
            args: Vec::new(),
            env: Vec::new(),
        })
    }

    fn apply_command_override(&self, base: Command, override_settings: &CommandSettings) -> Command {
        let command = override_settings.path.clone().unwrap_or(base.command);
        let args = override_settings.arguments.clone().unwrap_or(base.args);
        let env = override_settings
            .env
            .clone()
            .map(|entries| entries.into_iter().collect())
            .unwrap_or(base.env);

        Command { command, args, env }
    }
}

impl zed::Extension for AsfdkHarnessExtension {
    fn new() -> Self {
        Self
    }

    fn context_server_command(
        &mut self,
        _context_server_id: &ContextServerId,
        project: &Project,
    ) -> Result<Command> {
        let base = self.default_command()?;
        let settings = ContextServerSettings::for_project(CONTEXT_SERVER_ID, project)?;

        if let Some(command_settings) = settings.command.as_ref() {
            return Ok(self.apply_command_override(base, command_settings));
        }

        Ok(base)
    }

    fn context_server_configuration(
        &mut self,
        _context_server_id: &ContextServerId,
        _project: &Project,
    ) -> Result<Option<ContextServerConfiguration>> {
        let installation_instructions = r#"
## ASFDK Harness MCP server setup

This extension starts the ASFDK MCP server and exposes ASFDK governance tools in Zed.

### Recommended (local repo dev mode)

From the `asfdk-harness` repository root:

```bash
npm install
npm run build
```

Then install this folder as a Dev Extension in Zed:

- Open `zed: extensions`
- Click **Install Dev Extension**
- Select `asfdk-harness/zed-extension`

The extension will automatically run `../dist/mcp-server.js` when that file exists.

### Alternative (PATH binary)

If `../dist/mcp-server.js` is not present, the extension falls back to `asfdk-harness-mcp` from PATH.

You can make that available by installing from this repo:

```bash
npm install
npm run build
npm link
```

### Optional command override

You can override the startup command in Zed settings:

```json
{
  "context_servers": {
    "asfdk-harness": {
      "command": {
        "path": "asfdk-harness-mcp",
        "arguments": [],
        "env": {
          "ASFDK_MODE": "unified"
        }
      }
    }
  }
}
```
"#
        .trim()
        .to_string();

        let settings_schema = serde_json::json!({
            "type": "object",
            "properties": {},
            "additionalProperties": false
        })
        .to_string();

        let default_settings = serde_json::json!({}).to_string();

        Ok(Some(ContextServerConfiguration {
            installation_instructions,
            settings_schema,
            default_settings,
        }))
    }
}

zed::register_extension!(AsfdkHarnessExtension);
