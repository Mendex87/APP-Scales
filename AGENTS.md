# AGENTS.md

## Commands

- Install deps with `npm install`.
- Local dev server: `npm run dev`.
- Required verification before handing off code changes: `npm run build` (`tsc && vite build`).
- There are no configured `test`, `lint`, or formatter scripts in `package.json`; do not invent them.

## App Shape

- Main React app logic is concentrated in `src/App.tsx`; shared domain types are in `src/types.ts`.
- Persistence boundary is `src/repository.ts`: it loads cached localStorage first and uses Supabase only when configured.
- Local fallback storage keys live in `src/storage.ts`; do not rename them unless intentionally migrating local data.
- Event IDs are generated in `src/utils.ts` by `generateEventCode`; keep compatibility with historical event IDs when changing the format.

## Supabase

- Expected Vite env vars are `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, but `src/supabase.ts` currently includes project defaults so the app is effectively Supabase-configured by default.
- Schema and RLS policies are in `supabase/schema.sql`; keep it re-runnable with `if not exists`, `add column if not exists`, and `drop policy if exists` patterns.
- Roles are `admin`, `tecnico`, `supervisor`, and `viewer`; only `admin` can update/delete equipment and manage users, while `tecnico` can insert equipment/events/chains.
- Do not update `equipments` while saving a calibration event unless RLS is intentionally changed; this previously broke saves for `tecnico`.
- Equipment photos use Supabase Storage bucket `equipment-photos` and DB field `photo_path`.
- User management Edge Function is `supabase/functions/manage-users/index.ts`; its service role secret must be named `SERVICE_ROLE_KEY`, not `SUPABASE_SERVICE_ROLE_KEY`.

## Release/Deploy

- Vercel deploy expects build command `npm run build` and output directory `dist`.
- `vercel.json` rewrites public manual routes and redirects admin manual URLs to `/manual/tecnico/`; keep SPA behavior untouched unless intentionally adding routing.
- For relevant app changes, update all version locations together: `APP_VERSION` in `src/App.tsx`, `package.json`, `package-lock.json`, and `CHANGELOG.md`.
- Google Sheets sync exports one summarized calibration event through `supabase/functions/sync-sheets-event`; Sheets remains output-only and Supabase remains the source of truth.

## Manuals

- Public manual assets are limited to the field/technical guide (`public/manual/tecnico/index.html`, `public/manual-tecnico-campo.pdf`) plus `public/manual-usuario.pdf` compatibility.
- The admin manual must not be published under `public`; admin users get an in-app generated admin guide after login.
- Manual source HTML lives in `docs/`; if field names or workflow labels change in the app, update both relevant HTML manuals and the public PDFs if regenerated.
- There is no npm script for PDF generation; verify any manual generation workflow before claiming PDFs were refreshed.
