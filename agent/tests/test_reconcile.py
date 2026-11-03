def fixture_ip(*octets):
    return ".".join(map(str, octets))

import copy
import hashlib
import pathlib
import sys
import unittest
sys.path.insert(0, str(pathlib.Path(__file__).parents[1]))
from agent import PREFIX, SyncError, reconcile, owned, desired_ips, Alibaba, rule_reference


def rule(ip, managed=True, port='10800/10800', rule_id='r1'):
    return {'Direction': 'ingress', 'IpProtocol': 'TCP', 'PortRange': port, 'Policy': 'Accept',
            'SourceCidrIp': ip, 'SecurityGroupRuleId': rule_id,
            'Description': PREFIX + hashlib.sha256(ip.encode()).hexdigest()[:16] if managed else 'manual'}


class Fake:
    def __init__(self, rules, fail_add=False, invisible_add=False):
        self.data = copy.deepcopy(rules); self.events = []; self.fail_add = fail_add; self.invisible_add = invisible_add
    def rules(self): return copy.deepcopy(self.data)
    def add(self, cidrs):
        self.events.append(('add', cidrs))
        if self.fail_add: raise SyncError('denied')
        if not self.invisible_add:
            self.data += [rule(ip, rule_id='new-'+ip) for ip in cidrs]
    def delete_existing(self,r,reference):
        if rule_reference(r)!=reference:raise SyncError('mismatch')
        self.events.append(('delete-existing',r['SourceCidrIp']))
        self.data=[x for x in self.data if x['SecurityGroupRuleId']!=r['SecurityGroupRuleId']]
    def delete(self, r):
        self.events.append(('delete', r['SourceCidrIp'])); self.data = [x for x in self.data if x['SecurityGroupRuleId'] != r['SecurityGroupRuleId']]


def snapshot(*ips): return {'port': 10800, 'entries': [{'ip': ip, 'expires_at': 2000} for ip in ips]}


