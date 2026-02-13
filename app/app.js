const CONFIG = {
  festivalDates: "Feb 13–15, 2026",
  scheduleCsvUrl:
    "https://docs.google.com/spreadsheets/d/1Yw24ECctBPCMWJejqsEB41XYBx0d8wJGAl2MNSuCyeI/gviz/tq?tqx=out:csv",
  localScheduleJsonUrl: "schedule.json",
  localScheduleUrl: "schedule_extracted.csv",
  timezone: "Asia/Kolkata",
};

const SW_VERSION = "v7";
const EXPECTED_SESSION_COUNT = 143;
const STORAGE_KEY = "vff_saved_sessions";
const SORT_KEY = "vff_saved_sort";
const TAGS_KEY = "vff-selected-tags";
const NOTIFY_ASKED_KEY = "vff_notify_asked";
const NOTIFY_SENT_KEY = "vff_notify_sent";
const POWER_MODE_KEY = "vff_low_power_mode";
const A2HS_SNOOZE_UNTIL_KEY = "vff_a2hs_snooze_until";
const VISIT_KEY = "vff_visit_count";
const SW_DISMISSED_VERSION_KEY = "vff_sw_dismissed_version";
const A2HS_DISMISSED_KEY = "a2hs-dismissed";
const UPDATE_DISMISSED_KEY = "update-dismissed";
const CHROME_NOTICE_DISMISSED_KEY = "chrome-notice-dismissed";

const TAG_ORDER = [
  "food-demo",
  "workshop",
  "movement",
  "dance",
  "yoga",
  "fitness",
  "talk",
  "music",
  "arts",
  "meditation",
  "meetup",
  "kids",
  "community",
  "meal",
  "wellness",
  "activism",
  "nature",
];

const QUICK_FILTERS = {
  wellness: ["wellness", "yoga", "meditation"],
  music: ["music", "dance"],
  talks: ["talk", "workshop"],
  family: ["kids", "community"],
  nature: ["nature", "activism"],
};

const travelModes = {
  walk: {
    icon: "🚶",
    className: "good",
    text: "Excellent! ~0 kg CO2 emitted. Perfect for short distances.",
  },
  bike: {
    icon: "🚴",
    className: "good",
    text: "Excellent! ~0 kg CO2 emitted. Perfect for short distances.",
  },
  bus: {
    icon: "🚌",
    className: "mid",
    text: "Low-impact transport (~40-80g CO2/passenger/km).",
  },
  train: {
    icon: "🚆",
    className: "mid",
    text: "Low-impact transport (~40-80g CO2/passenger/km).",
  },
  car: {
    icon: "🚗",
    className: "warn",
    text: "High emissions (~162-320g CO2/passenger/km). Consider carpool.",
  },
  carpool: {
    icon: "🚗🤝",
    className: "good",
    text: "Great reduction! Splitting with 3+ people cuts impact by 75%+.",
  },
};

const elements = {
  dayTabs: document.getElementById("day-tabs"),
  dayFilter: document.getElementById("day-filter"),
  venueFilter: document.getElementById("venue-filter"),
  searchInput: document.getElementById("search-input"),
  scheduleList: document.getElementById("schedule-list"),
  emptyState: document.getElementById("empty-state"),
  savedList: document.getElementById("saved-list"),
  savedEmpty: document.getElementById("saved-empty"),
  savedNext: document.getElementById("saved-next"),
  nowCard: document.getElementById("now-card"),
  nowBtn: document.getElementById("now-btn"),
  travelButtons: document.querySelectorAll(".travel-buttons .chip"),
  travelTip: document.getElementById("travel-tip"),
  festivalDates: document.getElementById("festival-dates"),
  planCountNav: document.getElementById("plan-count-nav"),
  savedSort: document.getElementById("saved-sort"),
  exportIcsBtn: document.getElementById("export-ics-btn"),
  exportCsvBtn: document.getElementById("export-csv-btn"),
  sharePlanBtn: document.getElementById("share-plan-btn"),
  shareAppBtn: document.getElementById("share-app-btn"),
  lowPowerToggle: document.getElementById("low-power-toggle"),
  a2hsBanner: document.getElementById("a2hs-banner"),
  a2hsText: document.getElementById("a2hs-text"),
  a2hsBtn: document.getElementById("a2hs-btn"),
  a2hsClose: document.getElementById("a2hs-close"),
  swUpdateBanner: document.getElementById("update-banner"),
  swRefreshBtn: document.getElementById("sw-refresh-btn"),
  swRefreshClose: document.getElementById("sw-refresh-close"),
  scrollTopBtn: document.getElementById("scroll-top-btn"),
  tagFilters: document.getElementById("tag-filters"),
  activeFilterCount: document.getElementById("active-filter-count"),
  activeTags: document.getElementById("active-tags"),
  filterResults: document.getElementById("filter-results"),
  filterAnnouncer: document.getElementById("filter-announcer"),
  filterToggleBtn: document.getElementById("filter-toggle-btn"),
  tagFilterPanel: document.getElementById("tag-filter-panel"),
  clearFiltersBtn: document.getElementById("clear-filters-btn"),
  recommendations: document.getElementById("recommendations"),
  recommendationList: document.getElementById("recommendation-list"),
  chromeNotice: document.getElementById("chrome-notice"),
  chromeNoticeClose: document.getElementById("chrome-notice-close"),
};

const state = {
  allSessions: [],
  selectedTags: new Set(),
};

let deferredA2HS = null;
let waitingWorker = null;
let refreshingByUpdate = false;

const banners = {
  a2hs: () => elements.a2hsBanner,
  sw: () => elements.swUpdateBanner,
};

function getSavedIds() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch (err) {
    return [];
  }
}

