import sys
from pathlib import Path
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parents[1]))
import operations as ops


class OperationsTests(unittest.TestCase):
    def test_usage_allowlists_fields_and_distinguishes_windows_from_tokens(self):
        result = ops.normalise_usage({'accountId': 'private', 'rateLimits': {'planType': 'pro',
            'credits': {'balance': 'private'}, 'primary': {'usedPercent': 120, 'windowDurationMins': 300, 'resetsAt': 1792475412}}}, {})
        self.assertEqual(result['windows'][0]['remainingPercent'], 0)
        self.assertFalse(result['usageAvailable'])
        self.assertNotIn('private', str(result))

    def test_missing_allowance_is_not_unlimited(self):
        result = ops.normalise_usage({'rateLimits': {}}, {})
        self.assertEqual(result['status'], 'unavailable')
        self.assertEqual(result['windows'], [])

    def test_linear_follows_pages_and_targets_rich_not_api_key_owner(self):
        def issue(identifier):
            return {'identifier': identifier, 'state': {'type': 'started'}, 'priority': 1}
        responses = [{'users': {'nodes': [{'id': 'rich-user'}]}},
                     {'issues': {'nodes': [issue('AG-1')], 'pageInfo': {'hasNextPage': True, 'endCursor': 'next'}}},
                     {'issues': {'nodes': [issue('AG-2')], 'pageInfo': {'hasNextPage': False}}}]
        with patch.object(ops, 'linear_query', side_effect=responses) as query:
            result = ops.fetch_linear()
            self.assertEqual(len(result['items']), 2)
            self.assertEqual(result['richId'], 'rich-user')
            self.assertNotIn('assignee', query.call_args_list[1].args[1]['filter'])
            self.assertEqual(query.call_args_list[2].args[1]['after'], 'next')

    def test_unknown_rich_identity_is_an_error(self):
        with patch.object(ops, 'linear_query', return_value={'users': {'nodes': []}}):
            with self.assertRaises(RuntimeError):
                ops.fetch_linear()


if __name__ == '__main__':
    unittest.main()
