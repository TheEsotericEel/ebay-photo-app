# eBay Photo Handoff App — Cross-Platform Spec

**Status**: Planning document (not yet approved for implementation)
**Created**: May 19, 2026
**Related**: `ebay-photo-handoff-camera-app-official-spec.md` (current PWA spec, preserved as historical context)

---

## 1. Product Direction

### 1.1 Current State

The current implementation is a **PWA-first web application** that provides:
- iPhone Safari camera capture with browser MediaStreamTrack/ImageCapture APIs
- Desktop browser listing queue for managing captured items
- Supabase backend for auth, data, and storage
- IndexedDB for local pending photo queue
- Single shared account model (one account used on both phone and desktop)

This is documented in `ebay-photo-handoff-camera-app-official-spec.md` and is currently in Phase 1 (end-to-end vertical slice partially complete).

### 1.2 Future Direction

The product will evolve into a **multi-platform application** with:
- **Webapp**: Desktop-focused listing/admin surface (evolution of current PWA)
- **Native iOS app**: Additional platform for capture and queue management
- **Shared backend**: Supabase auth, Postgres schema, and storage (unchanged)
- **Current PWA fallback**: The existing PWA mobile capture path remains as a working fallback and historical reference

### 1.3 Platform Roles

| Platform | Primary Role | Secondary Role | Status |
|----------|-------------|----------------|--------|
| **Shared Backend** | Data persistence, auth, storage, cleanup logic | API contracts for all platforms | Implemented (Supabase) |
| **Webapp** | Desktop listing queue, admin surface | Mobile browser capture (fallback) | Partially implemented (Phase 1) |
| **Native iOS App** | iOS capture surface, queue management | Desktop queue access (future) | Not started |
| **Current PWA** | Historical reference, fallback path | None | Implemented (Phase 0-1) |

### 1.4 Working Assumptions

1. **iOS app is additional, not replacement**: The native iOS app is an additional platform, not an immediate replacement for the current PWA.
2. **Webapp remains desktop-focused**: The webapp will focus on desktop browsers for listing/admin, with mobile browser capture as a fallback.
3. **Current PWA preserved**: The existing PWA/mobile capture path should remain documented as the current working path and possible fallback.
4. **Multi-user deferred**: Multi-user/team support is deferred unless existing repo/spec evidence shows it is required for MVP.
5. **Direct Supabase SDK default**: Start with direct Supabase client/SDK integration as the simplest default. A REST API layer is documented as a future option.
6. **Same repo preferred**: Prefer same repo/monorepo planning unless repo evidence suggests a separate repo is safer.

---

## 2. MVP Scope

### 2.1 Shared Backend MVP

**Included**:
- Supabase schema (stores, batches, items, photos, photo_variants, upload_jobs)
- Supabase Auth (magic-link login, single shared account)
- Private storage bucket (photo-assets, 50MB limit, JPEG/PNG)
- Retention/cleanup logic (delete after listing/completion window)
- Upload/sync logic (batch sync, retry/resume, verification)
- RLS policies (authenticated users can manage all data)

**Excluded**:
- Multi-user/team roles
- Billing/commercialization features
- eBay API integration
- AI listing generation
- REST API layer (deferred)

### 2.2 Webapp MVP

**Included**:
- Desktop listing queue (store/batch/item views)
- Item detail view (ordered photos, notes/SKU/weight)
- Status controls (listed, hold, needs retake, new)
- Photo availability state (available, deleted, incomplete)
- Upload progress and retry
- Manual local cleanup after verified upload
- Manual remote cleanup after retention window
- Mobile browser capture fallback (existing PWA camera)

**Excluded**:
- Advanced capture features (templates, flags, dimensions)
- Search/filter
- Copy-all notes block
- Chrome extension helper
- Background removal

### 2.3 iOS App MVP

**Included**:
- AVFoundation camera capture (rear camera, zoom, torch, focus)
- SwiftUI capture surface (live preview, metadata overlay)
- Core Data local storage (photos, items, batches)
- Supabase iOS SDK integration (auth, data, storage)
- SwiftUI queue surface (store/batch/item views)
- Upload/sync (batch sync, retry/resume, progress)
- Basic offline support (local queue survives app close)

