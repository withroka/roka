#!/bin/sh

cp -f "$CLAUDE_PROJECT_DIR/AGENTS.md" "$CLAUDE_PROJECT_DIR/CLAUDE.md"
cp -fR "$CLAUDE_PROJECT_DIR/.github/agents" "$CLAUDE_PROJECT_DIR/.claude/agents"

if ! command -v deno >/dev/null; then
  if curl -fsSL https://deno.land/install.sh | sh >/dev/null; then
    echo 'export PATH="$PATH:$HOME/.deno/bin"' >>"$CLAUDE_ENV_FILE"
    echo "Installed deno"
  fi
fi
