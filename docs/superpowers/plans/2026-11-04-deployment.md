# Deployment Implementation Plan

> For agentic workers: execute the approved design task by task in the current session. The optional superpowers execution skills are not installed; native implementation and focused review are used.

**Goal:** Support local, authenticated website, and isolated static-browser deployment, then update repository metadata.

**Architecture:** One cross-platform Node HTTP/SQLite service preserves the existing storage contract. Explicit browser runtime configuration and a separate static artifact select deployment behavior.

**Tech Stack:** Node.js 22.13+, node:sqlite, existing JavaScript/Vue/TypeScript, Docker, GitHub Actions.

**Spec:** docs/plans/2026-11-04-deployment-design.md

## Global Constraints

- Preserve confirmed business metrics and activity-ID associations.
- Default to empty data; no production configuration or private records.
- Server failures never switch persistence to browser storage.
- Local listener defaults to 127.0.0.1:8765; website requires administrator configuration.
- Static data is isolated by deployment path and stays in the visitor's browser.

## Review Focus

- Restart after explicit clear must preserve the cleared state (Task 1).
- Concurrent writes and malformed batch operations must not partially commit (Task 1).
- Unauthenticated requests, foreign origins, and expired sessions must not write (Task 2).
- Nested static deployments must preserve links and isolate browser keys (Task 3).
- Static artifacts must never contain runtime data, credentials, or server files (Task 4).

### Task 1: Cross-platform storage and HTTP host

Files: server/config.mjs, server/storage.mjs, server/host.mjs, tests/node-host.test.mjs, package.json.

Interface: createHost(config) returns an HTTP server; Storage.snapshot() returns {revision,updatedAt,values}; Storage.apply(body) validates and commits atomically.

- [x] Add failing integration tests for empty initialization, restart, clear, batch rollback and revision conflicts.
- [x] Implement configuration, SQLite persistence, backups and static file routing; preserve existing API payloads.
- [x] Run node --test tests/node-host.test.mjs; commit passing implementation.

### Task 2: Website authentication

Files: server/auth.mjs, app/offline-package/login.html, tests/auth.test.mjs.

Interface: POST /api/login establishes an HttpOnly session; POST /api/logout revokes it. Website routes require a session; writes require same origin.

- [x] Add failing tests for login failures, valid cookies, logout, request limits and foreign origins.
- [x] Implement session handling, rate limits and login UI with return-path validation.
- [x] Run node --test tests/auth.test.mjs; commit passing implementation.

### Task 3: Explicit client runtime and static persistence

Files: app/offline-package/runtime-config.js, shared-storage-client.js and member/shared-storage-client.js, browser-storage.js, module entry HTML, operations frontend, tests/browser-storage.test.mjs.

Interface: window.DashboardRuntime specifies mode, storage and basePath; existing __sharedStorageReady/__flushSharedStorage interfaces remain available.

- [x] Add tests for path-isolated storage, seed-once behavior, quota errors and same-origin iframe cooperation.
- [x] Implement browser adapter, backup controls, mode labels, session-expiry handling and deployment-relative URLs.
- [x] Verify client behavior and original business tests; commit passing implementation.

### Task 4: Builds, deployment and repository identity

Files: scripts/build-static.mjs, scripts/build-operations.mjs, Dockerfile, compose.yaml, deploy/Caddyfile, .dockerignore, .env.example, README.md, docs/DEPLOYMENT.md, CI workflows and package metadata.

- [x] Add artifact checks for empty template, absence of server/private files and relative assets.
- [x] Build static artifact from publish resources, add server and static deployment instructions and CI matrix.
- [x] Run all tests, type check, both builds, public scan and browser smoke checks.
- [ ] Review diff, commit, push to main, update GitHub name/description/topics and verify remote CI.

## Validation notes

Static browser persistence uses IndexedDB transactions with per-key conflict checks and pending-write retry. Real-browser checks covered nested paths, plan save/reload, concurrent tabs, quota failure/retry, JSON import persistence, and website login/logout. Publication uses the Git source list and Vite manifest to exclude ignored private files.