**Excluded**:
- Advanced camera controls (manual exposure, white balance)
- Background sync (iOS background tasks)
- Real-time sync
- iPad-specific layouts
- Apple Watch companion

---

## 3. Deferred Scope

### 3.1 Shared Backend Deferred

- Multi-user/team support (RLS policies per user/team)
- REST API layer (if needed for rate limiting or custom logic)
- Edge Functions for server-side logic
- Advanced retention policies (per-store, per-batch)
- Storage optimization (CDN, compression)

### 3.2 Webapp Deferred

- Advanced capture features (templates, flags, dimensions, photo roles)
- Search/filter across items
- Copy-all notes block
- SKU auto-increment
- Chrome extension helper
- Background removal
- AI listing draft helper
- eBay API draft creation
- eBay listing status sync

### 3.3 iOS App Deferred

- Advanced camera controls (manual exposure, white balance, ISO)
- Background sync (iOS background tasks)
- Real-time sync (Supabase realtime)
- iPad-specific layouts
- Apple Watch companion
- Share sheet integration
- Widget support
- Spotlight search integration

---

## 4. Shared Backend/Data Contracts

### 4.1 Data Model

The data model is unchanged from the current spec:

```
stores → batches → items → photos → photo_variants
                                      ↓
                               upload_jobs
```

**Tables**:
- `stores`: id, name, short_code, created_at, updated_at
- `batches`: id, store_id, name, status, upload_status, item_count, photo_count, remote_retention_mode, remote_expires_at, etc.
- `items`: id, store_id, batch_id, sequence, status, main_photo_id, sku, notes, weight, title_hint, dimensions, listing_intent, tags, etc.
- `photos`: id, store_id, batch_id, item_id, order_index, local_status, upload_status, remote_status, captured_at, etc.
- `photo_variants`: id, photo_id, variant_type (original/listing/thumbnail), storage_bucket, storage_key, width, height, bytes, etc.
- `upload_jobs`: id, photo_id, variant_type, status, attempt_count, last_error, etc.

### 4.2 Storage Contracts

**Storage Bucket**: `photo-assets` (private)
- File size limit: 50MB
- Allowed MIME types: image/jpeg, image/png
- Access: Authenticated users only (via RLS)
- Signed URLs: Generated on demand for upload/download

**Photo Variant Types**:
- `original`: Full-resolution photo from camera
- `listing`: Optimized for eBay listing (max 1600px longest dimension)
- `thumbnail`: Small preview (max 300px longest dimension)

### 4.3 Auth Contracts

**Current**: Supabase Auth with magic-link login, single shared account
- User logs in via email magic link on both phone and desktop
- Same account used on all platforms
- RLS policies allow authenticated users to manage all data

**Future (deferred)**: Multi-user/team support
- User roles (owner, admin, editor, viewer)
- Team-based data isolation
- Per-user permissions

### 4.4 API Contracts

**Current**: Direct Supabase client/SDK usage
- Webapp: `@supabase/supabase-js` client
- iOS app: Supabase iOS SDK (assumption)
- Both platforms call Supabase directly

**Future (deferred)**: REST API layer
- Custom REST endpoints if needed for:
  - Rate limiting
  - Custom business logic
  - Third-party integrations
  - Complex queries

### 4.5 Retention/Cleanup Contracts

**Retention Modes** (from current schema):
- `manual`: No automatic deletion
- `delete_24h_after_listed`: Delete 24 hours after item listed
- `delete_3d_after_listed`: Delete 3 days after item listed
- `delete_7d_after_listed`: Delete 7 days after item listed
- `delete_7d_after_upload`: Delete 7 days after upload complete
- `delete_7d_after_batch_complete`: Delete 7 days after batch marked complete

**Cleanup Safety Rules**:
- Local cleanup only after verified upload (upload_status = 'uploaded', remote_status = 'verified')
- Remote cleanup only after retention window expires
- Hold/needs-retake/incomplete items are not auto-deleted
- Manual cleanup only after user confirmation

