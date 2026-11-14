/**
 * Who is the laptop itself (moved here from remote-server.js for PLAN.md
 * 23.17f, so `npm run signin` 25 measures the rule the show server ships and
 * not a copy of it; remote-server.js starts a server when imported).
 *
 * A request from this machine, not forwarded by the tunnel or a proxy, and
 * addressed to this machine by a local name. The last part is what stops DNS
 * rebinding: a web page anywhere can point its own name at 127.0.0.1 and have
 * the laptop's browser fetch `/remote-info.json` from it, and that request
 * comes from loopback with no forwarding headers. Its Host is the page's name,
 * though, which is how it is told apart. The Mac app loads
 * `http://localhost:<port>` and asks `127.0.0.1` for the key, so both pass.
 */
export const LOOPBACK = /^(127\.|::1$|::ffff:127\.)/;

export const isLaptop = (req) => {
  if (!LOOPBACK.test(req.socket.remoteAddress ?? '')) return false;
  if (req.headers['x-forwarded-for'] || req.headers['cf-connecting-ip']) return false;
  const host = String(req.headers.host ?? '').replace(/:\d+$/, '').replace(/^\[|\]$/g, '').toLowerCase();
  return host === 'localhost' || host === '::1' || /^127\.\d+\.\d+\.\d+$/.test(host);
};
