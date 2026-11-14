import importlib.util
from pathlib import Path
import unittest
from datetime import datetime
from unittest.mock import patch
from types import SimpleNamespace
spec=importlib.util.spec_from_file_location('reminders_server',Path(__file__).parents[1]/'server.py')
s=importlib.util.module_from_spec(spec);spec.loader.exec_module(s)
class RemindersTests(unittest.TestCase):
 def test_do_now_selection_and_all_day(self):
  now=datetime(2026,7,14,12,tzinfo=s.TZ)
  rows=[{'id':str(i),'dueDate':due,'dueDateIsAllDay':True} for i,due in enumerate(['2026-07-13T00:00:00Z','2026-07-14T00:00:00Z','2026-07-15T00:00:00Z'])]
  rows.extend([{'id':'undated'},{'id':'done','isCompleted':True,'dueDate':'2026-07-12T00:00:00Z'}, {'id':'timed','dueDate':'2026-07-13T23:30:00Z'}])
  items=s.normalise_reminders(rows,now)
  self.assertEqual({i['id'] for i in items},{'0','1','timed'})
  self.assertFalse(next(i for i in items if i['id']=='1')['overdue'])
  self.assertEqual(next(i for i in items if i['id']=='1')['due'],'2026-07-14T00:00:00+0100')
 def test_failure_is_not_successful_empty(self):
  with patch.object(s.subprocess,'run',return_value=SimpleNamespace(returncode=1,stdout='')):
   with self.assertRaises(RuntimeError):s.fetch_reminders()
 def test_reader_only_uses_read_command(self):
  with patch.object(s.subprocess,'run',return_value=SimpleNamespace(returncode=0,stdout='[]')) as run:
   self.assertEqual(s.fetch_reminders()['items'],[])
   self.assertEqual(run.call_args.args[0][1:],['show','open','--json','--no-input'])
if __name__=='__main__':unittest.main()