function setSavedIds(ids) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
}

function getSavedSort() {
  return localStorage.getItem(SORT_KEY) || "chronological";
}

function setSavedSort(value) {
  localStorage.setItem(SORT_KEY, value);
}

function saveSelectedTags() {
  localStorage.setItem(TAGS_KEY, JSON.stringify([...state.selectedTags]));
}

function loadSelectedTags() {
  try {
    const value = JSON.parse(localStorage.getItem(TAGS_KEY) || "[]");
    state.selectedTags = new Set(value);
  } catch (err) {
    state.selectedTags = new Set();
  }
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(current.trim());
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(current.trim());
      if (row.some((cell) => cell.length)) rows.push(row);
      row = [];
      current = "";
      continue;
    }

    current += char;
  }

  if (current.length || row.length) {
    row.push(current.trim());
    rows.push(row);
  }

  return rows;
}

function normalizeHeader(header) {
  return header.toLowerCase().trim().replace(/\s+/g, "_");
}

function normalizeTag(tag) {
  return String(tag || "")
    .trim()
    .toLowerCase();
}

function normalizeSchedule(rows) {
  const dayToDate = {
    friday: "2026-02-13",
    saturday: "2026-02-14",
    sunday: "2026-02-15",
  };
  const errors = [];
  const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

  const sessions = rows
    .map((item, index) => {
      const day = (item.day || "").trim();
      const start_time = (item.start_time || "").trim();
      const venue = (item.venue || "").trim();
      let title = (item.title || "").trim();
      const speaker = (item.speaker || "").trim();
      const end_time = (item.end_time || "").trim();
      const tag1 = normalizeTag(item.tag1 || item.tag_1);
      const tag2 = normalizeTag(item.tag2 || item.tag_2);
      const date = (item.date || "").trim() || dayToDate[day.toLowerCase()] || "";

      if (!day || !start_time || !venue) {
        errors.push(`Row ${index + 2}: required field missing.`);
        return null;
      }

      if (!title) title = "TBA Session";

      if (!timeRegex.test(start_time)) {
        errors.push(`Row ${index + 2}: invalid time '${start_time}'.`);
        return null;
      }

      if (end_time && !timeRegex.test(end_time)) {
        errors.push(`Row ${index + 2}: invalid end time '${end_time}'.`);
        return null;
      }

      const id = [date, start_time, venue, title, speaker]
        .map((v) =>
          String(v || "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
        )
        .filter(Boolean)
        .join("_");

      return {
        day,
        date,
        start_time,
        end_time,
        venue,
        title,
        speaker,
        tag1: tag1 || "",
        tag2: tag2 || "",
        tags: [tag1, tag2].filter(Boolean).join("|"),
        id,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time));

  if (errors.length) {
    console.warn("[schedule] validation errors:", errors);
  }

  if (sessions.length !== EXPECTED_SESSION_COUNT) {
    console.warn(`[schedule] imported ${sessions.length} sessions (expected ${EXPECTED_SESSION_COUNT}).`);
  }

  return sessions;
}

async function loadSchedule() {
  const loadCsvUrl = async (url) => {
    if (!url) return null;
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    const text = await response.text();
    const parsed = parseCsv(text);
    if (!parsed.length) return null;

    const [headers, ...records] = parsed;
    const normalizedHeaders = headers.map(normalizeHeader);
    const rows = records.map((record) => {
      const row = {};
      normalizedHeaders.forEach((header, index) => {
        row[header] = record[index] || "";
      });
      return row;
    });

    const sessions = normalizeSchedule(rows);
    return sessions.length ? sessions : null;
  };

  const loadJsonUrl = async (url) => {
    if (!url) return null;
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    const payload = await response.json();
    if (!Array.isArray(payload)) return null;
    const sessions = normalizeSchedule(payload);
    return sessions.length ? sessions : null;
  };

  try {
    const localJson = await loadJsonUrl(CONFIG.localScheduleJsonUrl);
    if (localJson) return localJson;
  } catch (err) {
    console.warn("[schedule] local json load failed", err);
  }

  try {
    const local = await loadCsvUrl(CONFIG.localScheduleUrl);
    if (local) return local;
  } catch (err) {
    console.warn("[schedule] local load failed", err);
  }

  try {
    const remote = await loadCsvUrl(CONFIG.scheduleCsvUrl);
    if (remote) return remote;
  } catch (err) {
    console.warn("[schedule] remote load failed", err);
  }

  return [];
}

function getNowInTimezone() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: CONFIG.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type)?.value || "";

  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
}

function toMinutes(time) {
  const [h, m] = String(time || "00:00").split(":").map(Number);
  return h * 60 + m;
}

function getSessionEndMinutes(item) {
  if (item.end_time) return toMinutes(item.end_time);
  return Math.min(toMinutes(item.start_time) + 60, 24 * 60 - 1);
}

function getNowNextIds(sessions) {
  const now = getNowInTimezone();
  const minuteNow = toMinutes(now.time);

  const todaySessions = sessions
    .filter((item) => item.date === now.date)
    .map((item) => ({
      ...item,
      startMinute: toMinutes(item.start_time),
      endMinute: getSessionEndMinutes(item),
    }))
    .sort((a, b) => a.startMinute - b.startMinute);

  let nowId = "";
  let nextId = "";

  for (const session of todaySessions) {
    if (minuteNow >= session.startMinute && minuteNow < session.endMinute) {
      nowId = session.id;
      break;
    }
  }

  if (nowId) {
    const current = todaySessions.find((s) => s.id === nowId);
    const next = todaySessions.find((s) => s.startMinute >= current.endMinute);
    if (next) nextId = next.id;
  } else {
    const next = todaySessions.find((s) => s.startMinute > minuteNow);
    if (next) nextId = next.id;
  }

  return { nowId, nextId };
}

