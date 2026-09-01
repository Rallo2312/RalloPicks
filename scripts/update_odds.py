import json, os, datetime, requests
from pathlib import Path

OUT = Path("data/odds.json")
OUT.parent.mkdir(parents=True, exist_ok=True)
key = os.environ.get("ODDS_API_KEY")
if not key:
    raise SystemExit("ODDS_API_KEY is not set")

url = "https://api.the-odds-api.com/v4/sports/baseball_mlb/odds/"
params = {
    "apiKey": key,
    "regions": "us",
    "markets": "h2h,totals",
    "oddsFormat": "american",
    "dateFormat": "iso",
}
r = requests.get(url, params=params, timeout=30)
r.raise_for_status()
games = r.json()

rows = []
for g in games:
    item = {
        "id": g.get("id"),
        "commence_time": g.get("commence_time"),
        "home_team": g.get("home_team"),
        "away_team": g.get("away_team"),
        "books": [],
    }
    for b in g.get("bookmakers", []):
        book = {"key": b.get("key"), "title": b.get("title"), "markets": {}}
        for m in b.get("markets", []):
            book["markets"][m.get("key")] = m.get("outcomes", [])
        item["books"].append(book)
    rows.append(item)

OUT.write_text(json.dumps({
    "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "games": rows
}, indent=2), encoding="utf-8")
print(f"Wrote {OUT} with {len(rows)} games")
