import datetime
import json
import os
import time
from pathlib import Path

import requests

OUT = Path("data/hr-odds.json")
OUT.parent.mkdir(parents=True, exist_ok=True)
CACHE = Path(".cache/sportsgameodds-mlb-events.json")

API_KEY = os.environ.get("SPORTSGAMEODDS_API_KEY")
URL = "https://api.sportsgameodds.com/v2/events"
BOOK_LABELS = {
    "draftkings": "DraftKings",
    "fanduel": "FanDuel",
    "betmgm": "BetMGM",
    "caesars": "Caesars",
    "bet365": "bet365",
    "espnbet": "ESPN BET",
    "fanatics": "Fanatics",
    "pinnacle": "Pinnacle",
    "novig": "Novig",
    "prizepicks": "PrizePicks",
    "underdog": "Underdog",
}

def fmt_name(player_id: str) -> str:
    if not player_id:
        return "Unknown"
    parts = player_id.split("_")
    if len(parts) > 2 and parts[-2].isdigit():
        parts = parts[:-2]
    return " ".join(p.capitalize() for p in parts)

def implied_probability(price):
    try:
        p = int(str(price).replace("+", ""))
        return round((100 / (p + 100) if p > 0 else (-p) / ((-p) + 100)) * 100, 2)
    except Exception:
        return None

def american_value(price):
    try:
        return int(str(price).replace("+", ""))
    except Exception:
        return -999999

def backfill_cached_output(reason):
    """Keep the board usable when the provider is rate limited.

    The four new market fields are derived from already saved prices, so they
    can still be published without pretending that the odds timestamp is fresh.
    """
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    try:
        cached = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    except (OSError, json.JSONDecodeError):
        cached = {}
    rows = cached.get("rows") or []
    for row in rows:
        implied = implied_probability(row.get("bestOdds"))
        fair_implied = implied_probability(row.get("fairOdds"))
        row["bestImpliedProbability"] = implied
        row["fairImpliedProbability"] = fair_implied
        row["marketEdgePct"] = round(fair_implied - implied, 2) if implied is not None and fair_implied is not None else None
        row["bookCount"] = len(row.get("books") or [])
    cached.update({
        "source": "SportsGameOdds",
        "league": "MLB",
        "market": "Anytime Home Run",
        "methodology": "Best available book price, implied probability, provider fair probability, and price edge; matchup scoring remains separate.",
        "count": len(rows),
        "refreshStatus": "cached_rate_limited",
        "lastRefreshAttempt": now,
        "refreshError": str(reason),
        "rows": rows,
    })
    OUT.write_text(json.dumps(cached, indent=2), encoding="utf-8")
    print(f"SportsGameOdds refresh unavailable ({reason}); preserved and upgraded {len(rows)} cached HR rows")

def fetch_payload():
    if CACHE.exists():
        cached = json.loads(CACHE.read_text(encoding="utf-8"))
        if cached.get("_fetchError"):
            raise RuntimeError(cached["_fetchError"])
        return cached
    if not API_KEY:
        raise RuntimeError("SPORTSGAMEODDS_API_KEY is not set")
    for attempt in range(3):
        resp = requests.get(
            URL,
            params={"leagueID": "MLB", "oddsAvailable": "true", "limit": 100},
            headers={"x-api-key": API_KEY},
            timeout=45,
        )
        if resp.status_code != 429:
            resp.raise_for_status()
            return resp.json()
        retry_after = resp.headers.get("Retry-After")
        try:
            delay = min(60, max(1, int(float(retry_after))))
        except (TypeError, ValueError):
            delay = 10 * (attempt + 1)
        print(f"SportsGameOdds rate limited; retrying in {delay}s ({attempt + 1}/3)")
        time.sleep(delay)
    raise RuntimeError("SportsGameOdds remained rate limited after 3 attempts")

try:
    payload = fetch_payload()
except Exception as exc:
    backfill_cached_output(exc)
    raise SystemExit(0)
events = payload.get("data") or []

