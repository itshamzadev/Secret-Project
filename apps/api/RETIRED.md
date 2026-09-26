# Legacy API retirement

`apps/api` is retained as source and a compatibility/test target only. It is
not part of the distributed production runtime after Phase 14. Production
traffic enters `servers/gateway` and is routed to the independently deployed
service that owns each route family.

The monolith may still be started explicitly for migration tests with
`pnpm run legacy:dev`; it must not be exposed publicly or configured as a
Gateway fallback.
