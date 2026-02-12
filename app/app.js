const CONFIG = {
  festivalDates: "Feb 13–15, 2026",
  scheduleCsvUrl:
    "https://docs.google.com/spreadsheets/d/1Yw24ECctBPCMWJejqsEB41XYBx0d8wJGAl2MNSuCyeI/gviz/tq?tqx=out:csv",
  localScheduleUrl: "schedule_extracted.csv",
  timezone: "Asia/Kolkata",
};

const STORAGE_KEY = "vff_saved_sessions";
const SCHEDULE_CACHE_KEY = "vff_cached_schedule";
const SORT_KEY = "vff_saved_sort";
const NOTIFY_ASKED_KEY = "vff_notify_asked";
const NOTIFY_SENT_KEY = "vff_notify_sent";
const POWER_MODE_KEY = "vff_low_power_mode";
const A2HS_SNOOZE_UNTIL_KEY = "vff_a2hs_snooze_until";
const VISIT_KEY = "vff_visit_count";
const SW_LATER_UNTIL_KEY = "vff_sw_later_until";

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

const defaultSchedule = [
  {
    day: "Friday",
    date: "2026-02-13",
    start_time: "08:30",
    end_time: "09:30",
    venue: "Main Hut",
    title: "Breakfast",
    speaker: "",
    tags: "Food",
    id: "2026-02-13_0830_main-hut_breakfast",
  },
];

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
  swUpdateBanner: document.getElementById("sw-update-banner"),
  swRefreshBtn: document.getElementById("sw-refresh-btn"),
  swRefreshClose: document.getElementById("sw-refresh-close"),
  scrollTopBtn: document.getElementById("scroll-top-btn"),
};

let deferredA2HS = null;
let waitingWorker = null;
let refreshingByUpdate = false;

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

function getSavedIds() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
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

function setSavedSort(sortValue) {
  localStorage.setItem(SORT_KEY, sortValue);
}

function setCachedSchedule(items) {
  try {
    localStorage.setItem(SCHEDULE_CACHE_KEY, JSON.stringify(items));
  } catch (err) {
    // Ignore storage errors.
  }
}

function getCachedSchedule() {
  try {
    const raw = localStorage.getItem(SCHEDULE_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
  }
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
  const [h, m] = (time || "00:00").split(":").map(Number);
  return h * 60 + m;
}

function getSessionEndMinutes(item) {
  if (item.end_time) return toMinutes(item.end_time);
  return Math.min(toMinutes(item.start_time) + 60, 24 * 60 - 1);
}

function normalizeSchedule(data) {
  const token = (value) =>
    String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  return data
    .filter((item) => item.day && item.start_time && item.title)
    .map((item) => {
      const normalized = {
        ...item,
        day: item.day.trim(),
        date: (item.date || "").trim(),
        start_time: (item.start_time || "").trim(),
        end_time: (item.end_time || "").trim(),
        venue: (item.venue || "").trim(),
        title: item.title.trim(),
        speaker: (item.speaker || "").trim(),
        tags: (item.tags || "").trim(),
      };

      normalized.id = [
        token(normalized.date),
        token(normalized.start_time),
        token(normalized.venue),
        token(normalized.title),
        token(normalized.speaker),
      ]
        .filter(Boolean)
        .join("_");

      return normalized;
    })
    .sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time));
}

