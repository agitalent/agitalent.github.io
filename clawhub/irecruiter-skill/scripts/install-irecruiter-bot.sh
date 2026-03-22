#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${IRECRUITER_ENV_FILE:-$HOME/.openclaw/irecruiter.env}"
PLIST_NAME="com.agitalent.irecruiter-bot.plist"
PLIST_SRC="$ROOT_DIR/launchd/$PLIST_NAME"
PLIST_DST="$HOME/Library/LaunchAgents/$PLIST_NAME"

SUPABASE_URL_VALUE="${SUPABASE_URL:-${1:-}}"
SUPABASE_KEY_VALUE="${SUPABASE_ANON_KEY:-${SUPABASE_PUBLISHABLE_KEY:-${2:-}}}"

if [[ -z "${SUPABASE_URL_VALUE}" ]]; then
  printf 'Supabase URL: '
  read -r SUPABASE_URL_VALUE
fi

if [[ -z "${SUPABASE_KEY_VALUE}" ]]; then
  printf 'Supabase anon/publishable key: '
  read -r SUPABASE_KEY_VALUE
fi

if [[ -z "${SUPABASE_URL_VALUE}" || -z "${SUPABASE_KEY_VALUE}" ]]; then
  echo "Supabase URL and key are required."
  exit 1
fi

mkdir -p "$(dirname "$ENV_FILE")" "$HOME/Library/LaunchAgents"

cat > "$ENV_FILE" <<EOF
SUPABASE_URL=$SUPABASE_URL_VALUE
SUPABASE_ANON_KEY=$SUPABASE_KEY_VALUE
EOF
chmod 600 "$ENV_FILE"

cp "$PLIST_SRC" "$PLIST_DST"

launchctl bootout "gui/$(id -u)" "$PLIST_DST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_DST"
launchctl enable "gui/$(id -u)/com.agitalent.irecruiter-bot"
launchctl kickstart -k "gui/$(id -u)/com.agitalent.irecruiter-bot"

echo "Installed iRecruiter bot service."
echo "Env file: $ENV_FILE"
echo "LaunchAgent: $PLIST_DST"
