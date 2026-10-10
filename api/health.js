/** GET /api/health — liveness probe for uptime monitors (1000-client rollout). */
export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(JSON.stringify({ ok: true, service: 'market', ts: Date.now() }));
}