rows = []
for event in events:
    event_id = event.get("eventID")
    starts_at = (event.get("status") or {}).get("startsAt")
    teams = event.get("teams") or {}
    matchup = {
        "away": (((teams.get("away") or {}).get("names") or {}).get("long")),
        "home": (((teams.get("home") or {}).get("names") or {}).get("long")),
    }

    for odd in (event.get("odds") or {}).values():
        if odd.get("statID") != "batting_homeRuns":
            continue
        entity = odd.get("statEntityID") or odd.get("playerID")
        if entity in (None, "all", "home", "away"):
            continue

        side = odd.get("sideID")
        bet_type = odd.get("betTypeID")
        line = odd.get("bookOverUnder") or odd.get("fairOverUnder")

        # Treat yes/no YES or over 0.5 as an anytime-HR market.
        is_anytime = (bet_type == "yn" and side == "yes") or (
            bet_type == "ou" and side == "over" and str(line) in {"0.5", ".5"}
        )
        if not is_anytime:
            continue

        books = []
        for book_id, book in (odd.get("byBookmaker") or {}).items():
            if not book or not book.get("available", True):
                continue
            price = book.get("odds")
            if price is None:
                continue
            book_line = book.get("overUnder")
            if bet_type == "ou" and book_line is not None and str(book_line) not in {"0.5", ".5"}:
                continue
            books.append({
                "book": book_id,
                "bookName": BOOK_LABELS.get(book_id, book_id.replace("_", " ").title()),
                "odds": str(price),
                "line": book_line,
                "lastUpdatedAt": book.get("lastUpdatedAt"),
            })

        if not books:
            continue
        books.sort(key=lambda x: american_value(x["odds"]), reverse=True)
        best = books[0]
        implied = implied_probability(best["odds"])
        fair_implied = implied_probability(odd.get("fairOdds"))
        # Market context only: this is not the Rallo matchup score. It lets the
        # research layer compare best available price with provider fair price.
        market_edge = round(fair_implied - implied, 2) if implied is not None and fair_implied is not None else None
        rows.append({
            "eventID": event_id,
            "startsAt": starts_at,
            "awayTeam": matchup["away"],
            "homeTeam": matchup["home"],
            "playerID": entity,
            "playerName": fmt_name(entity),
            "marketName": odd.get("marketName") or "Anytime Home Run",
            "bestBook": best["book"],
            "bestBookName": best["bookName"],
            "bestOdds": best["odds"],
            "bestImpliedProbability": implied,
            "fairOdds": odd.get("fairOdds"),
            "fairImpliedProbability": fair_implied,
            "marketEdgePct": market_edge,
            "bookCount": len(books),
            "books": books,
        })

# Deduplicate players when the provider exposes both 0.5 O/U and Yes/No
# representations of the same anytime-HR market. Prefer the explicit Yes/No row.
deduped = {}
for row in rows:
    key = (row.get("eventID"), row.get("playerID"))
    current = deduped.get(key)
    row_is_yesno = "Any Home Runs" in str(row.get("marketName") or "")
    current_is_yesno = current and "Any Home Runs" in str(current.get("marketName") or "")
    if current is None or (row_is_yesno and not current_is_yesno):
        deduped[key] = row

rows = list(deduped.values())
# Keep the feed useful for research: strongest positive price edge first when
# fair odds are available, then lower implied HR probability (longer price).
rows.sort(key=lambda x: (-(x.get("marketEdgePct") if x.get("marketEdgePct") is not None else -999),
                         x.get("bestImpliedProbability") if x.get("bestImpliedProbability") is not None else 999,
                         x.get("playerName") or ""))

OUT.write_text(json.dumps({
    "source": "SportsGameOdds",
    "updatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "league": "MLB",
    "market": "Anytime Home Run",
    "methodology": "Best available book price, implied probability, provider fair probability, and price edge; matchup scoring remains separate.",
    "refreshStatus": "fresh",
    "count": len(rows),
    "rows": rows,
}, indent=2), encoding="utf-8")

print(f"Wrote {OUT} with {len(rows)} verified HR price rows")
