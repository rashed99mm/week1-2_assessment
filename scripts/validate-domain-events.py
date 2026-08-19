#!/usr/bin/env python3
"""Validate emitted domain events against the published JSON Schema.

`DomainEventContractTest` provokes one event of every type through the real
service layer and writes the resulting envelopes to
`tickets-backend/storage/framework/testing/domain-events/envelopes.json`. This
script checks them against `docs/contracts/domain-events.schema.json`.

The point is to catch drift between the producer and the contract *here*,
rather than in the Node or .NET repository where the first symptom would be
messages piling up in a dead-letter queue. It exists because nothing in the PHP
toolchain validates JSON Schema.

Run from anywhere:

    python scripts/validate-domain-events.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

try:
    from jsonschema import Draft202012Validator
except ImportError:
    sys.exit("jsonschema is not installed. Run: python -m pip install jsonschema")

REPO_ROOT = Path(__file__).resolve().parent.parent
SCHEMA_PATH = REPO_ROOT / "docs" / "contracts" / "domain-events.schema.json"
ENVELOPES_PATH = (
    REPO_ROOT
    / "tickets-backend"
    / "storage"
    / "framework"
    / "testing"
    / "domain-events"
    / "envelopes.json"
)

# Every type the contract documents. A type that stops being emitted is as much
# a contract break as one whose payload changed — a consumer waiting on
# `order.refunded` has no way to tell "not emitted yet" from "never again".
EXPECTED_TYPES = {
    "user.registered",
    "order.created",
    "order.paid",
    "order.refunded",
    "order.cancelled",
    "event.published",
}


def main() -> int:
    if not SCHEMA_PATH.is_file():
        sys.exit(f"Schema not found: {SCHEMA_PATH}")

    if not ENVELOPES_PATH.is_file():
        sys.exit(
            f"Envelopes not found: {ENVELOPES_PATH}\n"
            "Run `php artisan test --filter DomainEventContractTest` first."
        )

    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(schema)
    validator = Draft202012Validator(schema)

    envelopes = json.loads(ENVELOPES_PATH.read_text(encoding="utf-8"))
    print(f"Validating {len(envelopes)} envelope(s) against {SCHEMA_PATH.name}\n")

    failed = False

    for envelope in envelopes:
        event_type = envelope.get("type", "<missing type>")
        errors = sorted(validator.iter_errors(envelope), key=lambda e: list(e.path))

        if errors:
            failed = True
            print(f"  FAIL  {event_type}")
            for error in errors:
                path = "/".join(map(str, error.path)) or "(root)"
                print(f"          {path}: {error.message}")
        else:
            print(f"  PASS  {event_type}")

    seen = {envelope.get("type") for envelope in envelopes}
    missing = EXPECTED_TYPES - seen

    if missing:
        failed = True
        print(f"\n  FAIL  no envelope emitted for: {', '.join(sorted(missing))}")

    unexpected = seen - EXPECTED_TYPES
    if unexpected:
        failed = True
        print(
            f"\n  FAIL  undocumented event type(s): {', '.join(sorted(unexpected))}\n"
            "        Add them to docs/contracts/domain-events.md and the schema."
        )

    print()
    print("Contract violated." if failed else "All envelopes match the published contract.")

    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
