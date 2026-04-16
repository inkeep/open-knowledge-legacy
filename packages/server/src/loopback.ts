/**
 * Loopback-address predicate for gating host-shape endpoints.
 *
 * Node sets `req.socket.remoteAddress` to the peer's address as a string. For
 * connections that arrived via loopback it's one of the four shapes below —
 * anything else (LAN, public, or a misconfigured proxy) is refused by callers
 * that MUST NOT disclose the host (e.g. `GET /api/workspace` discloses the
 * absolute filesystem path, which is local-editing-only data).
 *
 * Accepts:
 *   - `127.0.0.1`                 classic IPv4 loopback
 *   - `127.X.Y.Z`                 anywhere in the `127.0.0.0/8` block (Linux
 *                                 does hand out non-.0.0.1 loopback addresses
 *                                 when apps open them explicitly)
 *   - `::1`                       IPv6 loopback
 *   - `::ffff:127.0.0.1`          IPv4-mapped IPv6 (dual-stack sockets on
 *                                 Linux/macOS represent `127.0.0.1` this way
 *                                 when the listener is `::` instead of `0.0.0.0`)
 *
 * Rejects: undefined (socket already closed — treat as untrusted), every
 * public/private-LAN v4 address, every v6 address outside `::1`, and any
 * IPv4-mapped v6 address that isn't loopback (e.g. `::ffff:192.168.1.5`).
 */
export function isLoopbackAddress(remote: string | undefined): boolean {
  if (!remote) return false;
  if (remote === '::1') return true;
  if (remote === '::ffff:127.0.0.1') return true;
  // IPv4 loopback block (127.0.0.0/8). `startsWith('127.')` is sufficient —
  // string peers never contain arbitrary trailing garbage under Node's parser.
  if (remote.startsWith('127.')) return true;
  return false;
}
