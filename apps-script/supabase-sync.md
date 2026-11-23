# supabase-sync.gs (live script project, added Nov 23, 2026)

Reference notes; the code lives in the Apps Script project as `supabase-sync.gs`.

- `supabaseSync()`: pushes Players, Courses, Hole Yards and Tonight's setup to Supabase (`/functions/v1/api/sync`), then runs the scores mirror. Runs a minute after an edit to Players, Courses, Hole Yards or Tonight (installable onEdit trigger `supabaseSyncOnEdit`).
- `supabaseMirror_()`: called at the end of `boardBust_()` in Web.gs (any save from the app, the GSPro agent or the old page). Sends Tonight's setup, the gross grid and that night's putts/mulligans/penalties from the GSPro Log to `/functions/v1/api/scores`. Never throws.
- Key: Script Property `SUPABASE_AGENT_KEY` (same value as the Supabase Edge secret `GSPRO_AGENT_KEY`).

The app's live.js reads the result (Supabase `board_scores` view) and re-draws tonight's scorecards and the Board's Individual list on every change. Kill switch: Supabase `app_config.live_board = false`, or `?live=0` on one phone.
