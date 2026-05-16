Status: DONE
Commit: d0c244a91889eb93cbb108ec42b9697dcaa9290c

1. What Changed
- Added renderer-safe shared model/auth types in `src/shared/model-auth-types.ts`.
- Extended `IpcMethods` with the approved `modelsAuth.*` request/response contracts.
- Imported the new shared model/auth types into `src/shared/ipc-types.ts`.

2. Files Modified
- `src/shared/model-auth-types.ts`
- `src/shared/ipc-types.ts`

3. Validation Run
- `npx tsc --noEmit` — passed with no output.
- `gitnexus detect-changes --repo macpi` — risk low, affected processes 0, changed symbol `IpcMethods`.

4. Deviations / Open Issues
- No deviations from Task 1.1.
- Existing untracked file left untouched: `docs/superpowers/plans/2026-05-16-macpi-model-auth.md`.
- This report file was written after commit and is intentionally uncommitted.

5. Suggested Reviewer Focus
- Verify the new `modelsAuth.*` IPC method names and shapes match the approved plan exactly.
- Check that renderer-safe types expose no secret values.
