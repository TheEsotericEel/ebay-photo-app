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

## Notes

- The project is configured for authenticated access only.
- Storage is private by default.
- The next app step is client integration against the linked project.
