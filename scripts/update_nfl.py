import datetime as dt
import csv
import io
import json
import os
import re
import urllib.parse
import urllib.error
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
NFLVERSE_ROSTER = f"https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_{season}.csv"

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

roster_request = urllib.request.Request(NFLVERSE_ROSTER, headers={"User-Agent": "RalloPicks/1.0"})
with urllib.request.urlopen(roster_request, timeout=60) as response:
    roster_rows = list(csv.DictReader(io.TextIOWrapper(response, encoding="utf-8")))
latest_roster = {}
for row in roster_rows:
    if row.get("position") not in {"QB", "RB", "WR", "TE"}:
        continue
    if row.get("status") != "ACT":
        continue
    player_id = row.get("gsis_id") or row.get("espn_id") or normalized(row.get("full_name"))
    if not player_id or not row.get("team"):
        continue
    current = latest_roster.get(player_id)
    if current and int(number(current.get("week"))) > int(number(row.get("week"))):
        continue
    latest_roster[player_id] = row

players = []
for player_id, row in latest_roster.items():
    players.append({
        "id": player_id,
        "name": row.get("full_name") or row.get("football_name"),
        "team": row.get("team"),
        "position": row.get("position"),
        "jersey": row.get("jersey_number"),
        "status": row.get("status"),
        "headshot": row.get("headshot_url"),
        "college": row.get("college"),
        "experience": int(number(row.get("years_exp"))),
        "season": {"games": 0, "pass_yards": 0, "pass_tds": 0,
                   "rush_yards": 0, "rush_tds": 0, "receptions": 0,
                   "targets": 0, "rec_yards": 0, "rec_tds": 0},
        "recent": [],
        "lines": {"PrizePicks": {}, "Underdog": {}},
    })

weekly_stats_url = (
    f"https://github.com/nflverse/nflverse-data/releases/download/player_stats/"
    f"stats_player_week_{season}.csv"
)
try:
    stats_request = urllib.request.Request(weekly_stats_url, headers={"User-Agent": "RalloPicks/1.0"})
    with urllib.request.urlopen(stats_request, timeout=60) as response:
        weekly_rows = list(csv.DictReader(io.TextIOWrapper(response, encoding="utf-8")))
except (urllib.error.HTTPError, urllib.error.URLError):
    weekly_rows = []

players_by_id = {player["id"]: player for player in players}
for row in weekly_rows:
    if row.get("season_type") not in {"REG", None, ""}:
        continue
    player = players_by_id.get(row.get("player_id"))
    if not player:
        continue
    game = {
        "week": int(number(row.get("week"))), "opponent": row.get("opponent_team"),
        "pass_yards": number(row.get("passing_yards")), "pass_tds": number(row.get("passing_tds")),
        "rush_yards": number(row.get("rushing_yards")), "rush_tds": number(row.get("rushing_tds")),
        "receptions": number(row.get("receptions")), "targets": number(row.get("targets")),
        "rec_yards": number(row.get("receiving_yards")), "rec_tds": number(row.get("receiving_tds")),
    }
    player["recent"].append(game)

for player in players:
    player["recent"].sort(key=lambda game: game["week"], reverse=True)
    season_stats = player["season"]
    season_stats["games"] = len(player["recent"])
    for game in player["recent"]:
        for key in ("pass_yards", "pass_tds", "rush_yards", "rush_tds",
                    "receptions", "targets", "rec_yards", "rec_tds"):
            season_stats[key] += game[key]

try:
    prizepicks = get_json(
        "https://partner-api.prizepicks.com/projections",
        {"league_id": 9, "per_page": 250},
    )
except (urllib.error.HTTPError, urllib.error.URLError):
    prizepicks = {"data": [], "included": []}

pp_players = {
    item.get("id"): item.get("attributes", {})
    for item in prizepicks.get("included", [])
    if item.get("type") == "new_player"
}
players_by_name = {normalized(player["name"]): player for player in players}
for projection in prizepicks.get("data", []):
    attrs = projection.get("attributes", {})
    if attrs.get("status") != "pre_game" or attrs.get("odds_type") != "standard":
        continue
    player_ref = projection.get("relationships", {}).get("new_player", {}).get("data") or {}
    pp_player = pp_players.get(player_ref.get("id"), {})
    player = players_by_name.get(normalized(pp_player.get("display_name") or pp_player.get("name")))
    stat_name = attrs.get("stat_display_name") or attrs.get("stat_type")
    line = attrs.get("line_score")
    if player and stat_name and line is not None:
        player["lines"]["PrizePicks"][stat_name] = number(line)
position_order = {"QB": 0, "RB": 1, "WR": 2, "TE": 3}
players.sort(key=lambda player: (position_order[player["position"]], player["team"], player["name"] or ""))

OUT.write_text(json.dumps({
    "updated_at": now.isoformat(),
    "season": season,
    "games": games,
    "teams": teams,
    "players": players,
}, indent=2), encoding="utf-8")
print(f"Wrote {OUT} with {len(games)} games, {len(teams)} teams, and {len(players)} players")
