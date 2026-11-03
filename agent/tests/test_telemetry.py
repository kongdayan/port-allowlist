def fixture_ip(*octets):
    return ".".join(map(str, octets))

import pathlib,sys,unittest
sys.path.insert(0,str(pathlib.Path(__file__).parents[1]))
from agent import Telemetry, desired_ips, SyncError

class TelemetryTests(unittest.TestCase):
    def test_samples_real_socket_deltas_and_handles_new_connections(self):
        s={};t=Telemetry('/unused',s)
        first=f'0 0 {fixture_ip(10,0,0,1)}:10800 {fixture_ip(8,8,8,8)}:50000\n\t cubic bytes_sent:2000 bytes_received:1000\n'
        r=t.sample(first,1000);self.assertFalse(r['traffic_available'])
        second=f'0 0 {fixture_ip(10,0,0,1)}:10800 {fixture_ip(8,8,8,8)}:50000\n\t cubic bytes_sent:7000 bytes_received:3000\n0 0 {fixture_ip(10,0,0,1)}:10800 {fixture_ip(1,1,1,1)}:50001\n\t cubic bytes_sent:100 bytes_received:200\n'
        r=t.sample(second,1010)
        self.assertEqual(r['active'],{fixture_ip(8,8,8,8):1,fixture_ip(1,1,1,1):1})
        self.assertEqual(r['traffic'][fixture_ip(8,8,8,8)],{'up_bps':200,'down_bps':500})
        self.assertEqual(r['traffic'][fixture_ip(1,1,1,1)],{'up_bps':20,'down_bps':10})
        self.assertEqual(t.sample('',1020)['traffic'],{})
    def test_private_peers_ignored_and_stale_counters_reset(self):
        t=Telemetry('/unused',{});raw=f'0 0 {fixture_ip(10,0,0,1)}:10800 {fixture_ip(127,0,0,1)}:30000\n\t bytes_sent:999999 bytes_received:999999\n'
        self.assertEqual(t.sample(raw,1000)['active'],{})
        self.assertFalse(t.sample(raw,1200)['traffic_available'])
    def test_annual_grants_are_supported_but_unbounded_grants_rejected(self):
        policy={'port':10800,'entries':[{'ip':fixture_ip(1,1,1,1),'expires_at':1000+365*86400}]}
        self.assertEqual(desired_ips(policy,1000),{fixture_ip(1,1,1,1) + '/32'})
        policy['entries'][0]['expires_at']=1000+400*86400
        with self.assertRaises(SyncError):desired_ips(policy,1000)