---

## 5. Webapp Plan

### 5.1 Current State

The webapp is currently a PWA with:
- React 18, TypeScript, Vite
- Phase 0 camera spike complete (CameraLab.tsx)
- Phase 1 partially complete (Phase1Screen.tsx combines mobile capture and desktop queue)
- IndexedDB for local storage
- Supabase JS SDK for backend
- Single shared account model

### 5.2 Webapp Architecture

**Tech Stack**:
- Frontend: React 18, TypeScript, Vite
- Backend: Supabase (Auth, Postgres, Storage)
- Local: IndexedDB (photos, items, workflow stores)
- Testing: Vitest, React Testing Library, jsdom, fake-indexeddb

**Adapter Layer** (already implemented):
- `camera.ts`: BrowserCameraAdapter with MediaStreamTrack/ImageCapture
- `imageProcessing.ts`: CanvasImageProcessingAdapter
- `localPhotoStore.ts`: IndexedDbPhotoStore
- `itemPacket.ts`: IndexedDbItemPacketStore
- `workflowStore.ts`: IndexedDbWorkflowStore
- `supabaseUpload.ts`: Batch sync to Supabase
- `remoteCleanup.ts`: Remote photo deletion
- `retention.ts`: Retention window calculations

**Component Layer**:
- `CameraPreview.tsx`: Live camera preview
- `CameraSettingsDrawer.tsx`: Camera controls
- `CameraTestDrawer.tsx`: Diagnostics
- `CaptureMetadataOverlay.tsx`: Item metadata input
- `DiagnosticsPanel.tsx`: System diagnostics
- `PhotoDetailModal.tsx`: Photo viewer
- `PhotoList.tsx`: Photo grid

**Screen Layer**:
- `phase0/CameraLab.tsx`: Camera feasibility spike
- `phase1/Phase1Screen.tsx`: Mobile capture + desktop queue (combined)

### 5.3 Webapp Improvements Needed

**Separate Mobile vs Desktop Routing**:
- Currently: Phase1Screen.tsx uses viewport detection to show mobile capture or desktop queue
- Future: Clear separation of concerns with proper routing (React Router or similar)
- Mobile: Capture-focused UI
- Desktop: Queue-focused UI

**Desktop Queue Polish**:
- Store selector
- Batch list with status
- Unlisted queue prioritized
- Item cards with thumbnails
- Photo count and availability state
- SKU/note/weight preview
- Item detail with ordered photo grid
- Status controls (listed, hold, needs retake, new)
- Upload completeness warnings
- Photo availability state (available/deleted/incomplete)

**Photo Retention Visibility**:
- Show retention dates on desktop queue
- Show which photos are eligible for cleanup
- Show which photos are deleted
- Show remote expiration dates

**Remote Cleanup Actions**:
- Manual cleanup button for eligible photos
- Confirmation dialog before deletion
- Show cleanup history

### 5.4 Webapp Deployment

**Current**: Vite dev server, Vercel for production (assumption)
**Future**: 
- Vercel for production webapp
- HTTPS required for secure context (camera APIs)
- PWA manifest for installability
- Service worker for offline support (optional)

---

## 6. iOS App Plan

### 6.1 iOS App Architecture

**Tech Stack** (assumptions marked):
- Language: Swift (assumption)
- UI Framework: SwiftUI (assumption)
- Camera: AVFoundation (AVCaptureDevice, AVCaptureSession, AVCapturePhotoOutput) (assumption)
- Local Storage: Core Data or SQLite (assumption: Core Data preferred for native feel)
- Backend: Supabase iOS SDK (assumption)
- Deployment: App Store / TestFlight (assumption)

**Architecture Pattern** (assumption: MVVM):
- Model: Core Data entities, Supabase data models
- View: SwiftUI views (capture surface, queue surface)
- ViewModel: Business logic, camera coordination, sync coordination
- Repository: Data access layer (Core Data + Supabase)

### 6.2 iOS Camera Implementation

