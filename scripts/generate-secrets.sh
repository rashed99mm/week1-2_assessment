#!/usr/bin/env bash
#
# Generate the secrets a deployment needs, and fill them into .env.
#
#   ./scripts/generate-secrets.sh
#
# Safe to re-run: existing values are left alone. Deleting a value and running
# again regenerates just that one.
#
# Rotating the JWT key pair invalidates every live session across all three
# services at once, because each verifies against the public key it was given
# at start-up. Treat it as a coordinated restart, not a routine change.

set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE=".env"
SECRETS_DIR="deploy/secrets"

if [[ ! -f "$ENV_FILE" ]]; then
    cp .env.example "$ENV_FILE"
    echo "Created $ENV_FILE from .env.example"
fi

# Set a key in .env only when it is currently empty.
set_if_empty() {
    local key="$1" value="$2"
    local current
    current=$(grep -E "^${key}=" "$ENV_FILE" | head -1 | cut -d= -f2- | sed 's/[[:space:]]*#.*//' | xargs || true)

    if [[ -n "$current" ]]; then
        echo "  $key already set, leaving it alone"
        return
    fi

    # The trailing comment marker is dropped along with the placeholder.
    if grep -qE "^${key}=" "$ENV_FILE"; then
        sed -i.bak -E "s|^${key}=.*|${key}=${value}|" "$ENV_FILE" && rm -f "${ENV_FILE}.bak"
    else
        printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
    fi

    echo "  $key generated"
}

random_secret() {
    openssl rand -base64 32 | tr -d '/+=' | cut -c1-32
}

echo "Generating passwords..."
set_if_empty POSTGRES_PASSWORD "$(random_secret)"
set_if_empty MONGO_PASSWORD "$(random_secret)"
set_if_empty RABBITMQ_PASSWORD "$(random_secret)"
set_if_empty GATEWAY_API_KEY "$(random_secret)"

# Laravel's own format: base64: prefix, 32 random bytes.
echo "Generating APP_KEY..."
set_if_empty APP_KEY "base64:$(openssl rand -base64 32)"

echo "Generating the JWT key pair..."
mkdir -p "$SECRETS_DIR"

if [[ -f "$SECRETS_DIR/jwt-private.pem" ]]; then
    echo "  key pair already exists, leaving it alone"
else
    openssl genrsa -out "$SECRETS_DIR/jwt-private.pem" 2048 2>/dev/null
    openssl rsa -in "$SECRETS_DIR/jwt-private.pem" \
        -pubout -out "$SECRETS_DIR/jwt-public.pem" 2>/dev/null

    # The private key signs admin tokens. Only its owner should be able to
    # read it.
    chmod 600 "$SECRETS_DIR/jwt-private.pem"
    chmod 644 "$SECRETS_DIR/jwt-public.pem"

    echo "  RS256 key pair written to $SECRETS_DIR/"
fi

echo
echo "Done. Next:"
echo "  docker compose up -d --wait"
echo "  open http://localhost/          # portal"
echo "  open http://localhost/admin/    # CMS"
echo "  open http://localhost:8025/     # Mailpit inbox"
