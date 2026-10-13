import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
import json
from types import SimpleNamespace
spec=importlib.util.spec_from_file_location('frame_server',Path(__file__).parents[1]/'server.py')
s=importlib.util.module_from_spec(spec);spec.loader.exec_module(s)
class SourcesTests(unittest.TestCase):
 def test_recurring_occurrences_deduplicate_by_uid_and_start(self):
  def e(start):return {'id':start,'iCalUID':'series','summary':'Meeting','start':{'dateTime':start},'end':{'dateTime':start}}
  a=e('2026-10-13T10:00:00Z');b=e('2026-10-14T10:00:00Z')
  self.assertEqual(len(s.normalise_events([('A',a),('B',a),('A',b)])),2)
 def test_cancelled_and_declined_are_not_shown(self):
  a={'id':'1','start':{'date':'2026-10-13'},'status':'cancelled'}
  b={'id':'2','start':{'date':'2026-10-13'},'attendees':[{'self':True,'responseStatus':'declined'}]}
  self.assertEqual(s.normalise_events([('A',a),('A',b)]),[])
 def test_all_day_end_is_preserved(self):
  e={'id':'1','start':{'date':'2026-10-13'},'end':{'date':'2026-10-14'}}
  row=s.normalise_events([('A',e)])[0]
  self.assertTrue(row['allDay']);self.assertEqual(row['end'],'2026-10-14')
 def test_pagination_is_followed(self):
  calls=[]
  def run(cmd,**kwargs):
   p=json.loads(cmd[cmd.index('--params')+1]);calls.append(p)
   return SimpleNamespace(returncode=0,stdout=json.dumps({'items':[{'id':str(len(calls))}],'nextPageToken':'second'} if len(calls)==1 else {'items':[{'id':'2'}]}))
  with patch.object(s.subprocess,'run',run):self.assertEqual(len(s.read_calendar(('a','A'))),2)
  self.assertEqual(calls[1]['pageToken'],'second');self.assertTrue(calls[0]['singleEvents'])
 def test_provider_failure_is_not_an_empty_calendar(self):
  with patch.object(s.subprocess,'run',return_value=SimpleNamespace(returncode=1,stdout='')):
   with self.assertRaises(RuntimeError):s.read_calendar(('a','A'))
if __name__=='__main__':unittest.main()
