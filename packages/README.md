# Root package audit

Active deployable services under `servers/` do not import root workspace
packages at runtime. They contain their own transport types, configuration,
logging, and service-auth implementations so each service can be copied and
built independently.

| Package | Current use | Status |
| --- | --- | --- |
| `@terqivo/contracts` | Android/web/desktop/admin clients and retired API compatibility types | Active client contract package; not a server runtime dependency |
| `@terqivo/auth-core` | `apps/api` compatibility source | Legacy only; no active service imports it |
| `@terqivo/logger` | `apps/api` compatibility source | Legacy only; no active service imports it |
| `@terqivo/config` | Phase 2 foundation used only by the inactive service-auth package | Inactive foundation; not a server runtime dependency |
| `@terqivo/service-auth` | Phase 2 foundation tests/package only | Inactive foundation; active services use local compatible validators |
| `@terqivo/events` | Phase 2 event-contract foundation only | Inactive foundation; no broker or active service import |

The inactive foundations are retained as uncommitted architecture history and
are not part of any service's production dependency graph. They can be removed
in a separate package cleanup once Phase 2 compatibility history is no longer
needed. No active service may add a `workspace:*` runtime dependency on them.
