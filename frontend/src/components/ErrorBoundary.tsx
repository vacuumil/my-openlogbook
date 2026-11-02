import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('Unhandled UI error:', error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-6 text-center bg-[#0b0f17] text-slate-200">
        <h1 className="text-lg font-bold">Что-то пошло не так</h1>
        <p className="max-w-sm text-sm text-slate-400">
          Ваши рейсы сохранены на этом устройстве. Перезагрузите приложение, чтобы продолжить.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-5 py-2.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm rounded-xl"
        >
          Перезагрузить
        </button>
      </div>
    );
  }
}