async function loadSchedule() {
  const tryFetch = async (url) => {
    if (!url) return null;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const text = await res.text();
    const rows = parseCsv(text);
    if (!rows.length) return null;

    const [headerRow, ...dataRows] = rows;
    if (!headerRow || headerRow.length < 3) return null;

    const headers = headerRow.map((h) => h.toLowerCase().trim());
    const items = dataRows.map((row) => {
      const item = {};
      headers.forEach((header, index) => {
        item[header] = row[index] || "";
      });
      return item;
    });

    const normalized = normalizeSchedule(items);
    if (normalized.length) {
      setCachedSchedule(normalized);
      return normalized;
    }
    return null;
  };

  try {
    const fromSheet = await tryFetch(CONFIG.scheduleCsvUrl);
    if (fromSheet) return fromSheet;
  } catch (err) {
    // Fallback below.
  }

  try {
    const fromLocal = await tryFetch(CONFIG.localScheduleUrl);
    if (fromLocal) return fromLocal;
  } catch (err) {
    // Fallback below.
  }

  const cached = getCachedSchedule();
  if (cached?.length) return cached;

  return defaultSchedule;
}

function uniqueBy(list, key) {
  return [...new Set(list.map((item) => item[key]).filter(Boolean))];
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getNowNextIds(schedule) {
  const now = getNowInTimezone();
  const today = now.date;
  const minuteNow = toMinutes(now.time);

  const todaySessions = schedule
    .filter((item) => item.date === today)
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

function renderFilters(schedule) {
  const days = uniqueBy(schedule, "day");
  const venues = uniqueBy(schedule, "venue");

  elements.dayFilter.innerHTML = [
    `<option value="">All Days</option>`,
    ...days.map((day) => `<option value="${escapeHtml(day)}">${escapeHtml(day)}</option>`),
  ].join("");

  elements.venueFilter.innerHTML = [
    `<option value="">All Venues</option>`,
    ...venues.map(
      (venue) => `<option value="${escapeHtml(venue)}">${escapeHtml(venue)}</option>`
    ),
  ].join("");

  elements.dayTabs.innerHTML = days
    .map((day, index) => {
      const active = index === 0 ? "active" : "";
      return `<button class="day-tab ${active}" data-day="${escapeHtml(day)}">${escapeHtml(day)}</button>`;
    })
    .join("");

  if (days.length) elements.dayFilter.value = days[0];
}

function matchesSearch(item, query) {
  if (!query) return true;
  const hay = [item.title, item.speaker, item.tags, item.venue].join(" ").toLowerCase();
  return hay.includes(query);
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
        <div class="session-time">${escapeHtml(item.start_time)}${item.end_time ? "-" + escapeHtml(item.end_time) : ""}</div>
        <div class="session-meta">${escapeHtml(item.day)}${item.date ? " • " + escapeHtml(item.date) : ""}</div>
        <div class="session-meta">${escapeHtml(item.venue || "")}</div>
        ${flag}
      </div>
      <div>
        <h3>${escapeHtml(item.title)}</h3>
        ${item.speaker ? `<div class="session-meta">${escapeHtml(item.speaker)}</div>` : ""}
        <div class="session-tags">
          ${item.tags
            .split("|")
            .filter(Boolean)
            .map((tag) => `<span class="tag">${escapeHtml(tag.trim())}</span>`)
            .join("")}
        </div>
      </div>
      <div class="session-actions">
        <button class="save-btn ${isSaved ? "active" : ""}" data-id="${escapeHtml(item.id)}">${
    isSaved ? "Saved" : "Save"
  }</button>
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

function renderSchedule(schedule) {
  const day = elements.dayFilter.value;
  const venue = elements.venueFilter.value;
  const query = elements.searchInput.value.trim().toLowerCase();
  const savedIds = new Set(getSavedIds());
  const nowNext = getNowNextIds(schedule);

  const filtered = schedule.filter((item) => {
    if (day && item.day !== day) return false;
    if (venue && item.venue !== venue) return false;
    return matchesSearch(item, query);
  });

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

  elements.emptyState.classList.toggle("hidden", filtered.length > 0);
}

function renderSavedNext(savedItems) {
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

function renderSaved(schedule) {
  const savedIds = new Set(getSavedIds());
  const savedItems = getSortedSavedItems(schedule.filter((item) => savedIds.has(item.id)));

  renderSavedNext(savedItems);
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

function buildIcsContent(items) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//VFF//Guest Schedule//EN",
    "CALSCALE:GREGORIAN",
  ];

  items.forEach((item) => {
    const end = item.end_time || "23:59";
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${item.id}@vff2026`);
    lines.push(`DTSTART;TZID=${CONFIG.timezone}:${toIcsDate(item.date, item.start_time)}`);
    lines.push(`DTEND;TZID=${CONFIG.timezone}:${toIcsDate(item.date, end)}`);
    lines.push(`SUMMARY:${item.title}`);
    lines.push(`LOCATION:${item.venue || "Festival Venue"}`);
    lines.push(`DESCRIPTION:${item.speaker ? `Speaker: ${item.speaker}` : "Festival Session"}`);
    lines.push("END:VEVENT");
  });

  lines.push("END:VCALENDAR");
  return lines.join("\n");
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

function exportSavedAsIcs(schedule) {
  const savedIds = new Set(getSavedIds());
  const items = schedule.filter((item) => savedIds.has(item.id));
  if (!items.length) return;
  downloadFile(buildIcsContent(items), "vff-my-plan.ics", "text/calendar;charset=utf-8");
}

function exportSavedAsCsv(schedule) {
  const savedIds = new Set(getSavedIds());
  const items = schedule.filter((item) => savedIds.has(item.id));
  if (!items.length) return;

  const header = "session_name,time,venue,day";
  const rows = items.map((item) => {
    const time = `${item.start_time}${item.end_time ? `-${item.end_time}` : ""}`;
    return [item.title, time, item.venue, item.day]
      .map((value) => `"${String(value).replace(/\"/g, '""')}"`)
      .join(",");
  });

  downloadFile([header, ...rows].join("\n"), "vff-my-plan.csv", "text/csv;charset=utf-8");
}

function getPlanUrl() {
  const ids = getSavedIds();
  const params = new URLSearchParams(window.location.search);
  if (!ids.length) {
    params.delete("plan");
  } else {
    params.set("plan", ids.map((id) => encodeURIComponent(id)).join(","));
  }
  return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
}

async function sharePlan() {
  const url = getPlanUrl();
  if (navigator.share) {
    try {
      await navigator.share({ title: "My VFF Plan", text: "My saved sessions", url });
      return;
    } catch (err) {
      // Fallback below.
    }
  }
  await navigator.clipboard.writeText(url);
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

function applyPlanFromQuery(schedule) {
  const params = new URLSearchParams(window.location.search);
  const encoded = params.get("plan");
  if (!encoded) return;

  const rawIds = encoded.split(",").map((part) => {
    try {
      return decodeURIComponent(part);
    } catch (err) {
      return part;
    }
  });

  const valid = new Set(schedule.map((item) => item.id));
  const filtered = rawIds.filter((id) => valid.has(id));
  if (filtered.length) setSavedIds([...new Set(filtered)]);
}

function maybeAskNotifications() {
  const hasSaved = getSavedIds().length > 0;
  const asked = localStorage.getItem(NOTIFY_ASKED_KEY) === "1";
  if (!hasSaved || asked || !("Notification" in window)) return;

  localStorage.setItem(NOTIFY_ASKED_KEY, "1");
  Notification.requestPermission();
}

function maybeNotifyUpcoming(schedule) {
  if (document.hidden) return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;

  const savedIds = new Set(getSavedIds());
  if (!savedIds.size) return;

  const now = getNowInTimezone();
  const nowMinutes = toMinutes(now.time);
  const todaySaved = schedule.filter((item) => savedIds.has(item.id) && item.date === now.date);

  const sentMap = (() => {
    try {
      return JSON.parse(localStorage.getItem(NOTIFY_SENT_KEY) || "{}");
    } catch (err) {
      return {};
    }
  })();

  let updated = false;
  todaySaved.forEach((item) => {
    const start = toMinutes(item.start_time);
    const diff = start - nowMinutes;
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

function updateNowCard(schedule) {
  const nowNext = getNowNextIds(schedule);
  const nowItem = schedule.find((item) => item.id === nowNext.nowId);
  const nextItem = schedule.find((item) => item.id === nowNext.nextId);

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
  elements.lowPowerToggle.textContent = isOn ? "Low Power Mode On 🌙" : "Low Power Mode 🌙";
}

function initPowerMode() {
  const stored = localStorage.getItem(POWER_MODE_KEY);
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const isOn = stored ? stored === "1" : prefersDark;
  setPowerModeState(isOn);
}

function initA2HS() {
  const visitCount = Number(localStorage.getItem(VISIT_KEY) || "0") + 1;
  localStorage.setItem(VISIT_KEY, String(visitCount));

  const snoozeUntil = Number(localStorage.getItem(A2HS_SNOOZE_UNTIL_KEY) || "0");
  const snoozed = Date.now() < snoozeUntil;
  const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;

  if (standalone || snoozed) return;

  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
    elements.a2hsBtn.classList.add("hidden");
    elements.a2hsText.textContent =
      "On iPhone/iPad: tap Share, then 'Add to Home Screen' for offline access 🌿";
  } else {
    elements.a2hsBtn.classList.remove("hidden");
    elements.a2hsText.textContent = "Add this app to your home screen for offline access 🌿";
  }

  const maybeShow = () => {
    if (deferredA2HS || /iphone|ipad|ipod/i.test(navigator.userAgent)) {
      elements.a2hsBanner.classList.remove("hidden");
    }
  };

  if (visitCount >= 3) maybeShow();
  setTimeout(maybeShow, 30000);
}

function initMeta() {
  elements.festivalDates.textContent = CONFIG.festivalDates;
  elements.savedSort.value = getSavedSort();
}

function maybeShowSwBanner(registration) {
  const laterUntil = Number(localStorage.getItem(SW_LATER_UNTIL_KEY) || "0");
  if (Date.now() < laterUntil) return;

  waitingWorker = registration.waiting || waitingWorker;
  if (waitingWorker) {
    elements.swUpdateBanner.classList.remove("hidden");
  }
}

function trackInstallingWorker(registration) {
  if (!registration) return;
  registration.addEventListener("updatefound", () => {
    const newWorker = registration.installing;
    if (!newWorker) return;
    newWorker.addEventListener("statechange", () => {
      if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
        waitingWorker = newWorker;
        maybeShowSwBanner(registration);
      }
    });
  });
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  navigator.serviceWorker
    .register("./sw.js")
    .then((registration) => {
      maybeShowSwBanner(registration);
      trackInstallingWorker(registration);
      registration.update().catch(() => {});

      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (refreshingByUpdate) {
          window.location.reload();
        }
      });
    })
    .catch(() => {});
}

function bindEvents(schedule) {
  [elements.dayFilter, elements.venueFilter, elements.searchInput].forEach((el) => {
    el.addEventListener("input", () => renderSchedule(schedule));
  });

  elements.nowBtn.addEventListener("click", () => updateNowCard(schedule));

  elements.dayTabs.addEventListener("click", (event) => {
    const button = event.target.closest(".day-tab");
    if (!button) return;
    const day = button.dataset.day;
    elements.dayFilter.value = day;
    elements.dayTabs.querySelectorAll(".day-tab").forEach((tab) => {
      tab.classList.toggle("active", tab === button);
    });
    renderSchedule(schedule);
  });

  elements.scheduleList.addEventListener("click", (event) => {
    const button = event.target.closest(".save-btn");
    if (!button) return;

    const saved = new Set(getSavedIds());
    const id = button.dataset.id;

    if (saved.has(id)) saved.delete(id);
    else saved.add(id);

    setSavedIds([...saved]);
    renderSchedule(schedule);
    renderSaved(schedule);
    maybeAskNotifications();
  });

  elements.savedList.addEventListener("click", (event) => {
    const removeButton = event.target.closest(".save-btn");
    const calendarButton = event.target.closest(".calendar-btn");

    if (calendarButton) {
      const id = calendarButton.dataset.calendarId;
      const item = schedule.find((s) => s.id === id);
      if (item) downloadFile(buildIcsContent([item]), `${item.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.ics`, "text/calendar;charset=utf-8");
      return;
    }

    if (!removeButton) return;

    const id = removeButton.dataset.id;
    const saved = new Set(getSavedIds());
    saved.delete(id);
    setSavedIds([...saved]);
    renderSchedule(schedule);
    renderSaved(schedule);
  });

  elements.savedSort.addEventListener("change", () => {
    setSavedSort(elements.savedSort.value);
    renderSaved(schedule);
  });

  elements.exportIcsBtn.addEventListener("click", () => exportSavedAsIcs(schedule));
  elements.exportCsvBtn.addEventListener("click", () => exportSavedAsCsv(schedule));
  elements.sharePlanBtn.addEventListener("click", sharePlan);
  elements.shareAppBtn.addEventListener("click", shareApp);

  elements.travelButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const mode = travelModes[button.dataset.mode];
      if (!mode) return;
      elements.travelTip.className = `travel-tip ${mode.className}`;
      elements.travelTip.innerHTML = `<span class="tip-icon">${mode.icon}</span>${mode.text}`;
    });
  });

  elements.lowPowerToggle.addEventListener("click", () => {
    const enabled = document.body.classList.contains("low-power");
    setPowerModeState(!enabled);
  });

  elements.a2hsBtn.addEventListener("click", async () => {
    if (deferredA2HS) {
      deferredA2HS.prompt();
      try {
        await deferredA2HS.userChoice;
      } catch (err) {
        // Ignore.
      }
      deferredA2HS = null;
      localStorage.removeItem(A2HS_SNOOZE_UNTIL_KEY);
    }
    elements.a2hsBanner.classList.add("hidden");
  });

  elements.a2hsClose.addEventListener("click", () => {
    localStorage.setItem(A2HS_SNOOZE_UNTIL_KEY, String(Date.now() + 24 * 60 * 60 * 1000));
    elements.a2hsBanner.classList.add("hidden");
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredA2HS = event;
    const snoozeUntil = Number(localStorage.getItem(A2HS_SNOOZE_UNTIL_KEY) || "0");
    if (Date.now() >= snoozeUntil) {
      elements.a2hsBanner.classList.remove("hidden");
    }
  });

  window.addEventListener("scroll", () => {
    const show = window.scrollY > 280;
    elements.scrollTopBtn.classList.toggle("hidden", !show);
  });

  elements.scrollTopBtn.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  elements.swRefreshBtn.addEventListener("click", () => {
    if (waitingWorker) {
      refreshingByUpdate = true;
      waitingWorker.postMessage({ type: "SKIP_WAITING" });
    }
  });

  elements.swRefreshClose.addEventListener("click", () => {
    localStorage.setItem(SW_LATER_UNTIL_KEY, String(Date.now() + 2 * 60 * 60 * 1000));
    elements.swUpdateBanner.classList.add("hidden");
  });
}

async function init() {
  initMeta();
  initPowerMode();
  initA2HS();

  const schedule = await loadSchedule();
  applyPlanFromQuery(schedule);

  renderFilters(schedule);
  renderSchedule(schedule);
  renderSaved(schedule);
  updateNowCard(schedule);
  bindEvents(schedule);

  setInterval(() => {
    renderSchedule(schedule);
    renderSaved(schedule);
    updateNowCard(schedule);
    maybeNotifyUpcoming(schedule);
  }, 60000);

  maybeAskNotifications();
  maybeNotifyUpcoming(schedule);
  registerServiceWorker();
}

init();
