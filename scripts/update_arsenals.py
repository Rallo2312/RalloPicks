import csv, io, json, datetime, requests
from pathlib import Path

OUT = Path("data/arsenals.json")
OUT.parent.mkdir(parents=True, exist_ok=True)

TODAY = datetime.date.today()
YEAR = TODAY.year

MLB = "https://statsapi.mlb.com/api/v1"
BATTER_URL = f"https://baseballsavant.mlb.com/leaderboard/pitch-arsenal-stats?type=batter&year={YEAR}&min=1&minPitches=1&csv=true"
PITCHER_URL = f"https://baseballsavant.mlb.com/leaderboard/pitch-arsenal-stats?type=pitcher&year={YEAR}&min=1&minPitches=1&csv=true"
MOVEMENT_URL = f"https://baseballsavant.mlb.com/leaderboard/pitch-movement?year={YEAR}&csv=true"

session = requests.Session()
session.headers.update({
    "User-Agent": "Mozilla/5.0 RalloPicks/1.0",
    "Accept": "text/csv,application/json;q=0.9,*/*;q=0.8"
})

def get_json(url):
    r = session.get(url, timeout=30)
    r.raise_for_status()
    return r.json()

def get_csv(url):
    r = session.get(url, timeout=90)
    r.raise_for_status()
    txt = r.content.decode("utf-8-sig", errors="replace")
    return list(csv.DictReader(io.StringIO(txt)))

def to_int(v):
    try:
        return int(float(v))
    except:
        return None

def to_float(v):
    try:
        if v in (None, "", "null", "None"):
            return None
        return float(v)
    except:
        return None

def first(row, *keys):
    for k in keys:
        if k in row and row[k] not in (None, ""):
            return row[k]
    return None

def todays_people():
    sched = get_json(
        f"{MLB}/schedule?sportId=1&date={TODAY.isoformat()}&hydrate=probablePitcher"
    )

    pitchers = set()
    team_ids = set()
    batters = set()

    for d in sched.get("dates", []):
        for g in d.get("games", []):
            for side in ("away", "home"):
                team = g.get("teams", {}).get(side, {}).get("team", {})
                if team.get("id"):
                    team_ids.add(team["id"])

                pp = g.get("teams", {}).get(side, {}).get("probablePitcher")
                if pp and pp.get("id"):
                    pitchers.add(pp["id"])

            # The schedule can be incomplete early in the day. The live game feed
            # contains late pitcher changes and posted batting orders, so merge it in.
            game_pk = g.get("gamePk")
            if game_pk:
                try:
                    feed = get_json(f"https://statsapi.mlb.com/api/v1.1/game/{game_pk}/feed/live")
                    game_data = feed.get("gameData", {})
                    boxscore = feed.get("liveData", {}).get("boxscore", {})

                    for side in ("away", "home"):
                        pp = game_data.get("probablePitchers", {}).get(side)
                        if pp and pp.get("id"):
                            pitchers.add(pp["id"])

                        team_box = boxscore.get("teams", {}).get(side, {})
                        for pid in team_box.get("battingOrder", []):
                            try:
                                batters.add(int(pid))
                            except (TypeError, ValueError):
                                pass
                except Exception as e:
                    print(f"Live-feed warning for game {game_pk}: {e}")

    for tid in team_ids:
        try:
            roster = get_json(
                f"{MLB}/teams/{tid}/roster?rosterType=active&season={YEAR}"
            )
            for x in roster.get("roster", []):
                if x.get("position", {}).get("type") != "Pitcher":
                    pid = x.get("person", {}).get("id")
                    if pid:
                        batters.add(pid)
        except Exception as e:
            print(f"Roster warning for team {tid}: {e}")

    return pitchers, batters

def build_pitcher_data(rows, movement_rows, wanted):
    movement = {}

    for r in movement_rows:
        pid = to_int(first(r, "pitcher_id", "player_id"))
        ptype = first(r, "pitch_type")
        if pid is None or not ptype:
            continue

        movement[(pid, ptype)] = {
            "velo": to_float(first(r, "avg_speed")),
            "usage": to_float(first(r, "pitch_per")),
            "pitches": to_int(first(r, "pitches_thrown")),
        }

    grouped = {}

    for r in rows:
        pid = to_int(first(r, "player_id"))
        if pid is None or pid not in wanted:
            continue

        ptype = first(r, "pitch_type")
        if not ptype:
            continue

        name = first(r, "pitch_name") or ptype
        mv = movement.get((pid, ptype), {})

        item = {
            "code": ptype,
            "type": name,
            "pitches": to_int(first(r, "pitches")) or mv.get("pitches"),
            "usage": to_float(first(r, "pitch_usage")) or mv.get("usage"),
            "velo": mv.get("velo"),
            "whiff": to_float(first(r, "whiff_percent")),
            "avg": to_float(first(r, "ba")),
            "slg": to_float(first(r, "slg")),
            "hardHit": to_float(first(r, "hard_hit_percent")),
        }

        grouped.setdefault(str(pid), []).append(item)

    for pid, arr in grouped.items():
        arr.sort(key=lambda x: (x["usage"] is None, -(x["usage"] or 0)))

    return {pid: {"pitches": arr[:10]} for pid, arr in grouped.items()}

def build_batter_data(rows, wanted):
    grouped = {}

    for r in rows:
        pid = to_int(first(r, "player_id"))
        if pid is None or pid not in wanted:
            continue

        ptype = first(r, "pitch_type")
        if not ptype:
            continue

        item = {
            "code": ptype,
            "type": first(r, "pitch_name") or ptype,
            "pitches": to_int(first(r, "pitches")),
            "usage": to_float(first(r, "pitch_usage")),
            "avg": to_float(first(r, "ba")),
            "slg": to_float(first(r, "slg")),
            "whiff": to_float(first(r, "whiff_percent")),
            "hardHit": to_float(first(r, "hard_hit_percent")),
        }

        grouped.setdefault(str(pid), []).append(item)

    for pid, arr in grouped.items():
        arr.sort(key=lambda x: (x["pitches"] is None, -(x["pitches"] or 0)))

    return {pid: {"vsPitch": arr[:10]} for pid, arr in grouped.items()}

pitchers, batters = todays_people()

print(f"Today's slate: {len(pitchers)} probable pitchers, {len(batters)} active hitters")
print("Downloading Baseball Savant league-wide arsenal tables...")

batter_rows = get_csv(BATTER_URL)
pitcher_rows = get_csv(PITCHER_URL)
movement_rows = get_csv(MOVEMENT_URL)

print(
    f"Downloaded {len(batter_rows)} batter arsenal rows, "
    f"{len(pitcher_rows)} pitcher arsenal rows, "
    f"{len(movement_rows)} movement rows"
)

data = {
    "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "season": YEAR,
    "source": "Baseball Savant pitch arsenal + pitch movement leaderboards",
    "pitchers": build_pitcher_data(pitcher_rows, movement_rows, pitchers),
    "batters": build_batter_data(batter_rows, batters),
}

OUT.write_text(json.dumps(data, indent=2), encoding="utf-8")

print(
    f"Wrote {OUT}: "
    f"{len(data['pitchers'])}/{len(pitchers)} pitchers, "
    f"{len(data['batters'])}/{len(batters)} hitters with arsenal data"
)
