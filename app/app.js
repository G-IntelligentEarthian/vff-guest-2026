const CONFIG = {
  festivalDates: "Feb 13–15, 2026",
  // Replace this with your Google Sheet CSV publish URL.
  scheduleCsvUrl: "https://docs.google.com/spreadsheets/d/1Yw24ECctBPCMWJejqsEB41XYBx0d8wJGAl2MNSuCyeI/gviz/tq?tqx=out:csv",
  // Local fallback for testing.
  localScheduleUrl: "schedule_extracted.csv",
  timezone: "Asia/Kolkata",
};

const travelTips = {
  walk: "Best choice. Walk between venues and bring a reusable bottle.",
  bike: "Low impact. Lock points near entrances help reduce clutter.",
  bus: "Good impact. Encourage shared pickup points.",
  train: "Great option for longer travel. Plan last-mile with shuttles.",
  car: "Higher impact. Try to combine trips and park once for the day.",
  carpool: "Good compromise. Aim for 3+ passengers per car.",
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
};

const STORAGE_KEY = "vff_saved_sessions";
const SCHEDULE_CACHE_KEY = "vff_cached_schedule";

function initMeta() {
  if (CONFIG.festivalDates) {
    elements.festivalDates.textContent = CONFIG.festivalDates;
  }
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

    if (char === "\n" && !inQuotes) {
      row.push(current.trim());
      rows.push(row);
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

function normalizeSchedule(data) {
  return data
    .filter((item) => item.day && item.start_time && item.title)
    .map((item) => {
      const normalized = {
        ...item,
        day: item.day.trim(),
        venue: item.venue?.trim() || "",
        title: item.title.trim(),
        speaker: item.speaker?.trim() || "",
        tags: item.tags?.trim() || "",
      };
      normalized.id = [
        normalized.date || "",
        normalized.start_time,
        normalized.venue,
        normalized.title,
        normalized.speaker,
      ]
        .join("|")
        .toLowerCase();
      return normalized;
    })
    .sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time));
}

async function loadSchedule() {
  const tryFetch = async (url) => {
    if (!url) return null;
    const res = await fetch(url);
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
    // Ignore and fall back to local CSV for testing.
  }

  try {
    const fromLocal = await tryFetch(CONFIG.localScheduleUrl);
    if (fromLocal) return fromLocal;
  } catch (err) {
    // Ignore and fall back to minimal default.
  }

  const cached = getCachedSchedule();
  if (cached?.length) return cached;

  return defaultSchedule;
}

function uniqueBy(list, key) {
  return [...new Set(list.map((item) => item[key]).filter(Boolean))];
}

function renderFilters(schedule) {
  const days = uniqueBy(schedule, "day");
  const venues = uniqueBy(schedule, "venue");

  elements.dayFilter.innerHTML = [
    `<option value="">All Days</option>`,
    ...days.map((day) => `<option value="${day}">${day}</option>`),
  ].join("");

  elements.venueFilter.innerHTML = [
    `<option value="">All Venues</option>`,
    ...venues.map((venue) => `<option value="${venue}">${venue}</option>`),
  ].join("");

  elements.dayTabs.innerHTML = days
    .map((day, index) => {
      const active = index === 0 ? "active" : "";
      return `<button class="day-tab ${active}" data-day="${day}">${day}</button>`;
    })
    .join("");

  if (days.length) {
    elements.dayFilter.value = days[0];
  }
}

function matchesSearch(item, query) {
  if (!query) return true;
  const hay = [item.title, item.speaker, item.tags, item.venue].join(" ").toLowerCase();
  return hay.includes(query);
}

function renderSchedule(schedule) {
  const day = elements.dayFilter.value;
  const venue = elements.venueFilter.value;
  const query = elements.searchInput.value.trim().toLowerCase();
  const savedIds = getSavedIds();

  const filtered = schedule.filter((item) => {
    if (day && item.day !== day) return false;
    if (venue && item.venue !== venue) return false;
    return matchesSearch(item, query);
  });

  elements.scheduleList.innerHTML = filtered
    .map(
      (item) => {
        const isSaved = savedIds.includes(item.id);
        return `
      <div class="session">
        <div>
          <div class="session-time">${item.start_time}${item.end_time ? "–" + item.end_time : ""}</div>
          <div class="session-meta">${item.day}${item.date ? " • " + item.date : ""}</div>
          <div class="session-meta">${item.venue || ""}</div>
        </div>
        <div>
          <h3>${item.title}</h3>
          ${item.speaker ? `<div class="session-meta">${item.speaker}</div>` : ""}
          <div class="session-tags">
            ${item.tags
              .split("|")
              .filter(Boolean)
              .map((tag) => `<span class="tag">${tag.trim()}</span>`)
              .join("")}
          </div>
        </div>
        <div class="session-actions">
          <button class="save-btn ${isSaved ? "active" : ""}" data-id="${item.id}">
            ${isSaved ? "Saved" : "Save"}
          </button>
        </div>
      </div>
    `;
      }
    )
    .join("");

  elements.emptyState.classList.toggle("hidden", filtered.length > 0);
}

