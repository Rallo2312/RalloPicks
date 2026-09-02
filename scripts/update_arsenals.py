import csv, io, json, datetime, time, requests
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

OUT = Path("data/arsenals.json")
OUT.parent.mkdir(parents=True, exist_ok=True)

TODAY = datetime.date.today()
START = TODAY - datetime.timedelta(days=45)
SAVANT = "https://baseballsavant.mlb.com/statcast_search/csv"

PITCH_NAMES = {
    "FF":"4-Seam Fastball","SI":"Sinker","FC":"Cutter","SL":"Slider","ST":"Sweeper",
    "CH":"Changeup","CU":"Curveball","KC":"Knuckle Curve","FS":"Split-Finger",
    "SV":"Slurve","KN":"Knuckleball","EP":"Eephus"
}

session = requests.Session()
session.headers.update({"User-Agent":"Mozilla/5.0 RalloPicks/1.0"})

def get_json(url, timeout=20):
    r = session.get(url, timeout=timeout)
    r.raise_for_status()
    return r.json()

def todays_people():
    sched = get_json(
        f"https://statsapi.mlb.com/api/v1/schedule?sportId=1&date={TODAY.isoformat()}&hydrate=probablePitcher"
    )
    pitchers, batters = set(), set()

    team_ids = set()
    for d in sched.get("dates", []):
        for g in d.get("games", []):
            for side in ("away", "home"):
                team = g.get("teams", {}).get(side, {}).get("team", {})
                if team.get("id"):
                    team_ids.add(team["id"])
                pp = g.get("teams", {}).get(side, {}).get("probablePitcher")
                if pp and pp.get("id"):
                    pitchers.add(pp["id"])

    def load_team(tid):
        try:
            r = get_json(
                f"https://statsapi.mlb.com/api/v1/teams/{tid}/roster?rosterType=active&season={TODAY.year}"
            )
            return [
                x["person"]["id"] for x in r.get("roster", [])
                if x.get("position", {}).get("type") != "Pitcher"
            ]
        except Exception:
            return []

    with ThreadPoolExecutor(max_workers=10) as ex:
        for ids in ex.map(load_team, team_ids):
            batters.update(ids)

    return sorted(pitchers), sorted(batters)

def savant_rows(player_id, player_type):
    params = [
        ("all","true"),
        ("type","details"),
        ("player_type",player_type),
        ("player_lookup[]",str(player_id)),
        ("game_date_gt",START.strftime("%Y-%m-%d")),
        ("game_date_lt",TODAY.strftime("%Y-%m-%d")),
        ("hfGT","R|PO|S|"),
        ("group_by","name"),
        ("sort_order","desc"),
        ("min_pitches","0"),
        ("min_results","0"),
    ]
    for attempt in range(2):
        try:
            r = session.get(SAVANT, params=params, timeout=20)
            r.raise_for_status()
            return list(csv.DictReader(io.StringIO(r.text)))
        except Exception:
            if attempt == 0:
                time.sleep(0.5)
    return []

def fnum(x):
    try:
        return float(x)
    except Exception:
        return None

def pitcher_summary(rows):
    by = defaultdict(list)
    for r in rows:
        pt = r.get("pitch_type")
        if pt:
            by[pt].append(r)

    total = sum(len(v) for v in by.values()) or 1
    out = []
    for pt, rs in sorted(by.items(), key=lambda kv: len(kv[1]), reverse=True):
        velo = [fnum(x.get("release_speed")) for x in rs]
        velo = [x for x in velo if x is not None]

        swings = 0
        whiffs = 0
        for x in rs:
            d = x.get("description", "")
            if ("swing" in d) or ("foul" in d) or ("hit_into_play" in d):
                swings += 1
            if "swinging_strike" in d:
                whiffs += 1

        out.append({
            "code": pt,
            "type": PITCH_NAMES.get(pt, pt),
            "pitches": len(rs),
            "usage": round(len(rs) / total * 100, 1),
            "velo": round(sum(velo) / len(velo), 1) if velo else None,
            "whiff": round(whiffs / swings * 100, 1) if swings else None
        })
    return out[:8]

def hitter_summary(rows):
    by = defaultdict(list)
    for r in rows:
        pt = r.get("pitch_type")
        if pt:
            by[pt].append(r)

    out = []
    for pt, rs in sorted(by.items(), key=lambda kv: len(kv[1]), reverse=True):
        ab = hits = tb = 0
        bbes = hard = swings = whiffs = 0

        for r in rs:
            ev = r.get("events", "")
            desc = r.get("description", "")

            if ("swing" in desc) or ("foul" in desc) or ("hit_into_play" in desc):
                swings += 1
            if "swinging_strike" in desc:
                whiffs += 1

            ev_speed = fnum(r.get("launch_speed"))
            if ev_speed is not None:
                bbes += 1
                if ev_speed >= 95:
                    hard += 1

            if ev in {
                "single","double","triple","home_run","field_out","force_out",
                "grounded_into_double_play","field_error","fielders_choice",
                "fielders_choice_out","strikeout"
            }:
                ab += 1

            if ev == "single":
                hits += 1; tb += 1
            elif ev == "double":
                hits += 1; tb += 2
            elif ev == "triple":
                hits += 1; tb += 3
            elif ev == "home_run":
                hits += 1; tb += 4

        out.append({
            "code": pt,
            "type": PITCH_NAMES.get(pt, pt),
            "pitches": len(rs),
            "avg": round(hits / ab, 3) if ab else None,
            "slg": round(tb / ab, 3) if ab else None,
            "whiff": round(whiffs / swings * 100, 1) if swings else None,
            "hardHit": round(hard / bbes * 100, 1) if bbes else None
        })

    return out[:8]

def fetch_one(kind, pid):
    rows = savant_rows(pid, "pitcher" if kind == "pitcher" else "batter")
    if kind == "pitcher":
        return str(pid), {"pitches": pitcher_summary(rows)}
    return str(pid), {"vsPitch": hitter_summary(rows)}

pitchers, batters = todays_people()

data = {
    "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "window_days": 45,
    "pitchers": {},
    "batters": {}
}

jobs = [("pitcher", x) for x in pitchers] + [("batter", x) for x in batters]

# Parallel requests make this dramatically faster than the original one-by-one updater.
with ThreadPoolExecutor(max_workers=24) as ex:
    futures = {ex.submit(fetch_one, kind, pid): (kind, pid) for kind, pid in jobs}
    for fut in as_completed(futures):
        kind, pid = futures[fut]
        try:
            key, value = fut.result()
        except Exception as e:
            key = str(pid)
            value = {"pitches": []} if kind == "pitcher" else {"vsPitch": []}
            value["error"] = str(e)[:120]
        if kind == "pitcher":
            data["pitchers"][key] = value
        else:
            data["batters"][key] = value

OUT.write_text(json.dumps(data, indent=2), encoding="utf-8")
print(f"Wrote {OUT}: {len(pitchers)} pitchers, {len(batters)} batters")
