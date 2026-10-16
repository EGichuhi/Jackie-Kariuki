# Community Events Calendar Setup

## Architecture

GitHub Pages serves the static website. A Cloudflare Worker in `workers/calendar` reads a private Google Calendar iCal feed and returns upcoming events as JSON. The Events page keeps its custom layout, filters, loading states, and refresh behavior; it does not embed Google's calendar interface.

The source calendar stays private, but events returned by the Worker are visible to website visitors. Use a separate calendar containing only events intended for the public. The iCal address grants read access to that calendar to anyone who obtains the URL, so store it only as a Cloudflare secret.

## Configure Google Calendar

1. Create a separate calendar in the Gmail account and add only website events to it. Keep the calendar's access permissions private.
2. In that calendar's settings, open **Integrate calendar** and copy **Secret address in iCal format**.
3. Do not put this URL in GitHub, website HTML, or chat. If it is exposed, reset the secret iCal address in Google Calendar.

## Configure Cloudflare

1. Connect the repository `EGichuhi/Jackie-Kariuki` to a Cloudflare Worker using the `main` branch.
2. Set the Worker project root to `workers/calendar`. The Wrangler configuration is `workers/calendar/wrangler.jsonc`; its Worker name is `jackie-calendar-api`.
3. In Worker **Settings → Variables and Secrets**, add a secret named `CALENDAR_ICS_URL` and set its value to the secret iCal address. Never add this value to `wrangler.jsonc` or a plain-text variable.
4. `EVENTS_ALLOWED_ORIGIN` is already declared in Wrangler as `https://jackiekariuki.ca`. Keep it aligned with the site's production origin.
5. Deploy the Worker. Wrangler bundles the `ical.js` dependency from `workers/calendar/package.json`.

If setting up the Worker through Cloudflare Builds, use `workers/calendar` as the root directory and make sure the deployment runs `npm install` followed by `npm run deploy`. The Worker name in Cloudflare must match the name in `wrangler.jsonc`.

## Connect the Website

The Worker exposes `GET /api/events` and returns `{ "items": [...] }` in the format expected by `assets/js/events.js`. After deployment, copy its `workers.dev` URL and set `data-events-endpoint` on the Events page to the full endpoint URL, for example:

```text
https://jackie-calendar-api.<your-account>.workers.dev/api/events
```

The Worker allows browser requests from `https://jackiekariuki.ca`. If the site uses another production origin, update `EVENTS_ALLOWED_ORIGIN` in `wrangler.jsonc` and redeploy.

## Event Details

The Worker returns up to 250 upcoming events within the next 180 days and allows a five-minute cache. It expands recurring events and preserves all-day dates, times, locations, descriptions, and event links where available. The site recognizes workshops when “workshop” appears in an event title or description, or in its categories.

The current Events page still uses `/api/events` until the deployed Worker URL is added to `events.html`. Do not commit the iCal secret while making that change.