# OOPOEH-kandidaten dashboard

Self-hosted dashboard dat elke nacht alle honden rond een postcode van [oopoeh.nl](https://www.oopoeh.nl) verzamelt en alléén de **kandidaten** toont: kleine honden (tot ~10 kg) waarvan het profiel expliciet zegt `Hond kan met ander huisdier: Ja` én `Gecastreerd of gesteriliseerd: Ja`. Ontbrekende of "Onbekend"-waarden vallen af; de criteria staan in `FILTER_LABELS`/`_is_kandidaat` in [app/scraper.py](app/scraper.py).

Kandidaten beoordeel je Tinder-gewijs in de **Beoordelen**-weergave: één profiel tegelijk met alle info, ✕/♥-knoppen, pijltjestoetsen (← nee, → ja) of swipe. Ja = **Favoriet**, nee = **Afgewezen**; beide blijven over scrape-runs heen bewaard en zijn altijd terug te draaien in het **Overzicht** (filter op Favoriet / Onbeoordeeld / Afgewezen). Fotokaarten zoals op de site, met beschikbaarheidsstatus, filters, een detailpaneel en een ✨ Nieuw-badge voor honden die er vorige run nog niet waren.

Zie [CONTEXT.md](CONTEXT.md) voor het begrippenkader (Kandidaat, Snapshot, Nieuw, …).

## Draaien met Dockge

Op de Docker-host (Dockge op Proxmox):

```bash
cd /opt/stacks
git clone <repo-url> oopoeh-dashboard
```

Daarna verschijnt de stack in Dockge → **Deploy**. De image wordt lokaal gebouwd (`build: .`). Dashboard: `http://<host>:8099`.

Bij de eerste start is de snapshot leeg; na ~10 seconden begint automatisch de eerste vulling (± 9 minuten voor ~500 profielen). Daarna elke nacht om `SCRAPE_TIME`, of handmatig via de knop **Update nu**.

### Bijwerken

```bash
cd /opt/stacks/oopoeh-dashboard
git pull
```

Dan in Dockge de stack opnieuw builden/deployen. De data (snapshot, registry, foto's) staat op het named volume `oopoeh_data` en overleeft rebuilds.

## Configuratie (environment)

| Variabele | Default | Betekenis |
|---|---|---|
| `SEARCH_POSTCODE` | `2273vm` | Postcode van het zoekgebied (OOPOEH zoekt in een straal van 20 km) |
| `SCRAPE_TIME` | `03:00` | Tijdstip van de nachtelijke scrape-run (`HH:MM`) |
| `RATE_LIMIT_SECONDS` | `1.0` | Minimale tussenpoos tussen requests |
| `TZ` | `Europe/Amsterdam` | Tijdzone voor schema en logs |
| `DATA_DIR` | `/data` | Opslaglocatie (volume) |

## Scrape-etiquette

Bindend voor dit project: uitsluitend GET-requests op publieke pagina's, maximaal 1 request per seconde, een eerlijke User-Agent met contactadres, foto's worden éénmalig gecachet. Eén nachtelijke run is ± 520 requests. Persoonlijk, niet-commercieel gebruik; de data blijft lokaal.

## Lokaal ontwikkelen

```bash
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
.venv\Scripts\python -m uvicorn main:app --app-dir app --port 8000
```

Data komt dan in `./data/`. Een beperkte testrun zonder alle 25 pagina's te halen:

```bash
curl -X POST http://127.0.0.1:8000/api/scrape -H "Content-Type: application/json" -d "{\"max_pages\": 2}"
```

## API

- `GET /api/dogs` — huidige snapshot (kandidaten + stats; per hond `afgewezen_op`)
- `POST /api/scrape` — start een scrape-run (`409` als er al één draait; optioneel `{"max_pages": n}` voor tests)
- `GET /api/status` — voortgang, laatste fout, volgende geplande run
- `PUT /api/beoordeling/{dog_id}` met `{"oordeel": "ja"|"nee"}` / `DELETE /api/beoordeling/{dog_id}` — beoordeling zetten of wissen; opslag in `beoordelingen.json` op het volume
