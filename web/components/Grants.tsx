import { useEffect, useRef, useState, type FormEvent } from 'react';
import { betweenDays, plusDays } from '../i18n';
import type { Lease, FirewallRule, GrantState } from '../types';
import { Dialog, Icon, Status, displayIP, usePortal } from '../ui';
export function DateFields({
  date,
  setDate,
  prefix = '',
}: {
  date: string;
  setDate: (date: string) => void;
  prefix?: string;
}) {
  const { state, store, t } = usePortal();
  const expiry = state.dashboard!.expiry;
  const account = store.account()!;
  const max = account.max_manual_days;
  const [dayInput, setDayInput] = useState('');
  const days = betweenDays(expiry.today, date);
  return (
    <>
      <div className="date-fields">
        <label htmlFor={prefix + 'days'}>
          {t('days')}
          <input
            id={prefix + 'days'}
            name="days"
            type="number"
            min="1"
            max={max}
            value={dayInput || (Number.isFinite(days) ? days : '')}
            onChange={(e) => {
              setDayInput(e.target.value);
              const n = Number(e.target.value);
              if (Number.isInteger(n) && n >= 1 && n <= max) {
                setDate(plusDays(expiry.today, n));
                setDayInput('');
              }
            }}
            onBlur={() => setDayInput('')}
            required
          />
        </label>
        <label htmlFor={prefix + 'date'}>
          {t('expiry')}
          <input
            id={prefix + 'date'}
            name="expire_date"
            type="date"
            min={plusDays(expiry.today, 1)}
            max={expiry.max_expire_date}
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setDayInput('');
            }}
            required
          />
        </label>
      </div>
      <div className="date-presets">
        {[7, 30, 90, 365]
          .filter((n) => n <= max)
          .map((n) => (
            <button
              key={n}
              type="button"
              className="text-button"
              data-days={n}
              onClick={() => {
                setDate(plusDays(expiry.today, n));
                setDayInput('');
              }}
            >
              {t('daysPreset', { days: n })}
            </button>
          ))}
      </div>
      <p className="date-note deadline-preview">
        <Icon name="activity" />
        {t('midnightHelp', { date })}
      </p>
    </>
  );
}
export function Grants() {
  const { state, store, t, time, zone } = usePortal();
  const dashboard = state.dashboard!,
    account = store.account()!;
  const demo = store.transport.demo;
  const [open, setOpen] = useState(dashboard.leases.length + dashboard.firewall_rules.length === 0);
  const [ip, setIP] = useState(''),
    [label, setLabel] = useState(''),
    [date, setDate] = useState(dashboard.expiry.default_expire_date);
  const [query, setQuery] = useState(''),
    [filter, setFilter] = useState('all'),
    [renew, setRenew] = useState<Lease | null>(null),
    [confirm, setConfirm] = useState<Lease | FirewallRule | null>(null);
  const ipRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!state.grantIntent) return;
    setOpen(true);
    if (state.grantIntent.ip) setIP(state.grantIntent.ip);
    requestAnimationFrame(() => {
      ipRef.current?.focus();
      document.querySelector('#add-ip')?.scrollIntoView({
        block: 'nearest',
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      });
    });
  }, [state.grantIntent?.nonce]);
  const addCurrent = async () => {
    const network = await store.detect();
    setOpen(true);
    if (network?.ipv4) setIP(network.ipv4);
    requestAnimationFrame(() => ipRef.current?.focus());
  };
  const all = dashboard.leases.filter(
    (lease) => !lease.revoked_at || store.grantState(lease) === 'deleting',
  );
  const matches = (text: string, status: GrantState) =>
    text.toLocaleLowerCase().includes(query.toLocaleLowerCase()) &&
    (filter === 'all' ||
      (filter === 'active' && status === 'applied') ||
      (filter === 'pending' &&
        ['submitted', 'syncing', 'syncFailed', 'deleting'].includes(status)) ||
      (filter === 'expired' && status === 'expired'));
  const leases = all.filter((lease) =>
    matches(lease.ip + ' ' + lease.label, store.grantState(lease)),
  );
  const rules = dashboard.firewall_rules.filter((rule) =>
    matches(
      rule.cidr,
      rule.delete_requested_at
        ? 'deleting'
        : dashboard.synchronization.state === 'error' || dashboard.synchronization.state === 'stale'
          ? 'syncFailed'
          : 'applied',
    ),
  );
  const total = all.length + dashboard.firewall_rules.length;
  const add = async (event: FormEvent) => {
    event.preventDefault();
    if (await store.addGrant({ ip, label, expire_date: date })) {
      setIP('');
      setLabel('');
      setOpen(false);
    }
  };
  return (
    <section id="allowlist" className="panel grants-panel">
      <header className="section-heading">
        <div>
          <h2>{t('grantsTitle')}</h2>
          <p>{t('grantsIntro', { port: dashboard.port })}</p>
        </div>
        <button
          className="primary"
          type="button"
          aria-expanded={open}
          aria-controls="grant-form-panel"
          onClick={() => {
            setOpen(!open);
            requestAnimationFrame(() => ipRef.current?.focus());
          }}
        >
          <Icon name={open ? 'close' : 'plus'} />
          {t(open ? 'hideForm' : 'addGrant')}
        </button>
      </header>
      <div id="grant-form-panel" className="grant-form-panel" hidden={!open}>
        <form id="add-ip" onSubmit={add}>
          <div className="grant-fields">
            <label className="address-field" htmlFor="grant-ip">
              {t('address')}
              <div className="input-with-action">
                <input
                  ref={ipRef}
                  id="grant-ip"
                  name="ip"
                  placeholder={t('addressPlaceholder')}
                  value={ip}
                  onChange={(e) => setIP(e.target.value)}
                  required
                  maxLength={32}
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  id="fill-current-ip"
                  className="text-button"
                  onClick={() => void addCurrent()}
                  disabled={state.busy.detect}
                >
                  {t('detect')}
                </button>
              </div>
            </label>
            <label htmlFor="grant-label">
              {t('label')}
              <input
                id="grant-label"
                name="label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={t('labelPlaceholder')}
                maxLength={80}
              />
            </label>
            <DateFields date={date} setDate={setDate} prefix="grant-" />
          </div>
          <div className="form-footer">
            <span>{t('timezoneHelp')}</span>
            <button
              className="primary"
              type="submit"
              disabled={state.busy.grant || account.enabled === 0}
            >
              {state.busy.grant ? t('submitted') : t('addGrant')}
            </button>
          </div>
        </form>
      </div>
      {total > 0 && (
        <div className="list-toolbar">
          <label className="search-field">
            <Icon name="network" />
            <span className="sr-only">{t('search')}</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('search')}
            />
          </label>
          <div className="segmented" aria-label={t('status')}>
            {(['all', 'active', 'pending', 'expired'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {t(
                  (
                    {
                      all: 'filterAll',
                      active: 'filterActive',
                      pending: 'filterPending',
                      expired: 'filterExpired',
                    } as const
                  )[value],
                )}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="grant-list" role="list">
        <div className="grant-table-head" aria-hidden="true">
          <span>{t('nameSource')}</span>
          <span>{t('expiry')}</span>
          <span>{t('status')}</span>
          <span>{t('actions')}</span>
        </div>
        {leases.map((lease) => {
          const status = store.grantState(lease);
          return (
            <article key={lease.id} className="grant-row" role="listitem" data-lease-id={lease.id}>
              <div className="grant-identity">
                <span className="network-icon">
                  <Icon name={lease.device_id ? 'device' : 'network'} />
                </span>
                <div>
                  <strong>
                    {lease.device_id
                      ? t('automatic')
                      : ['Manual authorization', '手动授权'].includes(lease.label)
                        ? t('manual')
                        : lease.label || t('manual')}
                  </strong>
                  <span className="mono sensitive">{displayIP(lease.ip, demo)}</span>
                </div>
              </div>
              <div className="grant-expiry">
                <time dateTime={new Date(lease.expires_at * 1000).toISOString()}>
                  {time(lease.expires_at)}
                </time>
                <small>
                  {t(
                    lease.device_id
                      ? 'automaticExpiry'
                      : lease.expiry_kind === 'legacy_hours'
                        ? 'legacyExpiry'
                        : 'expiry',
                  )}{' '}
                  {!lease.device_id && '· ' + zone}
                </small>
              </div>
              <div className="grant-state">
                <Status value={status} />
                {['submitted', 'syncing', 'syncFailed', 'deleting'].includes(status) && (
                  <small>
                    {t(
                      status === 'deleting'
                        ? 'deletingHelp'
                        : status === 'syncFailed'
                          ? 'retryHelp'
                          : 'pendingHelp',
                    )}
                  </small>
                )}
              </div>
              <div className="row-actions">
                {!lease.revoked_at && (
                  <>
                    {!lease.device_id && (
                      <button
                        type="button"
                        className="text-button renew-ip"
                        data-id={lease.id}
                        onClick={() => setRenew(lease)}
                      >
                        {t('renew')}
                      </button>
                    )}
                    <button
                      type="button"
                      className="text-button danger revoke-ip"
                      data-id={lease.id}
                      onClick={() => setConfirm(lease)}
                    >
                      {t('delete')}
                    </button>
                  </>
                )}
              </div>
            </article>
          );
        })}
        {rules.map((rule) => (
          <article
            key={rule.ref}
            className="grant-row"
            role="listitem"
            data-firewall-ref={rule.ref}
          >
            <div className="grant-identity">
              <span className="network-icon">
                <Icon name="shield" />
              </span>
              <div>
                <strong>{t('existing')}</strong>
                <span className="mono sensitive">{displayIP(rule.cidr, demo)}</span>
              </div>
            </div>
            <div className="grant-expiry">{t('noExpiry')}</div>
            <div className="grant-state">
              <Status
                value={
                  rule.delete_requested_at
                    ? 'deleting'
                    : dashboard.synchronization.state === 'error' ||
                        dashboard.synchronization.state === 'stale'
                      ? 'syncFailed'
                      : 'applied'
                }
              />
              {!!rule.delete_requested_at && <small>{t('deletingHelp')}</small>}
            </div>
            <div className="row-actions">
              {!rule.delete_requested_at && (
                <button
                  type="button"
                  className="text-button danger delete-firewall"
                  data-ref={rule.ref}
                  onClick={() => setConfirm(rule)}
                >
                  {t('delete')}
                </button>
              )}
            </div>
          </article>
        ))}
        {!leases.length && !rules.length && (
          <div className="empty-state">
            <Icon name="network" />
            <h3>{t(total ? 'noResults' : 'emptyGrants')}</h3>
            <p>{t(total ? 'search' : 'emptyGrantsHelp')}</p>
            {total > 0 ? (
              <button
                className="text-button"
                onClick={() => {
                  setQuery('');
                  setFilter('all');
                }}
              >
                {t('clearSearch')}
              </button>
            ) : (
              <button className="text-button" onClick={() => void addCurrent()}>
                {t('authorizeNetwork')}
                <Icon name="arrow" />
              </button>
            )}
          </div>
        )}
      </div>
      {renew && <Renew lease={renew} onClose={() => setRenew(null)} />}
      {confirm && (
        <Dialog id="delete-dialog" title={t('deleteTitle')} onClose={() => setConfirm(null)}>
          <p className="mono dialog-source sensitive">
            {displayIP('ip' in confirm ? confirm.ip : confirm.cidr, demo)}
          </p>
          <p>{t('deleteHelp')}</p>
          {'device_id' in confirm && confirm.device_id && (
            <p className="callout">{t('deleteAutomaticHelp')}</p>
          )}
          <div className="dialog-actions">
            <button className="secondary" onClick={() => setConfirm(null)}>
              {t('cancel')}
            </button>
            <button
              id="confirm-delete"
              className="danger-button"
              disabled={Object.values(state.busy).some(Boolean)}
              onClick={async () => {
                if (await ('ip' in confirm ? store.remove(confirm) : store.removeRule(confirm.ref)))
                  setConfirm(null);
              }}
            >
              {t('confirmDelete')}
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
function Renew({ lease, onClose }: { lease: Lease; onClose: () => void }) {
  const { state, store, t } = usePortal();
  const [date, setDate] = useState(
    lease.expire_date && lease.expire_date > state.dashboard!.expiry.today
      ? lease.expire_date
      : state.dashboard!.expiry.default_expire_date,
  );
  return (
    <Dialog id="expiry-dialog" title={t('renew')} onClose={onClose}>
      <p className="mono dialog-source sensitive">{displayIP(lease.ip, store.transport.demo)}</p>
      <form
        id="renew-ip-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await store.renew(lease, date)) onClose();
        }}
      >
        <DateFields date={date} setDate={setDate} prefix="renew-" />
        <div className="dialog-actions">
          <button type="button" className="secondary" onClick={onClose}>
            {t('cancel')}
          </button>
          <button type="submit" className="primary" disabled={state.busy.renew}>
            {t('saveExpiry')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
