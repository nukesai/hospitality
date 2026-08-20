---
"@nukesai-pos/backend": minor
"@nukesai-pos/common": minor
"@nukesai-pos/frontend": minor
"@nukesai-pos/cli": minor
---

Single-mount API dispatcher (`createPosApi` + `POS_API_BASE_PATH`), package-owned
tRPC root (`posTrpc`/procedures — consumers keep only routers), `getPos()`
singleton, next-intl localization layer (i18next removed; `createPosRequestConfig`,
`PosIntl`, `withNukesPos`, `createPosProxy`, `PosAdminShell`), and a full CLI
assembler (init/add/doctor/upgrade with stamped, example-synced templates).
