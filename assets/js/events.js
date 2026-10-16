(() => {
  const page = document.getElementById('events-page');
  if (!page) return;

  const endpoint = page.dataset.eventsEndpoint;
  const filterButtons = [...document.querySelectorAll('.event-filter')];
  const list = document.getElementById('events-list');
  const loading = document.getElementById('events-loading');
  const error = document.getElementById('events-error');
  const empty = document.getElementById('events-empty');
  const announcer = document.getElementById('events-announcer');
  const refreshButton = document.getElementById('events-refresh');
  const retryButton = document.getElementById('events-retry');
  let events = [];
  let activeFilter = 'all';

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function parseCalendarDate(value) {
    if (!value) return null;
    if (value.dateTime) {
      const date = new Date(value.dateTime);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    if (value.date) {
      const match = value.date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!match) return null;
      const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
      return Number.isNaN(date.getTime()) ? null : date;
    }
    return null;
  }

  function formatDate(date, options, timeZone) {
    try {
      return new Intl.DateTimeFormat(undefined, {
        ...options,
        ...(timeZone ? { timeZone } : {})
      }).format(date);
    } catch {
      return new Intl.DateTimeFormat(undefined, options).format(date);
    }
  }

  function getDateParts(event) {
    const start = event.start || {};
    if (start.date) {
      const [year, month, day] = start.date.split('-').map(Number);
      const localDate = new Date(year, month - 1, day, 12);
      return {
        month: formatDate(localDate, { month: 'short' }),
        day: formatDate(localDate, { day: 'numeric' }),
        weekday: formatDate(localDate, { weekday: 'short' })
      };
    }

    const date = parseCalendarDate(start);
    if (!date) return { month: 'TBD', day: '--', weekday: '' };
    return {
      month: formatDate(date, { month: 'short' }, start.timeZone),
      day: formatDate(date, { day: 'numeric' }, start.timeZone),
      weekday: formatDate(date, { weekday: 'short' }, start.timeZone)
    };
  }

  function formatTime(date, timeZone) {
    return formatDate(date, { hour: 'numeric', minute: '2-digit' }, timeZone);
  }

  function getEventTime(event) {
    const startValue = event.start || {};
    if (startValue.date) return 'All day';

    const start = parseCalendarDate(startValue);
    if (!start) return 'Time to be announced';

    const end = parseCalendarDate(event.end || {});
    const startText = formatTime(start, startValue.timeZone);
    if (!end || !event.end?.dateTime) return startText;
    return `${startText} - ${formatTime(end, event.end.timeZone || startValue.timeZone)}`;
  }

  function isUpcoming(event, now) {
    const start = parseCalendarDate(event.start || {});
    if (!start) return false;
    const end = parseCalendarDate(event.end || {});
    return start >= now || (end && end > now);
  }

  function isThisMonth(event, now) {
    const startValue = event.start || {};
    if (startValue.date) {
      const [year, month] = startValue.date.split('-').map(Number);
      return year === now.getFullYear() && month === now.getMonth() + 1;
    }

    const start = parseCalendarDate(startValue);
    if (!start) return false;
    const options = { year: 'numeric', month: 'numeric' };
    const eventParts = formatDate(start, options, startValue.timeZone);
    const currentParts = formatDate(now, options, startValue.timeZone);
    return eventParts === currentParts;
  }

  function isWorkshop(event) {
    const extendedCategory = event.extendedProperties?.shared?.category
      || event.extendedProperties?.private?.category
      || '';
    const categories = Array.isArray(event.categories) ? event.categories.join(' ') : '';
    const searchable = [event.summary, event.description, extendedCategory, categories].join(' ');
    return /\bworkshops?\b/i.test(searchable);
  }

  function safeEventUrl(value) {
    if (!value) return '';
    try {
      const url = new URL(value, window.location.origin);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch {
      return '';
    }
  }

  function renderEvent(event) {
    const dateParts = getDateParts(event);
    const start = event.start || {};
    const datetime = start.dateTime || start.date || '';
    const description = String(event.description || '').trim();
    const location = String(event.location || '').trim();
    const detailsUrl = safeEventUrl(event.htmlLink);
    const safeDescription = escapeHtml(description).replace(/\r?\n/g, '<br>');

    return `
      <li class="community-event">
        <time class="event-date-block" datetime="${escapeHtml(datetime)}" aria-label="${escapeHtml(`${dateParts.weekday}, ${dateParts.month} ${dateParts.day}`)}">
          <span class="event-date-month">${escapeHtml(dateParts.month)}</span>
          <span class="event-date-day">${escapeHtml(dateParts.day)}</span>
          <span class="event-date-weekday">${escapeHtml(dateParts.weekday)}</span>
        </time>
        <div class="event-content">
          <h3>${escapeHtml(event.summary || 'Community event')}</h3>
          <div class="event-meta">
            <span><i class="bi bi-clock" aria-hidden="true"></i><span>${escapeHtml(getEventTime(event))}</span></span>
            ${location ? `<span><i class="bi bi-geo-alt" aria-hidden="true"></i><span>${escapeHtml(location)}</span></span>` : ''}
          </div>
          ${description ? `<p class="event-description">${safeDescription}</p>` : ''}
          ${detailsUrl ? `<a class="event-details-link" href="${escapeHtml(detailsUrl)}" target="_blank" rel="noopener noreferrer">View event details <i class="bi bi-arrow-up-right" aria-hidden="true"></i></a>` : ''}
        </div>
      </li>
    `;
  }

  function getFilteredEvents() {
    const now = new Date();
    return events.filter((event) => {
      if (activeFilter === 'month') return isThisMonth(event, now);
      if (activeFilter === 'workshops') return isWorkshop(event);
      return true;
    });
  }

  function renderEvents() {
    const filteredEvents = getFilteredEvents();
    list.innerHTML = filteredEvents.map(renderEvent).join('');
    list.hidden = filteredEvents.length === 0;
    empty.hidden = filteredEvents.length > 0;

    if (filteredEvents.length) {
      const count = filteredEvents.length;
      announcer.textContent = `${count} upcoming ${count === 1 ? 'event' : 'events'} shown.`;
    } else if (events.length === 0) {
      empty.textContent = 'There are no upcoming events right now. Please check back soon.';
      announcer.textContent = empty.textContent;
    } else {
      const messages = {
        month: 'No upcoming events are scheduled for this month.',
        workshops: 'No upcoming workshops are scheduled right now.',
        all: 'There are no upcoming events right now. Please check back soon.'
      };
      empty.textContent = messages[activeFilter];
      announcer.textContent = empty.textContent;
    }
  }

  async function loadEvents() {
    loading.hidden = false;
    error.hidden = true;
    empty.hidden = true;
    list.hidden = true;
    refreshButton.disabled = true;
    page.setAttribute('aria-busy', 'true');

    try {
      if (!endpoint) throw new Error('Events endpoint is not configured.');
      const response = await fetch(endpoint, {
        headers: { Accept: 'application/json' },
        cache: 'no-store'
      });
      if (!response.ok) throw new Error('Events request failed.');

      const payload = await response.json();
      const items = Array.isArray(payload) ? payload : payload.items;
      if (!Array.isArray(items)) throw new Error('Events response is invalid.');

      const now = new Date();
      events = items
        .filter((event) => event && event.status !== 'cancelled' && isUpcoming(event, now))
        .sort((first, second) => parseCalendarDate(first.start) - parseCalendarDate(second.start));
      loading.hidden = true;
      renderEvents();
    } catch {
      loading.hidden = true;
      list.hidden = true;
      empty.hidden = true;
      error.hidden = false;
      announcer.textContent = 'Events could not be loaded. Try again.';
    } finally {
      refreshButton.disabled = false;
      page.removeAttribute('aria-busy');
    }
  }

  filterButtons.forEach((button) => {
    button.addEventListener('click', () => {
      activeFilter = button.dataset.filter;
      filterButtons.forEach((filterButton) => {
        const selected = filterButton === button;
        filterButton.classList.toggle('is-active', selected);
        filterButton.setAttribute('aria-pressed', String(selected));
      });
      if (!loading.hidden) return;
      if (!error.hidden) return;
      renderEvents();
    });
  });

  refreshButton.addEventListener('click', loadEvents);
  retryButton.addEventListener('click', loadEvents);

  const mobileNavToggle = document.querySelector('.mobile-nav-toggle');
  mobileNavToggle.addEventListener('click', () => {
    const expanded = mobileNavToggle.getAttribute('aria-expanded') === 'true';
    document.body.classList.toggle('mobile-nav-active', !expanded);
    mobileNavToggle.setAttribute('aria-expanded', String(!expanded));
    mobileNavToggle.setAttribute('aria-label', expanded ? 'Open navigation' : 'Close navigation');
    mobileNavToggle.firstElementChild.classList.toggle('bi-list', expanded);
    mobileNavToggle.firstElementChild.classList.toggle('bi-x', !expanded);
  });

  document.querySelectorAll('#navmenu a').forEach((link) => {
    link.addEventListener('click', () => {
      document.body.classList.remove('mobile-nav-active');
      mobileNavToggle.setAttribute('aria-expanded', 'false');
      mobileNavToggle.setAttribute('aria-label', 'Open navigation');
      mobileNavToggle.firstElementChild.classList.add('bi-list');
      mobileNavToggle.firstElementChild.classList.remove('bi-x');
    });
  });

  const scrollTop = document.getElementById('scroll-top');
  function updateScrollTop() {
    scrollTop.classList.toggle('active', window.scrollY > 100);
  }
  scrollTop.addEventListener('click', (event) => {
    event.preventDefault();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  window.addEventListener('scroll', updateScrollTop);
  updateScrollTop();

  document.getElementById('year').textContent = new Date().getFullYear();
  loadEvents();
})();