function matchesSearch(item, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  const hay = [item.title, item.speaker, item.venue, item.tag1, item.tag2].join(" ").toLowerCase();
  return hay.includes(q);
}

function getActiveDay() {
  return elements.dayFilter.value;
}

function getActiveVenue() {
  return elements.venueFilter.value;
}

function getActiveSearch() {
  return elements.searchInput.value.trim().toLowerCase();
}

function getFilteredSessions({ ignoreTags = false } = {}) {
  const day = getActiveDay();
  const venue = getActiveVenue();
  const query = getActiveSearch();

  return state.allSessions.filter((item) => {
    if (day && item.day !== day) return false;
    if (venue && item.venue !== venue) return false;
    if (!matchesSearch(item, query)) return false;

    if (!ignoreTags && state.selectedTags.size) {
      const tags = [item.tag1, item.tag2].filter(Boolean);
      return tags.some((tag) => state.selectedTags.has(tag));
    }

    return true;
  });
}

function getAllTags() {
  const set = new Set();
  state.allSessions.forEach((session) => {
    if (session.tag1) set.add(session.tag1);
    if (session.tag2) set.add(session.tag2);
  });

  const list = [...set];
  list.sort((a, b) => {
    const ia = TAG_ORDER.indexOf(a);
    const ib = TAG_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  return list;
}

function getTagClass(tag) {
  if (["food-demo", "meal"].includes(tag)) return "tag-food";
  if (["music", "dance", "arts"].includes(tag)) return "tag-arts";
  if (["wellness", "meditation", "yoga", "fitness", "movement"].includes(tag)) return "tag-wellness";
  if (["talk", "workshop"].includes(tag)) return "tag-talk";
  if (["kids"].includes(tag)) return "tag-kids";
  if (["activism"].includes(tag)) return "tag-activism";
  if (["nature"].includes(tag)) return "tag-nature";
  return "";
}

function renderTagFilters() {
  if (!elements.tagFilters) return;

  const tags = getAllTags();
  const base = getFilteredSessions({ ignoreTags: true });
  const tagCounts = {};

  tags.forEach((tag) => {
    tagCounts[tag] = base.filter((session) => session.tag1 === tag || session.tag2 === tag).length;
  });

  elements.tagFilters.innerHTML = tags
    .map((tag) => {
      const active = state.selectedTags.has(tag);
      const count = tagCounts[tag] || 0;
      const disabled = count === 0 && (getActiveDay() || getActiveVenue() || getActiveSearch());
      return `<button class="tag-filter-btn ${active ? "active" : ""}" data-tag="${escapeHtml(tag)}" aria-label="Filter by ${escapeHtml(
        tag
      )} category" aria-pressed="${active ? "true" : "false"}" ${disabled ? "disabled" : ""}>${escapeHtml(
        tag
      )} (${count})</button>`;
    })
    .join("");

  if (elements.activeFilterCount) {
    elements.activeFilterCount.textContent = String(state.selectedTags.size);
  }
  renderActiveTagChips();
}

function renderActiveTagChips() {
  if (!elements.activeTags) return;
  const tags = [...state.selectedTags];
  elements.activeTags.innerHTML = tags
    .map((tag) => `<button class="active-chip" data-remove-tag="${escapeHtml(tag)}">${escapeHtml(tag)} ×</button>`)
    .join("");
}

function updateFilterResultLabel(filteredCount) {
  if (!elements.filterResults) return;
  const total = state.allSessions.length;
  elements.filterResults.textContent = `Showing ${filteredCount} of ${total} sessions`;
}

function syncFilterUrl() {
  const url = new URL(window.location.href);
  const day = getActiveDay();
  const venue = getActiveVenue();
  const tags = [...state.selectedTags];

  if (day) url.searchParams.set("day", day);
  else url.searchParams.delete("day");

  if (venue) url.searchParams.set("venue", venue);
  else url.searchParams.delete("venue");

  if (tags.length) url.searchParams.set("tags", tags.join(","));
  else url.searchParams.delete("tags");

  history.replaceState(null, "", `${url.pathname}?${url.searchParams.toString()}${url.hash}`);
}

function applyUrlFilters() {
  const params = new URLSearchParams(window.location.search);
  const day = params.get("day") || "";
  const venue = params.get("venue") || "";
  const tags = (params.get("tags") || "")
    .split(",")
    .map((t) => normalizeTag(t))
    .filter(Boolean);

  if (day) elements.dayFilter.value = day;
  if (venue) elements.venueFilter.value = venue;

  if (tags.length) {
    state.selectedTags = new Set(tags);
  }
}

function hasUrlFilterParams() {
  const params = new URLSearchParams(window.location.search);
  return Boolean(params.get("day") || params.get("venue") || params.get("tags") || params.get("q"));
}

function sanitizeSelectedTags() {
  const available = new Set(getAllTags());
  state.selectedTags = new Set([...state.selectedTags].filter((tag) => available.has(tag)));
}

function announce(text) {
  elements.filterAnnouncer.textContent = text;
}

function renderFilters() {
  const days = [...new Set(state.allSessions.map((s) => s.day).filter(Boolean))];
  const venues = [...new Set(state.allSessions.map((s) => s.venue).filter(Boolean))];

  elements.dayFilter.innerHTML = [
    `<option value="">All Days</option>`,
    ...days.map((day) => `<option value="${escapeHtml(day)}">${escapeHtml(day)}</option>`),
  ].join("");

  elements.venueFilter.innerHTML = [
    `<option value="">All Venues</option>`,
    ...venues.map((venue) => `<option value="${escapeHtml(venue)}">${escapeHtml(venue)}</option>`),
  ].join("");

  elements.dayTabs.innerHTML = days
    .map(
      (day) => `<button class="day-tab ${elements.dayFilter.value === day ? "active" : ""}" data-day="${escapeHtml(day)}">${
        escapeHtml(day)
      }</button>`
    )
    .join("");
}

function renderSessionTags(item) {
  const tags = [item.tag1, item.tag2].filter(Boolean);
  return tags
    .map((tag) => `<button class="tag clickable ${getTagClass(tag)}" data-inline-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`)
    .join("");
}

function renderSessionCard(item, options = {}) {
  const { isSaved = false, allowCalendar = false, highlight = "" } = options;
  const flag =
    highlight === "now"
      ? '<span class="session-flag now">Happening Now</span>'
      : highlight === "next"
      ? '<span class="session-flag next">Up Next</span>'
      : "";

  return `
    <div class="session ${highlight}">
      <div>
        <div class="session-time">${escapeHtml(item.start_time)}${item.end_time ? `-${escapeHtml(item.end_time)}` : ""}</div>
        <div class="session-meta">${escapeHtml(item.day)}${item.date ? ` • ${escapeHtml(item.date)}` : ""}</div>
        <div class="session-meta">${escapeHtml(item.venue || "")}</div>
        ${flag}
      </div>
      <div>
        <h3>${escapeHtml(item.title)}</h3>
        ${item.speaker ? `<div class="session-meta">${escapeHtml(item.speaker)}</div>` : ""}
        <div class="session-tags">${renderSessionTags(item)}</div>
      </div>
      <div class="session-actions">
        <button class="save-btn ${isSaved ? "active" : ""}" data-id="${escapeHtml(item.id)}">${isSaved ? "Saved" : "Save"}</button>
        ${allowCalendar ? `<button class="calendar-btn" data-calendar-id="${escapeHtml(item.id)}">Add to Calendar</button>` : ""}
      </div>
    </div>
  `;
}

function updateSavedBadge(count) {
  elements.planCountNav.textContent = String(count);
}

function getSortedSavedItems(savedItems) {
  const sortValue = elements.savedSort.value;

  if (sortValue === "day") {
    return [...savedItems].sort((a, b) => a.day.localeCompare(b.day) || a.start_time.localeCompare(b.start_time));
  }

  if (sortValue === "time") {
    return [...savedItems].sort((a, b) => a.start_time.localeCompare(b.start_time) || a.day.localeCompare(b.day));
  }

  return [...savedItems].sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time));
}