function renderSaved(schedule) {
  const savedIds = getSavedIds();
  const savedItems = schedule.filter((item) => savedIds.includes(item.id));

  renderSavedNext(savedItems);

  elements.savedList.innerHTML = savedItems
    .map(
      (item) => `
      <div class="session">
        <div>
          <div class="session-time">${item.start_time}${item.end_time ? "–" + item.end_time : ""}</div>
          <div class="session-meta">${item.day}${item.date ? " • " + item.date : ""}</div>
          <div class="session-meta">${item.venue || ""}</div>
        </div>
        <div>
          <h3>${item.title}</h3>
          ${item.speaker ? `<div class="session-meta">${item.speaker}</div>` : ""}
          <div class="session-tags">
            ${item.tags
              .split("|")
              .filter(Boolean)
              .map((tag) => `<span class="tag">${tag.trim()}</span>`)
              .join("")}
          </div>
        </div>
        <div class="session-actions">
          <button class="save-btn active" data-id="${item.id}">Saved</button>
          <button class="calendar-btn" data-calendar-id="${item.id}">Add to Calendar</button>
        </div>
      </div>
    `
    )
    .join("");

  elements.savedEmpty.classList.toggle("hidden", savedItems.length > 0);
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
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  const time = `${get("hour")}:${get("minute")}`;
  return { date, time };
}

function toMinutes(time) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
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
  elements.savedNext.innerHTML = `Next in your plan: <strong>${next.title}</strong> at ${next.start_time} in ${next.venue}`;
  elements.savedNext.classList.remove("hidden");
}

function buildIcs(item) {
  const start = `${item.date.replace(/-/g, "")}T${item.start_time.replace(":", "")}00`;
  let endTime = item.end_time;
  if (!endTime) {
    const hour = Number(item.start_time.slice(0, 2));
    const nextHour = hour >= 23 ? 23 : hour + 1;
    const minutes = item.start_time.slice(3);
    endTime = `${String(nextHour).padStart(2, "0")}:${minutes}`;
    if (hour >= 23) endTime = "23:59";
  }
  const end = `${item.date.replace(/-/g, "")}T${endTime.replace(":", "")}00`;
  const uid = `${item.id}@vff2026`;
  const description = item.speaker ? `Speaker: ${item.speaker}` : "";
  const location = item.venue || "Festival Venue";

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//VFF//Guest Schedule//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTART;TZID=${CONFIG.timezone}:${start}`,
    `DTEND;TZID=${CONFIG.timezone}:${end}`,
    `SUMMARY:${item.title}`,
    `DESCRIPTION:${description}`,
    `LOCATION:${location}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\n");
}

function downloadIcs(item) {
  const ics = buildIcs(item);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${item.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function showNowNext(schedule) {
  const now = getNowInTimezone();
  const today = now.date;
  const currentMinutes = toMinutes(now.time);

  const todaySessions = schedule.filter((item) => item.date === today);
  if (!todaySessions.length) {
    elements.nowCard.innerHTML = "No sessions scheduled for today.";
    elements.nowCard.classList.remove("hidden");
    return;
  }

  const upcoming = todaySessions
    .map((item) => ({
      ...item,
      start: toMinutes(item.start_time),
    }))
    .sort((a, b) => a.start - b.start);

  const next = upcoming.find((item) => item.start >= currentMinutes) || upcoming[0];

  elements.nowCard.innerHTML = `Next up: <strong>${next.title}</strong> at ${next.start_time} in ${next.venue}`;
  elements.nowCard.classList.remove("hidden");
}

function bindEvents(schedule) {
  [elements.dayFilter, elements.venueFilter, elements.searchInput].forEach((el) => {
    el.addEventListener("input", () => renderSchedule(schedule));
  });

  elements.nowBtn.addEventListener("click", () => showNowNext(schedule));

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
    const id = button.dataset.id;
    const saved = new Set(getSavedIds());
    if (saved.has(id)) {
      saved.delete(id);
    } else {
      saved.add(id);
    }
    setSavedIds([...saved]);
    renderSchedule(schedule);
    renderSaved(schedule);
  });

  elements.savedList.addEventListener("click", (event) => {
    const button = event.target.closest(".save-btn");
    if (!button) return;
    if (button.classList.contains("calendar-btn")) return;
    const id = button.dataset.id;
    const saved = new Set(getSavedIds());
    saved.delete(id);
    setSavedIds([...saved]);
    renderSchedule(schedule);
    renderSaved(schedule);
  });

  elements.savedList.addEventListener("click", (event) => {
    const button = event.target.closest(".calendar-btn");
    if (!button) return;
    const id = button.dataset.calendarId;
    const item = schedule.find((session) => session.id === id);
    if (item) downloadIcs(item);
  });

  elements.travelButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const mode = button.dataset.mode;
      elements.travelTip.textContent = travelTips[mode] || "Choose a mode to see tips.";
    });
  });
}

async function init() {
  initMeta();
  const schedule = await loadSchedule();
  renderFilters(schedule);
  renderSchedule(schedule);
  renderSaved(schedule);
  bindEvents(schedule);

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("./sw.js")
      .then((reg) => {
        reg.addEventListener("updatefound", () => {
          const worker = reg.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              window.location.reload();
            }
          });
        });
      })
      .catch(() => {});
  }
}

init();
