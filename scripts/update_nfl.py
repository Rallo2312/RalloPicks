import datetime as dt
import csv
import io
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
NFLVERSE_GAMES = "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv"


def get_json(url, params=None):
    if params:
        url = f"{url}?{urllib.parse.urlencode(params)}"
    request = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                      "(KHTML, like Gecko) Chrome/140.0 Safari/537.36",
        "Accept": "application/json,text/plain,*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.espn.com/",
    })
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

TEAM_INFO = {
    "ARI": ("Arizona Cardinals", "NFC"), "ATL": ("Atlanta Falcons", "NFC"),
    "BAL": ("Baltimore Ravens", "AFC"), "BUF": ("Buffalo Bills", "AFC"),
    "CAR": ("Carolina Panthers", "NFC"), "CHI": ("Chicago Bears", "NFC"),
    "CIN": ("Cincinnati Bengals", "AFC"), "CLE": ("Cleveland Browns", "AFC"),
    "DAL": ("Dallas Cowboys", "NFC"), "DEN": ("Denver Broncos", "AFC"),
    "DET": ("Detroit Lions", "NFC"), "GB": ("Green Bay Packers", "NFC"),
    "HOU": ("Houston Texans", "AFC"), "IND": ("Indianapolis Colts", "AFC"),
    "JAX": ("Jacksonville Jaguars", "AFC"), "KC": ("Kansas City Chiefs", "AFC"),
    "LA": ("Los Angeles Rams", "NFC"), "LAC": ("Los Angeles Chargers", "AFC"),
    "LV": ("Las Vegas Raiders", "AFC"), "MIA": ("Miami Dolphins", "AFC"),
    "MIN": ("Minnesota Vikings", "NFC"), "NE": ("New England Patriots", "AFC"),
    "NO": ("New Orleans Saints", "NFC"), "NYG": ("New York Giants", "NFC"),
    "NYJ": ("New York Jets", "AFC"), "PHI": ("Philadelphia Eagles", "NFC"),
    "PIT": ("Pittsburgh Steelers", "AFC"), "SEA": ("Seattle Seahawks", "NFC"),
    "SF": ("San Francisco 49ers", "NFC"), "TB": ("Tampa Bay Buccaneers", "NFC"),
    "TEN": ("Tennessee Titans", "AFC"), "WAS": ("Washington Commanders", "NFC"),
}

request = urllib.request.Request(NFLVERSE_GAMES, headers={"User-Agent": "RalloPicks/1.0"})
with urllib.request.urlopen(request, timeout=60) as response:
    schedule_rows = list(csv.DictReader(io.TextIOWrapper(response, encoding="utf-8")))
season_rows = [row for row in schedule_rows
               if row.get("season") == str(season) and row.get("game_type") == "REG"]

teams = []
for abbr, (name, conference) in TEAM_INFO.items():
    team_games = [row for row in season_rows
                  if row.get("away_team") == abbr or row.get("home_team") == abbr]
    completed = [row for row in team_games
                 if row.get("away_score") not in (None, "") and row.get("home_score") not in (None, "")]
    wins = losses = ties = 0
    points_for = points_against = 0.0
    for row in completed:
        home = row.get("home_team") == abbr
        scored = number(row.get("home_score") if home else row.get("away_score"))
        allowed = number(row.get("away_score") if home else row.get("home_score"))
        points_for += scored
        points_against += allowed
        if scored > allowed:
            wins += 1
        elif scored < allowed:
            losses += 1
        else:
            ties += 1
    games_played = len(completed)
    teams.append({
        "id": abbr, "name": name, "abbr": abbr, "logo": None,
        "conference": conference, "wins": wins, "losses": losses, "ties": ties,
        "games_played": games_played, "points_for": points_for,
        "points_against": points_against, "point_diff": points_for - points_against,
        "win_pct": (wins + ties * .5) / games_played if games_played else 0,
        "offense_rank": None, "defense_rank": None, "differential_rank": None,
    })


def apply_rank(key, rank_key, reverse=False):
    eligible = [team for team in teams if team["games_played"] > 0]
    eligible.sort(key=lambda team: team[key] / team["games_played"], reverse=reverse)
    for index, team in enumerate(eligible, 1):
        team[rank_key] = index


apply_rank("points_for", "offense_rank", reverse=True)
apply_rank("points_against", "defense_rank", reverse=False)
apply_rank("point_diff", "differential_rank", reverse=True)

window_start = now - dt.timedelta(hours=12)
window_end = now + dt.timedelta(days=10)
games = []
for row in season_rows:
    try:
        event_time = dt.datetime.fromisoformat(
            f"{row.get('gameday')}T{row.get('gametime') or '12:00'}:00-04:00"
        ).astimezone(dt.timezone.utc)
    except (TypeError, ValueError):
        continue
    if not window_start <= event_time <= window_end:
        continue
    def side(home_away):
        abbr = row.get(f"{home_away}_team")
        name = TEAM_INFO.get(abbr, (abbr, "NFL"))[0]
        return {
            "id": abbr, "name": name, "abbr": abbr, "logo": None,
            "score": row.get(f"{home_away}_score"),
        }

    games.append({
        "id": row.get("game_id"), "date": event_time.isoformat(),
        "name": f"{side('away')['name']} at {side('home')['name']}",
        "short_name": f"{row.get('away_team')} @ {row.get('home_team')}",
        "status": "Final" if row.get("home_score") not in (None, "") else "Scheduled",
        "venue": row.get("stadium"),
        "home": side("home"),
        "away": side("away"),
        "odds": {
            "book": "nflverse consensus", "home_moneyline": number(row.get("home_moneyline"), None),
            "away_moneyline": number(row.get("away_moneyline"), None),
            "home_spread": -number(row.get("spread_line"), 0),
            "spread_price": number(row.get("home_spread_odds"), None),
            "total": number(row.get("total_line"), None),
            "over_price": number(row.get("over_odds"), None),
        },
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
