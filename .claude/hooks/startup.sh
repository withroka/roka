#!/bin/sh

if [ -f "$CLAUDE_PROJECT_DIR/AGENTS.md" ] && [ ! -e "$CLAUDE_PROJECT_DIR/CLAUDE.md" ]; then
  ln -sfn "$CLAUDE_PROJECT_DIR/AGENTS.md" "$CLAUDE_PROJECT_DIR/CLAUDE.md"
  echo "Linked CLAUDE.md"
fi

if [ -d "$CLAUDE_PROJECT_DIR/.github/agents" ] && [ ! -e "$CLAUDE_PROJECT_DIR/.claude/agents" ]; then
  ln -sfn "$CLAUDE_PROJECT_DIR/.github/agents" "$CLAUDE_PROJECT_DIR/.claude/agents"
  echo "Linked .claude/agents"
fi

if ! command -v deno >/dev/null; then
  if curl -fsSL https://deno.land/install.sh | sh >/dev/null; then
    echo 'export PATH="$PATH:$HOME/.deno/bin"' >>"$CLAUDE_ENV_FILE"
    echo "Installed deno"
  fi
fi
