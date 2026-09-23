"""Paired forward evaluation. Never recompute challengers on historical outcomes."""
from collections import defaultdict
from datetime import datetime
import math

def compare(records):
    groups=defaultdict(list)
    for r in records:
        if r.get('snapshotSchema')!=2 or not r.get('modelVersion'):continue
        try:
            if datetime.fromisoformat(r['recordedAt'].replace('Z','+00:00'))>=datetime.fromisoformat(r['gameDate'].replace('Z','+00:00')):continue
        except (KeyError,ValueError,TypeError):continue
        groups[(r['modelVersion'],r['date'],r['board'])].append(r)
    comparisons={}
    for (baseline,date,board),rows in sorted(groups.items()):
        names=set(n for r in rows for n in r.get('experiments',{}))
        for name in sorted(names):
            versions={r.get('experiments',{}).get(name,{}).get('version') for r in rows}
            versions.discard(None)
            if len(versions)!=1:continue
            version=next(iter(versions));key=baseline+' / '+version
            out=comparisons.setdefault(key,{'baselineVersion':baseline,'challengerVersion':version,'status':'collecting','excludedCohorts':0,'pendingCohorts':0,'completedCohorts':[]})
            def valid(r):
                value=r.get('experiments',{}).get(name,{}).get('score')
                return r.get('lineup')=='confirmed' and isinstance(value,(int,float)) and math.isfinite(value)
            # Require a meaningful choice and identical complete recorded pools.
            if len(rows)<4 or not all(valid(r) for r in rows):out['excludedCohorts']+=1;continue
            if any(r['status'] not in ('hit','miss','void') for r in rows):out['pendingCohorts']+=1;continue
            base=sorted(rows,key=lambda r:(-r['baseScore'],str(r['playerId'])))[:3]
            trial=sorted(rows,key=lambda r:(-r['experiments'][name]['score'],str(r['playerId'])))[:3]
            def summary(selected):
                return {'players':[r['playerId'] for r in selected],'hits':sum(r['status']=='hit' for r in selected),'graded':sum(r['status'] in ('hit','miss') for r in selected),'voids':sum(r['status']=='void' for r in selected)}
            b,t=summary(base),summary(trial)
            out['completedCohorts'].append({'date':date,'board':board,'poolSize':len(rows),'baseline':b,'challenger':t,'samePicks':set(b['players'])==set(t['players'])})
    for out in comparisons.values():
        cohorts=out['completedCohorts'];days=defaultdict(int)
        for c in cohorts:days[c['date']]+=c['challenger']['hits']-c['baseline']['hits']
        out['summary']={'dates':len(days),'baselineHits':sum(c['baseline']['hits'] for c in cohorts),'challengerHits':sum(c['challenger']['hits'] for c in cohorts),'baselineGraded':sum(c['baseline']['graded'] for c in cohorts),'challengerGraded':sum(c['challenger']['graded'] for c in cohorts),'betterDates':sum(v>0 for v in days.values()),'worseDates':sum(v<0 for v in days.values()),'tiedDates':sum(v==0 for v in days.values()),'differentPickCohorts':sum(not c['samePicks'] for c in cohorts)}
        out['automaticPromotion']=False
    return {'comparisons':comparisons,'rules':['Only frozen pregame challenger scores are evaluated; legacy records are excluded.','Confirmed lineups and at least four recorded candidates are required.','Baseline and challenger use the identical recorded pool; missing challenger inputs exclude the whole cohort.','Pending cohorts wait; void picks are not replaced. Dates and graded counts are shown alongside hits.','These are tests on published candidate pools, not all MLB hitters. No claim of improved accuracy or profitability; no automatic promotion.']}
