import { useState } from 'react';
import { Dialog, Icon, usePortal } from '../ui';
import type { MessageKey } from '../i18n';
export function CustomerPicker() {
  const { state, store, t } = usePortal();
  const [name, setName] = useState('');
  const d = state.dashboard!;
  return (
    <section className="panel operator-bar">
      <label htmlFor="customer">
        {t('customer')}
        <select
          id="customer"
          value={state.selected}
          onChange={(e) => void store.selectCustomer(e.target.value)}
        >
          {(d.customers || []).map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name}
              {customer.enabled ? '' : ' · ' + t('disabled')}
            </option>
          ))}
        </select>
      </label>
      <form
        id="new-customer"
        className="inline-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await store.createCustomer(name)) setName('');
        }}
      >
        <label htmlFor="new-customer-name" className="sr-only">
          {t('newCustomer')}
        </label>
        <input
          id="new-customer-name"
          name="name"
          placeholder={t('newCustomer')}
          required
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="secondary" disabled={state.busy.admin}>
          <Icon name="plus" />
          {t('createCustomer')}
        </button>
      </form>
    </section>
  );
}
export function CustomerSettings() {
  const { state, store, t } = usePortal();
  const account = store.account()!;
  const [values, setValues] = useState({ ...account }),
    [rotate, setRotate] = useState(false),
    [hostname, setHostname] = useState(''),
    [delegate, setDelegate] = useState(false);
  const fields: [keyof typeof values, MessageKey, number, number][] = [
    ['max_ips', 'maxIps', 1, 100],
    ['max_devices', 'maxDevices', 1, 10],
    ['max_manual_days', 'maxDays', 1, 365],
    ['lease_minutes', 'leaseMinutes', 5, 10080],
    ['grace_seconds', 'graceSeconds', 0, 600],
  ];
  return (
    <details className="panel settings-panel">
      <summary>
        {t('customerSettings')}
        <Icon name="chevron" />
      </summary>
      <div className="settings-content">
        <form
          id="settings"
          onSubmit={(e) => {
            e.preventDefault();
            void store.admin('/api/admin/customers/' + state.selected, 'PATCH', values);
          }}
        >
          <div className="settings-grid">
            {fields.map(([key, label, min, max]) => (
              <label key={key}>
                {t(label)}
                <input
                  type="number"
                  name={key}
                  min={min}
                  max={max}
                  required
                  value={String(values[key])}
                  onChange={(e) => setValues({ ...values, [key]: Number(e.target.value) })}
                />
              </label>
            ))}
            <label>
              {t('tier')}
              <select
                name="tier"
                value={values.tier || 'standard'}
                onChange={(e) =>
                  setValues({ ...values, tier: e.target.value === 'vip' ? 'vip' : 'standard' })
                }
              >
                <option value="standard">{t('standard')}</option>
                <option value="vip">{t('vip')}</option>
              </select>
            </label>
          </div>
          <div className="form-footer">
            <span>{t(account.enabled === 0 ? 'disabled' : 'enabled')}</span>
            <button className="primary" disabled={state.busy.admin}>
              {t('saveSettings')}
            </button>
          </div>
        </form>
        <form
          className="portal-form"
          onSubmit={(e) => {
            e.preventDefault();
            void store.admin('/api/admin/customers/' + state.selected + '/portal', 'POST', {
              hostname,
              manage_existing_rules: delegate,
            });
          }}
        >
          <label htmlFor="portal-host">
            {t('portalHost')}
            <input
              id="portal-host"
              name="hostname"
              placeholder="team.example.com"
              required
              value={hostname}
              onChange={(e) => setHostname(e.target.value)}
            />
          </label>
          <p className="muted">{t('portalHostHelp')}</p>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={delegate}
              onChange={(e) => setDelegate(e.target.checked)}
            />
            {t('delegateExisting')}
          </label>
          <p className="muted">{t('delegateHelp')}</p>
          <button className="secondary" disabled={state.busy.admin}>
            {t('bindPortal')}
          </button>
        </form>
        <div className="operator-actions">
          <button className="secondary" id="rotate-customer" onClick={() => setRotate(true)}>
            {t('rotateToken')}
          </button>
          <button
            className="text-button danger"
            id="toggle-customer"
            disabled={state.busy.admin}
            onClick={() =>
              void store.admin('/api/admin/customers/' + state.selected, 'PATCH', {
                enabled: !account.enabled,
              })
            }
          >
            {t(account.enabled === 0 ? 'enableCustomer' : 'disableCustomer')}
          </button>
        </div>
      </div>
      {rotate && (
        <Dialog id="rotate-dialog" title={t('rotateTitle')} onClose={() => setRotate(false)}>
          <p>{t('rotateHelp')}</p>
          <div className="dialog-actions">
            <button className="secondary" onClick={() => setRotate(false)}>
              {t('cancel')}
            </button>
            <button
              className="primary"
              disabled={state.busy.admin}
              onClick={async () => {
                if (await store.rotateToken()) setRotate(false);
              }}
            >
              {t('rotateToken')}
            </button>
          </div>
        </Dialog>
      )}
    </details>
  );
}
