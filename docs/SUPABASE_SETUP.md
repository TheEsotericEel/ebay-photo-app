# Supabase Setup

This project uses Supabase as the remote backend for Phase 1 and later work.

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

- Phase 1 uses Supabase Auth magic-link login.
- The same account is used on the phone and desktop for now.
- Sign in with an email address in the app, then use `Sync Batch` to push the current store/batch/items/photos into Supabase.
- The app writes uploaded assets into the private `photo-assets` bucket and records photo variants in `public.photo_variants`.

## Notes

- The project is configured for authenticated access only.
- Storage is private by default.
- The next app step after this slice is retry/resume plus cleanup verification.
