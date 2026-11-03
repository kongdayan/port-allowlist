import { useEffect, useState } from 'react';
import { installValidation } from './validation';
import { errorText, type MessageKey } from './i18n';
import type { Role, SyncState } from './types';
import { Icon, Notice, Preferences, Status, docsUrl, displayIP, usePortal } from './ui';
import { Grants } from './components/Grants';
import { Activity, Monitor, Topology } from './components/Monitor';
import { Devices, Secret } from './components/Devices';
import { CustomerPicker, CustomerSettings } from './components/Operator';
export function App() {
  const { state, store, t } = usePortal();
  useEffect(() => installValidation(state.locale), [state.locale]);
  useEffect(() => {
    document.documentElement.lang = state.locale;
    document.documentElement.dataset.theme = state.theme;
    document.title = (state.portal?.name || 'Port Allowlist') + ' · ' + t('app');
  }, [state.locale, state.theme, state.portal?.name]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden && store.state.dashboard)
        void store.refresh().catch((e) => store.fail(e));
    }, 10000);
    return () => clearInterval(timer);
  }, [store]);
  return (
    <>
      <a className="skip-link" href="#allowlist">
        {t('skip')}
      </a>
      {store.transport.demo && <DemoBar />}
      {state.loading ? (
        <div className="loading-screen" role="status">
          <Icon name="network" />
          {t('loading')}
        </div>
      ) : state.fatal ? (
        <div className="error-screen">
          <Preferences />
          <Icon name="shield" />
          <h1>{t('unavailable')}</h1>
          <p>{errorText(state.locale, state.fatal.code, state.fatal.params)}</p>
          <button className="primary" onClick={() => void store.bootstrap()}>
            {t('retry')}
          </button>
        </div>
      ) : state.dashboard ? (
        <Dashboard />
      ) : (
        <Login />
      )}
      <Notice />
      <Secret />
    </>
  );
}
function DemoBar() {
  const { state, store, t } = usePortal();
  return (
    <aside className="demo-bar" aria-label={t('demo')}>
      <span>
        <strong>{t('demo')}</strong>
        <span>{t('demoNotice')}</span>
      </span>
      <div className="demo-controls">
        <label>
          {t('demoRole')}
          <select
            value={state.dashboard?.role || 'customer'}
            onChange={(e) => void store.demoRole(e.target.value as Role)}
          >
            <option value="customer">{t('customerRole')}</option>
            <option value="admin">{t('operatorRole')}</option>
          </select>
        </label>
        <label>
          {t('demoState')}
          <select
            value={state.dashboard?.synchronization.state || 'ready'}
            onChange={(e) => void store.demoSync(e.target.value as SyncState)}
          >
            {(['ready', 'unavailable', 'dry_run', 'error', 'stale'] as const).map((state) => (
              <option key={state} value={state}>
                {t(state)}
              </option>
            ))}
          </select>
        </label>
        <button className="text-button" onClick={() => void store.resetDemo()}>
          {t('resetDemo')}
        </button>
      </div>
    </aside>
  );
}
function Login() {
  const { state, store, t } = usePortal();
  const [key, setKey] = useState('');
  const operator = state.portal?.mode === 'operator';
  return (
    <div className="login-page">
      <header className="public-header">
        <a className="wordmark" href="./">
          <span className="brand-mark">
            <Icon name="network" />
          </span>
          {state.portal?.brand || 'Port Access'}
        </a>
        <Preferences />
      </header>
      <main className="login-layout">
        <div className="login-story">
          <span className="story-port">
            <Icon name="shield" /> TCP {state.portal?.port || 10800}
          </span>
          <h1>{t('accessTitle')}</h1>
          <p>{t('accessIntro')}</p>
          <div className="login-network-art" aria-hidden="true">
            <div className="art-node">
              <Icon name="network" />
            </div>
            <div className="art-route" />
            <div className="art-gate">
              <Icon name="shield" />
            </div>
            <div className="art-route" />
            <div className="art-node">
              <Icon name="device" />
            </div>
          </div>
          <span className="muted">{t('secureLogin')}</span>
        </div>
        <section className="login-panel">
          <span className="brand-initial">{(state.portal?.name || 'P').slice(0, 1)}</span>
          <h2>{operator ? t('operatorLogin') : state.portal?.name}</h2>
          <p>{t('loginIntro')}</p>
          <form
            id="login"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await store.login(store.transport.demo ? 'DEMO' : key)) setKey('');
            }}
          >
            {!store.transport.demo && (
              <>
                <label htmlFor="key">{t('token')}</label>
                <input
                  id="key"
                  name="key"
                  type="password"
                  autoComplete="off"
                  placeholder={t('tokenPlaceholder')}
                  required
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                />
              </>
            )}
            <button className="primary" disabled={state.busy.login}>
              {t(state.busy.login ? 'signingIn' : store.transport.demo ? 'demo' : 'signIn')}
              <Icon name="arrow" />
            </button>
          </form>
          <a className="help-link" href={docsUrl(state.locale)} target="_blank" rel="noreferrer">
            {t('docs')}
            <Icon name="arrow" />
          </a>
        </section>
      </main>
      <footer className="public-footer">
        {t('app')} <span>v0.2</span>
      </footer>
    </div>
  );
}
function Dashboard() {
  const { state, store, t } = usePortal();
  const d = state.dashboard!,
    account = store.account();
  const admin = d.role === 'admin';
  const changingCustomer = admin && d.customer_id !== state.selected;
  const name = admin ? state.portal!.brand : state.portal!.name;
  const [nav, setNav] = useState('allowlist');
  return (
    <div className="app-shell">
      <header className="app-header">
        <a className="wordmark" href="#allowlist">
          <span className="brand-mark">
            <Icon name="network" />
          </span>
          <span>
            {name}
            <small>{admin ? t('operatorRole') : t('app')}</small>
          </span>
        </a>
        <nav aria-label={t('overview')}>
          {(['allowlist', 'activity', 'devices'] as const).map((id) => (
            <a
              key={id}
              href={'#' + id}
              className={nav === id ? 'active' : ''}
              onClick={() => setNav(id)}
            >
              {t(id)}
            </a>
          ))}
        </nav>
        <div className="header-actions">
          <Preferences />
          <button
            id="logout"
            className="text-button"
            onClick={() => void store.logout()}
            disabled={state.busy.logout}
          >
            {t('signOut')}
          </button>
        </div>
      </header>
      <main className="dashboard-main">
        <div className="page-heading">
          <div>
            <div className="service-label">
              <Icon name="shield" /> TCP {d.port}
            </div>
            <h1>{t(admin ? 'operatorTitle' : 'accessTitle')}</h1>
            <p>{t(admin ? 'operatorIntro' : 'accessIntro')}</p>
          </div>
          <button
            id="refresh"
            className="secondary"
            disabled={state.busy.refresh}
            onClick={() => void store.run('refresh', () => store.refresh())}
          >
            <Icon name="refresh" className={state.busy.refresh ? 'spinning' : ''} />
            {t(state.busy.refresh ? 'refreshing' : 'refresh')}
          </button>
        </div>
        {admin && <CustomerPicker />}
        {changingCustomer ? (
          <div className="panel empty-state" role="status">
            {t('loading')}
          </div>
        ) : (
          <>
            <Summary />
            {account ? (
              <>
                <Grants key={state.selected || 'customer'} />
                <Activity />
                <div className="secondary-grid">
                  <Devices key={'device-' + state.selected} />
                  <Topology />
                </div>
                <Monitor />
                {admin && <CustomerSettings key={'settings-' + state.selected} />}
                <Audit />
              </>
            ) : (
              <div className="panel empty-state">
                <Icon name="network" />
                <h2>{t('noCustomer')}</h2>
              </div>
            )}
          </>
        )}
        <footer className="app-footer">
          <span>
            {t('app')} <span className="version">v0.2</span>
          </span>
          <span>{t('timezoneHelp')}</span>
          <a href={docsUrl(state.locale)} target="_blank" rel="noreferrer">
            {t('docs')}
            <Icon name="arrow" />
          </a>
        </footer>
      </main>
    </div>
  );
}
function Summary() {
  const { state, store, t, time } = usePortal();
  const d = state.dashboard!,
    account = store.account(),
    sync = d.synchronization;
  const used =
    d.leases.filter((l) => !l.revoked_at && l.expires_at > d.server_time).length +
    d.firewall_rules.filter((r) => !r.delete_requested_at).length;

  return (
    <div className="summary-strip">
      <section className="summary-network">
        <div className="summary-label">
          <Icon name="network" />
          {t('network')}
        </div>
        <strong className="mono sensitive" id="detected-ip">
          {state.network
            ? displayIP(state.network.ipv4 || state.network.detected, store.transport.demo)
            : t('networkUnknown')}
        </strong>
        <small>
          {state.network ? t('detectedAt', { time: time(state.network.at) }) : t('networkHint')}
        </small>
        <div className="summary-actions">
          <button
            id="detect-ip"
            className="text-button"
            disabled={state.busy.detect}
            onClick={() => void store.detect()}
          >
            {t(state.busy.detect ? 'detecting' : state.network ? 'detectAgain' : 'detect')}
          </button>
          {account && (
            <button
              className="text-button"
              id="authorize-network"
              onClick={() => void store.authorizeCurrent()}
              disabled={state.busy.detect}
            >
              {t('authorizeNetwork')}
              <Icon name="arrow" />
            </button>
          )}
        </div>
      </section>
      <section className="summary-quota">
        <div className="summary-label">
          <Icon name="shield" />
          {t('permissions')}
        </div>
        <strong id="active-quota">{t('quota', { used, max: account?.max_ips || 0 })}</strong>
        <small>{t('quotaHelp')}</small>
        <progress value={used} max={account?.max_ips || 100} aria-label={t('permissions')} />
      </section>
      <section className={'summary-service sync-' + sync.state}>
        <div className="summary-label">
          <Icon name="activity" />
          {t('service')}
        </div>
        <div id="service-state">
          <Status value={sync.state} />
        </div>
        <small>
          {sync.updated_at ? t('lastSync', { time: time(sync.updated_at) }) : t('neverSynced')}
        </small>
        <p>
          {t(
            sync.state === 'ready'
              ? 'readyHelp'
              : sync.state === 'error'
                ? 'syncErrorHelp'
                : sync.state === 'dry_run'
                  ? 'dryRunHelp'
                  : sync.state === 'stale'
                    ? 'staleHelp'
                    : 'unavailableHelp',
          )}
        </p>
      </section>
      <p className="summary-footnote">{t('firewallOnly')}</p>
    </div>
  );
}
function Audit() {
  const { state, store, t, time } = usePortal();
  const rows = state.dashboard!.audit;
  return (
    <details className="panel audit-panel">
      <summary>
        {t('audit')}
        <Icon name="chevron" />
      </summary>
      <div className="audit-list">
        {rows.map((row, i) => (
          <div className="audit-row" key={row.created_at + '-' + i}>
            <time>{time(row.created_at)}</time>
            <span>{t(auditKey(row.action))}</span>
            <span className="mono sensitive">
              {row.ip ? displayIP(row.ip, store.transport.demo) : '—'}
            </span>
          </div>
        ))}
      </div>
    </details>
  );
}
const auditKeys = new Set([
  'ip.added',
  'ip.revoked',
  'ip.renewed',
  'ip.cloud_deleted',
  'device.created',
  'device.revoked',
  'customer.created',
  'customer.settings',
  'customer.key_rotated',
  'portal.bound',
]);
function auditKey(action: string): MessageKey {
  return auditKeys.has(action) ? (('audit.' + action) as MessageKey) : 'unknownAudit';
}
