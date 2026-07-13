"""Scrape-run: doorloopt het zoekgebied en bouwt een nieuwe snapshot van kandidaten.

Etiquette (bindend): uitsluitend GET, hoogstens 1 request per RATE_LIMIT_SECONDS,
eerlijke User-Agent, foto's worden eenmalig lokaal gecachet.
"""
import os
import re
import time
from datetime import date, datetime, timedelta, timezone
from urllib.parse import urljoin

import httpx
from bs4 import BeautifulSoup

import store

BASE_URL = "https://www.oopoeh.nl"
USER_AGENT = "oopoeh-dashboard/1.0 (persoonlijk gebruik; sandertkruis@gmail.com)"
NIEUW_DAYS = 7

# Kandidaat-criteria: alle drie vereist; ontbrekend of "Onbekend" telt als nee.
FILTER_LABELS = (
    "Hond kan met ander huisdier",
    "Gecastreerd of gesteriliseerd",
    "Grootte van de hond",
)


def _is_kandidaat(fields):
    return (
        fields.get("Hond kan met ander huisdier") == "Ja"
        and fields.get("Gecastreerd of gesteriliseerd") == "Ja"
        # prefix-match zodat een herformulering van "(tot ~10 kg)" niet breekt
        and fields.get("Grootte van de hond", "").startswith("Klein")
    )


class ScrapeError(RuntimeError):
    pass


def _clean(text):
    return re.sub(r"\s+", " ", text or "").strip()


def _slug(text):
    return re.sub(r"[^a-z0-9]+", "-", _clean(text).lower()).strip("-") or "hond"


def _soup(html):
    return BeautifulSoup(html, "html.parser")


class Fetcher:
    """GET met vaste tussenpoos en één retry bij 5xx/netwerkfout."""

    def __init__(self):
        self.rate = float(os.environ.get("RATE_LIMIT_SECONDS", "1.0"))
        self.client = httpx.Client(
            headers={"User-Agent": USER_AGENT}, timeout=30, follow_redirects=True
        )
        self._last = 0.0

    def get(self, url):
        response = None
        for attempt in (1, 2):
            wait = self.rate - (time.monotonic() - self._last)
            if wait > 0:
                time.sleep(wait)
            self._last = time.monotonic()
            try:
                response = self.client.get(url)
                if response.status_code < 500:
                    return response
            except httpx.HTTPError:
                if attempt == 2:
                    raise
            time.sleep(5)
        return response

    def close(self):
        self.client.close()


def parse_distance(text):
    match = re.match(r"(.*)\((\d+(?:[.,]\d+)?)\s*km\)", text)
    if not match:
        return _clean(text), None
    return _clean(match.group(1)), float(match.group(2).replace(",", "."))


def parse_listing(html):
    soup = _soup(html)
    cards = []
    for art in soup.select("article.search-results__result--pet"):
        link = art.select_one("a[href*='/profiel/baasje/']")
        match = re.search(r"/profiel/baasje/(\d+)", link.get("href", "") if link else "")
        h2 = art.select_one(".search-result__info h2")
        if not match or not h2:
            continue
        badge = h2.select_one(".op-status-label")
        status = _clean(badge.get_text()) if badge else "Beschikbaar"
        if badge:
            badge.extract()
        h3 = art.select_one(".search-result__info h3")
        dist_el = art.select_one(".search-result__distance")
        place, distance_km = parse_distance(_clean(dist_el.get_text()) if dist_el else "")
        img = art.select_one("a.search-result__image img")
        owner_el = art.select_one(".search-result__profile-image p")
        cards.append({
            "profile_id": match.group(1),
            "name": _clean(h2.get_text()),
            "status": status,
            "age_text": _clean(h3.get_text()) if h3 else "",
            "place": place,
            "distance_km": distance_km,
            "photo_src": img.get("src") if img else None,
            "owner_name": re.sub(r"^Baasje\s+", "", _clean(owner_el.get_text())) if owner_el else "",
        })

    total_results = None
    for h1 in soup.find_all("h1"):
        found = re.search(r"(\d+)\s+zoekresultaten", h1.get_text())
        if found:
            total_results = int(found.group(1))
            break

    page_numbers = [
        int(a.get_text()) for a in soup.select("ul.pagination a.page-link")
        if a.get_text().strip().isdigit()
    ]
    next_link = soup.select_one("ul.pagination a[rel='next']")
    return {
        "cards": cards,
        "total_results": total_results,
        "max_page": max(page_numbers) if page_numbers else 1,
        "next_url": urljoin(BASE_URL, next_link["href"]) if next_link else None,
    }


def parse_profile(html):
    soup = _soup(html)
    city_el = soup.select_one(".profile-details__city")
    personal = soup.select_one(".profile-details__personal")
    owner_text = frequency = ""
    if personal:
        p = personal.find("p")
        owner_text = _clean(p.get_text()) if p else ""
        freq_el = personal.select_one(".profile-details__frequency")
        frequency = _clean(freq_el.get_text()) if freq_el else ""

    pets = []
    for section in soup.select("section.pet-details"):
        name_el = section.select_one(".pet-details__name")
        age_el = section.select_one(".pet-details__age")
        desc_el = section.select_one(".pet-details__info p")
        img_el = section.select_one("img.pet-details__image")
        fields = {}
        for li in section.select(".profile-details__prefs li"):
            label_el, value_el = li.find("strong"), li.find("span")
            if label_el and value_el:
                fields[_clean(label_el.get_text())] = _clean(value_el.get_text())
        pets.append({
            "name": _clean(name_el.get_text()) if name_el else "",
            "age_text": _clean(age_el.get_text()) if age_el else "",
            "description": _clean(desc_el.get_text()) if desc_el else "",
            "photo_src": img_el.get("src") if img_el else None,
            "fields": fields,
        })
    return {
        "city": _clean(city_el.get_text()) if city_el else "",
        "owner_text": owner_text,
        "frequency": frequency,
        "pets": pets,
    }