**AVFoundation Setup** (assumption):
- `AVCaptureSession`: Manages camera input/output
- `AVCaptureDevice`: Camera device selection (rear camera preference)
- `AVCapturePhotoOutput`: High-resolution photo capture
- `AVCaptureVideoPreviewLayer`: Live preview
- Device switching: Rear main, rear wide, rear ultra-wide, front
- Zoom: Digital zoom via device.videoZoomFactor
- Torch: device.torchMode
- Focus: device.focusMode, device.focusPointOfInterest

**Camera Features** (MVP):
- Rear camera capture
- Live preview
- Photo capture
- Basic zoom (preset zoom levels: 1x, 0.5x)
- Torch toggle
- Auto focus

**Camera Features** (deferred):
- Manual focus
- Manual exposure
- White balance control
- RAW capture
- ProRes video

### 6.3 iOS Local Storage

**Core Data Model** (assumption):
- Store entity (matches Supabase stores table)
- Batch entity (matches Supabase batches table)
- Item entity (matches Supabase items table)
- Photo entity (matches Supabase photos table)
- PhotoVariant entity (matches Supabase photo_variants table)
- UploadJob entity (matches Supabase upload_jobs table)

**Sync Strategy** (assumption: batch sync, not real-time):
- Local Core Data is source of truth for pending data
- Batch sync to Supabase on user action or app foreground
- Retry failed uploads on app foreground
- Pull remote changes on app foreground

**Offline Support** (MVP: basic, not full offline):
- Local queue survives app close
- No upload while offline
- Upload resumes when network available
- No conflict resolution (last write wins)

**Offline Support** (deferred):
- Background sync (iOS background tasks)
- Conflict resolution
- Offline-first mode

### 6.4 iOS UI Structure

**Capture Surface** (SwiftUI):
- Live camera preview (AVCaptureVideoPreviewLayer wrapped in UIViewRepresentable)
- Metadata overlay (item number, photo count, notes/SKU/weight)
- Capture button
- Done/Next button
- Camera controls (zoom, torch, camera switch)
- Diagnostics panel (optional)

**Queue Surface** (SwiftUI):
- Store selector
- Batch list with status
- Unlisted queue prioritized
- Item cards with thumbnails
- Item detail view
- Ordered photo grid
- Status controls (listed, hold, needs retake, new)
- Upload progress
- Photo availability state

### 6.5 iOS Auth Integration

**Supabase Auth iOS SDK** (assumption):
- Magic-link login (email input, open mail app, deep link back to app)
- Session persistence (Keychain)
- Session refresh (automatic)
- Logout

**Alternative** (deferred):
- Custom token exchange via REST API
- OAuth providers (Google, Apple)

### 6.6 iOS Network Layer

**Supabase iOS SDK** (assumption):
- Direct Supabase client usage
- Auth: `supabase.auth`
- Database: `supabase.from('table').select()`, `.insert()`, `.update()`
- Storage: `supabase.storage.from('bucket').upload()`, `.createSignedUrl()`

**REST API Layer** (deferred):
- Custom REST endpoints if needed for rate limiting or custom logic
- Alamofire or URLSession for HTTP requests

### 6.7 iOS Deployment

**App Store** (assumption):
- App Store Connect account
- Code signing (Apple Developer account)
- TestFlight for beta testing
- App Store review process

**Enterprise Distribution** (deferred):
- Internal distribution for enterprise users
- No App Store review

---

## 7. Sync/Upload/Offline Strategy

### 7.1 Upload Strategy

**Current (Webapp)**:
- Foreground upload only (while app is open)
- Batch sync on user action
- Retry on app reopen
- Progress visible to user
- User instructed to keep app open during upload

**iOS App (assumption)**:
- Foreground upload only (MVP)
- Batch sync on user action or app foreground
- Retry on app foreground
- Progress visible to user
- Background sync (deferred)

### 7.2 Sync Strategy

**Current (Webapp)**:
- No real-time sync
- Manual batch sync
- Desktop queue reads from Supabase directly
- Local IndexedDB is for pending photos only

**iOS App (assumption)**:
- No real-time sync (MVP)
- Batch sync on user action or app foreground
- Core Data is source of truth for pending data
- Supabase is source of truth for uploaded data
- Pull remote changes on app foreground

