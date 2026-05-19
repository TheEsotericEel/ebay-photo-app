# Web Desktop Management App Spec

**Project:** eBay Photo App  
**Client:** React/Vite web app  
**Status:** implementation spec for post-iOS-migration desktop role  
**Primary responsibility:** remote item queue, listing workflow, retention, and cleanup management  

---

## 1. Purpose

The web app should become the desktop management client for items captured by the native iOS app.

It should no longer depend on browser camera capture as the primary production workflow.

The desktop web app should answer:

- What needs to be listed?
- Which store/batch is it in?
- What photos belong to this item?
- Is upload verified?
- Has the item been listed?
- When can remote photos be deleted?
- Which items need retakes?

---

## 2. Current Repo State

The current web app already contains a `WorkspaceScreen` with:

- mobile and desktop mode split
- local stores/batches/items/photos via IndexedDB
- camera capture path
- Supabase auth/session hook
- batch sync to Supabase
- desktop queue concepts
- listing status controls
- remote cleanup concepts

The migration goal is not to delete all of that. The goal is to re-center the web app around remote desktop management.

---

## 3. Strategic Shift

### Before

```txt
Web/PWA captures on iPhone
→ local IndexedDB stores photos/items
→ web syncs batch to Supabase
→ desktop uses same app/local concepts
```

### After

```txt
Native iOS captures on iPhone
→ iOS uploads to Supabase
→ desktop web reads from Supabase
→ desktop web manages listing/cleanup
```

---

## 4. Required Web Responsibilities

### 4.1 Auth

The web app must support:

- sign in with the same Supabase account and OTP flow as iOS
- sign out
- session loading state
- missing env/config state
- auth error state

### 4.2 Store and Batch Selection

The web app must show:

- available stores
- available batches per store
- active batch indicator
- archived/completed batch state
- unlisted count per batch
- upload/cleanup summary per batch

### 4.3 Queue

The default desktop view must prioritize work to be listed.

Default sort/filter:

1. `new`
2. `needs_retake`
3. `hold`
4. `listed`

Required queue item data:

- item number
- thumbnail or fallback
- photo count
- listing status
- upload verification status
- cleanup/retention state
- SKU/weight/dimensions if present

### 4.4 Item Detail

Required item detail:

- ordered photo gallery
- item number
- store/batch context
- notes
- SKU
- weight
- dimensions
- listing status controls
- upload status
- local/remote cleanup status
- retention date
- remote deleted state

### 4.5 Listing Status Controls

Allowed statuses:

- `new`
- `listed`
- `hold`
- `needs_retake`

When item is marked `listed`, the web app must:

- set `listed_at`
- set retention dates under MVP policy
- preserve upload/remote status
- not delete photos immediately

### 4.6 Retention and Cleanup

The web app must clearly show:

- remote photos verified
- local files safe-to-clear if relevant
- item listed or not listed
- retention date
- cleanup eligibility
- remote deleted state

Remote cleanup must be manual at first.

Remote cleanup must use remote photo IDs.

---

## 5. Remote-Data-First Requirement

The desktop web app must eventually treat Supabase as the source of truth for the queue.

IndexedDB can remain for:

- legacy PWA capture fallback
- camera diagnostics
- local-only dev mode
- transition period

But native iOS uploads will not exist in the desktop browser IndexedDB. Therefore, the desktop queue must read remote Supabase data.

Required migration:

```txt
current: desktop queue reads local IndexedDB items/photos
next: desktop queue can read remote Supabase items/photos/variants
later: local fallback capture can still sync into same remote contract
```

### 5.1 Desktop Preview Access

The desktop app must keep the storage bucket private and use authenticated access for image loading.

Preferred MVP behavior:

- generate signed URLs for queue/detail previews
- prefer thumbnail variants in the queue
- fall back to listing/original variants when thumbnails are unavailable
- preserve the current browser IndexedDB path only as legacy/fallback behavior

---

## 6. Remote Read Model

The web app needs a remote read adapter that can load:

- stores owned by current user
- batches for selected store
- items for selected batch
- photos for each item
- variants for each photo

Recommended module:

```txt
src/adapters/remoteWorkspaceStore.ts
```

Suggested interface:

```ts
interface RemoteWorkspaceStore {
  listStores(): Promise<Store[]>
  listBatches(storeId: string): Promise<Batch[]>
  listItems(batchId: string): Promise<ItemWithPhotos[]>
  updateListingStatus(itemId: string, status: ListingStatus): Promise<void>
  markRemotePhotosDeleted(photoRemoteIds: string[]): Promise<void>
}
```

---

## 7. Image Loading

The web app should not assume photo blobs are local.

It should load photos via:

- signed URLs for private storage, or
- authenticated storage download calls, or
- backend-generated signed URLs if direct storage access becomes awkward

MVP recommendation:

- use Supabase signed URLs for desktop preview where practical
- prefer thumbnail variant for queue
- prefer listing or original variant for detail view

---

## 8. Cleanup UX Rules

The web app must avoid destructive ambiguity.

### 8.1 Local Cleanup

Local cleanup applies to local browser/iOS files only.

The desktop web app should not claim it cleared iPhone files unless it actually operated on iOS local storage. For native iOS, local cleanup should be owned by the iOS app.

### 8.2 Remote Cleanup

Remote cleanup applies to Supabase storage objects and remote table state.

The web app may trigger remote cleanup after:

- item is listed
- retention window has expired
- remote upload is verified
- remote status is not already deleted

### 8.3 Records After Cleanup

Deleting remote photo assets should not delete item/photo metadata.

It should mark:

```txt
photos.remote_status = deleted
photos.remote_deleted_at = timestamp
photo_variants.remote_deleted_at = timestamp
```

---

## 9. Web MVP Acceptance Criteria

The web desktop app passes the migration MVP when:

1. It loads remote stores/batches/items from Supabase.
2. It displays items captured from native iOS without relying on browser IndexedDB.
3. It displays ordered photos using remote variants.
4. It marks an item listed and writes the status remotely.
5. It computes/shows retention date after listed status.
6. It blocks remote cleanup before retention expiry.
7. It deletes/marks remote photos only using remote photo IDs.
8. It shows remote-deleted items without breaking the queue.
9. It preserves metadata after image assets are deleted.
10. It still allows browser fallback capture only as a secondary path.

---

## 10. UI Scope

Keep desktop UI practical, not polished.

Required panels:

- top status strip
- store/batch context selector
- queue list
- item detail
- tools/cleanup panel

Avoid adding:

- dashboards
- analytics
- onboarding tours
- complex settings pages
- public account management

---

## 11. Refactor Guidance

`Phase1Screen.tsx` is currently too broad. Refactor after lifecycle fixes, not before.

Recommended extraction order:

1. `useWorkspaceData.ts`
2. `useBatchSync.ts`
3. `useRemoteCleanup.ts`
4. `MobileWorkspace.tsx`
5. `DesktopWorkspace.tsx`
6. `WorkspaceStatusStrip.tsx`
7. `ItemLifecycleStrip.tsx`

Do not combine refactor and iOS migration in the same slice.

---

## 12. Deferred Web Features

Do not build yet:

- real-time subscriptions
- team assignment
- eBay listing automation
- eBay status sync
- pricing/comps tooling
- bulk import/export
- AI listing writer
- analytics
- billing/subscriptions

---

## 13. References

- Supabase JavaScript/Swift shared backend concepts: https://supabase.com/docs
- Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Storage access control: https://supabase.com/docs/guides/storage/security/access-control
