# Design: "Hondenpaspoort"

Het dashboard is vormgegeven als het EU-dierenpaspoort dat elke Nederlandse hond heeft:
een diepblauwe kaft met goudfolie, daaronder papieren dossiers op een bureau, en
oordelen die als inktstempels op het dossier neerslaan. Eén gedurfd element — het
stempelmoment — de rest blijft stil papier.

## Tokens

| Token | Waarde | Rol |
|---|---|---|
| `--paspoort` | `#17304F` | kaft/header, actieve chips, linkknop |
| `--paspoort-diep` | `#0F2238` | kaft-verloop, toast |
| `--goud` / `--goud-licht` | `#C9A227` / `#E3C868` | folie: embleem, Update-knop, NIEUW-label, voortgang |
| `--papier` | `#FBF9F4` | kaarten/dossiers |
| `--bureau` | `#DFE3E8` | paginaondergrond |
| `--inkt` / `--inkt-zacht` | `#26313B` / `#5D6B77` | tekst |
| `--stempel-ja` | `#2E7D4F` | JA/Favoriet-inkt |
| `--stempel-nee` | `#A63A2B` | NEE/Afgewezen-inkt |
| `--stempel-blauw` / `--stempel-oker` | `#2C5F8A` / `#96660F` | status-inkten |

## Typografie

- **Bricolage Grotesque** (600–800) — display: hondennamen, koppen. Met mate.
- **Instrument Sans** (400–600) — lopende tekst en UI.
- **Spline Sans Mono** (400–600) — documentstem: veldlabels, eyebrows, chips, datums, MRZ.

## Signatuur

1. **De stempel**: bij ja/nee slaat een ronde inktstempel (FAVORIET/AFGEWEZEN) schuin op
   het dossier (`@keyframes stempelen`), daarna vliegt de kaart weg. Beoordeelde kaarten
   in het overzicht dragen een klein gestempeld merk over de pasfotohoek.
2. **De MRZ-strook** onderaan elk dossier — machine-leesbare regels opgebouwd uit echte
   data (`P<NLD<MOCHI<<KANDIDAAT…`), zoals in een echt paspoort.

## Vormtaal

- Foto's zijn **pasfoto's**: 4:5 in een wit kader met potloodrand — geen cirkels.
- Statussen zijn **inkt-omrande stempeltjes** (mono, uppercase), geen gevulde snoeppillen.
- Chips zijn **archieflabels**: rechthoekig, mono, uppercase.
- Weergave-tabs zitten als **tabbladen op de kaftrand** en lopen door in het bureau.
- Scheidingen op papier: **gestippelde/gestreepte potloodlijnen**, geen harde borders.

## Bewaakte grenzen

- Goud alleen als folie-accent (embleem, primaire knop, NIEUW, voortgang) — nooit als vlak.
- Reduced motion: stempel verschijnt statisch, kaarten vliegen niet.
- Fonts via Google Fonts met systeem-fallbacks; de app blijft bruikbaar zonder netwerk.

## Geprobeerd / verworpen

- Cirkelfoto's zoals oopoeh.nl zelf: te generiek naast de paspoortmetafoor.
- Delfts-blauwe tegeltjes en polaroids: gimmick, schaalde niet naar een data-UI.
- Kleurgevulde statusbadges: te veel snoep naast de stempelinkten.
