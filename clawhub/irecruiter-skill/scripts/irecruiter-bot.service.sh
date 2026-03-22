#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${IRECRUITER_ENV_FILE:-$HOME/.openclaw/irecruiter.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  cat >&2 <<EOF
Missing env file: $ENV_FILE

Create it with:
  SUPABASE_URL=https://zocovvewzpqxspysanyy.supabase.co
  SUPABASE_ANON_KEY=your_public_supabase_key
EOF
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

cd "$ROOT_DIR"
exec /usr/bin/env node scripts/irecruiter-bot.mjs watch
