# Community Events Calendar Setup

## Current Status

The site is published as static files on GitHub Pages and has no Google Calendar credentials or server-side API. The page requests `GET /api/events`; until that endpoint is deployed, it shows its friendly load-error state. No sample events or credentials are included in the site.

## Google Cloud Setup

1. Create or select a Google Cloud project and enable the Google Calendar API.
2. Use a dedicated calendar containing only events intended for public display.
3. Recommended for a server-owned calendar: create a service account, then share the calendar with its service-account email as a reader. Grant the backend the `https://www.googleapis.com/auth/calendar.readonly` scope. Confirm Workspace sharing policy allows this.
4. If the calendar cannot be shared with a service account, configure the OAuth consent screen and an OAuth client. Complete the authorization once with the read-only scope and store the resulting refresh token on the server. Never put the client secret or refresh token in browser code.

## Server Endpoint

Deploy a serverless endpoint separately from GitHub Pages, for example as a Cloudflare Worker or another server-side function. It should call Google Calendar `events.list` with `timeMin` set to now, `singleEvents=true`, `orderBy=startTime`, and pagination handled through `nextPageToken`. Return a JSON object with an `items` array using the Google Calendar event fields `summary`, `start`, `end`, `location`, `description`, `htmlLink`, `status`, and `extendedProperties` where present.

Configure these backend environment secrets/values:

- `GOOGLE_CALENDAR_ID`: ID of the dedicated calendar.
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`: service-account email, for service-account auth.
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`: private key, stored only in the hosting provider's secret manager.
- `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN`: use these instead of the service-account credentials when using OAuth consent.
- `EVENTS_ALLOWED_ORIGIN`: `https://jackiekariuki.ca`, used to restrict CORS.

The backend should expose only the public event fields, return errors with an appropriate HTTP status, and set a short cache lifetime (for example five minutes). Keep all keys, tokens, and authorization logic server-side. Set the endpoint URL on the page's `data-events-endpoint` attribute if it is not available at `/api/events`.

## Workshop Tagging

The page recognizes “workshop” in the event title or description, as well as a `category` value in Google Calendar `extendedProperties.shared` or `extendedProperties.private`. For consistent results, prefix workshop titles with `[Workshop]` or set the shared `category` property to `workshop` in the event integration.

The page fetches on load and offers a manual refresh. The short server cache lets calendar edits appear without exposing Google credentials to visitors.