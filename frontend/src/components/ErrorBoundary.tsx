import React from 'react';

interface ErrorBoundaryState {
  error: Error | null;
  copied: boolean;
}

const RELOAD_KEY = 'openlogbook_stale_reload_at';

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
  state: ErrorBoundaryState = { error: null, copied: false };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Unhandled UI error:', error, info.componentStack);
    if (!isStaleBundleError(error)) return;
    // One automatic reload per minute: enough to pick up a new deploy, never a loop
    let last = 0;
    try {
      last = Number(sessionStorage.getItem(RELOAD_KEY)) || 0;
      if (Date.now() - last > 60_000) {
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
        void reloadFresh();
      }
    } catch {
      // Storage is blocked: leave it to the button
    }
  }

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
    const { error, copied } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-6 text-center bg-[#0b0f17] text-slate-200">
        <h1 className="text-lg font-bold">Что-то пошло не так</h1>
        <p className="max-w-sm text-sm text-slate-400">
          Ваши рейсы сохранены на этом устройстве. Обновите приложение, чтобы продолжить.
        </p>
        <button
          onClick={() => void reloadFresh()}
          className="px-5 py-2.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm rounded-xl"
        >
          Обновить приложение
        </button>
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
