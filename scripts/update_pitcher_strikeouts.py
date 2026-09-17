import datetime, json, os, time, requests
from pathlib import Path

OUT=Path("data/pitcher-strikeouts.json"); OUT.parent.mkdir(parents=True,exist_ok=True)
MLB="https://statsapi.mlb.com/api/v1"; TODAY=datetime.date.today(); YEAR=TODAY.year
KEY=os.environ.get("SPORTSGAMEODDS_API_KEY")
S=requests.Session(); S.headers.update({"User-Agent":"RalloPicks/1.0"})
SGO_CACHE=Path(".cache/sportsgameodds-mlb-events.json")

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
def season_pitching(pid):
 try:
  d=js(f"{MLB}/people/{pid}/stats",stats="season",group="pitching",season=YEAR,gameType="R")
  st=((d.get("stats") or [{}])[0].get("splits") or [{}])[0].get("stat") or {}
  bf=float(st.get("battersFaced") or 0); so=float(st.get("strikeOuts") or 0)
  return {"strikeouts":st.get("strikeOuts"),"innings":st.get("inningsPitched"),"battersFaced":st.get("battersFaced"),
          "kPct":round(100*so/max(1,bf),1),"k9":st.get("strikeoutsPer9Inn") or st.get("strikeOutsPer9Inn"),
          "whip":st.get("whip"),"era":st.get("era")}
 except Exception as e:
  print("season pitching warning",e); return {}

def opponent_k(team_id):
 try:
  d=js(f"{MLB}/teams/{team_id}/stats",stats="season",group="hitting",season=YEAR,gameType="R")
  st=((d.get("stats") or [{}])[0].get("splits") or [{}])[0].get("stat") or {}
  return {"strikeouts":st.get("strikeOuts"),"plateAppearances":st.get("plateAppearances"),"kPct":round(100*float(st.get("strikeOuts",0))/max(1,float(st.get("plateAppearances",0))),1)}
 except: return {}
def norm_name(v):
 return "".join(ch for ch in str(v or "").lower() if ch.isalnum())
def provider_name(entity):
 parts=str(entity or "").replace("-","_").split("_")
 # SGO player IDs are commonly first_last_<number>_<league>
 while parts and (parts[-1].isdigit() or parts[-1].lower() in ("mlb","nfl","nba","nhl")): parts.pop()
 return " ".join(p.capitalize() for p in parts)
def odds_lines():
 if not KEY:
  SGO_CACHE.parent.mkdir(parents=True,exist_ok=True)
  SGO_CACHE.write_text(json.dumps({"_fetchError":"SPORTSGAMEODDS_API_KEY is not set","data":[]}))
  return {"by_id":{},"by_name":{}}
 try:
  payload=None
  for attempt in range(3):
   resp=requests.get("https://api.sportsgameodds.com/v2/events",params={"leagueID":"MLB","oddsAvailable":"true","limit":100},headers={"x-api-key":KEY},timeout=45)
   if resp.status_code != 429:
    resp.raise_for_status(); payload=resp.json(); break
   retry_after=resp.headers.get("Retry-After")
   try: delay=min(60,max(1,int(float(retry_after))))
   except (TypeError,ValueError): delay=10*(attempt+1)
   print(f"SportsGameOdds rate limited; retrying in {delay}s ({attempt+1}/3)")
   time.sleep(delay)
  if payload is None: raise RuntimeError("SportsGameOdds remained rate limited after 3 attempts")
  SGO_CACHE.parent.mkdir(parents=True,exist_ok=True)
  SGO_CACHE.write_text(json.dumps(payload),encoding="utf-8")
  events=payload.get("data") or []
  by_id={}; by_name={}
  for e in events:
   for o in (e.get("odds") or {}).values():
    sid=str(o.get("statID") or "").lower().replace("_","").replace("-","")
    market=str(o.get("marketName") or o.get("statName") or "").lower()
    # Accept SGO's pitcher strikeout stat variants (strikeouts, pitchingStrikeouts, etc.)
    if not (("strikeout" in sid or "strikeout" in market) and ("batter" not in sid and "batter" not in market)): continue
    ent=o.get("statEntityID") or o.get("playerID")
    if ent in (None,"all","home","away"): continue
    candidates=[]
    raw=o.get("bookOverUnder")
    if raw is None: raw=o.get("fairOverUnder")
    if raw is None: raw=o.get("overUnder")
    if raw is None: raw=o.get("line")
    if raw is not None:
     try:candidates.append(float(raw))
     except:pass
    for book_id,b in (o.get("byBookmaker") or {}).items():
     if not b or not b.get("available",True):continue
     val=b.get("overUnder")
     if val is not None:
      try:candidates.append(float(val))
      except:pass
    if not candidates:continue
    line=candidates[0]; info={"line":line,"market":o.get("marketName") or "Pitcher Strikeouts","providerID":ent}
    by_id[str(ent)]=info
    by_name[norm_name(provider_name(ent))]=info
  print("Matched",len(by_name),"pitcher strikeout prop names from SportsGameOdds")
  return {"by_id":by_id,"by_name":by_name}
 except Exception as e:
  print("K odds warning",e)
  SGO_CACHE.parent.mkdir(parents=True,exist_ok=True)
  SGO_CACHE.write_text(json.dumps({"_fetchError":str(e),"data":[]}),encoding="utf-8")
  return {"by_id":{},"by_name":{}}

