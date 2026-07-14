# Backlog / bekende beperkingen

Genoteerd 2026-07-14, nog niet gebouwd:

1. **Favorieten vasthouden bij verdwijning** — verdwijnt een favoriet uit de
   zoekresultaten (profiel weg of buiten de straal), dan verdwijnt hij nu ook
   uit de favorietenlijst. Gewenst: laatst bekende gegevens blijven tonen met
   een "Niet meer op OOPOEH"-stempel tot de beoordeling handmatig gewist wordt.
2. **Meldingen** — geen alerting bij nieuwe kandidaten of bij mislukte/verouderde
   scrapes. Plan: Home Assistant REST-sensoren op `/api/status` en `/api/dogs`
   plus twee automations (nieuwe kandidaat → push; `last_error` gezet of
   `scraped_at` > 2 dagen oud → push).
3. **Backup** — `beoordelingen.json` (handwerk!) staat alleen op het volume
   `oopoeh_data`; meenemen in de Proxmox-backupstrategie.
4. **Mobiel** — responsive gebouwd maar nooit op een echte telefoon getest
   (swipe gebruikt pointer events + `touch-action: pan-y`).
5. **ToS** — oopoeh.nl's algemene voorwaarden zijn nooit gecontroleerd op een
   scraping-clausule (robots.txt stond alles toe; gedrag is 1 req/s, nachtelijk,
   persoonlijk gebruik).
6. **Geen auth** — dashboard is bedoeld voor LAN/VPN; poort 8099 nooit publiek
   forwarden (persoonsgegevens van baasjes + onbeveiligde scrape-knop).