**Real-time Sync** (deferred):
- Supabase realtime subscriptions
- Push notifications for remote changes
- Conflict resolution

### 7.3 Offline Strategy

**Current (Webapp)**:
- IndexedDB for local pending photos
- No upload while offline
- Upload resumes when network available
- No conflict resolution

**iOS App (MVP)**:
- Core Data for local pending data
- No upload while offline
- Upload resumes when network available
- No conflict resolution (last write wins)

**iOS App (deferred)**:
- Background sync (iOS background tasks)
- Offline-first mode
- Conflict resolution (last write wins or manual resolution)

---

## 8. Auth/Session Strategy

### 8.1 Current Auth

**Supabase Auth**:
- Magic-link login (email input, user clicks link in email)
- Single shared account model
- Session persisted in browser storage
- Session refresh automatic
- RLS policies: Authenticated users can manage all data

### 8.2 Webapp Auth

**Unchanged**:
- Supabase Auth with magic-link
- Single shared account
- Browser storage for session
- RLS policies unchanged

### 8.3 iOS App Auth

**Supabase Auth iOS SDK** (assumption):
- Magic-link login (email input, open mail app, deep link back to app)
- Session persisted in Keychain
- Session refresh automatic
- Same Supabase project as webapp
- Same RLS policies

**Alternative** (deferred):
- OAuth providers (Google, Apple)
- Custom token exchange

### 8.4 Multi-User Support (deferred)

**Future Auth**:
- User roles (owner, admin, editor, viewer)
- Team-based data isolation
- Per-user permissions
- RLS policies updated for user/team isolation

---

## 9. Photo Retention and Cleanup Strategy

### 9.1 Current Retention Policy

**Retention Modes** (from schema):
- `manual`: No automatic deletion
- `delete_24h_after_listed`: Delete 24 hours after item listed
- `delete_3d_after_listed`: Delete 3 days after item listed
- `delete_7d_after_listed`: Delete 7 days after item listed
- `delete_7d_after_upload`: Delete 7 days after upload complete
- `delete_7d_after_batch_complete`: Delete 7 days after batch marked complete

**Default**: `delete_7d_after_listed`

### 9.2 Cleanup Safety Rules

**Local Cleanup**:
- Only after verified upload (upload_status = 'uploaded', remote_status = 'verified')
- Manual cleanup only after user confirmation
- Show which photos are safe to clear
- Show which photos are not safe to clear (with reasons)

**Remote Cleanup**:
- Only after retention window expires
- Hold/needs-retake/incomplete items are not auto-deleted
- Manual cleanup only after user confirmation
- Show which photos are eligible for cleanup
- Show cleanup history

### 9.3 Webapp Cleanup

**Current**:
- Manual local cleanup after verified upload
- Manual remote cleanup (not yet implemented)

**Needed**:
- Photo retention visibility on desktop queue
- Remote cleanup actions
- Cleanup history

### 9.4 iOS App Cleanup

**Assumption**:
- Same retention policy as webapp
- Same cleanup safety rules
- Manual local cleanup after verified upload
- Manual remote cleanup after retention window
- Photo retention visibility in queue surface

---

## 10. Testing and Validation Strategy

### 10.1 Backend Testing

**Current**:
- Supabase schema migrations
- RLS policy tests (if any)

**Needed**:
- Schema migration tests
- RLS policy tests
- Upload/cleanup integration tests
- Retention policy tests

### 10.2 Webapp Testing

**Current**:
- Vitest unit tests for adapters
- React Testing Library component tests
- jsdom environment
- fake-indexeddb for IndexedDB tests

**Commands**:
- `npm test` - Run Vitest tests
- `npm run typecheck` - TypeScript type checking
- `npm run build` - Production build (includes typecheck)

**Needed**:
- E2E tests for capture flow
- E2E tests for upload flow
- E2E tests for cleanup flow
- Cross-browser testing (Safari, Chrome, Firefox)

### 10.3 iOS App Testing

**Assumption**:
- XCTest for unit tests
- Snapshot tests for SwiftUI views
- Device testing on real iPhone
- Simulator testing for different screen sizes

