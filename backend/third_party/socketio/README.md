# Local Socket.IO fork

This is the `github.com/doquangtan/socketio/v4` module at v4.1.8 from
`https://github.com/doquangtan/socket.io-golang` with a local
connection-lifecycle fix. The upstream socket writer could dereference a
connection while a disconnect concurrently cleared it, causing a panic in an
HTTP handler. The fork synchronizes connection reads, writes, upgrades, and
shutdown, and includes a regression test for the concurrent writer/disconnect
case.

When upgrading the dependency, carry this fix forward or remove the local
replacement from `backend/go.mod` after the upstream version includes it.