function renderSchedule() {
  if (!elements.scheduleList) {
    console.error("[ui] Schedule container not found (#schedule-list).");
    return;
  }
  const savedIds = new Set(getSavedIds());
  const nowNext = getNowNextIds(state.allSessions);
  const filtered = getFilteredSessions();

  elements.scheduleList.innerHTML = filtered
    .map((item) => {
      const highlight = item.id === nowNext.nowId ? "now" : item.id === nowNext.nextId ? "next" : "";
      return renderSessionCard(item, {
        isSaved: savedIds.has(item.id),
        allowCalendar: false,
        highlight,
      });
    })
    .join("");

  if (elements.emptyState) {
    elements.emptyState.classList.toggle("hidden", filtered.length > 0);
  }
  updateFilterResultLabel(filtered.length);
  renderTagFilters();
  syncFilterUrl();
}

function renderSavedNext(savedItems) {
  if (!elements.savedNext) return;
  if (!savedItems.length) {
    elements.savedNext.classList.add("hidden");
    return;
  }

  const now = getNowInTimezone();
  const currentMinutes = toMinutes(now.time);
  const todayItems = savedItems.filter((item) => item.date === now.date);

  if (!todayItems.length) {
    elements.savedNext.textContent = "No saved sessions for today yet.";
    elements.savedNext.classList.remove("hidden");
    return;
  }

  const upcoming = todayItems
    .map((item) => ({ ...item, start: toMinutes(item.start_time) }))
    .sort((a, b) => a.start - b.start);

  const next = upcoming.find((item) => item.start >= currentMinutes) || upcoming[0];
  elements.savedNext.innerHTML = `Next in your plan: <strong>${escapeHtml(next.title)}</strong> at ${escapeHtml(
    next.start_time
  )} in ${escapeHtml(next.venue)}`;
  elements.savedNext.classList.remove("hidden");
}

