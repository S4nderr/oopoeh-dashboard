"use strict";

const SIZE_LABEL = "Grootte van de hond";
// "Nieuw" is OOPOEH's eigen statusbadge (recent aangemeld op de site);
// onze eigen eerste-waarneming heet in de UI altijd "✨ Nieuw".
const STATUS_ORDER = [
  "Beschikbaar",
  "Nieuw",
  "Heeft aanvraag lopen",
  "Gematcht (zoekt nog een OOPOEH)",
  "Gematcht",
  "Tijdelijk geen oppas nodig",
];
const STATUS_CLASS = {
  "Beschikbaar": "groen",
  "Nieuw": "blauw",
  "Heeft aanvraag lopen": "oranje",
  "Gematcht (zoekt nog een OOPOEH)": "blauw",
  "Gematcht": "roze",
  "Tijdelijk geen oppas nodig": "grijs",
};
const PLACEHOLDER = "data:image/svg+xml;utf8," + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
     <rect width="128" height="128" fill="#dfe7ee"/>
     <text x="64" y="80" font-size="52" text-anchor="middle">🐾</text>
   </svg>`);

const state = {
  dogs: [],
  activeStatuses: null,   // null = nog niet geïnitialiseerd → alles aan
  activeSizes: null,
  nieuwOnly: false,
  sort: "afstand",
  pollTimer: null,
};

const el = (id) => document.getElementById(id);

function esc(text) {
  const div = document.createElement("div");
  div.textContent = text == null ? "" : String(text);
  return div.innerHTML;
}

function statusClass(status) {
  return STATUS_CLASS[status] || "grijs";
}

function dogSize(dog) {
  return (dog.fields && dog.fields[SIZE_LABEL]) || "Onbekend";
}

function snippet(text, max) {
  if (!text) return "";
  return text.length > max ? text.slice(0, max).trimEnd() + "…" : text;
}

function fmtDateTime(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleString("nl-NL", { dateStyle: "medium", timeStyle: "short" });
}

function ageYears(dog) {
  const m = /^(\d+)/.exec(dog.age_text || "");
  return m ? parseInt(m[1], 10) : 999;
}

/* ---------- data laden ---------- */

async function loadDogs() {
  const snap = await (await fetch("/api/dogs")).json();
  state.dogs = snap.dogs || [];
  const sub = el("subtitle");
  if (snap.postcode) {
    sub.textContent = `Kleine, gecastreerde honden rond ${snap.postcode.toUpperCase()} die met een ander huisdier kunnen`;
  }
  if (snap.scraped_at) {
    el("lastUpdated").textContent = `Laatst bijgewerkt: ${fmtDateTime(snap.scraped_at)}`;
  }
  buildChips();
  render();
}

/* ---------- filterchips ---------- */

function buildChips() {
  const statuses = [...new Set(state.dogs.map((d) => d.status))]
    .sort((a, b) => {
      const ia = STATUS_ORDER.indexOf(a), ib = STATUS_ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  const sizes = [...new Set(state.dogs.map(dogSize))].sort();

  if (state.activeStatuses === null) state.activeStatuses = new Set(statuses);
  else statuses.forEach((s) => { if (![...el("statusChips").children].some((c) => c.dataset.value === s)) state.activeStatuses.add(s); });
  if (state.activeSizes === null) state.activeSizes = new Set(sizes);
  else sizes.forEach((s) => { if (![...el("sizeChips").children].some((c) => c.dataset.value === s)) state.activeSizes.add(s); });

  renderChipGroup(el("statusChips"), statuses, state.activeStatuses);
  renderChipGroup(el("sizeChips"), sizes, state.activeSizes);
}

function renderChipGroup(container, values, activeSet) {
  container.innerHTML = "";
  // een groep met één waarde filtert niets — verberg hem (bv. grootte, nu alles Klein is)
  container.hidden = values.length <= 1;
  if (container.hidden) return;
  for (const value of values) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip" + (activeSet.has(value) ? " chip--actief" : "");
    chip.dataset.value = value;
    chip.textContent = value;
    chip.addEventListener("click", () => {
      if (activeSet.has(value)) activeSet.delete(value);
      else activeSet.add(value);
      chip.classList.toggle("chip--actief");
      render();
    });
    container.appendChild(chip);
  }
}

/* ---------- grid ---------- */

function visibleDogs() {
  let dogs = state.dogs.filter((d) =>
    state.activeStatuses.has(d.status) &&
    state.activeSizes.has(dogSize(d)) &&
    (!state.nieuwOnly || d.is_new));

  const bySort = {
    afstand: (a, b) => (a.distance_km ?? 9e9) - (b.distance_km ?? 9e9),
    nieuw: (a, b) => (b.first_seen || "").localeCompare(a.first_seen || "") ||
                     (a.distance_km ?? 9e9) - (b.distance_km ?? 9e9),
    leeftijd: (a, b) => ageYears(a) - ageYears(b),
    naam: (a, b) => a.name.localeCompare(b.name, "nl"),
  };
  return dogs.sort(bySort[state.sort] || bySort.afstand);
}

function render() {
  const dogs = visibleDogs();
  el("resultCount").textContent = `${dogs.length} van ${state.dogs.length} kandidaten`;
  el("empty").hidden = dogs.length > 0 || state.dogs.length === 0;

  el("grid").innerHTML = dogs.map((dog) => `
    <article class="card" data-id="${esc(dog.id)}">
      ${dog.is_new ? '<span class="badge badge--nieuw">✨ Nieuw</span>' : ""}
      <img class="card__photo" loading="lazy" alt="Foto van ${esc(dog.name)}"
           src="${dog.photo ? "/" + esc(dog.photo) : PLACEHOLDER}"
           onerror="this.onerror=null;this.src='${PLACEHOLDER}'">
      <h2>${esc(dog.name)}</h2>
      <p class="card__agebreed">${esc(dog.age_text)}</p>
      <p class="card__distance">📍 ${esc(dog.place)}${dog.distance_km != null ? ` · ${dog.distance_km.toLocaleString("nl-NL")} km` : ""}</p>
      <span class="badge badge--${statusClass(dog.status)}">${esc(dog.status)}</span>
      <p class="card__desc">${esc(snippet(dog.description, 130))}</p>
    </article>`).join("");

  for (const card of el("grid").children) {
    card.addEventListener("click", () => openModal(card.dataset.id));
  }
}

/* ---------- modal ---------- */

function openModal(id) {
  const dog = state.dogs.find((d) => d.id === id);
  if (!dog) return;

  const rows = Object.entries(dog.fields || {})
    .map(([label, value]) => `<tr><td>${esc(label)}</td><td>${esc(value)}</td></tr>`)
    .join("");

  el("modalBody").innerHTML = `
    <div class="modal__kop">
      <img class="modal__foto" alt="Foto van ${esc(dog.name)}"
           src="${dog.photo ? "/" + esc(dog.photo) : PLACEHOLDER}"
           onerror="this.onerror=null;this.src='${PLACEHOLDER}'">
      <div>
        <h2 id="modalTitle">${esc(dog.name)}</h2>
        <p>${esc(dog.age_text)}</p>
        <p>📍 ${esc(dog.place)}${dog.distance_km != null ? ` · ${dog.distance_km.toLocaleString("nl-NL")} km` : ""} · Baasje ${esc(dog.owner_name)}</p>
        <div class="modal__badges">
          <span class="badge badge--${statusClass(dog.status)}">${esc(dog.status)}</span>
          ${dog.is_new ? '<span class="badge badge--nieuw" style="position:static">✨ Nieuw</span>' : ""}
        </div>
      </div>
    </div>
    ${dog.description ? `<div class="modal__sectie"><h3>Over ${esc(dog.name)}</h3><p>${esc(dog.description)}</p></div>` : ""}
    ${dog.frequency ? `<div class="modal__sectie"><h3>Oppas gezocht</h3><p>${esc(dog.frequency)}</p></div>` : ""}
    ${dog.owner_text ? `<div class="modal__sectie"><h3>Het baasje vertelt</h3><p>${esc(dog.owner_text)}</p></div>` : ""}
    ${rows ? `<div class="modal__sectie"><h3>Eigenschappen</h3><table class="veldtabel">${rows}</table></div>` : ""}
    <div class="modal__acties">
      <a class="modal__link" href="${esc(dog.url)}" target="_blank" rel="noopener">Bekijk op OOPOEH →</a>
    </div>`;
  el("modal").hidden = false;
  document.body.style.overflow = "hidden";
}

function closeModal() {
  el("modal").hidden = true;
  document.body.style.overflow = "";
}

/* ---------- scrape-run & status ---------- */

async function triggerScrape() {
  const response = await fetch("/api/scrape", { method: "POST" });
  if (response.status === 202 || response.status === 409) startPolling();
}

function startPolling() {
  if (state.pollTimer) return;
  poll();
  state.pollTimer = setInterval(poll, 2000);
}

async function poll() {
  let status;
  try {
    status = await (await fetch("/api/status")).json();
  } catch {
    return; // server even onbereikbaar; volgende tick opnieuw
  }
  updateStatusUI(status);
  if (!status.running && state.pollTimer) {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
    await loadDogs();
  }
}

function updateStatusUI(status) {
  el("updateBtn").disabled = status.running;
  el("updateBtn").textContent = status.running ? "Bezig…" : "Update nu";
  el("progress").hidden = !status.running;
  if (status.running) {
    const pct = status.total ? Math.round((status.done / status.total) * 100) : 0;
    el("progressFill").style.width = `${pct}%`;
    el("progressText").textContent = status.total
      ? `${status.phase}: ${status.done}/${status.total}`
      : (status.phase || "starten") + "…";
  }
  el("nextRun").textContent = status.next_run
    ? `Volgende automatische run: ${fmtDateTime(status.next_run)}`
    : "";
  const errEl = el("lastError");
  errEl.hidden = !status.last_error;
  if (status.last_error) errEl.textContent = `Laatste run mislukt: ${status.last_error}`;
}

/* ---------- init ---------- */

el("updateBtn").addEventListener("click", triggerScrape);
el("nieuwOnly").addEventListener("change", (e) => { state.nieuwOnly = e.target.checked; render(); });
el("sortSelect").addEventListener("change", (e) => { state.sort = e.target.value; render(); });
el("modalClose").addEventListener("click", closeModal);
el("modalBackdrop").addEventListener("click", closeModal);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

loadDogs();
poll();          // toont lopende run of eerstvolgende geplande run
startStatusWatch();

function startStatusWatch() {
  // Als de server zelf een run start (nachtelijk schema of eerste vulling)
  // willen we dat ook zien zonder klik: check elke 30s of er iets draait.
  setInterval(async () => {
    if (state.pollTimer) return;
    try {
      const status = await (await fetch("/api/status")).json();
      if (status.running) startPolling();
      else updateStatusUI(status);
    } catch { /* stil */ }
  }, 30000);
}