class ReconcileTests(unittest.TestCase):
    def test_add_is_verified_before_old_rule_removed(self):
        p = Fake([rule(fixture_ip(8,8,8,8) + '/32')]); reconcile(p, snapshot(fixture_ip(1,1,1,1)), True, 1000)
        self.assertEqual([e[0] for e in p.events], ['add', 'delete'])
    def test_failed_add_preserves_every_old_rule(self):
        p = Fake([rule(fixture_ip(8,8,8,8) + '/32')], fail_add=True)
        with self.assertRaises(SyncError): reconcile(p, snapshot(fixture_ip(1,1,1,1)), True, 1000)
        self.assertEqual(len(p.data), 1); self.assertNotIn('delete', [e[0] for e in p.events])
    def test_unconfirmed_add_cannot_remove_old_access(self):
        p = Fake([rule(fixture_ip(8,8,8,8) + '/32')], invisible_add=True)
        with self.assertRaises(SyncError): reconcile(p, snapshot(fixture_ip(1,1,1,1)), True, 1000)
        self.assertNotIn('delete', [e[0] for e in p.events])
    def test_legacy_network_and_other_ports_never_modified(self):
        baseline = [rule(fixture_ip(1,1,1,0) + '/31', False), rule(fixture_ip(8,8,8,8) + '/32', True, '22222/22222')]
        p = Fake(baseline); reconcile(p, snapshot(fixture_ip(1,1,1,1)), True, 1000)
        self.assertEqual(p.data, baseline); self.assertEqual(p.events, [])
    def test_dry_run_has_no_mutations(self):
        p = Fake([rule(fixture_ip(8,8,8,8) + '/32')]); reconcile(p, snapshot(fixture_ip(1,1,1,1)), False, 1000); self.assertEqual(p.events, [])
    def test_shared_ip_is_deduplicated(self):
        p = Fake([]); reconcile(p, snapshot(fixture_ip(1,1,1,1), fixture_ip(1,1,1,1)), True, 1000); self.assertEqual(len(p.data), 1)
    def test_expired_policy_removes_only_owned_entries(self):
        p = Fake([rule(fixture_ip(8,8,8,8) + '/32'), rule(fixture_ip(9,9,9,9) + '/32', False, rule_id='manual')])
        reconcile(p, snapshot(), True, 3000); self.assertEqual(p.data[0]['SecurityGroupRuleId'], 'manual')
    def test_invalid_policy_never_becomes_empty_policy(self):
        for v in [{}, {'port': 22, 'entries': []}, {'port':10800,'entries':[None]}, snapshot(fixture_ip(0,0,0,0) + '/0'), snapshot(fixture_ip(127,0,0,1))]:
            with self.assertRaises(SyncError): desired_ips(v, 1000)
    def test_cloud_bare_ipv4_is_equivalent_to_32(self):
        existing = rule(fixture_ip(8,8,8,8) + '/32'); existing['SourceCidrIp'] = fixture_ip(8,8,8,8)
        p = Fake([existing,rule(fixture_ip(9,9,9,9),False,rule_id='legacy')])
        result = reconcile(p,snapshot(fixture_ip(8,8,8,8)),True,1000)
        self.assertEqual(p.events,[])
        self.assertEqual(result['managed'],[fixture_ip(8,8,8,8) + '/32'])
        self.assertEqual(result['legacy'],[fixture_ip(9,9,9,9) + '/32'])

    def test_only_explicitly_selected_existing_10800_rule_can_be_deleted(self):
        one=rule(fixture_ip(8,8,8,8) + '/32',False,rule_id='chosen');other=rule(fixture_ip(9,9,9,9) + '/32',False,rule_id='other');ssh=rule(fixture_ip(1,1,1,1) + '/32',False,port='22222/22222',rule_id='ssh')
        p=Fake([one,other,ssh]);policy=snapshot();policy['delete_legacy']=[rule_reference(one)]
        reconcile(p,policy,True,1000)
        self.assertEqual([r['SecurityGroupRuleId'] for r in p.data],['other','ssh'])
        self.assertEqual(p.events,[('delete-existing',fixture_ip(8,8,8,8) + '/32')])
    def test_network_delete_preserves_live_grants_by_staging_replacements(self):
        old=rule(fixture_ip(1,1,1,0) + '/31',False);p=Fake([old]);policy=snapshot(fixture_ip(1,1,1,1));policy['delete_legacy']=[rule_reference(old)]
        reconcile(p,policy,True,1000);self.assertEqual([e[0] for e in p.events],['add','delete-existing']);self.assertEqual(p.data[0]['SourceCidrIp'],fixture_ip(1,1,1,1) + '/32')
    def test_failed_replacement_never_deletes_selected_existing_rule(self):
        old=rule(fixture_ip(1,1,1,0) + '/31',False);p=Fake([old],fail_add=True);policy=snapshot(fixture_ip(1,1,1,1));policy['delete_legacy']=[rule_reference(old)]
        with self.assertRaises(SyncError):reconcile(p,policy,True,1000)
        self.assertEqual(p.data,[old])
    def test_invalid_deletion_reference_is_rejected_before_cloud_changes(self):
        p=Fake([]);policy=snapshot();policy['delete_legacy']=['arbitrary-rule-id']
        with self.assertRaises(SyncError):reconcile(p,policy,True,1000)
        self.assertEqual(p.events,[])

    def test_permission_boundary_is_enforced_in_provider(self):
        p = Alibaba('cn-shanghai', 'sg-test', 'test', 'test')
        with self.assertRaises(SyncError): p.delete(rule(fixture_ip(8,8,8,8) + '/32', port='22/22'))
        with self.assertRaises(SyncError): p.call('RunCommand', {})


if __name__ == '__main__': unittest.main()

class ConfiguredPortTests(unittest.TestCase):
    def test_provider_and_policy_are_pinned_to_nondefault_port(self):
        import agent
        from unittest.mock import patch
        with patch.object(agent, 'PORT', 9443):
            provider = object.__new__(Alibaba)
            calls = []
            provider.call = lambda action, params: calls.append((action, params))
            provider.add([fixture_ip(11, 0, 0, 210) + '/32'])
            self.assertEqual(calls[0][1]['Permissions.1.PortRange'], '9443/9443')
            with self.assertRaises(SyncError): desired_ips(snapshot(fixture_ip(11, 0, 0, 210)), 1000)
            with self.assertRaises(SyncError): provider.delete(rule(fixture_ip(11, 0, 0, 210) + '/32'))
