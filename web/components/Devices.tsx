import { useState } from 'react';
import type { Device } from '../types';

import { Dialog, Icon, usePortal, docsUrl } from '../ui';
export function Devices() {
  const { state, store, t, time } = usePortal();
  const [name, setName] = useState(''),
    [confirm, setConfirm] = useState<Device | null>(null);
  const account = store.account()!,
    devices = state.dashboard!.devices.filter((d) => d.enabled);
  return (
    <section className="panel devices-panel" id="devices">
      <header className="section-heading">
        <div>
          <h2>{t('devicesTitle')}</h2>
          <p>{t('devicesIntro')}</p>
        </div>
        <span className="count-label">
          {devices.length} / {account.max_devices}
        </span>
      </header>
      <form
        id="add-device"
        className="inline-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await store.createDevice(name)) setName('');
        }}
      >
        <label htmlFor="device-name" className="sr-only">
          {t('deviceName')}
        </label>
        <input
          id="device-name"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('deviceName')}
          maxLength={80}
          required
        />
        <button
          className="secondary"
          disabled={state.busy.device || devices.length >= account.max_devices}
        >
          <Icon name="plus" />
          {t('addDevice')}
        </button>
      </form>
      <div className="device-list">
        {devices.map((device) => (
          <div key={device.id} className="device-row">
            <span className="network-icon">
              <Icon name="device" />
            </span>
            <div>
              <strong>{device.name}</strong>
              <small>
                {device.last_seen
                  ? t('lastSeen', { time: time(device.last_seen) })
                  : t('neverSynced')}
              </small>
            </div>
            <button className="text-button danger revoke-device" onClick={() => setConfirm(device)}>
              {t('revokeDevice')}
            </button>
          </div>
        ))}
        {!devices.length && <p className="muted">{t('emptyDevices')}</p>}
      </div>
      <div className="updater-guide">
        <p>{t('setupHelp')}</p>
        <div className="download-actions">
          {store.transport.demo ? (
            <a className="secondary" href={docsUrl(state.locale) + 'devices/'}>
              {t('docs')}
              <Icon name="arrow" />
            </a>
          ) : (
            <>
              <a className="secondary" href={'/downloads/macos?lang=' + state.locale} download>
                {t('downloadMac')}
                <Icon name="arrow" />
              </a>
              <a className="secondary" href={'/downloads/windows?lang=' + state.locale} download>
                {t('downloadWindows')}
                <Icon name="arrow" />
              </a>
            </>
          )}
        </div>
        <code>{t('setupMac')}</code>
        <code>{t('setupWindows')}</code>
        <p className="section-footnote">{t('linuxScheduler')}</p>
      </div>
      {confirm && (
        <Dialog id="device-dialog" title={t('revokeDeviceTitle')} onClose={() => setConfirm(null)}>
          <p>{confirm.name}</p>
          <p>{t('revokeDeviceHelp')}</p>
          <div className="dialog-actions">
            <button className="secondary" onClick={() => setConfirm(null)}>
              {t('cancel')}
            </button>
            <button
              className="danger-button"
              id="confirm-revoke-device"
              disabled={state.busy['device:' + confirm.id]}
              onClick={async () => {
                if (await store.revokeDevice(confirm.id)) setConfirm(null);
              }}
            >
              {t('revokeDevice')}
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
export function Secret() {
  const { state, store, t } = usePortal();
  const secret = state.secret;
  if (!secret) return null;
  return (
    <Dialog id="secret" title={t('secretTitle')} onClose={() => store.patch({ secret: null })}>
      <p>{t('secretHelp')}</p>
      <p>{t(secret.device ? 'deviceSecretHelp' : 'token')}</p>
      {store.transport.demo && <p className="callout">{t('demoToken')}</p>}
      <label className="sr-only" htmlFor="secret-value">
        {t('token')}
      </label>
      <textarea id="secret-value" value={secret.value} readOnly spellCheck={false} />
      <div className="dialog-actions">
        <button
          className="secondary"
          id="copy-secret"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(secret.value);
              store.notify('copied');
            } catch {
              store.notify('clipboardError');
            }
          }}
        >
          <Icon name="copy" />
          {t('copy')}
        </button>
        <button id="close-secret" className="primary" onClick={() => store.patch({ secret: null })}>
          {t('saved')}
        </button>
      </div>
    </Dialog>
  );
}
