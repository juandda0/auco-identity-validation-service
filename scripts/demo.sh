#!/usr/bin/env bash
# End-to-end tour of the API with curl. Start the stack first: docker compose up --build
# Usage: scripts/demo.sh [api-url]   (default http://localhost:3000)
set -euo pipefail

API="${1:-http://localhost:3000}"
RUN="$(date +%s | tail -c 6)"   # unique numbers so the demo can run many times
DOC="10${RUN}01"
PHONE="+57300${RUN}0"

post() { curl -sS -X POST "$API$1" -H 'content-type: application/json' -d "$2"; echo; }
sign() { curl -sS -X POST "$API/documents/$1/sign"; echo; }   # no body, so no content-type
field() { python3 -c "import sys, json; print(json.load(sys.stdin)$1)"; }
title() { printf '\n\033[1m== %s\033[0m\n' "$1"; }

title "Health"
curl -sS "$API/health"; echo

title "1. Clean validation -> APPROVED"
RESPONSE=$(post /validations "{\"name\":\"Ana Gómez\",\"documentNumber\":\"$DOC\",\"phone\":\"$PHONE\"}")
echo "$RESPONSE"
ID=$(echo "$RESPONSE" | field '["id"]')

title "2. GET /validations/$ID (enriched with World Bank country data)"
curl -sS "$API/validations/$ID"; echo

title "3. Same document, another name -> REVIEW (DOCUMENT_NAME_MISMATCH)"
post /validations "{\"name\":\"Carlos Ruiz\",\"documentNumber\":\"$DOC\"}"

title "4. Same phone on another document -> REVIEW (SHARED_PHONE, phone GSI)"
post /validations "{\"name\":\"Luis Pérez\",\"documentNumber\":\"20${RUN}02\",\"phone\":\"$PHONE\"}"

title "5. Three invalid attempts, then a valid one -> BLOCKED (REPEATED_FAILURES)"
for _ in 1 2 3; do post /validations "{\"name\":\"X\",\"documentNumber\":\"30${RUN}03\"}" > /dev/null; done
post /validations "{\"name\":\"Marta Díaz\",\"documentNumber\":\"30${RUN}03\"}"

title "6. Error handling"
post /validations '{"name":"A"}'
post /validations "{\"name\":\"Ana\",\"documentNumber\":\"$DOC\",\"countryCode\":\"ZZ\"}"
curl -sS "$API/validations/0123456789abcdef01234567"; echo

title "7. Promissory note for the approved validation, then sign it"
DOCUMENT=$(post "/validations/$ID/promissory-notes" '{"amount":1500000,"dueDate":"2027-06-30","creditorName":"Banco Demo S.A."}')
echo "$DOCUMENT" | field '["content"]'
DOCUMENT_ID=$(echo "$DOCUMENT" | field '["id"]')
sign "$DOCUMENT_ID" | field '["signature"]'
echo "Signing twice:"; sign "$DOCUMENT_ID"

title "8. Audit timeline of CO#$DOC (one DynamoDB query)"
curl -sS "$API/audit/CO/$DOC" | python3 -c '
import sys, json
for e in json.load(sys.stdin)["events"]:
    print(e["occurredAt"], e["eventType"].ljust(20), e.get("verdict", ""))'
