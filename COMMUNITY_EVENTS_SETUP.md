# Community Events Calendar Setup

## How It Works

The Cloudflare Worker in `src/index.js` reads a private Google Calendar iCal feed. GitHub Actions fetches the Worker’s JSON every six hours and commits a snapshot to `data/events.json`. The Events page reads that static snapshot and keeps its custom cards and filters; it does not embed Google’s calendar interface.

The calendar can remain private. Its Secret address in iCal format grants read access to anyone who obtains it, so store it only in Cloudflare’s secret store. Events returned in the snapshot are public on the website; include only events intended for visitors.

## Google Calendar

1. In Google Calendar, open the calendar’s **Settings → Integrate calendar**.
2. Copy **Secret address in iCal format**. Do not put this URL in GitHub, the website, or chat.

## Cloudflare Worker

The repository uses the root-level `wrangler.toml` and `src/index.js` for the deployed Worker `jackie-kariuki-events`.

1. In Worker settings, add `ICAL_URL` as a **Secret** using the iCal URL. Do not add it to `wrangler.toml` or as a plaintext variable.
2. Allow anonymous access to this events-only Worker endpoint by removing its Cloudflare Access protection or adding a narrowly scoped bypass for the Worker hostname. The Worker returns public event details but does not reveal the iCal URL.
3. Check that `https://jackie-kariuki-events.ewgichuh.workers.dev/` returns JSON, not an Access login page.

The supplied ICS parser does not expand `RRULE` recurring events. Each VEVENT is published as it appears in the feed; a recurring event whose DTSTART is in the past may not appear as upcoming. Use one-off VEVENTs or replace the parser with a recurrence-aware implementation if recurring events are needed.

## GitHub Actions

The workflow `.github/workflows/sync-events.yml` runs every six hours and writes the Worker response to `data/events.json`.

The workflow fetches the public events-only endpoint without authentication and validates the response before committing it. A Cloudflare API token is only needed if GitHub Actions will deploy the Worker itself; it does not grant runtime access to a Worker protected by Cloudflare Access. Since this Worker is already deployed, no deployment token is needed for event syncing.

Run the workflow manually from the GitHub **Actions** tab to test the first sync. The website reads `/data/events.json`; GitHub Pages and browser code do not need Google credentials.