**Needed**:
- Unit tests for camera logic
- Unit tests for Core Data sync
- Unit tests for Supabase integration
- Snapshot tests for UI
- Device testing on iPhone (different models)

### 10.4 Cross-Platform Testing

**Needed**:
- Sync tests between iOS and webapp
- Capture on iOS, list on webapp
- Capture on webapp, list on iOS
- Conflict resolution tests (if implemented)

---

## 11. Manual Verification Requirements

### 11.1 Webapp Manual Verification

**Current** (from PHASE0_TESTING.md):
- iPhone Safari camera testing
- Secure context verification
- Camera capability diagnostics
- Manual test checklist

**Needed**:
- Desktop queue testing
- Upload progress testing
- Cleanup testing
- Retention policy testing
- Cross-browser testing

### 11.2 iOS App Manual Verification

**Needed**:
- iPhone camera capture testing (different models)
- Core Data persistence testing
- Supabase sync testing
- Upload progress testing
- Cleanup testing
- Retention policy testing
- Offline behavior testing

### 11.3 Cross-Platform Manual Verification

**Needed**:
- Capture on iOS, list on webapp
- Capture on webapp, list on iOS
- Sync between platforms
- Conflict resolution (if implemented)

---

## 12. Risks and Mitigations

### 12.1 Technical Risks

**iOS Camera Complexity**
- Risk: AVFoundation is more complex than browser camera APIs
- Mitigation: Start with basic camera features, defer advanced controls

**Core Data Schema Drift**
- Risk: Local iOS schema may diverge from Supabase schema
- Mitigation: Keep Core Data entities aligned with Supabase tables, add migration strategy

**Sync Conflicts**
- Risk: Real-time sync between iOS and webapp may cause conflicts
- Mitigation: Start with batch sync, defer real-time sync, implement conflict resolution later

**Auth Complexity**
- Risk: Supabase Auth iOS SDK may have different behavior than web SDK
- Mitigation: Test auth flow early, use same Supabase project, document differences

**Storage Costs**
- Risk: Photo-heavy storage may be expensive at scale
- Mitigation: Implement retention policy, monitor storage usage, optimize image sizes

**App Store Review**
- Risk: iOS app may face review delays or rejections
- Mitigation: Follow App Store guidelines, test thoroughly, have fallback plan

### 12.2 Product Risks

**Platform Fragmentation**
- Risk: Maintaining PWA + iOS + webapp increases complexity
- Mitigation: Keep backend as single source of truth, share business logic where possible

**User Confusion**
- Risk: Users may not understand which platform to use
- Mitigation: Clear documentation, onboarding, platform-specific messaging

**Resource Constraints**
- Risk: Small team may struggle with multi-platform development
- Mitigation: Prioritize MVP, defer advanced features, consider hiring if needed

**Feature Parity**
- Risk: Keeping iOS and webapp feature-aligned is difficult
- Mitigation: Accept platform differences, document feature matrix, prioritize core features

### 12.3 Repo Risks

**Monorepo Complexity**
- Risk: Same repo for iOS and web may become complex
- Mitigation: Clear directory structure, separate build configs, document dependencies

**Schema Changes**
- Risk: Schema changes may break iOS or webapp
- Mitigation: Version migrations, test both platforms after schema changes, backward compatibility

**Dependency Conflicts**
- Risk: iOS and web dependencies may conflict
- Mitigation: Separate dependency management, clear separation of concerns

---

## 13. Open Questions and Assumptions

### 13.1 Assumptions Made

**iOS Tech Stack**:
- Swift language
- SwiftUI for UI
- AVFoundation for camera
- Core Data for local storage
- Supabase iOS SDK for backend
- MVVM architecture pattern
- App Store deployment

**iOS Behavior**:
- Batch sync (not real-time)
- Basic offline support (not full offline)
- Foreground upload only (not background)
- Last-write-wins conflict resolution

**Webapp Behavior**:
- Desktop-focused listing queue
- Mobile browser capture as fallback
- No real-time sync
- Foreground upload only

