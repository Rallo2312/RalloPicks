"""Evaluate frozen score versions on future recorded selections; never tune on outcomes."""
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

def evaluate(records):
    groups=defaultdict(list)
    legacy=0
    for row in records:
        if row.get('snapshotSchema')!=2 or not row.get('modelVersion'):
            legacy+=1;continue
        try:
            saved=datetime.fromisoformat(row['recordedAt'].replace('Z','+00:00'))
            start=datetime.fromisoformat(row['gameDate'].replace('Z','+00:00'))
            if saved>=start:continue
        except (KeyError,ValueError,TypeError):continue
        groups[(row['modelVersion'],row['date'],row['board'])].append(row)
    versions={}
    for (version,date,board),rows in sorted(groups.items()):
        v=versions.setdefault(version,{'completedCohorts':0,'pendingCohorts':0,'top3Hits':0,'top3Picks':0,'poolHits':0,'poolPicks':0,'cohorts':[]})
        # Select before examining outcomes. Voids are removed from denominator only;
        # they must never be replaced by the next-best player after a game ends.
        ranked=sorted(rows,key=lambda r:(-r['baseScore'],str(r['playerId'])))
        if any(r['status']=='pending' for r in ranked):
            v['pendingCohorts']+=1;continue
        graded=[r for r in ranked if r['status'] in ('hit','miss')]
        top=[r for r in ranked[:3] if r['status'] in ('hit','miss')]
        if not graded:continue
        v['completedCohorts']+=1
        v['top3Hits']+=sum(r['status']=='hit' for r in top);v['top3Picks']+=len(top)
        v['poolHits']+=sum(r['status']=='hit' for r in graded);v['poolPicks']+=len(graded)
        v['cohorts'].append({'date':date,'board':board,'recordedCandidates':len(rows),'top3Hits':sum(r['status']=='hit' for r in top),'top3Graded':len(top)})
    return {'updatedAt':datetime.now(timezone.utc).isoformat(),'status':'collecting_prospective_results','legacyRecordsExcluded':legacy,'versions':versions,'notes':['Scores are research indices, not HR probabilities.','Top three refers to the recorded board pool, not a complete market or a guaranteed published Top 3.','Pending cohorts are withheld; void top picks are not replaced after outcomes.','Different model versions are evaluated separately. No automatic promotion or claim of improved accuracy.','Pitch mix, weather and contact snapshots are stored for future factor tests; missing evidence remains missing.']}

if __name__=='__main__':
    root=Path(__file__).resolve().parents[1]
    archive=json.loads((root/'data/hr-history.json').read_text())
    (root/'data/hr-score-evaluation.json').write_text(json.dumps(evaluate(archive['records']),indent=2)+'\n')
