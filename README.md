# ProTrace Analyzer

A Windows desktop "4GL tracer" for Progress OpenEdge and QAD logs. It loads log files or whole folders, detects
each format, parses the files in a background worker, indexes every line in SQLite and shows them in a fast,
filterable viewer.

**Status: Milestone 1 of 8.** This milestone covers project setup, file and folder loading, auto-detection,
the 4GLTrace/4GLMessages parser and the raw log viewer.

## Requirements

- Windows 10/11 x64
- **Node.js 22 LTS or newer** (`node -v`)
- No Visual Studio Build Tools needed: better-sqlite3 ships a prebuilt N-API binary that Electron loads as-is.
  `.npmrc` sets `ignore-scripts=true` because some npm versions try to compile it anyway.
- Easiest: double-click `run-protrace.bat`, which does all of this for you.

## Run it

```powershell
cd protrace-analyzer
npm install          # scripts are skipped via .npmrc (no Visual Studio needed)
npm run setup        # downloads the Electron binary (~120 MB), first time only
npm run dev          # starts the app with hot reload
```

Other scripts:

| Command             | What it does                                              |
| ------------------- | --------------------------------------------------------- |
| `npm test`          | Runs the parser and database unit tests (Vitest)          |
| `npm run typecheck` | TypeScript check for main, preload and renderer           |
| `npm run build`     | Production build into `out/`                              |
| `npm run preview`   | Runs the production build                                 |
| `npm run dist:win`  | Builds a Windows NSIS installer into `dist/` (refined in M8) |

## Using M1

1. Drag log files or folders onto the window, or click **Open files** or **Open folder**. Folders are scanned
   recursively. Binaries such as `.db`, `.r`, `.zip` and extents are skipped.
2. Each file is detected and parsed in a worker thread. The bottom bar shows bytes, line count and a **Cancel** button.
   Cancelling removes that file's partial data.
3. The viewer shows every line with time, severity, PID, entry type and a parsed message. For 4GLTrace lines
   that means the action (Run / Return / Func / Publish …), the target and `← caller · file @ line`. Progress
   error numbers show as red `(91)` badges.
4. You can filter by:
   - search text, with optional **regex** and **match case**
   - program or procedure
   - PID
   - entry type
   - "Error no." (only lines that carry a Progress error number)
   - severity (sidebar)
   - file (click one or more files in the sidebar)
5. Click a line, or use ↑/↓, PgUp/PgDn, Home/End, to see every parsed field in the detail panel. The chips there
   filter by that program or PID.
6. **New analysis** clears the session. Recently opened paths appear on the start screen.
7. The sun/moon button toggles dark and light themes.

### Getting a client log from QAD / OpenEdge

```
-clientlog C:\temp\client.log -logentrytypes 4GLTrace:4,4GLMessages,DB.Connects,FileID,QryInfo -logginglevel 4
```

You can also do it at runtime in ABL: `LOG-MANAGER:LOGFILE-NAME = "C:\temp\client.log".
LOG-MANAGER:LOG-ENTRY-TYPES = "4GLTrace:4,4GLMessages".`

## Architecture

```
renderer (React)  ──IPC──►  main process  ──spawn──►  worker thread (one file at a time)
   ▲                           │  SessionStore               detect() → parse(stream) → EntryWriter
   │ pages of 500 rows         │  (read connection)                    │
   └───────────────────────────┴──────────► SQLite (WAL) ◄─────────────┘
```

- **Parsers** live in `src/main/parsers/` and implement `LogParser` (`detect(sample)` and `parse(stream)`). To add a
  format, create a class (line-based formats extend `BaseLineParser` and implement `parseLine()`), then register it in
  `registry.ts`. The highest `detect()` score wins. The generic parser always scores 0.05 as the fallback.
- **Streaming:** files are read in 1 MB chunks, so memory stays flat for 1 GB+ logs.
- **Viewer paging:** when the filter changes, the matching ids are copied into a TEMP table with a dense sequence
  number. Any scroll position is then a primary-key lookup (about 1 ms at row 2.8 million). Above roughly 360k rows the
  scrollbar is scaled to stay within the browser's height limit, and the wheel and keyboard move by rows.
- **Session data** is kept in `%APPDATA%\protrace-analyzer\session\current.sqlite` and recreated on each launch.
  Saving and reopening `.ptx` sessions arrives in M7.

## Tests

`tests/fixtures/` has sample logs: a client log with 4GLTrace, 4GLMessages and a stack dump, 4GLMessages error
lines, and an unknown-format Java/Tomcat log. The 31 tests cover:

- auto-detection
- every 4GLTrace action
- caller `[proc - file @ line]` parsing
- `(Procedure: 'x y.p' Line:n)` locations
- error-number extraction, including the rule that an info line ending in `(15321)` is not an error
- continuation lines
- reading with tiny chunks (lines split across reads)
- timestamp zones
- SQLite filtering, paging, facets and cancel cleanup

## Known limits in M1

- Each filter change rebuilds the view on the main thread. That takes about 1 s per 3 million rows, during which the
  window may briefly pause. It moves to a worker in M8.
- Measured throughput is about 9 MB/s on a slow 2-core VM, where SQLite inserts are the bottleneck. A normal desktop
  should be several times faster. Parsing and inserting in separate threads is planned for M8.
- AppServer/PASOE, DB `.lg`, protrace and QAD-specific parsers arrive in M4. Until then those files go through the
  generic parser, which still finds timestamps, `**` errors, `(NNNN)` numbers and ERROR/WARN levels.
