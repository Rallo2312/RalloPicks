"""Persist pregame HR selections, Statcast season contact evidence and final outcomes."""
import csv, io, json, re, urllib.request, argparse, subprocess, math
from datetime import datetime, timezone
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,default=ROOT)
ROOT=parser.parse_args().root
API='https://statsapi.mlb.com/api/v1'
now=datetime.now(timezone.utc)
def get(url):
    if 'baseballsavant.mlb.com' in url:
        return subprocess.check_output(['curl','-fsS','--retry','2','--max-time','60',url]).decode('utf-8-sig')
    with urllib.request.urlopen(url,timeout=60) as response:return response.read().decode('utf-8-sig')
def first_value(row,*keys):
    for key in keys:
        if key in row and row[key] not in (None,''):
            return row[key]
    return None
def num(value):
    try:
        n=float(value) if value not in (None,'') else None
        return n if n is not None and math.isfinite(n) else None
    except (TypeError,ValueError):return None
def upcoming(g):
    status=g.get('status',{})
    return status.get('abstractGameState')=='Preview' and not re.search('cancel|postpon|suspend|delay',status.get('detailedState',''),re.I) and datetime.fromisoformat(g['gameDate'].replace('Z','+00:00'))>datetime.now(timezone.utc)
def write(path,data):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
def main():
    html=(ROOT/'index.html').read_text()
    match=re.search(r'<script type="application/json" id="dailyHrResearch">(.*?)</script>',html,re.S)
    if not match:raise RuntimeError('Daily HR research feed missing')
    feed=json.loads(match.group(1));year=feed['date'][:4]
    contact_url=f'https://baseballsavant.mlb.com/leaderboard/statcast?type=batter&year={year}&position=&team=&min=1&csv=true'
    quality={'updatedAt':now.isoformat(),'season':int(year),'source':contact_url,'players':{},'status':'unavailable'}
    try:
        rows=list(csv.DictReader(io.StringIO(get(contact_url))))
        if not rows or not {'player_id','attempts','brl_percent','ev95percent','avg_hit_speed'}.issubset(rows[0]):raise ValueError('Unexpected Statcast schema')
        for row in rows:
            quality['players'][row['player_id']]={'bbe':num(row['attempts']),'barrelRate':num(row['brl_percent']),'hardHitRate':num(row['ev95percent']),'exitVelocity':num(row['avg_hit_speed']),'maxExitVelocity':num(first_value(row,'max_hit_speed','max_ev','max_exit_velocity')),'launchAngle':num(first_value(row,'avg_launch_angle','launch_angle_avg','launch_angle'))}
        quality['status']='ready'
    except Exception as error:quality['error']='Contact source unavailable: '+type(error).__name__
    archive_path=ROOT/'data/hr-history.json'
    archive=json.loads(archive_path.read_text()) if archive_path.exists() else {'version':1,'records':[]}
    existing={r['key'] for r in archive['records']}
    schedule=json.loads(get(f"{API}/schedule?sportId=1&date={feed['date']}&hydrate=probablePitcher"))
    games={g['gamePk']:g for date in schedule.get('dates',[]) for g in date['games']}
    lineups={};active={}
    for board in ('top10','underrated'):
        for rank,x in enumerate(feed.get(board,[]),1):
            key=f"{feed['date']}:{x['gamePk']}:{x['person']['id']}"
            if key in existing:continue
            g=games.get(x['gamePk']);team=x['team']['id'];pid=x['person']['id']
            if not g or not upcoming(g):continue
            side='away' if g['teams']['away']['team']['id']==team else 'home';opposite='home' if side=='away' else 'away'
            if g['teams'][opposite].get('probablePitcher',{}).get('id')!=x.get('starterId'):continue
            try:
                if team not in active:active[team]={p['person']['id'] for p in json.loads(get(f'{API}/teams/{team}/roster?rosterType=active')).get('roster',[])}
                if pid not in active[team]:continue
                if g['gamePk'] not in lineups:lineups[g['gamePk']]=json.loads(get(f"{API}/game/{g['gamePk']}/boxscore"))
                players=lineups[g['gamePk']].get('teams',{}).get(side,{}).get('players',{})
                order={p['person']['id'] for p in players.values() if p.get('battingOrder')}
                if order and pid not in order:continue
            except Exception:continue
            q=quality['players'].get(str(pid));trial=None
            if q and q['bbe'] is not None and q['bbe']>=100 and q['barrelRate'] is not None and q['hardHitRate'] is not None:
                # Trial hypothesis only: capped at +/-10%, never a probability.
                weight=q['bbe']/(q['bbe']+100)
                change=max(-.10,min(.10,((q['barrelRate']-8)*.005+(q['hardHitRate']-40)*.002)*weight))
                if num(x.get('score')) is not None:trial=x['score']*(1+change)
            if not upcoming(g):continue
            archive['records'].append({'key':key,'date':feed['date'],'gamePk':g['gamePk'],'gameDate':g['gameDate'],'playerId':pid,'teamId':team,'name':x['person']['fullName'],'board':board,'rank':rank,'recordedAt':datetime.now(timezone.utc).isoformat(),'lineup': 'confirmed' if order else 'pending','baseScore':x.get('score'),'trialScore':trial,'contact':q,'contactCheckedAt':quality['updatedAt'],'source':contact_url,'status':'pending','hr':None})
            existing.add(key)
    # Settle from official final box scores; no PA is void, missing data stays pending.
    pending={r['gamePk'] for r in archive['records'] if r['status']=='pending'}
    for game_pk in pending:
        try:
            detail=json.loads(get(f'{API}/schedule?gamePk={game_pk}'))
            game=next(g for d in detail.get('dates',[]) for g in d['games'])
            if game['status'].get('abstractGameState')!='Final':continue
            box=json.loads(get(f'{API}/game/{game_pk}/boxscore'))
            players={key:p for side in ('away','home') for key,p in box.get('teams',{}).get(side,{}).get('players',{}).items()}
            for r in archive['records']:
                if r['gamePk']!=game_pk or r['status']!='pending':continue
                player=players.get('ID'+str(r['playerId']));stats=player.get('stats',{}).get('batting',{}) if player else {}
                pa=num(stats.get('plateAppearances'));hr=num(stats.get('homeRuns'))
                if player is None or pa==0:r['status']='void'
                elif pa is not None and pa>0 and hr is not None:r.update(status='hit' if hr>0 else 'miss',hr=int(hr))
                else:continue
                r['settledAt']=now.isoformat();r['resultSource']=f'{API}/game/{game_pk}/boxscore'
        except Exception:continue
    archive['updatedAt']=now.isoformat()
    write(ROOT/'data/hr-quality.json',quality);write(archive_path,archive)
    print('Contact players:',len(quality['players']),'pregame records:',len(archive['records']))
if __name__=='__main__':main()
