import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from hr_score_evaluation import evaluate
class Evaluation(unittest.TestCase):
 def row(self,i,status='miss',version='a'):
  return dict(snapshotSchema=2,modelVersion=version,date='2026-09-23',board='top10',playerId=i,baseScore=90-i,recordedAt='2026-09-23T15:00:00Z',gameDate='2026-09-23T20:00:00Z',status=status)
 def test_void_not_replaced(self):
  v=evaluate([self.row(1,'void'),self.row(2),self.row(3),self.row(4,'hit')])['versions']['a']
  self.assertEqual((v['top3Picks'],v['top3Hits']),(2,0))
 def test_pending_and_versions(self):
  v=evaluate([self.row(1,'pending'),self.row(2,'hit'),self.row(3,'hit','b')])['versions']
  self.assertEqual(v['a']['top3Picks'],0);self.assertEqual(v['b']['top3Hits'],1)
 def test_legacy_and_late_excluded(self):
  r=self.row(1);r['recordedAt']='2026-09-23T21:00:00Z'
  v=evaluate([r,{'status':'hit'}]);self.assertEqual(v['versions'],{});self.assertEqual(v['legacyRecordsExcluded'],1)
if __name__=='__main__':unittest.main()