def _match_pet(profile, card_name):
    pets = profile["pets"]
    target = _clean(card_name).casefold()
    for pet in pets:
        if _clean(pet["name"]).casefold() == target:
            return pet
    if len(pets) == 1:
        return pets[0]
    return None


def _cache_photo(fetcher, url):
    """Eén foto naar de cache; elke fout levert None op en breekt nooit de run."""
    if not url:
        return None
    url = urljoin(BASE_URL, url)
    if not url.startswith(("http://", "https://")):
        return None
    filename = os.path.basename(url.split("?")[0])
    if not filename:
        return None
    dest = os.path.join(store.PHOTOS_DIR, filename)
    if not os.path.exists(dest):
        try:
            response = fetcher.get(url)
        except httpx.HTTPError:
            return None
        if response is None or response.status_code != 200 or not response.content:
            return None
        with open(dest, "wb") as f:
            f.write(response.content)
    return f"photos/{filename}"


def run(progress, max_pages=None):
    """Volledige scrape-run; schrijft snapshot atomair en geeft stats terug."""
    postcode = os.environ.get("SEARCH_POSTCODE", "2273vm").lower()
    started = time.monotonic()
    fetcher = Fetcher()
    try:
        cards = []
        total_results = None
        url = f"{BASE_URL}/zoeken/huisdier/{postcode}"
        page = 1
        expected_pages = max_pages
        while url:
            response = fetcher.get(url)
            if response is None or response.status_code != 200:
                code = response.status_code if response is not None else "geen antwoord"
                raise ScrapeError(f"Zoekpagina {page} gaf {code}; run afgebroken, oude snapshot blijft staan")
            listing = parse_listing(response.text)
            cards.extend(listing["cards"])
            total_results = listing["total_results"] or total_results
            expected_pages = min(listing["max_page"], max_pages) if max_pages else listing["max_page"]
            progress("zoekpagina's", page, expected_pages)
            if max_pages and page >= max_pages:
                break
            url = listing["next_url"]
            page += 1

        profiles = {}
        profile_errors = 0
        unique_ids = list(dict.fromkeys(card["profile_id"] for card in cards))
        for i, profile_id in enumerate(unique_ids, 1):
            try:
                response = fetcher.get(f"{BASE_URL}/profiel/baasje/{profile_id}")
            except httpx.HTTPError:
                response = None
            if response is not None and response.status_code == 200:
                profiles[profile_id] = parse_profile(response.text)
            else:
                profile_errors += 1
            progress("hondenprofielen", i, len(unique_ids))

        dogs = []
        filter_stats = {label: {} for label in FILTER_LABELS}
        for card in cards:
            profile = profiles.get(card["profile_id"])
            pet = _match_pet(profile, card["name"]) if profile else None
            fields = pet["fields"] if pet else {}
            for label in FILTER_LABELS:
                value = fields.get(label, "— ontbreekt —")
                filter_stats[label][value] = filter_stats[label].get(value, 0) + 1
            if not _is_kandidaat(fields):
                continue
            dogs.append({
                "id": f"{card['profile_id']}-{_slug(card['name'])}",
                "profile_id": card["profile_id"],
                "name": card["name"],
                "url": f"{BASE_URL}/profiel/baasje/{card['profile_id']}",
                "status": card["status"],
                "place": card["place"],
                "distance_km": card["distance_km"],
                "age_text": (pet and pet["age_text"]) or card["age_text"],
                "description": (pet and pet["description"]) or "",
                "fields": fields,
                "owner_name": card["owner_name"],
                "city": profile["city"],
                "frequency": profile["frequency"],
                "owner_text": profile["owner_text"],
                "photo_src": (pet and pet["photo_src"]) or card["photo_src"],
            })

        for i, dog in enumerate(dogs, 1):
            dog["photo"] = _cache_photo(fetcher, dog["photo_src"])
            progress("foto's", i, len(dogs))

        registry = store.update_registry([dog["id"] for dog in dogs])
        cutoff = (date.today() - timedelta(days=NIEUW_DAYS)).isoformat()
        for dog in dogs:
            entry = registry["dogs"][dog["id"]]
            dog["first_seen"] = entry["first_seen"]
            dog["is_new"] = (
                entry["first_seen"] > registry["initialized"]
                and entry["first_seen"] >= cutoff
            )

        stats = {
            "total_results": total_results,
            "cards_seen": len(cards),
            "profiles_fetched": len(profiles),
            "profile_errors": profile_errors,
            "kandidaten": len(dogs),
            "filters": filter_stats,
            "duur_seconden": round(time.monotonic() - started),
        }
        store.save_snapshot({
            "scraped_at": datetime.now(timezone.utc).isoformat(),
            "postcode": postcode,
            "dogs": dogs,
            "stats": stats,
        })
        return stats
    finally:
        fetcher.close()
