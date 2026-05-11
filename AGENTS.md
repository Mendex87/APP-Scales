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
- Workflow rule: do all new work on a dedicated preview branch first. Merge/push to `main` only after Ezequiel explicitly approves that preview. Never use `main` for exploratory work.

## Manuals

- Public manual assets are limited to the field/technical guide (`public/manual/tecnico/index.html`, `public/manual-tecnico-campo.pdf`) plus `public/manual-usuario.pdf` compatibility.
- The admin manual must not be published under `public`; admin users get an in-app generated admin guide after login.
- Manual source HTML lives in `docs/`; if field names or workflow labels change in the app, update both relevant HTML manuals and the public PDFs if regenerated.
- There is no npm script for PDF generation; verify any manual generation workflow before claiming PDFs were refreshed.

## LLM Wiki / Obsidian Vault

- The working Obsidian vault for project knowledge is `../Calibracinta` relative to this repository root (`C:\Opencode-principal\Test\Calibracinta`).
- Treat the vault as a persistent LLM-maintained wiki: raw sources are the source of truth, and generated markdown pages are the accumulated synthesis.
- The expected vault layout is `raw/` for immutable source files, `raw/assets/` for downloaded attachments/images, and `wiki/` for LLM-generated pages.
- Raw sources are read-only. Never edit, rename, delete, or rewrite files under `raw/` unless Ezequiel explicitly asks for source cleanup.
- The LLM owns generated pages under `wiki/`: summaries, entity pages, concept pages, comparisons, analyses, indexes, and maintenance notes.
- Use Obsidian-style links (`[[Page Name]]`) for internal wiki references, and keep page names stable once referenced.
- Every non-obvious factual claim in generated wiki pages should cite a source page or raw source path. Mark uncertain claims as `pendiente de verificar` instead of presenting them as fact.
- Prefer small, targeted wiki updates: update the summary page, the relevant entity/concept pages, `wiki/index.md`, and `wiki/log.md` rather than rewriting the whole vault.
- Preserve human-authored notes or comments unless asked to reorganize them. If a human note conflicts with sources, add a contradiction note instead of deleting it.
- If the vault structure is missing, ask before creating many files. It is OK to create minimal bootstrap files when requested: `wiki/index.md`, `wiki/log.md`, and `wiki/overview.md`.

## LLM Wiki Operations

- Ingest workflow: read one new source, extract key facts, discuss important takeaways when useful, create or update a source summary, update relevant entity/concept/topic pages, add cross-links, update `wiki/index.md`, and append to `wiki/log.md`.
- Query workflow: read `wiki/index.md` first, search/read relevant wiki pages, synthesize the answer with citations, and ask whether useful answers should be filed back into the wiki as a new analysis page.
- Lint workflow: periodically inspect the wiki for contradictions, stale claims superseded by newer sources, orphan pages, missing cross-links, important concepts without pages, and data gaps that need more sources.
- Maintenance workflow: keep contradictions visible in dedicated sections named `Contradicciones y dudas`; do not silently resolve conflicting claims unless sources clearly support the resolution.
- When adding a source summary, include at minimum: source title, source path or URL, ingest date, one-paragraph summary, key facts, entities/concepts touched, open questions, and backlinks.
- When adding an entity or concept page, include at minimum: definition/context, key facts, related pages, source-backed notes, contradictions/doubts, and last updated date.
- When filing an analysis created from a user question, place it under `wiki/analyses/` and link it from the relevant topic/entity pages.
- Use `wiki/index.md` as the content catalog. Keep entries grouped by category and include a one-line summary for each linked page.
- Use `wiki/log.md` as append-only chronological history. Start each entry with `## [YYYY-MM-DD] type | Title`, where `type` is `ingest`, `query`, `lint`, or `maintenance`.
- If a wiki answer depends on raw app code, cite repository files with relative paths such as `src/App.tsx` or `supabase/functions/sync-sheets-event/index.ts`.
- Do not use the wiki as a replacement for app release docs. Product changes still require `CHANGELOG.md`, relevant docs/manual updates, and the normal preview-first Git workflow.
