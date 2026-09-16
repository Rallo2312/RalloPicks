import datetime, json, os, requests
from pathlib import Path

OUT=Path("data/pitcher-strikeouts.json"); OUT.parent.mkdir(parents=True,exist_ok=True)
MLB="https://statsapi.mlb.com/api/v1"; TODAY=datetime.date.today(); YEAR=TODAY.year
KEY=os.environ.get("SPORTSGAMEODDS_API_KEY")
S=requests.Session(); S.headers.update({"User-Agent":"RalloPicks/1.0"})

def js(url,**params):
 r=S.get(url,params=params,timeout=45); r.raise_for_status(); return r.json()
def game_logs(pid):
 p=js(f"{MLB}/people/{pid}/stats",stats="gameLog",group="pitching",season=YEAR,gameType="R")
 splits=((p.get("stats") or [{}])[0].get("splits") or [])
 out=[]
 for x in splits:
  st=x.get("stat") or {}; g=x.get("game") or {}; opp=x.get("opponent") or {}
  out.append({"date":x.get("date"),"gamePk":g.get("gamePk") or g.get("id"),"opponent":opp.get("abbreviation") or opp.get("name"),"strikeouts":st.get("strikeOuts",0),"innings":st.get("inningsPitched"),"pitches":st.get("numberOfPitches")})
 return out[-20:][::-1]
def opponent_k(team_id):
 try:
  d=js(f"{MLB}/teams/{team_id}/stats",stats="season",group="hitting",season=YEAR,gameType="R")
  st=((d.get("stats") or [{}])[0].get("splits") or [{}])[0].get("stat") or {}
  return {"strikeouts":st.get("strikeOuts"),"plateAppearances":st.get("plateAppearances"),"kPct":round(100*float(st.get("strikeOuts",0))/max(1,float(st.get("plateAppearances",0))),1)}
 except: return {}
def odds_lines():
 if not KEY:return {}
 try:
  d=requests.get("https://api.sportsgameodds.com/v2/events",params={"leagueID":"MLB","oddsAvailable":"true","limit":100},headers={"x-api-key":KEY},timeout=45).json().get("data") or []
  out={}
  for e in d:
   for o in (e.get("odds") or {}).values():
    sid=str(o.get("statID") or "").lower()
    if "pitch" not in sid or "strikeout" not in sid: continue
    ent=o.get("statEntityID") or o.get("playerID"); line=o.get("bookOverUnder") or o.get("fairOverUnder")
    if ent and line is not None: out[str(ent)]={"line":float(line),"market":o.get("marketName"),"providerID":ent}
  return out
 except Exception as e: print("K odds warning",e); return {}

sched=js(f"{MLB}/schedule",sportId=1,date=TODAY.isoformat(),hydrate="probablePitcher")
lines=odds_lines(); rows=[]
for day in sched.get("dates",[]):
 for g in day.get("games",[]):
  teams=g.get("teams") or {}
  for side,opp_side in (("away","home"),("home","away")):
   slot=teams.get(side) or {}; pp=slot.get("probablePitcher") or {}
   if not pp.get("id"): continue
   opp=(teams.get(opp_side) or {}).get("team") or {}; logs=game_logs(pp["id"]); ks=[float(x["strikeouts"] or 0) for x in logs]
   lineinfo=lines.get(str(pp["id"])) or {}
   line=lineinfo.get("line")
   def rate(n):
    a=ks[:n]
    return round(100*sum(v>line for v in a)/len(a)) if a and line is not None else None
   rows.append({"id":pp["id"],"name":pp.get("fullName"),"team":(slot.get("team") or {}).get("abbreviation"),"opponent":opp.get("abbreviation"),"gamePk":g.get("gamePk"),"gameDate":g.get("gameDate"),"line":line,"lineSource":"SportsGameOdds" if line is not None else None,"l5Rate":rate(5),"l10Rate":rate(10),"seasonAvg":round(sum(ks)/len(ks),2) if ks else None,"recent":logs,"opponentK":opponent_k(opp.get("id"))})
OUT.write_text(json.dumps({"updated_at":datetime.datetime.now(datetime.timezone.utc).isoformat(),"season":YEAR,"rows":rows},indent=2))
print("Wrote",OUT,"with",len(rows),"probable starters")
