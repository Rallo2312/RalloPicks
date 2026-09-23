import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from hr_experiment_evaluation import compare
class Experiments(unittest.TestCase):
 def rows(self):
  return [dict(snapshotSchema=2,modelVersion='base1',date='2026-09-24',board='top10',playerId=i,baseScore=90-i,lineup='confirmed',recordedAt='2026-09-24T12:00:00Z',gameDate='2026-09-24T22:00:00Z',status='hit' if i==4 else 'miss',experiments={'test':{'version':'v1','score':i}}) for i in range(1,5)]
 def result(self,rows):return next(iter(compare(rows)['comparisons'].values()))
 def test_forward_paired(self):
  r=self.result(self.rows());self.assertEqual(r['summary']['baselineHits'],0);self.assertEqual(r['summary']['challengerHits'],1);self.assertFalse(r['automaticPromotion'])
 def test_missing_excludes_entire_pool(self):
  rows=self.rows();rows[0]['experiments']['test']['score']=None
  r=self.result(rows);self.assertEqual(r['excludedCohorts'],1);self.assertEqual(r['summary']['dates'],0)
 def test_pending_waits(self):
  rows=self.rows();rows[0]['status']='pending';self.assertEqual(self.result(rows)['pendingCohorts'],1)
 def test_void_not_replaced(self):
  rows=self.rows();rows[0]['status']='void';r=self.result(rows);self.assertEqual(r['summary']['baselineGraded'],2);self.assertEqual(r['summary']['baselineHits'],0)
 def test_legacy_excluded(self):
  rows=self.rows();rows[0]['snapshotSchema']=1
  self.assertEqual(self.result(rows)['excludedCohorts'],1)
if __name__=='__main__':unittest.main()
