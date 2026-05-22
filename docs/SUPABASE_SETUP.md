# Supabase Setup

This project uses Supabase as the remote backend for the workspace and later work.

## Linked project

- Project ref: `wchoxagxpsejwrotvnsx`
- Project name: `ebay-photo-app`

## Included backend pieces

- `public.stores`
- `public.batches`
- `public.items`
- `public.photos`
- `public.photo_variants`
- `public.upload_jobs`
- private `photo-assets` storage bucket

## Local CLI workflow

```bash
supabase login
supabase link --project-ref wchoxagxpsejwrotvnsx
SUPABASE_DB_PASSWORD='your-password' supabase db push --include-seed --yes
```

## Frontend env vars

Create a local `.env.local` file with:

```bash
VITE_SUPABASE_URL=https://wchoxagxpsejwrotvnsx.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

## App login and sync

- The workspace uses Supabase Auth magic-link login.
- The same account is used on the phone and desktop for now.
- On mobile, sign in with an email address in the app, then use the deliberate submit/upload action to push eligible unsubmitted item packets into Supabase.
- On desktop, Supabase acts as the shared remote workspace backend for stores, batches, items, and photos.
- The app writes uploaded assets into the private `photo-assets` bucket and records photo variants in `public.photo_variants`.
- Listed items now surface photo retention dates and can trigger remote cleanup once their retention window has expired.

Terminology note:

- Backend `batches` are still part of the shared remote schema.
- The exact mapping between the iPhone local queue/workflow and backend batches is intentionally deferred.

## Notes

- The project is configured for authenticated access only.
- Storage is private by default.
- The next app step after this slice is retry/resume plus cleanup verification.
