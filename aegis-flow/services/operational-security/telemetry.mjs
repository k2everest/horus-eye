export class Telemetry {
  #counts = new Map(); #totalMs = 0; #total = 0;
  record(route, status, elapsed) {
    const key = `${route}:${Math.floor(status / 100)}xx`;
    this.#counts.set(key, (this.#counts.get(key) ?? 0) + 1); this.#total++; this.#totalMs += elapsed;
  }
  render({ bodies, verifying, ready }) {
    return ['# TYPE aegis_http_requests_total counter', ...[...this.#counts].map(([key, count]) => {
      const [route, status] = key.split(':'); return `aegis_http_requests_total{route="${route}",status="${status}"} ${count}`;
    }), '# TYPE aegis_http_duration_seconds_sum counter', `aegis_http_duration_seconds_sum ${this.#totalMs / 1000}`,
    `aegis_http_duration_seconds_count ${this.#total}`, '# TYPE aegis_inflight_bodies gauge', `aegis_inflight_bodies ${bodies}`,
    '# TYPE aegis_verifier_busy gauge', `aegis_verifier_busy ${Number(verifying)}`, '# TYPE aegis_ready gauge', `aegis_ready ${Number(ready)}`, ''].join('\n');
  }
}
