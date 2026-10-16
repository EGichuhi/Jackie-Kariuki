import ICAL from "ical.js";

const EVENTS_PATH = "/api/events";
const MAX_EVENTS = 250;
const MAX_DAYS_AHEAD = 180;
const MAX_OCCURRENCES_PER_EVENT = 10000;

function allowedOrigins(env) {
  return (env.EVENTS_ALLOWED_ORIGIN || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function responseHeaders(origin, origins) {
  const headers = new Headers({
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Accept, Content-Type",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "public, max-age=300",
    "Content-Type": "application/json; charset=utf-8",
    Vary: "Origin"
  });

  if (origin && origins.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }

  return headers;
}

function jsonResponse(payload, status, origin, origins) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: responseHeaders(origin, origins)
  });
}

function calendarTime(time) {
  if (time.isDate) {
    return { date: time.toString().slice(0, 10) };
  }

  const result = { dateTime: time.toJSDate().toISOString() };
  const timeZone = time.zone?.tzid;
  if (timeZone && timeZone !== "floating") {
    result.timeZone = timeZone;
  }
  return result;
}

function toCalendarEvent(component, details) {
  const event = details.item || new ICAL.Event(component);
  const occurrenceComponent = event.component || component;
  const summary = event.summary || "Community event";
  const description = event.description || "";
  const location = event.location || "";
  const categories = occurrenceComponent
    .getAllProperties("categories")
    .flatMap((property) => property.getValues())
    .map(String);
  const status = String(
    occurrenceComponent.getFirstPropertyValue("status") || "confirmed"
  ).toLowerCase();
  const url = occurrenceComponent.getFirstPropertyValue("url");

  return {
    summary,
    description,
    location,
    start: calendarTime(details.startDate),
    end: calendarTime(details.endDate),
    status,
    categories,
    ...(url ? { htmlLink: String(url) } : {})
  };
}

function upcomingEvents(calendarText) {
  const calendar = new ICAL.Component(ICAL.parse(calendarText));
  calendar.getAllSubcomponents("vtimezone").forEach((timezone) => {
    ICAL.TimezoneService.register(timezone);
  });
  const components = calendar.getAllSubcomponents("vevent");
  const now = new Date();
  const endWindow = new Date(now.getTime() + MAX_DAYS_AHEAD * 24 * 60 * 60 * 1000);
  const events = [];

  for (const component of components) {
    const event = new ICAL.Event(component);
    const status = String(component.getFirstPropertyValue("status") || "").toLowerCase();
    if (status === "cancelled") continue;

    const iterator = event.iterator();
    let occurrenceStart;
    let occurrences = 0;

    while ((occurrenceStart = iterator.next()) && occurrences < MAX_OCCURRENCES_PER_EVENT) {
      occurrences += 1;
      const details = event.getOccurrenceDetails(occurrenceStart);
      const start = details.startDate?.toJSDate();
      const end = details.endDate?.toJSDate();
      if (!start || !end) continue;
      if (start > endWindow) break;
      if (end <= now) continue;

      events.push(toCalendarEvent(component, details));
      if (events.length >= MAX_EVENTS) break;
    }

    if (events.length >= MAX_EVENTS) break;
  }

  return events.sort((first, second) => {
    const firstStart = first.start.dateTime || first.start.date;
    const secondStart = second.start.dateTime || second.start.date;
    return firstStart.localeCompare(secondStart);
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const origins = allowedOrigins(env);
    const url = new URL(request.url);

    if (origin && !origins.includes(origin)) {
      return jsonResponse({ error: "Origin not allowed." }, 403, origin, origins);
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: responseHeaders(origin, origins) });
    }

    if (request.method !== "GET") {
      return jsonResponse({ error: "Method not allowed." }, 405, origin, origins);
    }

    if (url.pathname !== EVENTS_PATH && url.pathname !== "/") {
      return jsonResponse({ error: "Not found." }, 404, origin, origins);
    }

    if (!env.CALENDAR_ICS_URL) {
      return jsonResponse({ error: "Calendar feed is not configured." }, 503, origin, origins);
    }

    try {
      const feedUrl = new URL(env.CALENDAR_ICS_URL);
      if (feedUrl.protocol !== "https:") {
        throw new Error("Calendar feed must use HTTPS.");
      }

      const feedResponse = await fetch(feedUrl, {
        headers: { Accept: "text/calendar" },
        signal: AbortSignal.timeout(10000)
      });
      if (!feedResponse.ok) {
        throw new Error("Calendar feed request failed.");
      }

      const events = upcomingEvents(await feedResponse.text());
      return jsonResponse({ items: events }, 200, origin, origins);
    } catch {
      return jsonResponse({ error: "Calendar feed could not be read." }, 502, origin, origins);
    }
  }
};
