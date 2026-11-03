import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type { PortalStore } from './store';
import { translate, errorText, dateText, clockText, type MessageKey } from './i18n';
export const StoreContext = createContext<PortalStore | null>(null);
export function usePortal() {
  const store = useContext(StoreContext);
  if (!store) throw Error('Missing portal store');
  const state = useSyncExternalStore(store.subscribe, store.snapshot);
  const timeZone = state.dashboard?.expiry.time_zone || 'Asia/Shanghai';
  const zone = timeZone === 'Asia/Shanghai' ? 'UTC+8' : timeZone;
  const boundary = ['Asia/Shanghai', 'UTC', 'Etc/UTC'].includes(timeZone)
    ? '00:00'
    : translate(state.locale, 'dayStart');
  const t = (key: MessageKey, params?: Record<string, string | number>) =>
    translate(state.locale, key, { zone, boundary, ...params });
  const time = (at: number) => dateText(state.locale, at, timeZone);
  const clock = (at: number) => clockText(state.locale, at, timeZone);
  return { store, state, t, time, clock, zone };
}
export function Icon({
  name,
  className = '',
}: {
  name:
    | 'network'
    | 'shield'
    | 'arrow'
    | 'refresh'
    | 'plus'
    | 'check'
    | 'close'
    | 'chevron'
    | 'device'
    | 'activity'
    | 'sun'
    | 'moon'
    | 'link'
    | 'copy';
  className?: string;
}) {
  const paths: Record<string, ReactNode> = {
    network: (
      <>
        <circle cx="5" cy="6" r="2" />
        <circle cx="19" cy="6" r="2" />
        <circle cx="12" cy="18" r="2" />
        <path d="m6 8 5 8m7-8-5 8M7 6h10" />
      </>
    ),
    shield: (
      <>
        <path d="m12 3 8 3v5c0 5-8 10-8 10S4 16 4 11V6z" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    refresh: (
      <>
        <path d="M20 10a8 8 0 1 0-1 7M20 4v6h-6" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    check: <path d="m5 12 4 4L19 6" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    chevron: <path d="m8 5 7 7-7 7" />,
    device: (
      <>
        <rect x="5" y="3" width="14" height="14" rx="2" />
        <path d="M9 21h6m-3-4v4M9 7h6" />
      </>
    ),
    activity: <path d="M2 12h5l3-8 4 16 3-8h5" />,
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 1v2m0 18v2M1 12h2m18 0h2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2" />
      </>
    ),
    moon: <path d="M20 14A8 8 0 0 1 10 4 8 8 0 1 0 20 14Z" />,
    link: (
      <>
        <path d="m9 15 6-6M8 17l-1 1a4 4 0 0 1-5-5l5-5a4 4 0 0 1 5 0m0-1 1-1a4 4 0 0 1 5 5l-5 5a4 4 0 0 1-5 0" />
      </>
    ),
    copy: (
      <>
        <rect x="8" y="8" width="12" height="13" rx="2" />
        <path d="M16 8V3H3v13h5" />
      </>
    ),
  };
  return (
    <svg
      className={'icon ' + className}
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
export function Preferences() {
  const { state, store, t } = usePortal();
  return (
    <div className="preferences">
      <label className="sr-only" htmlFor="locale">
        {t('language')}
      </label>
      <select
        id="locale"
        value={state.locale}
        onChange={(e) => store.setLocale(e.target.value === 'zh-CN' ? 'zh-CN' : 'en')}
      >
        <option value="en">English</option>
        <option value="zh-CN">简体中文</option>
      </select>
      <button
        className="icon-button"
        aria-label={t('theme') + ': ' + t(state.theme === 'light' ? 'dark' : 'light')}
        onClick={() => store.setTheme(state.theme === 'light' ? 'dark' : 'light')}
      >
        <Icon name={state.theme === 'light' ? 'moon' : 'sun'} />
      </button>
    </div>
  );
}
export function Status({ value }: { value: string }) {
  const { t } = usePortal();
  const key = value as MessageKey;
  return (
    <span className={'status status-' + value}>
      <span className="status-dot" />
      {t(key)}
    </span>
  );
}
export function Dialog({
  id,
  title,
  children,
  onClose,
}: {
  id: string;
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    const cancel = (event: Event) => {
      event.preventDefault();
      closeRef.current();
    };
    dialog.addEventListener('cancel', cancel);
    return () => {
      dialog.removeEventListener('cancel', cancel);
      dialog.close();
    };
  }, []);
  const { t } = usePortal();
  return (
    <dialog
      id={id}
      ref={ref}
      aria-labelledby={id + '-title'}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="dialog-header">
        <h2 id={id + '-title'}>{title}</h2>
        <button type="button" className="icon-button" aria-label={t('close')} onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Notice() {
  const { state, store, t } = usePortal();
  const notice = state.notice;
  if (!notice) return null;
  return (
    <div
      className={'notice ' + (notice.error ? 'notice-error' : '')}
      role={notice.error ? 'alert' : 'status'}
      id="toast"
    >
      <Icon name={notice.error ? 'shield' : 'check'} />
      <span>
        {notice.error ? errorText(state.locale, notice.code, notice.params) : t(notice.key)}
      </span>
      <button
        className="icon-button"
        aria-label={t('close')}
        onClick={() => store.patch({ notice: null })}
      >
        <Icon name="close" />
      </button>
    </div>
  );
}
export const docsUrl = (locale: string) =>
  'https://kongdayan.github.io/port-allowlist/' + (locale === 'zh-CN' ? 'zh-cn' : 'en') + '/';
export function displayIP(ip: string, demo: boolean) {
  if (!demo) return ip;
  const [address, suffix] = ip.split('/');
  return (
    address.split('.').slice(0, 2).concat(['••', '••']).join('.') + (suffix ? '/' + suffix : '')
  );
}
