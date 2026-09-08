import datetime as dt
import json
import os
import re
import urllib.parse
import urllib.request
from pathlib import Path


OUT = Path("data/nfl.json")
OUT.parent.mkdir(parents=True, exist_ok=True)
ESPN_SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard"
ESPN_STANDINGS = "https://site.api.espn.com/apis/v2/sports/football/nfl/standings"
ODDS = "https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds/"


def get_json(url, params=None):
    if params:
        url = f"{url}?{urllib.parse.urlencode(params)}"
    request = urllib.request.Request(url, headers={"User-Agent": "RalloPicks/1.0"})
    with urllib.request.urlopen(request, timeout=40) as response:
        return json.load(response)


def number(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def normalized(value):
    return re.sub(r"[^a-z0-9]", "", str(value or "").lower())


def stat_map(entry):
    return {item.get("name"): item for item in entry.get("stats", [])}


def stat_value(stats, name, default=0.0):
    return number((stats.get(name) or {}).get("value"), default)


now = dt.datetime.now(dt.timezone.utc)
season = now.year if now.month >= 3 else now.year - 1

standings_payload = get_json(ESPN_STANDINGS, {"season": season, "seasontype": 2})
teams = []
for conference in standings_payload.get("children", []):
    conference_name = conference.get("name", "NFL")
    for entry in conference.get("standings", {}).get("entries", []):
        team = entry.get("team", {})
        stats = stat_map(entry)
        wins = int(stat_value(stats, "wins"))
        losses = int(stat_value(stats, "losses"))
        ties = int(stat_value(stats, "ties"))
        games_played = wins + losses + ties
        points_for = stat_value(stats, "pointsFor")
        points_against = stat_value(stats, "pointsAgainst")
        teams.append({
            "id": team.get("id"),
            "name": team.get("displayName") or team.get("name"),
            "abbr": team.get("abbreviation"),
            "logo": ((team.get("logos") or [{}])[0]).get("href"),
            "conference": conference_name,
            "wins": wins,
            "losses": losses,
            "ties": ties,
            "games_played": games_played,
            "points_for": points_for,
            "points_against": points_against,
            "point_diff": stat_value(stats, "pointDifferential", points_for - points_against),
            "win_pct": stat_value(stats, "winPercent"),
            "offense_rank": None,
            "defense_rank": None,
            "differential_rank": None,
        })


def apply_rank(key, rank_key, reverse=False):
    eligible = [team for team in teams if team["games_played"] > 0]
    eligible.sort(key=lambda team: team[key] / team["games_played"], reverse=reverse)
    for index, team in enumerate(eligible, 1):
        team[rank_key] = index


apply_rank("points_for", "offense_rank", reverse=True)
apply_rank("points_against", "defense_rank", reverse=False)
apply_rank("point_diff", "differential_rank", reverse=True)

scoreboard_payload = get_json(ESPN_SCOREBOARD, {"dates": season, "seasontype": 2, "limit": 1000})
window_start = now - dt.timedelta(hours=12)
window_end = now + dt.timedelta(days=10)
games = []
for event in scoreboard_payload.get("events", []):
    try:
        event_time = dt.datetime.fromisoformat(event.get("date", "").replace("Z", "+00:00"))
    except ValueError:
        continue
    if not window_start <= event_time <= window_end:
        continue
    competition = (event.get("competitions") or [{}])[0]
    competitors = competition.get("competitors", [])

    def side(home_away):
        competitor = next((item for item in competitors if item.get("homeAway") == home_away), {})
        team = competitor.get("team", {})
        return {
            "id": team.get("id"),
            "name": team.get("displayName") or team.get("name"),
            "abbr": team.get("abbreviation"),
            "logo": team.get("logo") or ((team.get("logos") or [{}])[0]).get("href"),
            "score": competitor.get("score"),
        }

    games.append({
        "id": event.get("id"),
        "date": event.get("date"),
        "name": event.get("name"),
        "short_name": event.get("shortName"),
        "status": event.get("status", {}).get("type", {}).get("shortDetail") or "Scheduled",
        "venue": competition.get("venue", {}).get("fullName"),
        "home": side("home"),
        "away": side("away"),
        "odds": None,
    })

odds_key = os.environ.get("ODDS_API_KEY")
odds_rows = []
if odds_key:
    odds_rows = get_json(ODDS, {
        "apiKey": odds_key,
        "regions": "us",
        "markets": "h2h,spreads,totals",
        "oddsFormat": "american",
        "dateFormat": "iso",
    })


def market_outcome(markets, key, name):
    market = next((item for item in markets if item.get("key") == key), {})
    return next((item for item in market.get("outcomes", []) if normalized(item.get("name")) == normalized(name)), {})


for game in games:
    match = next((row for row in odds_rows
                  if normalized(row.get("home_team")) == normalized(game["home"]["name"])
                  and normalized(row.get("away_team")) == normalized(game["away"]["name"])), None)
    if not match or not match.get("bookmakers"):
        continue
    book = match["bookmakers"][0]
    markets = book.get("markets", [])
    home_ml = market_outcome(markets, "h2h", match.get("home_team"))
    away_ml = market_outcome(markets, "h2h", match.get("away_team"))
    home_spread = market_outcome(markets, "spreads", match.get("home_team"))
    total = market_outcome(markets, "totals", "Over")
    game["odds"] = {
        "book": book.get("title") or book.get("key"),
        "home_moneyline": home_ml.get("price"),
        "away_moneyline": away_ml.get("price"),
        "home_spread": home_spread.get("point"),
        "spread_price": home_spread.get("price"),
        "total": total.get("point"),
        "over_price": total.get("price"),
    }

games.sort(key=lambda game: game.get("date") or "")
teams.sort(key=lambda team: (-team["win_pct"], -team["point_diff"], team["name"] or ""))
OUT.write_text(json.dumps({
    "updated_at": now.isoformat(),
    "season": season,
    "games": games,
    "teams": teams,
}, indent=2), encoding="utf-8")
print(f"Wrote {OUT} with {len(games)} upcoming games and {len(teams)} teams")
