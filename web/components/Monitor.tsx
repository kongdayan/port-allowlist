import { useState } from 'react';
import type { Sample, AccessEvent } from '../types';
import { bytes } from '../i18n';
import { Icon, usePortal, displayIP } from '../ui';
type ChartPoint = Omit<Sample, 'connections'> & { connections: number | null };
function Chart({
  points,
  keys,
  rate = false,
  title,
}: {
  points: ChartPoint[];
  keys: ('up_bps' | 'down_bps' | 'connections')[];
  rate?: boolean;
  title: string;
}) {
  const { state, t, clock } = usePortal();
  const width = 640,
    height = 164,
    left = 54,
    right = 12,
    bottom = 28,
    top = 14;
  const samples = points
    .flatMap((p) => keys.map((key) => p[key]))
    .filter((v): v is number => v !== null && v !== undefined);
  const max = Math.max(rate ? 1024 : 2, ...samples) * 1.15;
  const x = (i: number) => left + (i * (width - left - right)) / Math.max(1, points.length - 1),
    y = (v: number) => height - bottom - (v * (height - top - bottom)) / max;
  return (
    <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
      <title>{title}</title>
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line
            className="chart-grid"
            x1={left}
            x2={width - right}
            y1={y(max * f)}
            y2={y(max * f)}
          />
          <text className="chart-label" x={0} y={y(max * f) + 4}>
            {rate ? bytes(max * f, state.locale) : Math.round(max * f)}
          </text>
        </g>
      ))}
      {keys.map((key, index) => {
        let path = '',
          previous = false;
        for (let i = 0; i < points.length; i++) {
          const value = points[i][key];
          if (value === null || value === undefined) {
            previous = false;
            continue;
          }
          path += (previous ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(value).toFixed(1) + ' ';
          previous = true;
        }
        return (
          <g key={key}>
            <path className={'chart-line line-' + index} d={path} />
            {points.map((p, i) =>
              p[key] === null || p[key] === undefined ? null : (
                <circle
                  className={'chart-point line-' + index}
                  key={p.at}
                  cx={x(i)}
                  cy={y(p[key]!)}
                  r={samples.length < 8 ? 3 : 1.6}
                >
                  <title>
                    {clock(p.at)} · {rate ? bytes(p[key]!, state.locale) + '/s' : p[key]}
                  </title>
                </circle>
              ),
            )}
          </g>
        );
      })}
      <text className="chart-label" x={left} y={height - 5}>
        {clock(points[0]?.at || state.dashboard!.server_time)}
      </text>
      <text className="chart-label" textAnchor="end" x={width - right} y={height - 5}>
        {t('now')}
      </text>
      {!samples.length && (
        <text className="chart-empty" x={width / 2} y={height / 2} textAnchor="middle">
          {t('waitingSample')}
        </text>
      )}
    </svg>
  );
}
export function Monitor() {
  const { state, t, clock } = usePortal();
  const d = state.dashboard!;
  const [range, setRange] = useState(15);
  const fresh =
    d.synchronization.state === 'ready' ||
    d.synchronization.state === 'dry_run' ||
    d.synchronization.state === 'error';
  const current = d.monitor.current;
  const bucket = Math.floor(d.server_time / 60) * 60;
  const byTime = new Map(d.monitor.history.map((point) => [Math.floor(point.at / 60) * 60, point]));
  if (fresh && current.at) byTime.set(Math.floor(current.at / 60) * 60, current);
  const points: ChartPoint[] = Array.from({ length: range + 1 }, (_, i) => {
    const at = bucket - (range - i) * 60;
    return (
      byTime.get(at) || {
        at,
        connections: null,
        ips: 0,
        up_bps: null,
        down_bps: null,
        healthy: null,
      }
    );
  });
  const rate = (value: number | null) =>
    fresh && value !== null ? bytes(value, state.locale) + '/s' : '—';
  return (
    <section className="panel monitor-panel" id="overview">
      <header className="section-heading">
        <div>
          <h2>{t('trafficTitle')}</h2>
          <p>{t('trafficIntro')}</p>
        </div>
        <div className="segmented" aria-label={t('chartRange')}>
          {[15, 60].map((n) => (
            <button key={n} data-range={n} aria-pressed={range === n} onClick={() => setRange(n)}>
              {t(n === 15 ? 'past15' : 'past60')}
            </button>
          ))}
        </div>
      </header>
      <div className="metric-strip">
        <div>
          <span>
            <i className="legend-dot" />
            {t('downloadRate')}
          </span>
          <strong>{rate(current.down_bps)}</strong>
        </div>
        <div>
          <span>
            <i className="legend-dot upload" />
            {t('uploadRate')}
          </span>
          <strong>{rate(current.up_bps)}</strong>
        </div>
        <div>
          <span>{t('connections')}</span>
          <strong>{fresh ? current.connections : '—'}</strong>
        </div>
        <div>
          <span>{t('sources')}</span>
          <strong>{fresh ? current.ips : '—'}</strong>
        </div>
      </div>
      <div className="charts">
        <div>
          <span className="chart-heading">{t('trafficChart')}</span>
          <Chart points={points} keys={['down_bps', 'up_bps']} rate title={t('trafficChart')} />
        </div>
        <div>
          <span className="chart-heading">{t('connectionChart')}</span>
          <Chart points={points} keys={['connections']} title={t('connectionChart')} />
        </div>
      </div>
      {current.down_bps === null && <p className="muted sample-note">{t('noTrafficHelp')}</p>}
      {current.limited && <p className="muted sample-note">{t('limitedSample')}</p>}
      <div className="health-line">
        <span>{t('service')}</span>
        <div className="health-cells" role="img" aria-label={t('service')}>
          {points.map((p) => (
            <span
              key={p.at}
              className={
                'health-cell ' + (p.healthy === null ? 'unknown' : p.healthy ? 'healthy' : 'failed')
              }
              title={
                clock(p.at) +
                ' · ' +
                (p.healthy === null ? t('noData') : t(p.healthy ? 'ready' : 'error'))
              }
            />
          ))}
        </div>
        <span>{t('now')}</span>
      </div>
    </section>
  );
}
export function Activity() {
  const { state, store, t, time, clock } = usePortal();
  const [expanded, setExpanded] = useState(false);
  const d = state.dashboard!;
  const grouped = new Map<string, AccessEvent[]>();
  for (const event of d.events) {
    const group = grouped.get(event.ip) || [];
    group.push(event);
    grouped.set(event.ip, group);
  }
  const groups = [...grouped].sort(
    (a, b) => Math.max(...b[1].map((e) => e.at)) - Math.max(...a[1].map((e) => e.at)),
  );
  const active = d.role === 'admin' ? d.agent?.active : d.service?.active;
  return (
    <section className="panel activity-panel" id="activity">
      <header className="section-heading">
        <div>
          <h2>{t('activityTitle')}</h2>
          <p>{t('activityIntro')}</p>
        </div>
        <Icon name="activity" />
      </header>
      <div className="activity-list">
        {groups.slice(0, expanded ? groups.length : 5).map(([ip, events]) => {
          const up = events.reduce((n, e) => n + e.bytes_up, 0),
            down = events.reduce((n, e) => n + e.bytes_down, 0);
          return (
            <details
              className="activity-source"
              data-ip={displayIP(ip, store.transport.demo)}
              key={ip}
            >
              <summary>
                <span
                  className={
                    'source-glyph ' +
                    (active?.[ip] && d.synchronization.state === 'ready' ? 'connected' : '')
                  }
                >
                  <Icon name="arrow" />
                </span>
                <span className="source-name">
                  <strong className="mono sensitive">{displayIP(ip, store.transport.demo)}</strong>
                  <small>
                    {t('sessions', { count: events.length })} ·{' '}
                    {active?.[ip] && d.synchronization.state === 'ready'
                      ? t('activeConnections', { count: active[ip] })
                      : t('lastSeen', {
                          time: clock(Math.max(...events.map((e) => e.at))),
                        })}
                  </small>
                </span>
                <span className="source-transfer">
                  <strong>↓ {bytes(down, state.locale)}</strong>
                  <small>↑ {bytes(up, state.locale)}</small>
                </span>
                <Icon name="chevron" className="expand-icon" />
              </summary>
              <div className="session-details">
                {events.slice(0, 8).map((e) => (
                  <div className="session-row" key={e.id}>
                    <time>{time(e.at)}</time>
                    <span>{t('seconds', { value: e.duration.toFixed(1) })}</span>
                    <span>↑ {bytes(e.bytes_up, state.locale)}</span>
                    <span>↓ {bytes(e.bytes_down, state.locale)}</span>
                  </div>
                ))}
              </div>
            </details>
          );
        })}
        {!groups.length && (
          <div className="empty-state">
            <Icon name="activity" />
            <h3>{t('noActivity')}</h3>
            <p>{t('noActivityHelp')}</p>
          </div>
        )}
      </div>
      {groups.length > 5 && (
        <button className="text-button" onClick={() => setExpanded(!expanded)}>
          {t(expanded ? 'showLess' : 'showMore')}
        </button>
      )}
      <p className="section-footnote">{t('activityPrivacy')}</p>
    </section>
  );
}
export function Topology() {
  const { state, store, t } = usePortal();
  const [diagram, setDiagram] = useState<'nodes' | 'architecture'>('nodes');
  const d = state.dashboard!;
  const active = d.role === 'admin' ? d.agent?.active || {} : d.service?.active || {};
  const peers = [
    ...new Set([
      ...d.leases.filter((l) => !l.revoked_at && l.expires_at > d.server_time).map((l) => l.ip),
      ...Object.keys(active),
    ]),
  ].slice(0, 5);
  const live = d.synchronization.state === 'ready';
  return (
    <section className="panel topology-panel">
      <header className="section-heading">
        <div>
          <h2>{t('architecture')}</h2>
          <p>{t('topologyIntro')}</p>
        </div>
        <div className="segmented">
          <button
            data-diagram="nodes"
            aria-pressed={diagram === 'nodes'}
            onClick={() => setDiagram('nodes')}
          >
            {t('nodes')}
          </button>
          <button
            data-diagram="architecture"
            aria-pressed={diagram === 'architecture'}
            onClick={() => setDiagram('architecture')}
          >
            {t('architecture')}
          </button>
        </div>
      </header>
      {diagram === 'nodes' ? (
        <div className="node-map">
          <div className="peer-column">
            {peers.map((ip) => (
              <div className="peer-node" key={ip}>
                <span className={'status-dot ' + (live && active[ip] ? 'live' : '')} />
                <span className="mono sensitive">{displayIP(ip, store.transport.demo)}</span>
                <small>
                  {live && active[ip]
                    ? t('activeConnections', { count: active[ip] })
                    : t(
                        d.leases.find((l) => l.ip === ip)
                          ? store.grantState(d.leases.find((l) => l.ip === ip)!)
                          : 'applied',
                      )}
                </small>
              </div>
            ))}
            {!peers.length && <div className="empty-state compact">{t('noNodes')}</div>}
          </div>
          <div
            className={
              'map-connector ' + (live && Object.values(active).some((n) => n > 0) ? 'flowing' : '')
            }
            aria-hidden="true"
          />
          <div className="map-node">
            <Icon name="shield" />
            <strong>{t('cloudFirewall')}</strong>
            <span>TCP {d.port}</span>
          </div>
          <div className="map-connector" aria-hidden="true" />
          <div className="map-node">
            <Icon name="network" />
            <strong>{t('serviceEndpoint')}</strong>
            <span>TCP {d.port}</span>
          </div>
        </div>
      ) : (
        <div className="architecture">
          {[
            d.role === 'admin'
              ? [t('customerScript'), 'Cloudflare', t('ecsSync'), t('aliyunGroup')]
              : [t('yourNetworks'), t('accessPortal'), t('cloudFirewall'), `TCP ${d.port}`],
            [t('approvedSource'), t('cloudFirewall'), `TCP ${d.port}`, t('serviceProcess')],
          ].map((nodes, index) => (
            <div className="architecture-path" key={index}>
              <h3>{t(index ? 'trafficPath' : 'controlPath')}</h3>
              <div className="architecture-lane">
                {nodes.map((node, i) => (
                  <div className="architecture-stop" key={i}>
                    {i > 0 && <Icon name="arrow" />}
                    <span>{node}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
