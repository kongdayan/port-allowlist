// Additive control-plane tables. Also callable through the existing SQL RPC during rolling upgrades.
export const controlSchema = [
 'CREATE TABLE IF NOT EXISTS port_owners(port INTEGER PRIMARY KEY CHECK(port BETWEEN 1 AND 65535),customer_id TEXT NOT NULL REFERENCES customers(id))',
 'CREATE TABLE IF NOT EXISTS cloud_rules(ref TEXT PRIMARY KEY,cidr TEXT NOT NULL,present INTEGER NOT NULL DEFAULT 1,seen_at INTEGER NOT NULL,delete_requested_at INTEGER,deleted_at INTEGER)',
 'CREATE TABLE IF NOT EXISTS client_portals(hostname TEXT PRIMARY KEY,customer_id TEXT NOT NULL UNIQUE REFERENCES customers(id))',
 'CREATE TABLE IF NOT EXISTS telemetry_samples(at INTEGER PRIMARY KEY,payload TEXT NOT NULL)',
];
