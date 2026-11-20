# Identity validation service

Node.js service that validates a person, enriches the record with public country data, stores it in **MongoDB** and writes an append-only audit event to **DynamoDB Local**.

## Quick start

Requirements: Docker with Compose. Nothing else.

```bash
docker compose up --build
```

| What | URL |
|---|---|
| API | http://localhost:3000 |
| OpenAPI / Swagger UI | http://localhost:3000/docs |
| Health | http://localhost:3000/health |

Port taken? Every host port can be changed: `API_PORT=3100 docker compose up --build`.

## Endpoints

### `POST /validations`

```bash
curl -X POST localhost:3000/validations \
  -H 'content-type: application/json' \
  -d '{"name": "Ana Gómez", "documentNumber": "1020304050"}'
# 201 {"id":"6b00d6a86152ee9615a08a52"}
```

| Field | Required | Rules |
|---|---|---|
| `name` | yes | 2–100 characters, trimmed |
| `documentNumber` | yes | 5–20 letters or digits; `.`, `-` and spaces are removed (`1.020.304.050` → `1020304050`) |
| `countryCode` | no, default `CO` | ISO 3166-1 alpha-2; used to enrich the record |
| `phone` | no | E.164, e.g. `+573001234567` |

### `GET /validations/:id`

```bash
curl localhost:3000/validations/6b00d6a86152ee9615a08a52
```

```json
{
  "id": "6b00d6a86152ee9615a08a52",
  "name": "Ana Gómez",
  "documentNumber": "1020304050",
  "countryCode": "CO",
  "phone": null,
  "country": {
    "code": "CO",
    "name": "Colombia",
    "region": "Latin America & Caribbean",
    "incomeLevel": "Upper middle income",
    "capital": "Bogota"
  },
  "createdAt": "2026-11-20T23:24:24.593Z"
}
```

### Errors

Every error has the same shape: `{"error": {"code": "...", "message": "...", "details": [...]}}`.

| Status | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Invalid body or id (with per-field `details`) |
| 404 | `NOT_FOUND` | No validation with that id |
| 422 | `COUNTRY_NOT_FOUND` | The country code does not exist |
| 502 | `UPSTREAM_UNAVAILABLE` | Countries API failed (after one retry) |
| 504 | `UPSTREAM_TIMEOUT` | Countries API took longer than 3 s (after one retry) |
| 503 | `AUDIT_UNAVAILABLE` | DynamoDB failed; the MongoDB insert was rolled back |

## Tests

```bash
cd api
npm ci
npm test          # unit + HTTP tests, no Docker needed
npm run lint && npm run typecheck
```

## Design decisions

- **Public API: World Bank Countries API** (`api.worldbank.org/v2/country/{iso2}`). The first choice was REST Countries, but `v3.1` is now deprecated and `v5` requires an API key, which would force every reviewer to sign up before running the project. The World Bank API is free, keyless and official. Its quirks are handled and tested: unknown codes return **HTTP 200** with an error message, and regional aggregates (e.g. `ZJ`) look like countries.
- **External API resilience:** 3 s timeout, one retry only for transient failures (network, 5xx, timeout), never for "country does not exist". Successful lookups are cached in memory for one hour.
- **No validation without an audit event:** the id is generated before writing, the record goes to MongoDB, then the event to DynamoDB. If DynamoDB fails, the MongoDB insert is deleted and the API answers 503.
- **DynamoDB keys:** `PK documentKey = "<country>#<document>"`, `SK sk = "<ISO timestamp>#<eventId>"`. One query returns a person's full history in order; the country is part of the key because the same number can belong to different people in different countries; the suffix avoids collisions within the same millisecond. Writes are conditional, so events can never be overwritten.
- **Hexagonal-ish layout:** routes only translate HTTP; services receive their dependencies. Tests inject in-memory fakes, and `src/lambda.ts` runs the same app on AWS Lambda (not deployed).