function renderRecommendations(savedItems) {
  if (!elements.recommendations || !elements.recommendationList) return;
  const savedIds = new Set(savedItems.map((s) => s.id));
  if (!savedItems.length) {
    elements.recommendations.classList.add("hidden");
    return;
  }

  const frequency = {};
  savedItems.forEach((session) => {
    [session.tag1, session.tag2].filter(Boolean).forEach((tag) => {
      frequency[tag] = (frequency[tag] || 0) + 1;
    });
  });

  const ranked = state.allSessions
    .filter((session) => !savedIds.has(session.id))
    .map((session) => {
      const score = [session.tag1, session.tag2].filter(Boolean).reduce((sum, tag) => sum + (frequency[tag] || 0), 0);
      return { session, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((item) => item.session);

  if (!ranked.length) {
    elements.recommendations.classList.add("hidden");
    return;
  }

  elements.recommendationList.innerHTML = ranked
    .map((item) =>
      renderSessionCard(item, {
        isSaved: false,
        allowCalendar: false,
      })
    )
    .join("");

  elements.recommendations.classList.remove("hidden");
}

function renderSaved() {
  if (!elements.savedList || !elements.savedEmpty) return;
  const savedIds = new Set(getSavedIds());
  const savedItems = getSortedSavedItems(state.allSessions.filter((item) => savedIds.has(item.id)));

  renderSavedNext(savedItems);
  renderRecommendations(savedItems);
  updateSavedBadge(savedItems.length);

  elements.savedList.innerHTML = savedItems
    .map((item) =>
      renderSessionCard(item, {
        isSaved: true,
        allowCalendar: true,
      })
    )
    .join("");

  elements.savedEmpty.classList.toggle("hidden", savedItems.length > 0);
}

function toIcsDate(date, time) {
  return `${date.replace(/-/g, "")}T${time.replace(":", "")}00`;
}

function downloadFile(content, fileName, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function buildIcsContent(items) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//VFF//Guest Schedule//EN",
    "CALSCALE:GREGORIAN",
  ];

  items.forEach((item) => {
    const categories = [item.tag1, item.tag2].filter(Boolean).join(",");
    const end = item.end_time || "23:59";

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${item.id}@vff2026`);
    lines.push(`DTSTART;TZID=${CONFIG.timezone}:${toIcsDate(item.date, item.start_time)}`);
    lines.push(`DTEND;TZID=${CONFIG.timezone}:${toIcsDate(item.date, end)}`);
    lines.push(`SUMMARY:${item.title}`);
    lines.push(`LOCATION:${item.venue || "Festival Venue"}`);
    lines.push(`DESCRIPTION:${item.speaker ? `Speaker: ${item.speaker}` : "Festival Session"}`);
    if (categories) lines.push(`CATEGORIES:${categories}`);
    lines.push("END:VEVENT");
  });

  lines.push("END:VCALENDAR");
  return lines.join("\n");
}

function exportSavedAsIcs() {
  const savedIds = new Set(getSavedIds());
  const items = state.allSessions.filter((item) => savedIds.has(item.id));
  if (!items.length) return;
  downloadFile(buildIcsContent(items), "vff-my-plan.ics", "text/calendar;charset=utf-8");
}

function exportSavedAsCsv() {
  const savedIds = new Set(getSavedIds());
  const items = state.allSessions.filter((item) => savedIds.has(item.id));
  if (!items.length) return;

  const header = "session_name,time,venue,day,tag1,tag2";
  const rows = items.map((item) => {
    const time = `${item.start_time}${item.end_time ? `-${item.end_time}` : ""}`;
    return [item.title, time, item.venue, item.day, item.tag1 || "", item.tag2 || ""]
      .map((value) => `"${String(value).replace(/\"/g, '""')}"`)
      .join(",");
  });

  downloadFile([header, ...rows].join("\n"), "vff-my-plan.csv", "text/csv;charset=utf-8");
}

function getPlanUrl() {
  const ids = getSavedIds();
  const params = new URLSearchParams(window.location.search);
  if (!ids.length) params.delete("plan");
  else params.set("plan", ids.join(","));
  return `${window.location.origin}${window.location.pathname}?${params.toString()}#my-plan-anchor`;
}

function getTagSummary(items) {
  const count = {};
  items.forEach((item) => {
    [item.tag1, item.tag2].filter(Boolean).forEach((tag) => {
      count[tag] = (count[tag] || 0) + 1;
    });
  });

  return Object.entries(count)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([tag, value]) => `${value} ${tag}`)
    .join(", ");
}

async function sharePlan() {
  const savedIds = new Set(getSavedIds());
  const items = state.allSessions.filter((item) => savedIds.has(item.id));
  const summary = getTagSummary(items);
  const text = summary ? `My VFF Plan: ${summary}` : "My VFF Plan";
  const url = getPlanUrl();

  if (navigator.share) {
    try {
      await navigator.share({ title: "My VFF Plan", text, url });
      return;
    } catch (err) {
      // Fallback below.
    }
  }

  await navigator.clipboard.writeText(`${text}\n${url}`);
  alert("Plan link copied.");
}

async function shareApp() {
  const url = "https://vff-guest-2026.netlify.app/";
  const shareText =
    "🌱 Heading to Vegan Forest Festival 2026? Use this lightweight app to track our schedule, see what’s happening 'Now/Next,' and other useful tips. No bulky downloads needed! 📅 Check it out here: https://vff-guest-2026.netlify.app/";

  if (navigator.share) {
    try {
      await navigator.share({ title: "Vegan Forest Festival 2026", text: shareText, url });
      return;
    } catch (err) {
      // Fallback below.
    }
  }

  await navigator.clipboard.writeText(shareText);
  alert("Share message copied.");
}

function applyPlanFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const encoded = params.get("plan");
  if (!encoded) return;

  const incoming = encoded
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const valid = new Set(state.allSessions.map((item) => item.id));
  const filtered = incoming.filter((id) => valid.has(id));
  if (filtered.length) setSavedIds([...new Set(filtered)]);
}

function maybeAskNotifications() {
  const hasSaved = getSavedIds().length > 0;
  const asked = localStorage.getItem(NOTIFY_ASKED_KEY) === "1";
  if (!hasSaved || asked || !("Notification" in window)) return;

  localStorage.setItem(NOTIFY_ASKED_KEY, "1");
  Notification.requestPermission();
}

function maybeNotifyUpcoming() {
  if (document.hidden) return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;

  const savedIds = new Set(getSavedIds());
  if (!savedIds.size) return;

  const now = getNowInTimezone();
  const nowMinutes = toMinutes(now.time);
  const todaySaved = state.allSessions.filter((item) => savedIds.has(item.id) && item.date === now.date);

  const sentMap = (() => {
    try {
      return JSON.parse(localStorage.getItem(NOTIFY_SENT_KEY) || "{}");
    } catch (err) {
      return {};
    }
  })();

  let updated = false;
  todaySaved.forEach((item) => {
    const diff = toMinutes(item.start_time) - nowMinutes;
    const key = `${item.date}|${item.id}`;

    if (diff <= 10 && diff >= 9 && !sentMap[key]) {
      new Notification("Session starts in 10 minutes", {
        body: `${item.title} at ${item.start_time} (${item.venue})`,
      });
      sentMap[key] = true;
      updated = true;
    }
  });

  if (updated) localStorage.setItem(NOTIFY_SENT_KEY, JSON.stringify(sentMap));
}

function updateNowCard() {
  const nowNext = getNowNextIds(state.allSessions);
  const nowItem = state.allSessions.find((item) => item.id === nowNext.nowId);
  const nextItem = state.allSessions.find((item) => item.id === nowNext.nextId);

  if (nowItem) {
    elements.nowCard.innerHTML = `Happening now: <strong>${escapeHtml(nowItem.title)}</strong> in ${escapeHtml(
      nowItem.venue
    )} · Next: <strong>${nextItem ? escapeHtml(nextItem.title) : "No more today"}</strong>`;
    elements.nowCard.classList.remove("hidden");
    return;
  }

  if (nextItem) {
    elements.nowCard.innerHTML = `Up next: <strong>${escapeHtml(nextItem.title)}</strong> at ${escapeHtml(
      nextItem.start_time
    )} in ${escapeHtml(nextItem.venue)}`;
    elements.nowCard.classList.remove("hidden");
    return;
  }

  elements.nowCard.innerHTML = "No sessions scheduled for today.";
  elements.nowCard.classList.remove("hidden");
}

function setPowerModeState(isOn) {
  document.body.classList.toggle("low-power", isOn);
  document.body.classList.toggle("dark-mode", isOn);
  localStorage.setItem(POWER_MODE_KEY, isOn ? "1" : "0");
  if (elements.lowPowerToggle) {
    elements.lowPowerToggle.textContent = isOn ? "Low Power Mode On 🌙" : "Low Power Mode 🌙";
  }
}

function initPowerMode() {
  const stored = localStorage.getItem(POWER_MODE_KEY);
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  setPowerModeState(stored ? stored === "1" : prefersDark);
}

function syncBannerOffsets() {
  const topVisible =
    elements.a2hsBanner.style.display !== "none" &&
    elements.a2hsBanner.classList.contains("is-visible");
  const bottomVisible =
    elements.swUpdateBanner.style.display !== "none" &&
    elements.swUpdateBanner.classList.contains("is-visible");

  document.body.classList.toggle("has-top-banner", topVisible);
  document.body.classList.toggle("has-bottom-banner", bottomVisible);
}

function hideBanner(type) {
  const el = banners[type] && banners[type]();
  if (!el) return;

  el.classList.remove("is-visible");
  window.setTimeout(() => {
    if (!el.classList.contains("is-visible")) {
      el.classList.add("hidden");
      el.style.display = "none";
      syncBannerOffsets();
    }
  }, 220);
}

function showBanner(type) {
  const el = banners[type] && banners[type]();
  if (!el) return;

  el.classList.remove("hidden");
  el.style.display = "flex";
  requestAnimationFrame(() => {
    el.classList.add("is-visible");
    syncBannerOffsets();
  });
}

function initA2HS() {
  if (!elements.a2hsBanner || !elements.a2hsText || !elements.a2hsBtn) return;
  if (localStorage.getItem(A2HS_DISMISSED_KEY) === "true") return;

  const visitCount = Number(localStorage.getItem(VISIT_KEY) || "0") + 1;
  localStorage.setItem(VISIT_KEY, String(visitCount));

  const snoozeUntil = Number(localStorage.getItem(A2HS_SNOOZE_UNTIL_KEY) || "0");
  if (Date.now() < snoozeUntil) return;

  const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
  if (standalone) return;

  const isiOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (isiOS) {
    elements.a2hsBtn.classList.add("hidden");
    elements.a2hsText.textContent =
      "On iPhone/iPad: tap Share, then 'Add to Home Screen' for offline access 🌿";
    if (visitCount >= 2) showBanner("a2hs");
    return;
  }

  elements.a2hsBtn.classList.remove("hidden");
  elements.a2hsText.textContent = "Add this app to your home screen for offline access 🌿";
  if (visitCount >= 3 && deferredA2HS) showBanner("a2hs");
}

function maybeShowSwBanner(registration) {
  if (sessionStorage.getItem(UPDATE_DISMISSED_KEY) === "true") return;
  if (localStorage.getItem(SW_DISMISSED_VERSION_KEY) === SW_VERSION) return;

  waitingWorker = registration.waiting || waitingWorker;
  if (waitingWorker) showBanner("sw");
}

function dismissUpdateBanner() {
  localStorage.setItem(SW_DISMISSED_VERSION_KEY, SW_VERSION);
  hideBanner("sw");
}

function forceUpdate() {
  navigator.serviceWorker.getRegistration().then((registration) => {
    const candidate = (registration && registration.waiting) || waitingWorker;
    if (candidate) {
      refreshingByUpdate = true;
      candidate.postMessage({ type: "SKIP_WAITING" });
      return;
    }
    window.location.reload();
  });
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  const CLEANUP_KEY = "vff_sw_cleanup_version";

  navigator.serviceWorker
    .getRegistrations()
    .then(async (registrations) => {
      // One-time cleanup to remove broken older workers (e.g. addAll install failure).
      if (localStorage.getItem(CLEANUP_KEY) !== SW_VERSION) {
        await Promise.all(registrations.map((reg) => reg.unregister()));
        localStorage.setItem(CLEANUP_KEY, SW_VERSION);
      }
      return navigator.serviceWorker.register(`./sw.js?v=${SW_VERSION}`, { updateViaCache: "none" });
    })
    .then((registration) => {
      maybeShowSwBanner(registration);

      registration.onupdatefound = () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.onstatechange = () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            waitingWorker = registration.waiting || newWorker;
            maybeShowSwBanner(registration);
          }
        };
      };

      registration.update().catch(() => {});

      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (refreshingByUpdate) window.location.reload();
      });
    })
    .catch((err) => {
      console.error("[sw] registration failed", err);
    });
}