**Shared Backend**:
- No REST API layer (direct Supabase SDK)
- Single shared account (no multi-user)
- No Edge Functions
- No server-side logic beyond RLS

### 13.2 Open Questions

**Product Decisions**:
1. Should the iOS app support iPad-specific layouts?
2. Should the iOS app support Apple Watch companion?
3. Should the webapp support mobile browsers as a first-class platform?
4. When to add multi-user/team support?
5. What is the commercialization timeline?

**Technical Decisions**:
1. Should iOS use Core Data or SQLite for local storage?
2. Should iOS implement background sync (iOS background tasks)?
3. Should iOS implement real-time sync (Supabase realtime)?
4. Should iOS support manual camera controls (exposure, white balance)?
5. Should the webapp use React Router for routing?
6. Should the webapp implement a service worker for offline support?

**Repo Decisions**:
1. Should iOS app live in the same repo (monorepo) or separate repo?
2. How to structure the monorepo (shared packages, separate workspaces)?
3. How to coordinate schema changes between platforms?
4. How to version the API contracts?

**Unknowns**:
1. AVFoundation camera performance vs browser camera performance
2. Core Data schema complexity vs IndexedDB simplicity
3. Supabase iOS SDK maturity vs Supabase JS SDK maturity
4. App Store review requirements for photo-heavy apps
5. User preference for iOS app vs PWA

---

## 14. Phased Implementation Plan

### 14.1 Phase 0: Backend Foundation (Shared)

**Goal**: Solidify shared backend as single source of truth

**Tasks**:
- Finalize Supabase schema and RLS policies
- Document retention/cleanup logic
- Document API contracts (Supabase client usage patterns)
- Set up environment management (dev/staging/prod)
- Add backend tests (schema tests, RLS tests, upload/cleanup tests)

**Validation**:
- Schema migration tests pass
- RLS policy tests pass
- Upload/cleanup integration tests pass

**Status**: Partially complete (schema deployed, tests needed)

### 14.2 Phase 1: Webapp MVP Completion

**Goal**: Complete webapp MVP with desktop queue polish

**Tasks**:
- Separate mobile vs desktop routing (React Router)
- Polish desktop queue UX (store selector, batch list, item cards)
- Add photo retention visibility
- Wire remote cleanup actions
- Add E2E tests for capture and upload flows
- Add cross-browser testing

**Validation**:
- E2E test on iPhone Safari passes
- E2E test on desktop Chrome passes
- Manual verification on real devices passes

**Status**: Partially complete (Phase 1 vertical slice partially done)

### 14.3 Phase 2: iOS App MVP

**Goal**: Build native iOS app with capture and queue

**Tasks**:
- Set up Xcode project, SwiftUI app structure
- Implement AVFoundation camera capture
- Implement Core Data local storage
- Implement Supabase iOS SDK integration
- Build capture surface (camera preview, metadata)
- Build queue surface (store/batch/item views)
- Add unit tests and snapshot tests
- Add device testing on iPhone

**Validation**:
- Unit tests pass
- Snapshot tests pass
- Device testing on iPhone passes
- Integration with Supabase backend passes

**Status**: Not started

### 14.4 Phase 3: Cross-Platform Polish

**Goal**: Reliable upload, sync, and cleanup across platforms

**Tasks**:
- Reliable upload and retry/resume (shared logic, platform-specific UI)
- Offline support (iOS stronger than PWA)
- Error handling and recovery
- Cross-platform sync tests
- Manual verification on both platforms

**Validation**:
- Cross-platform sync tests pass
- Manual verification on both platforms passes

**Status**: Not started

### 14.5 Phase 4: Advanced Features (Deferred)

**Goal**: Multi-user, advanced camera, background sync

**Tasks**:
- Multi-user/team support (backend RLS + UI)
- Background sync (iOS background tasks)
- Advanced camera controls (iOS-only features)
- Real-time sync (Supabase realtime)
- Conflict resolution

**Validation**:
- Multi-user integration tests pass
- Background sync tests pass

**Status**: Not started

---

## 15. Relationship to Current Spec

### 15.1 Current Spec Preservation

