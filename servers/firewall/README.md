# Firewall

Reserved for production network policy. Public traffic should be limited to
TLS/HTTPS through the load balancer; MongoDB, Redis, and internal service ports
must remain private.

See `policy.example.json` for the platform-neutral baseline. It is a template,
not a firewall command set; the final rules must be applied in the hosting
provider after the service ports and private network are confirmed.
