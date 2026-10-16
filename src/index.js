/**
 * jackie-kariuki-events
 *
 * Fetches a Google Calendar iCal (.ics) feed, parses VEVENTs into JSON,
 * and serves the result for the scheduled GitHub Actions sync.
 *
 * Required secret: ICAL_URL, the Google Calendar "Secret address in iCal format".
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS, ...extra },
  });
}

function unfold(text) {
  return text.replace(/\r\n[ \t]/g, "").replace(/\r\n/g, "\n");
}

function parseLine(line) {
  const colon = line.indexOf(":");
  if (colon === -1) return null;
  const left = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const semi = left.indexOf(";");
  const name = (semi === -1 ? left : left.slice(0, semi)).toUpperCase();
  const params = {};
  if (semi !== -1) {
    for (const chunk of left.slice(semi + 1).split(";")) {
      const eq = chunk.indexOf("=");
      if (eq !== -1) {
        params[chunk.slice(0, eq).toUpperCase()] = chunk.slice(eq + 1).replace(/^"|"$/g, "");
      }
    }
  }
  return { name, params, value };
}

function parseICSDate(value, params) {
  const isDate = params.VALUE === "DATE" || !value.includes("T");
  const tzid = params.TZID;
  if (isDate) {
    const y = value.slice(0, 4);
    const m = value.slice(4, 6);
    const d = value.slice(6, 8);
    return { iso: `${y}-${m}-${d}T00:00:00`, allDay: true, tzid: tzid || null };
  }

  const y = value.slice(0, 4);
  const m = value.slice(4, 6);
  const d = value.slice(6, 8);
  const hh = value.slice(9, 11);
  const mm = value.slice(11, 13);
  const ss = value.slice(13, 15);
  if (value.endsWith("Z")) {
    return { iso: `${y}-${m}-${d}T${hh}:${mm}:${ss}Z`, allDay: false, tzid: null };
  }
  return { iso: `${y}-${m}-${d}T${hh}:${mm}:${ss}`, allDay: false, tzid: tzid || null };
}

function unescape(text) {
  return text
    .replace(/\\n/g, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function parseICS(ics) {
  const lines = unfold(ics).split("\n");
  const events = [];
  let current = null;
  let inEvent = false;

  for (const raw of lines) {
    if (!raw) continue;
    const parsed = parseLine(raw);
    if (!parsed) continue;
    const { name, params, value } = parsed;

    if (name === "BEGIN" && value === "VEVENT") {
      inEvent = true;
      current = {};
      continue;
    }
    if (name === "END" && value === "VEVENT") {
      if (current) events.push(current);
      current = null;
      inEvent = false;
      continue;
    }
    if (!inEvent || !current) continue;

    switch (name) {
      case "SUMMARY":
        current.summary = unescape(value);
        break;
      case "DESCRIPTION":
        current.description = unescape(value);
        break;
      case "LOCATION":
        current.location = unescape(value);
        break;
      case "UID":
        current.uid = value;
        break;
      case "STATUS":
        current.status = value;
        break;
      case "URL":
        current.url = value;
        break;
      case "DTSTART": {
        const date = parseICSDate(value, params);
        current.start = date.iso;
        current.allDay = date.allDay;
        if (date.tzid) current.startTzid = date.tzid;
        break;
      }
      case "DTEND": {
        const date = parseICSDate(value, params);
        current.end = date.iso;
        if (date.tzid) current.endTzid = date.tzid;
        break;
      }
      case "DTSTAMP":
        current.dtstamp = parseICSDate(value, params).iso;
        break;
      case "CREATED":
        current.created = parseICSDate(value, params).iso;
        break;
      case "LAST-MODIFIED":
        current.lastModified = parseICSDate(value, params).iso;
        break;
      default:
        if (!current.extra) current.extra = {};
        current.extra[name] = value;
    }
  }

  events.sort((a, b) => (a.start || "").localeCompare(b.start || ""));
  return events;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }
    if (request.method !== "GET") {
      return json({ error: "Method not allowed. Use GET." }, 405);
    }

    if (!env.ICAL_URL) {
      return json({ error: "ICAL_URL secret is not configured. Set it in the Worker settings." }, 500);
    }

    try {
      const upstream = await fetch(env.ICAL_URL, {
        headers: { "User-Agent": "jackie-kariuki-events-worker" },
        cf: { cacheTtl: 300, cacheEverything: true },
      });
      if (!upstream.ok) {
        return json(
          { error: `Google Calendar returned ${upstream.status}`, status: upstream.status },
          502
        );
      }

      const events = parseICS(await upstream.text());
      return json(
        {
          source: "google-calendar-ical",
          generatedAt: new Date().toISOString(),
          count: events.length,
          events,
        },
        200,
        { "Cache-Control": "public, max-age=300" }
      );
    } catch (error) {
      return json({ error: "Failed to fetch or parse iCal feed", detail: String(error) }, 500);
    }
  },
};
