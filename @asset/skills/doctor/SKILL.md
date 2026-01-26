---
name: doctor
description: Use when the development environment is misconfigured (missing CLIs, missing project config files, missing OpenCode plugins, or conflicting multi-installs) and you need a single consolidated diagnosis and fix plan.
model: low
---

# Doctor (Environment Diagnosis)

Diagnose the local environment for:

- OpenCode CLI, agent-browser
- project files (AGENTS.md, opencode.json)
- OpenCode global config (~/.config/opencode/opencode.json)
- multi-install conflicts (npm/pnpm/brew/native)

## Usage

Run via OCDX skill runner:

```bash
/ocdx doctor
```

## Step 1: Parallel checks (true parallel)

Run the following FOUR Bash tool calls in parallel (separate calls, not sequential). Each call MUST print its own section header.

### Batch 1: CLI versions

```bash
echo "=== CLI_VERSIONS ==="
echo "opencode:" && (which opencode && opencode --version 2>/dev/null || echo "NOT_FOUND")
echo "agent-browser:" && (which agent-browser && agent-browser --version 2>/dev/null || echo "NOT_FOUND")
```

### Batch 2: Project files

Run in the target project root (use current directory).

```bash
echo "=== PROJECT_FILES ==="
echo "AGENTS.md:" && (test -f AGENTS.md && echo "FOUND" || echo "NOT_FOUND")
echo "opencode.json:" && (test -f opencode.json && echo "CONFIGURED" || echo "NOT_FOUND")
echo "instructions:" && (if [ -f opencode.json ]; then grep -q '"AGENTS.md"' opencode.json && grep -q '"ruler/' opencode.json && echo "VALID" || echo "INVALID"; else echo "SKIP"; fi)
```

### Batch 3: OpenCode config + plugins

```bash
echo "=== OPENCODE_CONFIG ==="
if [ "${OPENCODE_DISABLE_AUTOUPDATE:-}" = "1" ] || [ "${OPENCODE_DISABLE_AUTOUPDATE:-}" = "true" ]; then
  echo "autoupdate: DISABLED(ENV)"
elif [ -f ~/.config/opencode/opencode.json ] || [ -f ~/.config/opencode/opencode.jsonc ]; then
  cfg="$HOME/.config/opencode/opencode.json"
  if [ -f ~/.config/opencode/opencode.jsonc ]; then cfg="$HOME/.config/opencode/opencode.jsonc"; fi

  if grep -Eq '"autoupdate"\s*:\s*false' "$cfg"; then
    echo "autoupdate: DISABLED"
  elif grep -Eq '"autoupdate"\s*:\s*"notify"' "$cfg"; then
    echo "autoupdate: NOTIFY"
  elif grep -Eq '"autoupdate"\s*:\s*true' "$cfg"; then
    echo "autoupdate: ENABLED"
  elif grep -Eq '"autoupdate"\s*:' "$cfg"; then
    echo "autoupdate: CUSTOM(ENABLED)"
  else
    echo "autoupdate: DEFAULT(ENABLED)"
  fi
else
  echo "autoupdate: CONFIG_NOT_FOUND"
fi

echo "=== OPENCODE_PLUGINS ==="
echo "oh-my-opencode:" && (grep -q 'oh-my-opencode' ~/.config/opencode/opencode.json 2>/dev/null && echo "INSTALLED" || echo "NOT_INSTALLED")
echo "opencode-antigravity-auth:" && (grep -q 'opencode-antigravity-auth' ~/.config/opencode/opencode.json 2>/dev/null && echo "INSTALLED" || echo "NOT_INSTALLED")
echo "opencode-openai-codex-auth:" && (grep -q 'opencode-openai-codex-auth' ~/.config/opencode/opencode.json 2>/dev/null && echo "INSTALLED" || echo "NOT_INSTALLED")
```

### Batch 4: Multi-version detection

```bash
echo "=== MULTI_VERSION ==="
echo "opencode/npm:" && (npm list -g opencode 2>/dev/null | grep opencode || echo "none")
echo "opencode/brew:" && (brew list opencode 2>/dev/null || echo "none")
```

## Step 2: Report

Parse results and print a single table:

```
Tool                           | Status          | Version
opencode                       | <OK|MISSING>    | <version|->
opencode autoupdate            | <OK|MISSING>    | <disabled|notify|enabled|default|custom>
agent-browser                  | <OK|MISSING>    | <version|->
AGENTS.md                      | <OK|MISSING>    | -
opencode.json                  | <OK|MISSING>    | -
instructions                   | <OK|INVALID|->  | -
oh-my-opencode                 | <OK|MISSING>    | -
opencode-antigravity-auth      | <OK|MISSING>    | -
opencode-openai-codex-auth     | <OK|MISSING>    | -
```

If multi-version conflicts exist, print a "Multi-version warning" section listing what is installed across managers.

## Step 3: One-shot confirmation (do not auto-change without consent)

If ANY missing/misconfigured items are found, ask the user ONCE:

"Detected missing/misconfigured items: <bulleted list>. Apply all suggested fixes automatically? (yes/no)"

If user says no: stop after providing the table + exact manual commands/edits.

If user says yes: proceed with Step 4.

## Step 4: Fixes (execute in order)

### 4.1 opencode CLI missing

Run:

```bash
brew install opencode || npm install -g opencode
```

### 4.4 AGENTS.md missing

Explain that OpenCode relies on AGENTS.md as the project instruction entry. Ask the user whether to generate a minimal AGENTS.md in the project root; if yes, create it via edit tool.

### 4.5 opencode.json missing

Create `<projectRoot>/opencode.json` with:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "instructions": ["AGENTS.md", "ruler/**/*.md"]
}
```

### 4.6 opencode.json instructions invalid

Edit opencode.json to ensure it includes:

- `"AGENTS.md"`
- `"ruler/**/*.md"`

### 4.7 OpenCode plugins missing

OpenCode plugins are configured in `~/.config/opencode/opencode.json` under `plugin` array.

Steps:

1. Read the file.
2. Add any missing entries:
   - `oh-my-opencode`
   - `opencode-antigravity-auth@latest`
   - `opencode-openai-codex-auth`
3. Verify:

```bash
grep -E 'oh-my-opencode|opencode-antigravity-auth|opencode-openai-codex-auth' ~/.config/opencode/opencode.json
```

### 4.8 OpenCode auto-update setting

If the user wants to disable auto-update, set env var:

```bash
export OPENCODE_DISABLE_AUTOUPDATE=1
```

Or edit `~/.config/opencode/opencode.json` (or `~/.config/opencode/opencode.jsonc`) and set:

```json
"autoupdate": false
```

If the user wants notifications only:

```json
"autoupdate": "notify"
```

## Final output

If everything is ready:

```
✅ 所有依赖已就绪
```

Otherwise:

```
⚠️ <tool> 未安装/未配置
```

After fixes, re-run Step 1 and print the final status table with all ✅.
