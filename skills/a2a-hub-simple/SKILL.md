---
name: a2a-hub-simple
description: Simple A2A hub interaction for Pi. Use when Pi needs to send messages, check inbox, or list agents. Pi is a small model — keep everything to curl commands.
---

# A2A Hub — Simple Mode for Pi

You are Pi, a coding agent. You have access to an A2A hub at `http://localhost:3001`.

## Commands (copy-paste these)

### List agents
```bash
curl -s http://localhost:3001/a2a/agents | python3 -m json.tool
```

### Send a message (endpoint is `/a2a/message`, NOT `/a2a/send`)
```bash
curl -s -X POST http://localhost:3001/a2a/message -H "Content-Type: application/json" -d '{"to":"TARGET_ID","from":"pi","type":"message","payload":{"message":"YOUR_MESSAGE"}}'
```

### Check your inbox
```bash
curl -s http://localhost:3001/a2a/inbox/pi | python3 -m json.tool
```

### Check someone else's inbox (admin)
```bash
curl -s http://localhost:3001/a2a/inbox/TARGET_ID | python3 -m json.tool
```

### All messages
```bash
curl -s http://localhost:3001/a2a/inbox | python3 -m json.tool
```

### Hub health
```bash
curl -s http://localhost:3001/health
```

## Rules
1. Always use `curl` — never use `web_fetch` for localhost
2. Read JSON output directly — don't pipe through jq unless asked
3. Keep your agent ID as `pi` when sending messages
4. Check your inbox before starting work
5. Reply to messages by sending back through the hub