The current spec `ebay-photo-handoff-camera-app-official-spec.md` is preserved as:
- Historical context for the PWA-first approach
- Reference for Phase 0 camera spike
- Reference for Phase 1 vertical slice
- Fallback path if iOS app is not pursued

### 15.2 Spec Evolution

**Current Spec** → **This Cross-Platform Spec**:
- Current spec: PWA-first, single shared account, browser camera APIs
- This spec: Multi-platform, shared backend, platform-specific UI/camera/storage
- Current spec remains as reference for PWA implementation
- This spec adds iOS app planning while preserving webapp plan

### 15.3 Implementation Guidance

**For Webapp**:
- Follow current spec for PWA implementation details
- Follow this spec for desktop queue polish and cross-platform considerations
- Current Phase 0 and Phase 1 guidance still applies

**For iOS App**:
- Follow this spec for iOS-specific planning
- Refer to current spec for backend/data model details
- Refer to current spec for product goals and acceptance criteria

**For Backend**:
- Follow current spec for schema and data model
- Follow this spec for cross-platform API contracts
- Current retention/cleanup logic still applies

---

## 16. Next Steps

### 16.1 Immediate Next Steps

1. **Review and approve this spec**: Confirm assumptions, address open questions
2. **Decide on repo structure**: Monorepo vs separate repo for iOS app
3. **Decide on iOS tech stack**: Confirm Swift/SwiftUI/AVFoundation/Core Data/Supabase iOS SDK
4. **Complete Phase 0 backend tests**: Add schema tests, RLS tests, upload/cleanup tests
5. **Complete Phase 1 webapp MVP**: Separate routing, desktop queue polish, retention visibility

### 16.2 iOS App Planning

1. **Set up Xcode project**: Create iOS app project in same repo or separate repo
2. **Implement AVFoundation camera spike**: Prove iOS camera can capture quickly
3. **Implement Core Data spike**: Prove local storage works with Supabase schema
4. **Implement Supabase iOS SDK spike**: Prove auth and data sync work
5. **Build MVP capture surface**: Basic camera with capture button
6. **Build MVP queue surface**: Basic store/batch/item views

### 16.3 Validation Strategy

1. **Backend tests**: Ensure schema and RLS are solid before adding iOS
2. **Webapp E2E tests**: Ensure webapp works reliably before adding iOS
3. **iOS device testing**: Test on real iPhone early and often
4. **Cross-platform sync tests**: Test sync between iOS and webapp
5. **Manual verification**: Real-world testing on both platforms

---

## 17. Appendix: Current Repo State

### 17.1 Current Implementation

**Phase 0**: Complete
- CameraLab.tsx with comprehensive diagnostics
- Camera adapter with MediaStreamTrack/ImageCapture
- Camera probe and test logging
- IndexedDB local storage

**Phase 1**: Partially complete
- Phase1Screen.tsx combines mobile capture and desktop queue
- Supabase auth and data sync
- Upload and retry/resume
- Remote cleanup logic (not yet wired to UI)

**Backend**: Complete
- Supabase schema deployed
- RLS policies in place
- Storage bucket configured
- Seed data loaded

### 17.2 Current Tech Stack

**Frontend**: React 18, TypeScript, Vite
**Backend**: Supabase (Auth, Postgres, Storage)
**Local**: IndexedDB
**Testing**: Vitest, React Testing Library, jsdom, fake-indexeddb

### 17.3 Current Commands

- `npm run dev` - Start dev server
- `npm run build` - Build for production (includes typecheck)
- `npm run typecheck` - TypeScript type checking
- `npm test` - Run Vitest tests
- `npm run preview` - Preview production build

### 17.4 Current Documentation

- `ebay-photo-handoff-camera-app-official-spec.md` - Original PWA spec
- `README.md` - Project overview
- `docs/PHASE0_TESTING.md` - iPhone camera testing guide
- `docs/PHASE1_NOTES.md` - Phase 1 implementation notes
- `docs/SUPABASE_SETUP.md` - Supabase setup instructions
- `docs/CROSS_PLATFORM_SPEC.md` - This document

---

**End of Spec**
