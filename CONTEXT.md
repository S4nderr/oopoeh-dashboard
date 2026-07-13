# OOPOEH Kandidaten-dashboard

Self-hosted dashboard that continuously collects dogs from OOPOEH around postcode 2273VM and shows only the ones that can live with another pet, so Sander can spot suitable dogs at a glance.

## Language

**Kandidaat**:
A dog whose OOPOEH profile explicitly states "Hond kan met ander huisdier: Ja" and "Gecastreerd of gesteriliseerd: Ja" and whose Grootte is Klein (tot ~10 kg). Only kandidaten appear on the dashboard; an absent or "Onbekend" value disqualifies just like "Nee".
_Avoid_: match, hit (collides with OOPOEH's own "Gematcht")

**Hondenprofiel**:
OOPOEH's public page for one baasje, containing one or more dogs. A dog's identity throughout this project is the numeric profile-id plus the dog's name, since multi-dog baasjes share one page.
_Avoid_: baasjesprofiel

**Baasje**:
The owner who registered the dog on OOPOEH. Shown on a card for context, but not an entity we track.

**Beschikbaarheidsstatus**:
The state OOPOEH shows on a result card: Gematcht, Gematcht (zoekt nog een OOPOEH), Heeft aanvraag lopen, Tijdelijk geen oppas nodig, Nieuw (OOPOEH's own badge for a recent registration), or Beschikbaar (our name for a card with no badge). Never a reason to exclude a kandidaat — only to inform.
_Avoid_: match status

**Zoekgebied**:
The population we collect: all dogs OOPOEH returns for postcode 2273VM within its 20 km radius.

**Scrape-run**:
One full traversal of the zoekgebied (every listing page, every dog's hondenprofiel) that produces a new snapshot. Started by the nightly schedule or the dashboard's "Update nu" button; never two at once.

**Snapshot**:
The complete current set of kandidaten the dashboard serves. A successful scrape-run replaces it wholesale; a failed run leaves the previous snapshot untouched.
_Avoid_: dump, export

**First-seen registry**:
Persistent record of when each profile-id was first observed, kept even after a dog disappears — so a returning dog is not Nieuw again.

**Nieuw**:
A kandidaat first observed by the collector within the last 7 days; always written "✨ Nieuw" in the UI. Distinct from OOPOEH's own "Nieuw" beschikbaarheidsstatus, which means recently registered on the site.

**Beoordeling**:
Sander's verdict on a kandidaat, given one dog at a time in the beoordeel-view (or on a card): Ja or Nee. Persistent across scrape-runs until explicitly withdrawn.
_Avoid_: swipe, like

**Favoriet**:
A kandidaat beoordeeld with Ja — the shortlist of dogs worth contacting.
_Avoid_: match (collides with OOPOEH's "Gematcht")

**Afgewezen**:
A kandidaat beoordeeld with Nee. Hidden from the dashboard by default — across scrape-runs — until the beoordeling is withdrawn. Sander's decision, unlike Verdwenen, which is the site's doing.
_Avoid_: gezien, verborgen

**Onbeoordeeld**:
A kandidaat without beoordeling; exactly these are served, nearest first, by the beoordeel-view.

**Verdwenen**:
A dog present in the first-seen registry but absent from the latest snapshot (profile removed or outside the zoekgebied). Not displayed; its history is retained.
