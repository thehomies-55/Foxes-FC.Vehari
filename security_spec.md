# Foxes FC.vehari — Firestore Security Specification

## 1. Data Invariants
1. **Manager Sovereignty (POTM & POTS)**: Only the verified club Manager (`thehomies1358@gmail.com` or `/admins/{uid}`) may assign or modify `officialPotmId`/`officialPotmName` on `/matches/{matchId}` or `officialPotsId`/`officialPotsName` on `/series/{seriesId}`. Authorized editors may submit match/series statistics and system-generated suggestions, never official awards.
2. **Manager-Only Instagram Desk Isolation**: `/managerIgConfig`, `/playerIgDirectory`, and `/igAlertLogs` contain private Instagram handles and dispatch logs and are strictly readable and writable only by the Manager.
3. **Editor Delegation**: `/editors/{editorEmail}` grants editor permissions strictly by Manager creation/deletion. Editors cannot grant or revoke editor status.
4. **Community Participation Boundary**: Fans and members (any verified Google user) may only create/delete their own `/discordMessages` and `/discordVotes` documents. All club operational collections reject writes from non-editor, non-manager accounts.
5. **PII Isolation**: `/users/{userId}` restricts `get` to document owner or Manager and `list` to Manager only.
6. **Temporal & Structural Integrity**: Every document enforces strict `hasAll` + `hasOnly` schema checks, bounded string/list lengths, regex-validated document IDs, immutable `createdAt`/`createdByUid`, and server-enforced `request.time` timestamps.

## 2. Dirty Dozen Attack Vectors Covered
1. Fan attempting to create or update a `/players/{playerId}` stat record -> `PERMISSION_DENIED`.
2. Authorized editor attempting to set `officialPotmId` during `/matches` create -> `PERMISSION_DENIED`.
3. Authorized editor attempting to mutate `officialPotmId` during `/matches` update -> `PERMISSION_DENIED`.
4. Authorized editor attempting to mutate `officialPotsId` on `/series` -> `PERMISSION_DENIED`.
5. Authorized editor or fan attempting to read `/playerIgDirectory` -> `PERMISSION_DENIED`.
6. Authorized editor attempting to write `/managerIgConfig` -> `PERMISSION_DENIED`.
7. Unverified email claim spoofing Manager email (`email_verified == false`) -> `PERMISSION_DENIED`.
8. User spoofing another user's `authorUid` in `/discordMessages` -> `PERMISSION_DENIED`.
9. User injecting extra shadow fields (e.g., `isAdmin: true`) into `/users` or `/discordMessages` -> `PERMISSION_DENIED`.
10. Resource poisoning with oversized (>1KB) document ID or >4KB news body -> `PERMISSION_DENIED`.
11. Fan attempting to list `/users` or `/editors` -> `PERMISSION_DENIED`.
12. Client forging past/future `createdAt` timestamp instead of `request.time` -> `PERMISSION_DENIED`.
