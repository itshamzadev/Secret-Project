# Load balancer plan

Reserved for the production edge/load-balancer configuration. The legacy
prototype remains at `servers/loadbalancer/` during Phase 2. Future rules must
support HTTP, WebSocket upgrades, Socket.IO stickiness/Redis fanout where
needed, health checks and forwarded headers.
