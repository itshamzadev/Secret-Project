# Phase 14 port plan

| Component           | Default port | Exposure          |
| ------------------- | -----------: | ----------------- |
| Gateway             |         5000 | Public entrypoint |
| Auth Server         |         5101 | Private           |
| Message Server      |         5102 | Private           |
| Call Server         |         5103 | Private           |
| Media Server        |         5104 | Private           |
| Notification Server |         5105 | Private           |
| Search / AI Server  |         5106 | Private           |
| Admin Server        |         5107 | Private           |
| Realtime Hub        |         5108 | Private           |
| Relationship Server |         5109 | Private           |
| Status Server       |         5110 | Private           |
| MongoDB             |        27017 | Private only      |
| Redis               |         6379 | Private only      |

The old `apps/api` port 5001 is a migration-test/rollback port only. It is not
configured in Gateway and is not part of distributed production. All service
URLs and ports remain environment configurable; these are local defaults, not
hardcoded production addresses.
