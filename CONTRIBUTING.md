# Contributing

Use Node.js 22.18+ and Python 3.10+. Run setup, build, type checks, Worker runtime tests, agent tests and the browser flow documented in the README. No cloud credential is needed for tests. CI never deploys cloud resources.

Preserve the fixed-port / fixed-group boundary, add-before-delete ordering, original cached expiries, tenant isolation, explicit existing-rule deletion and owner-only credential files. Changes to these guarantees need meaningful regression tests.

Do not include live tokens, addresses, personal / customer names, domains or cloud IDs in fixtures, screenshots, issues or commits. Use example.com and generated synthetic address fixtures. Stage files deliberately, run `npm run audit:public`, then a secret scanner with redacted output before publishing. Never copy `.local`, local state, cloud CLI profiles, agent environment files, logs or production history into the repository.