function initChromeNotice() {
  if (!elements.chromeNotice) return;
  const dismissed = localStorage.getItem(CHROME_NOTICE_DISMISSED_KEY) === "1";
  if (dismissed) return;

  const ua = navigator.userAgent;
  const isChrome = /(Chrome|CriOS)/.test(ua) && !/(Edg|OPR|SamsungBrowser)/.test(ua);
  const visits = Number(localStorage.getItem(VISIT_KEY) || "0");

  if (!isChrome || visits <= 1) {
    elements.chromeNotice.classList.remove("hidden");
  }
}

function bindTopNavLinks() {
  const topNav = document.querySelector(".top-nav");
  if (!topNav) return;

  topNav.addEventListener("click", (event) => {
    const link = event.target.closest("a[href^='#']");
    if (!link) return;
    const hash = link.getAttribute("href");
    const target = document.querySelector(hash);
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    history.replaceState(null, "", hash);
  });
}

function bindEvents() {
  if (!elements.dayFilter || !elements.venueFilter || !elements.searchInput || !elements.scheduleList || !elements.savedList) {
    console.error("[ui] Required filter/list elements missing. Check index.html ids.");
  }
  [elements.dayFilter, elements.venueFilter].forEach((el) => {
    el.addEventListener("input", () => {
      renderSchedule();
      renderSaved();
    });
    el.addEventListener("change", () => {
      renderSchedule();
      renderSaved();
    });
  });

  ["input", "search", "keyup", "change"].forEach((eventName) => {
    elements.searchInput.addEventListener(eventName, () => {
      renderSchedule();
      renderSaved();
    });
  });

  elements.nowBtn.addEventListener("click", updateNowCard);

  elements.dayTabs.addEventListener("click", (event) => {
    const button = event.target.closest(".day-tab");
    if (!button) return;
    elements.dayFilter.value = button.dataset.day;
    renderSchedule();
    renderSaved();
  });

  elements.scheduleList.addEventListener("click", (event) => {
    const saveBtn = event.target.closest(".save-btn");
    const tagBtn = event.target.closest("[data-inline-tag]");

    if (tagBtn) {
      event.preventDefault();
      const tag = tagBtn.dataset.inlineTag;
      state.selectedTags.add(tag);
      saveSelectedTags();
      announce(`${tag} filter applied, showing ${getFilteredSessions().length} sessions`);
      renderSchedule();
      return;
    }

    if (!saveBtn) return;
    event.preventDefault();

    const saved = new Set(getSavedIds());
    const id = saveBtn.dataset.id;
    if (saved.has(id)) saved.delete(id);
    else saved.add(id);

    setSavedIds([...saved]);
    renderSchedule();
    renderSaved();
    maybeAskNotifications();
  });

  // Fallback for mobile browsers that can miss delegated clicks during reflows.
  document.addEventListener("click", (event) => {
    if (event.defaultPrevented) return;
    const saveBtn = event.target.closest("#schedule-list .save-btn");
    if (!saveBtn) return;
    event.preventDefault();
    const saved = new Set(getSavedIds());
    const id = saveBtn.dataset.id;
    if (saved.has(id)) saved.delete(id);
    else saved.add(id);
    setSavedIds([...saved]);
    renderSchedule();
    renderSaved();
  });

  elements.savedList.addEventListener("click", (event) => {
    const removeBtn = event.target.closest(".save-btn");
    const calendarBtn = event.target.closest(".calendar-btn");
    const tagBtn = event.target.closest("[data-inline-tag]");

    if (tagBtn) {
      const tag = tagBtn.dataset.inlineTag;
      state.selectedTags.add(tag);
      saveSelectedTags();
      renderSchedule();
      return;
    }

    if (calendarBtn) {
      const id = calendarBtn.dataset.calendarId;
      const session = state.allSessions.find((item) => item.id === id);
      if (session) {
        downloadFile(buildIcsContent([session]), `${session.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.ics`, "text/calendar;charset=utf-8");
      }
      return;
    }

    if (!removeBtn) return;
    const saved = new Set(getSavedIds());
    saved.delete(removeBtn.dataset.id);
    setSavedIds([...saved]);
    renderSchedule();
    renderSaved();
  });

  if (elements.recommendationList) {
    elements.recommendationList.addEventListener("click", (event) => {
      const saveBtn = event.target.closest(".save-btn");
      if (!saveBtn) return;

      const saved = new Set(getSavedIds());
      const id = saveBtn.dataset.id;
      saved.add(id);
      setSavedIds([...saved]);
      renderSchedule();
      renderSaved();
    });
  }

  if (elements.tagFilters) {
    elements.tagFilters.addEventListener("click", (event) => {
      const button = event.target.closest(".tag-filter-btn");
      if (!button || button.disabled) return;

      const tag = button.dataset.tag;
      if (state.selectedTags.has(tag)) state.selectedTags.delete(tag);
      else state.selectedTags.add(tag);

      saveSelectedTags();
      announce(`${tag} filter ${state.selectedTags.has(tag) ? "applied" : "removed"}, showing ${getFilteredSessions().length} sessions`);
      renderSchedule();
      renderSaved();
    });

    elements.tagFilters.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const button = event.target.closest(".tag-filter-btn");
      if (!button) return;
      event.preventDefault();
      button.click();
    });
  }

  if (elements.activeTags) {
    elements.activeTags.addEventListener("click", (event) => {
      const button = event.target.closest("[data-remove-tag]");
      if (!button) return;
      state.selectedTags.delete(button.dataset.removeTag);
      saveSelectedTags();
      renderSchedule();
      renderSaved();
    });
  }

  document.querySelectorAll(".quick-filter").forEach((button) => {
    if (!button.dataset.quick) return;
    button.addEventListener("click", () => {
      const set = QUICK_FILTERS[button.dataset.quick] || [];
      state.selectedTags = new Set(set);
      saveSelectedTags();
      renderSchedule();
      renderSaved();
    });
  });

  if (elements.clearFiltersBtn) {
    elements.clearFiltersBtn.addEventListener("click", () => {
      state.selectedTags.clear();
      elements.dayFilter.value = "";
      elements.venueFilter.value = "";
      elements.searchInput.value = "";
      saveSelectedTags();
      renderSchedule();
      renderSaved();
    });
  }

  if (elements.filterToggleBtn && elements.tagFilterPanel) {
    elements.filterToggleBtn.addEventListener("click", () => {
      const collapsed = elements.tagFilterPanel.classList.toggle("collapsed");
      elements.filterToggleBtn.setAttribute("aria-expanded", String(!collapsed));
    });
  }

  if (elements.savedSort) {
    elements.savedSort.addEventListener("change", () => {
      setSavedSort(elements.savedSort.value);
      renderSaved();
    });
  }

  if (elements.exportIcsBtn) elements.exportIcsBtn.addEventListener("click", exportSavedAsIcs);
  if (elements.exportCsvBtn) elements.exportCsvBtn.addEventListener("click", exportSavedAsCsv);
  if (elements.sharePlanBtn) elements.sharePlanBtn.addEventListener("click", sharePlan);
  if (elements.shareAppBtn) elements.shareAppBtn.addEventListener("click", shareApp);

  elements.travelButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const mode = travelModes[button.dataset.mode];
      if (!mode) return;
      elements.travelTip.className = `travel-tip ${mode.className}`;
      elements.travelTip.innerHTML = `<span class="tip-icon">${mode.icon}</span>${mode.text}`;
    });
  });

  if (elements.lowPowerToggle) {
    elements.lowPowerToggle.addEventListener("click", () => {
      const isOn = document.body.classList.contains("low-power");
      setPowerModeState(!isOn);
    });
  }

  if (elements.a2hsBtn) {
    elements.a2hsBtn.addEventListener("click", async () => {
      if (deferredA2HS) {
        deferredA2HS.prompt();
        try {
          await deferredA2HS.userChoice;
        } catch (err) {
          // ignore
        }
        deferredA2HS = null;
        localStorage.removeItem(A2HS_SNOOZE_UNTIL_KEY);
      }
      hideBanner("a2hs");
    });
  }

  if (elements.a2hsClose) {
    elements.a2hsClose.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      localStorage.setItem(A2HS_DISMISSED_KEY, "true");
      localStorage.setItem(A2HS_SNOOZE_UNTIL_KEY, String(Date.now() + 24 * 60 * 60 * 1000));
      hideBanner("a2hs");
    });
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredA2HS = event;
    if (localStorage.getItem(A2HS_DISMISSED_KEY) === "true") return;

    const snoozeUntil = Number(localStorage.getItem(A2HS_SNOOZE_UNTIL_KEY) || "0");
    if (Date.now() >= snoozeUntil) showBanner("a2hs");
  });

  if (elements.swRefreshBtn) elements.swRefreshBtn.addEventListener("click", forceUpdate);
  if (elements.swRefreshClose) {
    elements.swRefreshClose.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      sessionStorage.setItem(UPDATE_DISMISSED_KEY, "true");
      dismissUpdateBanner();
    });
  }

  if (elements.scrollTopBtn) {
    elements.scrollTopBtn.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  window.addEventListener("scroll", () => {
    if (!elements.scrollTopBtn) return;
    elements.scrollTopBtn.classList.toggle("hidden", window.scrollY <= 280);
  });

  if (elements.chromeNoticeClose && elements.chromeNotice) {
    elements.chromeNoticeClose.addEventListener("click", () => {
      localStorage.setItem(CHROME_NOTICE_DISMISSED_KEY, "1");
      elements.chromeNotice.classList.add("hidden");
    });
  }

}

function initMeta() {
  if (elements.festivalDates) elements.festivalDates.textContent = CONFIG.festivalDates;
  if (elements.savedSort) elements.savedSort.value = getSavedSort();
}

async function init() {
  initMeta();
  initPowerMode();
  initA2HS();
  initChromeNotice();

  state.allSessions = await loadSchedule();
  console.log("[schedule] sessions loaded:", state.allSessions.length);
  console.log("[schedule] first session:", state.allSessions[0] || null);
  if (!state.allSessions.length) {
    console.error("[schedule] Schedule data failed to load.");
  }
  loadSelectedTags();

  renderFilters();
  applyUrlFilters();
  sanitizeSelectedTags();
  if (!hasUrlFilterParams()) {
    state.selectedTags.clear();
    localStorage.removeItem(TAGS_KEY);
  }
  applyPlanFromQuery();

  renderFilters();
  renderTagFilters();
  renderSchedule();
  renderSaved();
  updateNowCard();

  bindTopNavLinks();
  bindEvents();

  setInterval(() => {
    renderSchedule();
    renderSaved();
    updateNowCard();
    maybeNotifyUpcoming();
  }, 60000);

  maybeAskNotifications();
  maybeNotifyUpcoming();
  registerServiceWorker();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
