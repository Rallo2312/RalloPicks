import datetime
import json
import os
from pathlib import Path

import requests

OUT = Path("data/hr-odds.json")
OUT.parent.mkdir(parents=True, exist_ok=True)

API_KEY = os.environ.get("SPORTSGAMEODDS_API_KEY")
if not API_KEY:
    raise SystemExit("SPORTSGAMEODDS_API_KEY is not set")

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

def american_value(price):
    try:
        return int(str(price).replace("+", ""))
    except Exception:
        return -999999

resp = requests.get(
    URL,
    params={"leagueID": "MLB", "oddsAvailable": "true", "limit": 100},
    headers={"x-api-key": API_KEY},
    timeout=45,
)
resp.raise_for_status()
payload = resp.json()
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
            "fairOdds": odd.get("fairOdds"),
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
rows.sort(key=lambda x: (x.get("startsAt") or "", x.get("playerName") or ""))

OUT.write_text(json.dumps({
    "source": "SportsGameOdds",
    "updatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "league": "MLB",
    "market": "Anytime Home Run",
    "count": len(rows),
    "rows": rows,
}, indent=2), encoding="utf-8")

print(f"Wrote {OUT} with {len(rows)} verified HR price rows")
