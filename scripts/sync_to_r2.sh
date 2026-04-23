#!/usr/bin/env bash
# Sync docs/<site>/<slug>.md → R2 bucket so Cloudflare AI Search can index them.
#
# Uses your local `wrangler` OAuth — no extra credentials required.
# Idempotent: re-running re-uploads every article (AI Search dedupes by key
# and re-indexes only what changed).
#
# After upload, optionally triggers an AI Search sync job so the index
# refreshes immediately instead of waiting for the periodic scan.
#
# Usage:
#   scripts/sync_to_r2.sh                          # uses defaults
#   BUCKET=other-bucket scripts/sync_to_r2.sh      # override bucket
#   AI_SEARCH_INSTANCE=name scripts/sync_to_r2.sh  # also kick off re-index
#   PARALLEL=4 scripts/sync_to_r2.sh               # tune upload concurrency

set -euo pipefail

BUCKET="${BUCKET:-abolition-kb}"
DOCS_DIR="${DOCS_DIR:-docs}"
PARALLEL="${PARALLEL:-8}"
# Optional: if set, kick off an AI Search re-index after uploading.
AI_SEARCH_INSTANCE="${AI_SEARCH_INSTANCE:-}"

if ! command -v wrangler >/dev/null; then
  echo "error: wrangler not found in PATH" >&2
  exit 1
fi

# Build the file list. We include only <site>/<slug>.md, excluding the
# auto-generated README.md and index.json at the docs root.
mapfile -t files < <(find "$DOCS_DIR" -mindepth 2 -maxdepth 2 \( -name '*.md' -o -name '*.mdx' \) | sort)
total="${#files[@]}"

if [[ "$total" -eq 0 ]]; then
  echo "no .md files found under $DOCS_DIR/<site>/" >&2
  exit 1
fi

echo "syncing $total files → r2://$BUCKET (parallel=$PARALLEL)"

# Upload one file. The R2 key mirrors the local path under docs/, so
# citations from AI Search ("abolitionistsrising.com/foo.md") map 1:1 to
# the Fumadocs URL (/docs/abolitionistsrising.com/foo).
upload_one() {
  local path="$1"
  local key="${path#"$DOCS_DIR"/}"
  wrangler r2 object put "$BUCKET/$key" \
    --file="$path" \
    --content-type="text/markdown" \
    --remote >/dev/null
  printf '.'
}
export -f upload_one
export BUCKET DOCS_DIR

printf '%s\n' "${files[@]}" \
  | xargs -P "$PARALLEL" -I{} bash -c 'upload_one "$@"' _ {}
echo
echo "uploaded $total files."

if [[ -n "$AI_SEARCH_INSTANCE" ]]; then
  if [[ -z "${CLOUDFLARE_API_TOKEN:-}" || -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then
    echo "skipping re-index trigger: set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN to enable" >&2
    exit 0
  fi
  echo "triggering AI Search re-index for instance '$AI_SEARCH_INSTANCE'..."
  curl -fsS -X POST \
    "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/ai-search/instances/$AI_SEARCH_INSTANCE/jobs" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    | sed 's/.*/  &/'
fi