sched=js(f"{MLB}/schedule",sportId=1,date=TODAY.isoformat(),hydrate="probablePitcher")
lines=odds_lines(); rows=[]
for day in sched.get("dates",[]):
 for g in day.get("games",[]):
  teams=g.get("teams") or {}
  for side,opp_side in (("away","home"),("home","away")):
   slot=teams.get(side) or {}; pp=slot.get("probablePitcher") or {}
   if not pp.get("id"): continue
   team=(slot.get("team") or {})
   opp=(teams.get(opp_side) or {}).get("team") or {}
   # Schedule team objects often omit abbreviations; hydrate them from /teams.
   try:
    if not team.get("abbreviation") and team.get("id"): team.update(js(f"{MLB}/teams/{team['id']}").get("teams",[{}])[0])
    if not opp.get("abbreviation") and opp.get("id"): opp.update(js(f"{MLB}/teams/{opp['id']}").get("teams",[{}])[0])
   except Exception as e: print("team hydrate warning",e)
   logs=game_logs(pp["id"]); ks=[float(x["strikeouts"] or 0) for x in logs]
   lineinfo=(lines.get("by_id") or {}).get(str(pp["id"])) or (lines.get("by_name") or {}).get(norm_name(pp.get("fullName"))) or {}
   line=lineinfo.get("line")
   def rate(n):
    a=ks[:n]
    return round(100*sum(v>line for v in a)/len(a)) if a and line is not None else None
   oppk=opponent_k(opp.get("id")); sp=season_pitching(pp["id"])
   recent5=logs[:5]
   avg_pitches=round(sum(float(x.get("pitches") or 0) for x in recent5)/len(recent5),1) if recent5 else None
   def ip_num(v):
    try:
     a,b=str(v or "0").split("."); return float(a)+float(b)/3
    except:return 0.0
   avg_innings=round(sum(ip_num(x.get("innings")) for x in recent5)/len(recent5),2) if recent5 else None
   h2h=[x for x in logs if norm_name(x.get("opponent")) in (norm_name(opp.get("abbreviation")),norm_name(opp.get("name")))]
   h2h_avg=round(sum(float(x.get("strikeouts") or 0) for x in h2h)/len(h2h),2) if h2h else None
   # Research score: skill + opponent K tendency + workload + recent production + line context.
   # Missing inputs are neutral rather than rewarded.
   score=50.0
   kp=sp.get("kPct")
   if kp is not None: score += max(-14,min(14,(float(kp)-22.0)*1.25))
   okp=oppk.get("kPct")
   if okp is not None: score += max(-10,min(10,(float(okp)-22.0)*1.5))
   if avg_pitches is not None: score += max(-8,min(8,(avg_pitches-88.0)*0.35))
   if avg_innings is not None: score += max(-6,min(6,(avg_innings-5.2)*3.0))
   recent_avg=round(sum(ks[:5])/len(ks[:5]),2) if ks[:5] else None
   if line is not None and recent_avg is not None: score += max(-12,min(12,(recent_avg-float(line))*4.0))
   score=round(max(1,min(99,score)))
   lean=None
   if line is not None: lean="OVER" if score>=56 else ("UNDER" if score<=44 else "PASS")
   rows.append({"id":pp["id"],"name":pp.get("fullName"),"team":team.get("abbreviation") or team.get("name"),"opponent":opp.get("abbreviation") or opp.get("name"),"gamePk":g.get("gamePk"),"gameDate":g.get("gameDate"),"line":line,"lineSource":"SportsGameOdds" if line is not None else None,"l5Rate":rate(5),"l10Rate":rate(10),"seasonAvg":round(sum(ks)/len(ks),2) if ks else None,"recent5Avg":recent_avg,"recent":logs,"opponentK":oppk,"seasonPitching":sp,"avgPitchesL5":avg_pitches,"avgInningsL5":avg_innings,"h2hGames":len(h2h),"h2hAvgK":h2h_avg,"researchScore":score,"lean":lean})
rows.sort(key=lambda x:x.get("researchScore") or 0,reverse=True)
for i,row in enumerate(rows,1):
 row["rank"]=i
OUT.write_text(json.dumps({"updated_at":datetime.datetime.now(datetime.timezone.utc).isoformat(),"season":YEAR,"methodology":"K skill + opponent K tendency + recent workload + recent K production vs current line; missing inputs neutral","rows":rows},indent=2))
print("Wrote",OUT,"with",len(rows),"probable starters")
