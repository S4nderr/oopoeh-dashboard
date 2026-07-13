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
  activeStatuses: null,
  activeSizes: null,
  activeOordelen: new Set(["favoriet", "onbeoordeeld"]),
  nieuwOnly: false,
  sort: "afstand",
  pollTimer: null,
  view: null, // "beoordelen" | "overzicht"; null = nog te bepalen na eerste load
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

function dogOordeel(dog) {
  if (!dog.beoordeling) return "onbeoordeeld";
  return dog.beoordeling.oordeel === "ja" ? "favoriet" : "afgewezen";
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

function photoUrl(dog) {
  return dog.photo ? "/" + esc(dog.photo) : PLACEHOLDER;
}

/* ---------- data laden ---------- */

async function loadDogs() {
  const snap = await (await fetch("/api/dogs")).json();
  state.dogs = snap.dogs || [];
  if (snap.postcode) {
    el("subtitle").textContent =
      `Kleine, gecastreerde honden rond ${snap.postcode.toUpperCase()} die met een ander huisdier kunnen`;
  }
  if (snap.scraped_at) {
    el("lastUpdated").textContent = `Laatst bijgewerkt: ${fmtDateTime(snap.scraped_at)}`;
  }
  if (state.view === null) {
    state.view = state.dogs.some((d) => !d.beoordeling) ? "beoordelen" : "overzicht";
    history.replaceState(null, "", "#" + state.view);
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

  renderChipGroup(el("statusChips"), statuses.map((s) => ({ value: s, label: s })), state.activeStatuses);
  renderChipGroup(el("sizeChips"), sizes.map((s) => ({ value: s, label: s })), state.activeSizes);

  const counts = { favoriet: 0, onbeoordeeld: 0, afgewezen: 0 };
  state.dogs.forEach((d) => counts[dogOordeel(d)]++);
  renderChipGroup(el("oordeelChips"), [
    { value: "favoriet", label: `♥ Favoriet (${counts.favoriet})` },
    { value: "onbeoordeeld", label: `Onbeoordeeld (${counts.onbeoordeeld})` },
    { value: "afgewezen", label: `🚫 Afgewezen (${counts.afgewezen})` },
  ], state.activeOordelen, { verbergBijEen: false });
}

function renderChipGroup(container, items, activeSet, { verbergBijEen = true } = {}) {
  container.innerHTML = "";
  // een groep met één waarde filtert niets — verberg hem (bv. grootte, nu alles Klein is)
  container.hidden = verbergBijEen && items.length <= 1;
  if (container.hidden) return;
  for (const item of items) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip" + (activeSet.has(item.value) ? " chip--actief" : "");
    chip.dataset.value = item.value;
    chip.textContent = item.label;
    chip.addEventListener("click", () => {
      if (activeSet.has(item.value)) activeSet.delete(item.value);
      else activeSet.add(item.value);
      chip.classList.toggle("chip--actief");
      render();
    });
    container.appendChild(chip);
  }
}

/* ---------- filteren & sorteren ---------- */

function filteredDogs() {
  return state.dogs.filter((d) =>
    state.activeStatuses.has(d.status) &&
    state.activeSizes.has(dogSize(d)) &&
    (!state.nieuwOnly || d.is_new));
}

function sortDogs(dogs) {
  const bySort = {
    afstand: (a, b) => (a.distance_km ?? 9e9) - (b.distance_km ?? 9e9),
    nieuw: (a, b) => (b.first_seen || "").localeCompare(a.first_seen || "") ||
                     (a.distance_km ?? 9e9) - (b.distance_km ?? 9e9),
    leeftijd: (a, b) => ageYears(a) - ageYears(b),
    naam: (a, b) => a.name.localeCompare(b.name, "nl"),
  };
  return dogs.sort(bySort[state.sort] || bySort.afstand);
}

function gridDogs() {
  return sortDogs(filteredDogs().filter((d) => state.activeOordelen.has(dogOordeel(d))));
}

function deckDogs() {
  return sortDogs(filteredDogs().filter((d) => !d.beoordeling));
}

/* ---------- gedeelde detail-markup ---------- */

function dogDetailsHtml(dog) {
  const rows = Object.entries(dog.fields || {})
    .map(([label, value]) => `<tr><td>${esc(label)}</td><td>${esc(value)}</td></tr>`)
    .join("");
  return `
    ${dog.description ? `<div class="modal__sectie"><h3>Over ${esc(dog.name)}</h3><p>${esc(dog.description)}</p></div>` : ""}
    ${dog.frequency ? `<div class="modal__sectie"><h3>Oppas gezocht</h3><p>${esc(dog.frequency)}</p></div>` : ""}
    ${dog.owner_text ? `<div class="modal__sectie"><h3>Het baasje vertelt</h3><p>${esc(dog.owner_text)}</p></div>` : ""}
    ${rows ? `<div class="modal__sectie"><h3>Eigenschappen</h3><table class="veldtabel">${rows}</table></div>` : ""}`;
}

function plaatsRegel(dog) {
  return `📍 ${esc(dog.place)}${dog.distance_km != null ? ` · ${dog.distance_km.toLocaleString("nl-NL")} km` : ""} · Baasje ${esc(dog.owner_name)}`;
}

/* ---------- weergaven ---------- */

function render() {
  const inBeoordelen = state.view === "beoordelen";
  el("deckWrap").hidden = !inBeoordelen;
  el("grid").hidden = inBeoordelen;
  el("oordeelChips").style.visibility = inBeoordelen ? "hidden" : "";
  el("resultCount").hidden = inBeoordelen;
  if (inBeoordelen) el("empty").hidden = true;

  el("viewBeoordelen").classList.toggle("views__btn--actief", inBeoordelen);
  el("viewOverzicht").classList.toggle("views__btn--actief", !inBeoordelen);
  el("viewBeoordelen").textContent = `Beoordelen (${deckDogs().length})`;
  el("viewOverzicht").textContent = "Overzicht";

  if (inBeoordelen) renderDeck();
  else renderGrid();
}

function renderGrid() {
  const dogs = gridDogs();
  el("resultCount").textContent = `${dogs.length} van ${state.dogs.length} kandidaten`;
  el("empty").hidden = dogs.length > 0 || state.dogs.length === 0;

  el("grid").innerHTML = dogs.map((dog) => {
    const oordeel = dogOordeel(dog);
    const acties = oordeel === "onbeoordeeld"
      ? `<div class="card__acties">
           <button class="card__mini card__mini--ja" type="button" data-actie="ja" title="Ja, favoriet">♥</button>
           <button class="card__mini card__mini--nee" type="button" data-actie="nee" title="Nee, niet meer tonen">✕</button>
         </div>`
      : `<div class="card__acties">
           <button class="card__mini" type="button" data-actie="wis" title="Beoordeling ongedaan maken">↺</button>
         </div>`;
    const oordeelBadge =
      oordeel === "favoriet" ? '<span class="badge badge--favoriet">♥ Favoriet</span>' :
      oordeel === "afgewezen" ? '<span class="badge badge--grijs">🚫 Afgewezen</span>' : "";
    return `
    <article class="card${oordeel === "afgewezen" ? " card--afgewezen" : ""}" data-id="${esc(dog.id)}">
      ${acties}
      ${dog.is_new ? '<span class="badge badge--nieuw">✨ Nieuw</span>' : ""}
      <img class="card__photo" loading="lazy" alt="Foto van ${esc(dog.name)}"
           src="${photoUrl(dog)}" onerror="this.onerror=null;this.src='${PLACEHOLDER}'">
      <h2>${esc(dog.name)}</h2>
      <p class="card__agebreed">${esc(dog.age_text)}</p>
      <p class="card__distance">📍 ${esc(dog.place)}${dog.distance_km != null ? ` · ${dog.distance_km.toLocaleString("nl-NL")} km` : ""}</p>
      <div class="card__badges">
        <span class="badge badge--${statusClass(dog.status)}">${esc(dog.status)}</span>
        ${oordeelBadge}
      </div>
      <p class="card__desc">${esc(snippet(dog.description, 130))}</p>
    </article>`;
  }).join("");
}

function renderDeck() {
  const dogs = deckDogs();
  const card = el("deckCard");
  const leeg = dogs.length === 0;

  el("deckCounter").textContent = leeg ? "" : `Nog ${dogs.length} te beoordelen`;
  card.hidden = leeg;
  el("deckActies").hidden = leeg;
  el("deckHint").hidden = leeg;
  el("deckLeeg").hidden = !leeg;
  if (leeg) return;

  const dog = dogs[0];
  card.dataset.id = dog.id;
  card.style.transition = "";
  card.style.transform = "";
  card.style.opacity = "";
  card.innerHTML = `
    <div class="deck-card__foto">
      <img src="${photoUrl(dog)}" alt="Foto van ${esc(dog.name)}"
           onerror="this.onerror=null;this.src='${PLACEHOLDER}'" draggable="false">
      <div class="deck-card__fotobadges">
        <span class="badge badge--${statusClass(dog.status)}">${esc(dog.status)}</span>
        ${dog.is_new ? '<span class="badge badge--nieuw" style="position:static">✨ Nieuw</span>' : ""}
      </div>
    </div>
    <div class="deck-card__body">
      <h2>${esc(dog.name)}</h2>
      <p class="deck-card__sub">${esc(dog.age_text)}</p>
      <p class="deck-card__sub">${plaatsRegel(dog)}</p>
      ${dogDetailsHtml(dog)}
    </div>`;
  el("deckLink").href = dog.url;
}

/* ---------- beoordelen ---------- */

let toastTimer = null;
let lastBeoordeeldId = null;
let deckBusy = false;

async function putBeoordeling(id, oordeel) {
  await fetch(`/api/beoordeling/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ oordeel }),
  });
  lastBeoordeeldId = id;
}

async function zetBeoordeling(id, oordeel) {
  const dog = state.dogs.find((d) => d.id === id);
  await putBeoordeling(id, oordeel);
  showToast(oordeel === "ja"
    ? `♥ ${dog ? dog.name : "Hond"} staat bij je favorieten`
    : `${dog ? dog.name : "Hond"} afgewezen — je ziet deze niet meer terug`);
  await loadDogs();
}

async function wisBeoordeling(id) {
  await fetch(`/api/beoordeling/${encodeURIComponent(id)}`, { method: "DELETE" });
  await loadDogs();
}

async function beoordeelDeck(oordeel) {
  if (deckBusy) return;
  const dog = deckDogs()[0];
  if (!dog) return;
  deckBusy = true;
  const card = el("deckCard");
  const put = putBeoordeling(dog.id, oordeel);
  flyOut(card, oordeel);
  await new Promise((r) => setTimeout(r, 240));
  await put;
  showToast(oordeel === "ja"
    ? `♥ ${dog.name} staat bij je favorieten`
    : `${dog.name} afgewezen — je ziet deze niet meer terug`);
  await loadDogs();
  deckBusy = false;
}

function flyOut(card, oordeel) {
  const richting = oordeel === "ja" ? 1 : -1;
  card.style.transition = "transform .24s ease-in, opacity .24s ease-in";
  card.style.transform = `translateX(${richting * 130}%) rotate(${richting * 16}deg)`;
  card.style.opacity = "0";
}

function showToast(text) {
  el("toastText").textContent = text;
  el("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el("toast").hidden = true; }, 8000);
}

/* ---------- swipe op de deck-kaart ---------- */

let drag = null;

function initSwipe() {
  const card = el("deckCard");
  card.addEventListener("pointerdown", (e) => {
    if (deckBusy || e.target.closest("a, button")) return;
    drag = { id: e.pointerId, x0: e.clientX, dx: 0 };
    card.setPointerCapture(e.pointerId);
  });
  card.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag.dx = e.clientX - drag.x0;
    card.style.transition = "none";
    card.style.transform = `translateX(${drag.dx}px) rotate(${drag.dx / 22}deg)`;
  });
  const stop = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = drag.dx;
    drag = null;
    if (dx > 90) beoordeelDeck("ja");
    else if (dx < -90) beoordeelDeck("nee");
    else {
      card.style.transition = "transform .18s";
      card.style.transform = "";
    }
  };
  card.addEventListener("pointerup", stop);
  card.addEventListener("pointercancel", stop);
}

/* ---------- modal ---------- */

function openModal(id) {
  const dog = state.dogs.find((d) => d.id === id);
  if (!dog) return;
  const oordeel = dogOordeel(dog);

  const acties = oordeel === "onbeoordeeld"
    ? `<button class="modal__afwijs" type="button" data-actie="nee">✕ Nee</button>
       <button class="modal__ja" type="button" data-actie="ja">♥ Ja, favoriet</button>`
    : `<button class="modal__afwijs" type="button" data-actie="wis">↺ Beoordeling wissen</button>`;

  el("modalBody").innerHTML = `
    <div class="modal__kop">
      <img class="modal__foto" alt="Foto van ${esc(dog.name)}"
           src="${photoUrl(dog)}" onerror="this.onerror=null;this.src='${PLACEHOLDER}'">
      <div>
        <h2 id="modalTitle">${esc(dog.name)}</h2>
        <p>${esc(dog.age_text)}</p>
        <p>${plaatsRegel(dog)}</p>
        <div class="modal__badges">
          <span class="badge badge--${statusClass(dog.status)}">${esc(dog.status)}</span>
          ${oordeel === "favoriet" ? '<span class="badge badge--favoriet">♥ Favoriet</span>' : ""}
          ${oordeel === "afgewezen" ? '<span class="badge badge--grijs">🚫 Afgewezen</span>' : ""}
          ${dog.is_new ? '<span class="badge badge--nieuw" style="position:static">✨ Nieuw</span>' : ""}
        </div>
      </div>
    </div>
    ${dogDetailsHtml(dog)}
    <div class="modal__acties">
      <div class="modal__acties-links">${acties}</div>
      <a class="modal__link" href="${esc(dog.url)}" target="_blank" rel="noopener">Bekijk op OOPOEH →</a>
    </div>`;

  el("modalBody").querySelectorAll("[data-actie]").forEach((btn) =>
    btn.addEventListener("click", () => {
      closeModal();
      if (btn.dataset.actie === "wis") wisBeoordeling(dog.id);
      else zetBeoordeling(dog.id, btn.dataset.actie);
    }));

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

function setView(view) {
  state.view = view;
  history.replaceState(null, "", "#" + view);
  render();
}

el("viewBeoordelen").addEventListener("click", () => setView("beoordelen"));
el("viewOverzicht").addEventListener("click", () => setView("overzicht"));
window.addEventListener("hashchange", () => {
  const h = location.hash.replace("#", "");
  if ((h === "beoordelen" || h === "overzicht") && h !== state.view) {
    state.view = h;
    render();
  }
});

el("updateBtn").addEventListener("click", triggerScrape);
el("jaBtn").addEventListener("click", () => beoordeelDeck("ja"));
el("neeBtn").addEventListener("click", () => beoordeelDeck("nee"));
el("toastUndo").addEventListener("click", async () => {
  el("toast").hidden = true;
  if (lastBeoordeeldId) {
    await wisBeoordeling(lastBeoordeeldId);
    lastBeoordeeldId = null;
  }
});
el("grid").addEventListener("click", (e) => {
  const card = e.target.closest(".card");
  if (!card) return;
  const actieBtn = e.target.closest("[data-actie]");
  if (!actieBtn) { openModal(card.dataset.id); return; }
  if (actieBtn.dataset.actie === "wis") wisBeoordeling(card.dataset.id);
  else zetBeoordeling(card.dataset.id, actieBtn.dataset.actie);
});
el("nieuwOnly").addEventListener("change", (e) => { state.nieuwOnly = e.target.checked; render(); });
el("sortSelect").addEventListener("change", (e) => { state.sort = e.target.value; render(); });
el("modalClose").addEventListener("click", closeModal);
el("modalBackdrop").addEventListener("click", closeModal);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { closeModal(); return; }
  if (state.view !== "beoordelen" || !el("modal").hidden) return;
  if (e.key === "ArrowLeft") beoordeelDeck("nee");
  if (e.key === "ArrowRight") beoordeelDeck("ja");
});

const hashView = location.hash.replace("#", "");
if (hashView === "beoordelen" || hashView === "overzicht") state.view = hashView;

initSwipe();
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
