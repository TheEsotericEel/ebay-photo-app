# iOS V1 Requirements Matrix

Last updated: 05/22/2026

## Purpose

This matrix maps canonical V1 requirements to concrete iOS implementation surfaces so delivery stays aligned and avoids deferred-scope drift.

Canonical references:

- `docs/BACKEND_CONTRACT_V1.md`
- `docs/ios-migration-docs/ebay-photo-app-ios-migration-docs/docs/PROJECT_SPEC.md`
- `docs/ios-migration-docs/ebay-photo-app-ios-migration-docs/docs/IMPLEMENTATION_DECISIONS.md`
- `docs/ios-migration-docs/ebay-photo-app-ios-migration-docs/docs/IOS_CAPTURE_APP_SPEC.md`
- `docs/ios-migration-docs/ebay-photo-app-ios-migration-docs/docs/FIRST_NATIVE_BUILD_HANDOFF.md`
- `docs/ios-migration-docs/ebay-photo-app-ios-migration-docs/docs/MIGRATION_PLAN.md`

## Requirements To Code

| Requirement | Status | Primary iOS files |
| --- | --- | --- |
| OTP-first auth with password fallback | In progress | `ios/EbayPhotoApp/Views/RootView.swift`, `ios/EbayPhotoApp/Services/SupabaseService.swift` |
| Real local multi-item queue | In progress | `ios/EbayPhotoApp/App/AppState.swift`, `ios/EbayPhotoApp/Views/RootView.swift` |
| `Next / Finish Item` checkpoint defines item boundary | In progress | `ios/EbayPhotoApp/App/AppState.swift`, `ios/EbayPhotoApp/Views/RootView.swift` |
| Queue survives app relaunch | In progress | `ios/EbayPhotoApp/App/AppState.swift` |
| Review/edit before submit | In progress | `ios/EbayPhotoApp/Views/RootView.swift`, `ios/EbayPhotoApp/Views/ItemDetailsSheet.swift` |
| Submit only eligible finalized queued work | In progress | `ios/EbayPhotoApp/App/AppState.swift`, `ios/EbayPhotoApp/Views/RootView.swift` |
| Retry without duplication, remote ID reuse | Planned | `ios/EbayPhotoApp/App/AppState.swift`, `ios/EbayPhotoApp/Services/SupabaseService.swift` |
| Required variants `listing` + `thumbnail` only | In place | `ios/EbayPhotoApp/Models/NativeUploadItemPacketV1.swift`, `ios/EbayPhotoApp/Services/SupabaseService.swift`, `ios/EbayPhotoApp/Views/RootView.swift` |
| V1 storage path/bucket contract | In place | `ios/EbayPhotoApp/Services/SupabaseService.swift` |
| Item-level store assignment in queue | Planned | `ios/EbayPhotoApp/App/AppState.swift`, `ios/EbayPhotoApp/Views/CaptureContextSheet.swift`, `ios/EbayPhotoApp/Views/RootView.swift` |
| Per-item/per-photo submit progress visibility | Planned | `ios/EbayPhotoApp/App/AppState.swift`, `ios/EbayPhotoApp/Services/SupabaseService.swift`, `ios/EbayPhotoApp/Views/RootView.swift` |
| Local cleanup after safe confirmation, metadata preserved | Planned | `ios/EbayPhotoApp/App/AppState.swift`, `ios/EbayPhotoApp/Views/RootView.swift` |

## Frozen Defers (Do Not Expand In V1)

- Exact `Done` behavior semantics
- Exact local queue to remote `batches` mapping policy
- Reorder / move-between-items (unless required to satisfy acceptance gates)
- Background uploads
- Owner-scoped schema or RLS hardening
- `original` variant upload
- Multi-user/team auth roles

## V1 Phase Gates

1. Auth/session path stable (OTP-first, password fallback available)
2. Capture loop stable (`capture -> Next -> queue persistence`)
3. Queue review/edit/retake stable
4. Submit/retry path idempotent (no duplicate remote photos/items on retry)
5. Desktop visibility verified after submit
6. Local cleanup safe and metadata-preserving
