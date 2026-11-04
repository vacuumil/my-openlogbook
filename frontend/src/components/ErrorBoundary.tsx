import React from 'react';
import { isStorageError, reopenDatabase, resetLocalDatabase } from '../db/db';

interface ErrorBoundaryState {
  error: Error | null;
  copied: boolean;
  resetting: boolean;
}

const RELOAD_KEY = 'openlogbook_stale_reload_at';
const REOPEN_KEY = 'openlogbook_db_reopen_at';

/** True once per minute: automatic recovery never turns into a loop */
function claimAttempt(key: string): boolean {
  try {
    if (Date.now() - (Number(sessionStorage.getItem(key)) || 0) < 60_000) return false;
    sessionStorage.setItem(key, String(Date.now()));
    return true;
  } catch {
    // Storage is blocked: leave it to the buttons
    return false;
  }
}

/**
 * A page left open across a deploy still asks for the old file names of lazily loaded screens,
 * which the server no longer has. Safari reports it as "Importing a module script failed".
 */
export const isStaleBundleError = (error: unknown) =>
  /dynamically imported module|importing a module script failed|module script|loading chunk|ChunkLoadError/i.test(
    `${(error as Error)?.name} ${(error as Error)?.message}`
  );

/** Drops cached app files and loads the newest version, keeping the logbook in IndexedDB */
export async function reloadFresh() {
  try {
    const registrations = (await navigator.serviceWorker?.getRegistrations()) ?? [];
    await Promise.all(registrations.map((registration) => registration.unregister()));
    if (typeof caches !== 'undefined') {
      await Promise.all((await caches.keys()).map((key) => caches.delete(key)));
    }
  } catch {
    // Nothing cached: a plain reload is enough
  }
  const url = new URL(window.location.href);
  url.searchParams.set('v', String(Date.now()));
  window.location.replace(url.toString());
}

export class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, copied: false, resetting: false };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Unhandled UI error:', error, info.componentStack);
    if (isStaleBundleError(error)) {
      // A reload picks up the new deploy
      if (claimAttempt(RELOAD_KEY)) void reloadFresh();
      return;
    }
    if (isStorageError(error)) {
      // Safari dropped the database connection: reconnect and draw the app again, then try a reload
      if (claimAttempt(REOPEN_KEY)) {
        reopenDatabase()
          .then(() => this.setState({ error: null, copied: false }))
          .catch(() => {
            if (claimAttempt(RELOAD_KEY)) void reloadFresh();
          });
      } else if (claimAttempt(RELOAD_KEY)) {
        void reloadFresh();
      }
    }
  }

  private resetDevice = async () => {
    const confirmed = window.confirm(
      'Удалить копию данных на этом устройстве и загрузить всё заново с сервера? Записи, которые ещё не успели отправиться на сервер, будут потеряны.'
    );
    if (!confirmed) return;
    this.setState({ resetting: true });
    try {
      await resetLocalDatabase();
    } finally {
      await reloadFresh();
    }
  };

  private details() {
    const { error } = this.state;
    return [
      `${error?.name}: ${error?.message}`,
      (error?.stack || '').split('\n').slice(0, 4).join('\n'),
      navigator.userAgent,
      new Date().toISOString(),
    ].join('\n');
  }

  private copyDetails = async () => {
    try {
      await navigator.clipboard.writeText(this.details());
      this.setState({ copied: true });
    } catch {
      // No clipboard over plain http: the text stays selectable on screen
    }
  };

  render() {
    const { error, copied, resetting } = this.state;
    if (!error) return this.props.children;
    const storage = isStorageError(error);

    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-6 text-center bg-[#0b0f17] text-slate-200">
        <h1 className="text-lg font-bold">Что-то пошло не так</h1>
        <p className="max-w-sm text-sm text-slate-400">
          {storage
            ? 'Браузер не смог прочитать данные приложения на этом устройстве. Обновите приложение; если не поможет — загрузите данные заново с сервера.'
            : 'Ваши рейсы сохранены на этом устройстве. Обновите приложение, чтобы продолжить.'}
        </p>
        <button
          onClick={() => void reloadFresh()}
          className="px-5 py-2.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm rounded-xl"
        >
          Обновить приложение
        </button>
        {storage && (
          <button
            onClick={this.resetDevice}
            disabled={resetting}
            className="px-5 py-2.5 border border-slate-600 hover:border-sky-400 text-slate-200 font-semibold text-sm rounded-xl disabled:opacity-50"
          >
            {resetting ? 'Загружаю заново…' : 'Загрузить данные заново с сервера'}
          </button>
        )}
        <details className="w-full max-w-md mt-4 text-left">
          <summary className="text-xs text-slate-500 cursor-pointer text-center">Подробности для поддержки</summary>
          <pre className="mt-2 p-3 rounded-xl bg-slate-900 text-2xs text-slate-400 whitespace-pre-wrap break-words select-all">{this.details()}</pre>
          <button onClick={this.copyDetails} className="mt-2 w-full px-3 py-2 rounded-xl border border-slate-700 text-xs text-slate-300">
            {copied ? 'Скопировано' : 'Скопировать'}
          </button>
        </details>
      </div>
    );
  }
}
