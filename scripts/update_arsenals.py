import csv, io, json, datetime, requests
from collections import defaultdict
from pathlib import Path

OUT = Path("data/arsenals.json")
OUT.parent.mkdir(parents=True, exist_ok=True)
TODAY = datetime.date.today()
SEASON_START = datetime.date(TODAY.year, 3, 1)
SAVANT = "https://baseballsavant.mlb.com/statcast_search/csv"

PITCH_NAMES = {
 "FF":"4-Seam Fastball","SI":"Sinker","FC":"Cutter","SL":"Slider","ST":"Sweeper",
 "CH":"Changeup","CU":"Curveball","KC":"Knuckle Curve","FS":"Split-Finger",
 "SV":"Slurve","KN":"Knuckleball","EP":"Eephus"
}

def mlb_json(url):
    r=requests.get(url,timeout=30); r.raise_for_status(); return r.json()

def todays_people():
    sched=mlb_json(f"https://statsapi.mlb.com/api/v1/schedule?sportId=1&date={TODAY.isoformat()}&hydrate=probablePitcher")
    pitchers=set(); batters=set()
    for d in sched.get("dates",[]):
      for g in d.get("games",[]):
        for side in ("away","home"):
          pp=g.get("teams",{}).get(side,{}).get("probablePitcher")
          if pp: pitchers.add(pp["id"])
          tid=g.get("teams",{}).get(side,{}).get("team",{}).get("id")
          if not tid: continue
          try:
            ros=mlb_json(f"https://statsapi.mlb.com/api/v1/teams/{tid}/roster?rosterType=active&season={TODAY.year}")
            for x in ros.get("roster",[]):
              if x.get("position",{}).get("type")!="Pitcher":
                batters.add(x["person"]["id"])
          except Exception: pass
    return pitchers,batters

def savant_rows(player_id, player_type):
    params={
      "all":"true","type":"details","player_type":player_type,
      "player_lookup[]":str(player_id),
      "game_date_gt":SEASON_START.strftime("%Y-%m-%d"),
      "game_date_lt":TODAY.strftime("%Y-%m-%d"),
      "hfGT":"R|PO|S|","group_by":"name","sort_order":"desc","min_pitches":"0","min_results":"0"
    }
    r=requests.get(SAVANT,params=params,timeout=60)
    r.raise_for_status()
    return list(csv.DictReader(io.StringIO(r.text)))

def fnum(x):
    try:return float(x)
    except:return None

def pitcher_summary(rows):
    by=defaultdict(list)
    for r in rows:
      pt=r.get("pitch_type")
      if pt: by[pt].append(r)
    total=sum(map(len,by.values())) or 1
    out=[]
    for pt,rs in sorted(by.items(),key=lambda kv:len(kv[1]),reverse=True):
      vel=[fnum(x.get("release_speed")) for x in rs]; vel=[x for x in vel if x is not None]
      desc=[x.get("description","") for x in rs]
      swings=[d for d in desc if "swing" in d or "foul" in d or "hit_into_play" in d]
      whiffs=[d for d in desc if "swinging_strike" in d]
      out.append({
        "code":pt,"type":PITCH_NAMES.get(pt,pt),"pitches":len(rs),
        "usage":round(len(rs)/total*100,1),
        "velo":round(sum(vel)/len(vel),1) if vel else None,
        "whiff":round(len(whiffs)/len(swings)*100,1) if swings else None
      })
    return out

def hitter_summary(rows):
    by=defaultdict(list)
    for r in rows:
      pt=r.get("pitch_type")
      if pt: by[pt].append(r)
    out=[]
    for pt,rs in sorted(by.items(),key=lambda kv:len(kv[1]),reverse=True):
      ab=hits=tb=0; hard=bbes=0; swings=whiffs=0
      for r in rs:
        ev=r.get("events",""); desc=r.get("description","")
        if "swing" in desc or "foul" in desc or "hit_into_play" in desc: swings+=1
        if "swinging_strike" in desc: whiffs+=1
        la=fnum(r.get("launch_speed"))
        if la is not None:
          bbes+=1
          if la>=95: hard+=1
        if ev in ("single","double","triple","home_run","field_out","force_out","grounded_into_double_play","field_error","fielders_choice","fielders_choice_out","strikeout"):
          ab+=1
        if ev=="single": hits+=1; tb+=1
        elif ev=="double": hits+=1; tb+=2
        elif ev=="triple": hits+=1; tb+=3
        elif ev=="home_run": hits+=1; tb+=4
      out.append({
        "code":pt,"type":PITCH_NAMES.get(pt,pt),"pitches":len(rs),
        "avg":round(hits/ab,3) if ab else None,
        "slg":round(tb/ab,3) if ab else None,
        "whiff":round(whiffs/swings*100,1) if swings else None,
        "hardHit":round(hard/bbes*100,1) if bbes else None
      })
    return out

pitchers,batters=todays_people()
data={"updated_at":datetime.datetime.now(datetime.timezone.utc).isoformat(),"pitchers":{},"batters":{}}
for pid in sorted(pitchers):
  try:data["pitchers"][str(pid)]={"pitches":pitcher_summary(savant_rows(pid,"pitcher"))}
  except Exception as e:data["pitchers"][str(pid)]={"pitches":[],"error":str(e)[:160]}
for bid in sorted(batters):
  try:data["batters"][str(bid)]={"vsPitch":hitter_summary(savant_rows(bid,"batter"))}
  except Exception as e:data["batters"][str(bid)]={"vsPitch":[],"error":str(e)[:160]}

OUT.write_text(json.dumps(data,indent=2),encoding="utf-8")
print(f"Wrote {OUT}: {len(pitchers)} pitchers, {len(batters)} batters")
