import { lazy, Suspense, useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, LocalFlight } from './db/db';
import { MAJOR_AIRPORTS } from './data/majorAirports';
import { Navbar, ActiveTab, ThemeMode } from './components/Navbar';
import { FlightList } from './components/FlightList';
import { AddFlightModal, addMinutesToTime } from './components/AddFlightModal';
import { FlightDetailModal } from './components/FlightDetailModal';
import { AuthModal } from './components/AuthModal';
import { FlightFilterBar, FLIGHT_SEARCH_INPUT_ID } from './components/FlightFilterBar';
import { SessionModal } from './components/SessionModal';
import { HelpCenter } from './components/HelpCenter';
import { PageHeader } from './components/PageHeader';
import { entryTypeOf, isDraft, isFlightTime } from './utils/entries';
import { WeatherModal } from './components/WeatherModal';
import { api } from './api/client';
import { clearLocalUserData, FLIGHT_FILTERS_KEY, getPendingFlightCount, syncEngine, SyncState } from './services/syncEngine';
import { buildIataIndex, EMPTY_FILTERS, filterFlights, FlightFilters } from './utils/flightFilters';
import { resolveHotkey } from './utils/hotkeys';

// Maps, PDF tooling and the admin console are heavy: they load only when opened
const PilotDashboard = lazy(() => import('./components/PilotDashboard').then((m) => ({ default: m.PilotDashboard })));
const FlightMap = lazy(() => import('./components/FlightMap').then((m) => ({ default: m.FlightMap })));
const StatsDashboard = lazy(() => import('./components/StatsDashboard').then((m) => ({ default: m.StatsDashboard })));
const CurrencyDashboard = lazy(() => import('./components/CurrencyDashboard').then((m) => ({ default: m.CurrencyDashboard })));
const ExportModal = lazy(() => import('./components/ExportModal').then((m) => ({ default: m.ExportModal })));
const RosterImportModal = lazy(() => import('./components/RosterImportModal').then((m) => ({ default: m.RosterImportModal })));
const GuestLanding = lazy(() => import('./components/GuestLanding').then((m) => ({ default: m.GuestLanding })));
const WorkTimePanel = lazy(() => import('./components/WorkTimePanel').then((m) => ({ default: m.WorkTimePanel })));
const AdminPanel = lazy(() => import('./components/AdminPanel').then((m) => ({ default: m.AdminPanel })));

const loadStoredFilters = (): FlightFilters => {
  try {
    const stored = sessionStorage.getItem(FLIGHT_FILTERS_KEY);
    return stored ? { ...EMPTY_FILTERS, ...JSON.parse(stored) } : EMPTY_FILTERS;
  } catch {
    return EMPTY_FILTERS;
  }
};

const PageLoader = () => (
  <div className="flex justify-center py-24" role="status" aria-label="Загрузка">
    <div className="w-8 h-8 rounded-full border-2 border-avionics-border border-t-sky-400 animate-spin" />
  </div>
);

export function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    const user = api.getUser();
    return user?.is_superuser ? 'admin' : 'dashboard';
  });
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addModalInitialData, setAddModalInitialData] = useState<Partial<LocalFlight> | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isWeatherModalOpen, setIsWeatherModalOpen] = useState(false);
  const [initialRegister, setInitialRegister] = useState(false);
  const [selectedFlight, setSelectedFlight] = useState<LocalFlight | null>(null);
  const [flightFilters, setFlightFilters] = useState<FlightFilters>(loadStoredFilters);
  const [isExportingSelection, setIsExportingSelection] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [session, setSession] = useState<{ entry: LocalFlight | null; type: 'simulator' | 'ground' } | null>(null);

  // Simulator and ground entries have their own editor
  const openEntry = (entry: LocalFlight) => {
    if (entryTypeOf(entry) === 'flight') setSelectedFlight(entry);
    else setSession({ entry, type: entryTypeOf(entry) === 'ground' ? 'ground' : 'simulator' });
  };

  const handleFiltersChange = (filters: FlightFilters) => {
    setFlightFilters(filters);
    try {
      sessionStorage.setItem(FLIGHT_FILTERS_KEY, JSON.stringify(filters));
    } catch {
      // Filters simply reset on reload
    }
  };

  const wipeLocalUserData = async () => {
    await clearLocalUserData();
    setFlightFilters(EMPTY_FILTERS);
  };

  const openExport = (selectionOnly: boolean) => {
    setIsExportingSelection(selectionOnly);
    setIsExportModalOpen(true);
  };

  const focusFlightSearch = () => {
    setActiveTab((tab) => (tab === 'map' ? tab : 'flights'));
    window.setTimeout(() => document.getElementById(FLIGHT_SEARCH_INPUT_ID)?.focus(), 150);
  };

  const [isOnline, setIsOnline] = useState(navigator.onLine);

  const handleOpenAddModal = (initial?: Partial<LocalFlight> | null) => {
    if (!currentUser) {
      setInitialRegister(false);
      setIsAuthModalOpen(true);
      return;
    }
    setAddModalInitialData(initial || null);
    setIsAddModalOpen(true);
  };

  const handleAddReturnFlight = (flight: LocalFlight) => {
    if (!currentUser) {
      setInitialRegister(false);
      setIsAuthModalOpen(true);
      return;
    }
    const turnaroundOut = addMinutesToTime(flight.inTimeUtc || '12:00', 45);
    const turnaroundIn = addMinutesToTime(turnaroundOut, flight.totalTimeMinutes || 120);

    setAddModalInitialData({
      date: flight.date,
      depIcao: flight.arrIcao,
      arrIcao: flight.depIcao,
      aircraftReg: flight.aircraftReg,
      aircraftType: flight.aircraftType,
      outTimeUtc: turnaroundOut,
      offTimeUtc: turnaroundOut,
      onTimeUtc: turnaroundIn,
      inTimeUtc: turnaroundIn,
      flightRole: flight.flightRole || 'SIC',
      flightHandling: flight.flightHandling === 'PF' ? 'PM' : 'PF',
      approachType: flight.approachType || 'ILS CAT I',
      remarks: `Обратный рейс (${flight.depIcao} -> ${flight.arrIcao})`,
    });
    setIsAddModalOpen(true);
  };

  // Theme state: dark | light
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('openlogbook_theme');
    return saved === 'light' ? 'light' : 'dark';
  });

  const handleSetTheme = (newTheme: ThemeMode) => {
    setTheme(newTheme);
    localStorage.setItem('openlogbook_theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    document.documentElement.className = newTheme === 'dark' ? 'dark theme-dark' : 'theme-light';
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.className = theme === 'dark' ? 'dark theme-dark' : 'theme-light';
  }, [theme]);

  // User state
  const [currentUser, setCurrentUser] = useState<any>(() => api.getUser());

  // User storage isolation check on startup/mount
  useEffect(() => {
    const initStorageUser = async () => {
      const user = api.getUser();
      if (user) {
        const storedUserId = localStorage.getItem('openlogbook_active_user_id');
        if (storedUserId && storedUserId !== String(user.id)) {
          // Switch between different accounts detected: wipe local data
          await wipeLocalUserData();
          localStorage.setItem('openlogbook_active_user_id', String(user.id));
          if (!user.is_superuser) {
            syncEngine.syncNow();
          }
        } else if (!storedUserId) {
          localStorage.setItem('openlogbook_active_user_id', String(user.id));
        }

        if (user.is_superuser) {
          setActiveTab('admin');
          await db.flights.clear();
        }
      } else {
        // Not logged in: ensure no leftover data in storage. An expired session lands here
        // too, so flights the server has not received yet wait for the next login.
        const storedUserId = localStorage.getItem('openlogbook_active_user_id');
        if (storedUserId && (await getPendingFlightCount()) === 0) {
          await wipeLocalUserData();
        }
      }
    };
    initStorageUser();

    // Listen for unauthorized 401 events (e.g. expired JWT / rotated secret key)
    const handleUnauthorized = () => {
      setCurrentUser(null);
      setIsAuthModalOpen(true);
    };
    window.addEventListener('openlogbook:unauthorized', handleUnauthorized);

    // Validate active session token against server
    const validateSession = async () => {
      const user = api.getUser();
      if (user) {
        try {
          const freshUser = await api.getMe();
          setCurrentUser(freshUser);
          api.setUser(freshUser);
        } catch (err: any) {
          if (err?.status === 401) {
            setCurrentUser(null);
          }
        }
      }
    };
    validateSession();

    return () => {
      window.removeEventListener('openlogbook:unauthorized', handleUnauthorized);
    };
  }, []);

  // Sync state
  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [syncMessage, setSyncMessage] = useState<string | undefined>();

  // Subscribe to syncEngine status
  useEffect(() => {
    const unsubscribe = syncEngine.subscribe((state, message) => {
      setSyncState(state);
      setSyncMessage(message);
    });
    return unsubscribe;
  }, []);

  // Reactive live query from IndexedDB
  const flights = useLiveQuery(() => db.flights.orderBy('date').reverse().toArray()) || [];
  const airports = useLiveQuery(() => db.airports.toArray()) || [];

  // Seed airports on first launch
  useEffect(() => {
    const initData = async () => {
      const airportCount = await db.airports.count();
      if (airportCount === 0) {
        await db.airports.bulkPut(MAJOR_AIRPORTS);
      }
    };
    initData();
  }, []);

  // Monitor network status & auto-sync
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      const user = api.getUser();
      if (user && !user.is_superuser) {
        syncEngine.syncNow();
      }
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    // Phones keep PWAs suspended for hours: catch up when the app comes back
    const handleVisibilityChange = () => {
      const user = api.getUser();
      if (document.visibilityState === 'visible' && user && !user.is_superuser) {
        syncEngine.syncNow();
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const user = api.getUser();
    if (navigator.onLine && user && !user.is_superuser) {
      syncEngine.syncNow();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Soft delete / save handlers
  const handleSaveFlight = async (updated: LocalFlight) => {
    if (!currentUser) {
      setIsAuthModalOpen(true);
      return;
    }
    // Saving a plan draft is the pilot's confirmation that it was flown
    await db.flights.put(isDraft(updated) ? { ...updated, status: 'confirmed' } : updated);
    setSelectedFlight(null);
    syncEngine.syncNow();
  };

  const handleSaveSession = async (entry: LocalFlight) => {
    await db.flights.put(entry);
    setSession(null);
    syncEngine.syncNow();
  };

  const handleRepeatFlight = (flight: LocalFlight) => {
    handleOpenAddModal({
      depIcao: flight.depIcao,
      arrIcao: flight.arrIcao,
      aircraftReg: flight.aircraftReg,
      aircraftType: flight.aircraftType,
      outTimeUtc: flight.outTimeUtc,
      offTimeUtc: flight.offTimeUtc,
      onTimeUtc: flight.onTimeUtc,
      inTimeUtc: flight.inTimeUtc,
      flightRole: flight.flightRole,
      flightHandling: flight.flightHandling,
      approachType: flight.approachType,
    });
  };

  const handleDeleteFlight = async (id: string) => {
    const flight = await db.flights.get(id);
    if (flight) {
      await db.flights.put({
        ...flight,
        syncStatus: 'deleted',
        updatedAt: new Date().toISOString(),
      });
    }
    setSelectedFlight(null);
    setSession(null);
    syncEngine.syncNow();
  };

  const handleAuthSuccess = async (user?: any) => {
    const loggedInUser = user || api.getUser();
    setCurrentUser(loggedInUser);
    setIsAuthModalOpen(false);

    if (loggedInUser) {
      const prevUserId = localStorage.getItem('openlogbook_active_user_id');
      if (prevUserId && prevUserId !== String(loggedInUser.id)) {
        const pending = await getPendingFlightCount();
        if (
          pending > 0 &&
          !window.confirm(
            `На устройстве есть несохранённые рейсы предыдущего аккаунта: ${pending}. Они будут удалены. Продолжить вход?`
          )
        ) {
          api.clearToken();
          setCurrentUser(null);
          return;
        }
        // Switch between different registered accounts: wipe local data to prevent cross-account leak
        await wipeLocalUserData();
      }
      localStorage.setItem('openlogbook_active_user_id', String(loggedInUser.id));

      if (loggedInUser.is_superuser) {
        setActiveTab('admin');
        await db.flights.clear();
      } else {
        setActiveTab('dashboard');
        syncEngine.syncNow();
      }
    }
  };

  const handleLogout = async ({ skipPendingCheck = false } = {}) => {
    if (!skipPendingCheck) {
      if ((await getPendingFlightCount()) > 0) {
        await syncEngine.syncNow();
      }
      const pending = await getPendingFlightCount();
      if (
        pending > 0 &&
        !window.confirm(
          `Рейсов не сохранено на сервере: ${pending}. После выхода они будут удалены с этого устройства. Всё равно выйти?`
        )
      ) {
        return;
      }
    }

    // Clear local logbook so next login or guest starts with an empty/clean state
    await wipeLocalUserData();
    api.clearToken();
    setCurrentUser(null);
    setIsAuthModalOpen(false);
    setActiveTab('dashboard');
  };

  // Filter out tombstones for visual display
  const activeFlights = useMemo(() => flights.filter((f) => f.syncStatus !== 'deleted'), [flights]);
  // Confirmed flights only: what the dashboard, map and statistics are about
  const logbookFlights = useMemo(() => activeFlights.filter(isFlightTime), [activeFlights]);
  const draftCount = useMemo(() => activeFlights.filter(isDraft).length, [activeFlights]);

  // The selection only drives the logbook and the map: dashboard, limits and currency always use every flight
  const iataIndex = useMemo(() => buildIataIndex([...MAJOR_AIRPORTS, ...airports]), [airports]);
  const filteredFlights = useMemo(
    () => filterFlights(activeFlights, flightFilters, iataIndex),
    [activeFlights, flightFilters, iataIndex]
  );

  const hasOpenDialog =
    isAddModalOpen || isExportModalOpen || isImportModalOpen || isAuthModalOpen || isWeatherModalOpen || selectedFlight !== null || session !== null || isHelpOpen;

  useEffect(() => {
    if (!currentUser || currentUser.is_superuser) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const action = resolveHotkey(event, hasOpenDialog);
      if (!action) return;
      event.preventDefault();
      if (action === 'new-flight') handleOpenAddModal(null);
      else focusFlightSearch();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentUser, hasOpenDialog]);

  return (
    <div
      className={`min-h-screen theme-${theme} bg-avionics-bg text-avionics-text transition-colors duration-200 flex flex-col`}
    >
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenHelp={() => setIsHelpOpen(true)}
        onOpenNewFlight={() => handleOpenAddModal(null)}
        onOpenWeather={() => setIsWeatherModalOpen(true)}
        onOpenExport={() => openExport(false)}
        onOpenImport={() => setIsImportModalOpen(true)}
        onOpenAuth={() => {
          setInitialRegister(false);
          setIsAuthModalOpen(true);
        }}
        onLogout={() => handleLogout()}
        currentUser={currentUser}
        isOnline={isOnline}
        syncState={syncState}
        syncMessage={syncMessage}
        onManualSync={() => syncEngine.syncNow()}
        theme={theme}
        setTheme={handleSetTheme}
      />

      <main className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-6 flex-1 w-full pb-24 xl:pb-8">
        <Suspense fallback={<PageLoader />}>
        {!currentUser ? (
          /* Landing Overview for unauthenticated guests */
          <GuestLanding
            onOpenAuth={(isReg) => {
              setInitialRegister(isReg);
              setIsAuthModalOpen(true);
            }}
          />
        ) : currentUser.is_superuser ? (
          /* Dedicated Superuser Admin Console (System management only) */
          <AdminPanel currentUser={currentUser} />
        ) : (
          /* Authenticated Pilot Experience */
          <>
            {activeTab === 'dashboard' && (
              <PilotDashboard
                flights={activeFlights}
                airports={airports}
                currentUser={currentUser}
                theme={theme}
                onOpenNewFlight={() => handleOpenAddModal(null)}
                onOpenWeather={() => setIsWeatherModalOpen(true)}
                onOpenImport={() => setIsImportModalOpen(true)}
                onOpenExport={() => openExport(false)}
                onSelectFlight={openEntry}
                onNavigateToFlights={() => setActiveTab('flights')}
                onNavigateToMap={() => setActiveTab('map')}
                onNavigateToCurrency={() => setActiveTab('currency')}
                draftCount={draftCount}
                onShowDrafts={() => {
                  handleFiltersChange({ ...EMPTY_FILTERS, entryType: 'draft' });
                  setActiveTab('flights');
                }}
                onAddSession={() => setSession({ entry: null, type: 'simulator' })}
                onOpenHelp={() => setIsHelpOpen(true)}
                onOpenProfile={() => setIsAuthModalOpen(true)}
                onNavigateToWorkTime={() => setActiveTab('worktime')}
                onShowPendingFlights={() => {
                  handleFiltersChange({ ...EMPTY_FILTERS, pendingOnly: true });
                  setActiveTab('flights');
                }}
              />
            )}

            {activeTab === 'flights' && (
              <>
              <PageHeader title="Лётная книжка" description="Рейсы, тренажёр и черновики из плана. Поиск: / , новый рейс: N" />
              <FlightList
                flights={activeFlights}
                filteredFlights={filteredFlights}
                filters={flightFilters}
                onFiltersChange={handleFiltersChange}
                onSelectFlight={openEntry}
                onExportSelection={() => openExport(true)}
                onAddSession={() => setSession({ entry: null, type: 'simulator' })}
              />
              </>
            )}

            {activeTab === 'map' && (
              <div className="space-y-3 sm:space-y-4">
                <PageHeader title="Карта полётов" description="Маршруты по ортодромии. Нажмите на маршрут или аэродром, чтобы увидеть рейсы" />
                <FlightFilterBar
                  flights={activeFlights}
                  filters={flightFilters}
                  onChange={handleFiltersChange}
                  resultCount={filteredFlights.length}
                />
                <FlightMap
                  flights={filteredFlights.filter(isFlightTime)}
                  allFlights={logbookFlights}
                  airports={airports}
                  theme={theme}
                  onSelectFlight={openEntry}
                  onFilterAirport={(icao) => handleFiltersChange({ ...flightFilters, airport: icao })}
                  onFilterRoute={(route) => handleFiltersChange({ ...flightFilters, query: route })}
                />
              </div>
            )}

            {activeTab === 'stats' && <StatsDashboard flights={activeFlights} airports={airports} theme={theme} />}

            {activeTab === 'currency' && (
              <>
                <PageHeader title="Допуски и сроки" description="Правило 90 дней по типовым рейтингам, ВЛЭК, проверки и документы" />
                <CurrencyDashboard flights={activeFlights} />
              </>
            )}

            {activeTab === 'worktime' && (
              <>
                <PageHeader title="Рабочее время" description="Месячный план, смены с явкой и окончанием, предварительный расчёт оплаты" />
                <WorkTimePanel flights={activeFlights} />
              </>
            )}
          </>
        )}
        </Suspense>
      </main>

      {/* Modals */}
      <AddFlightModal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setAddModalInitialData(null);
          syncEngine.syncNow();
        }}
        airports={airports}
        initialData={addModalInitialData}
      />

      <FlightDetailModal
        flight={selectedFlight}
        isOpen={selectedFlight !== null}
        onClose={() => setSelectedFlight(null)}
        onSave={handleSaveFlight}
        onDelete={handleDeleteFlight}
        airports={airports}
        onAddReturnFlight={handleAddReturnFlight}
        onRepeatFlight={handleRepeatFlight}
      />

      <SessionModal
        isOpen={session !== null}
        entry={session?.entry || null}
        defaultType={session?.type}
        onClose={() => setSession(null)}
        onSave={handleSaveSession}
        onDelete={handleDeleteFlight}
      />

      <HelpCenter isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />

      <WeatherModal
        isOpen={isWeatherModalOpen}
        onClose={() => setIsWeatherModalOpen(false)}
      />

      <Suspense fallback={null}>
        {isExportModalOpen && (
          <ExportModal
            isOpen={isExportModalOpen}
            onClose={() => setIsExportModalOpen(false)}
            flights={isExportingSelection ? filteredFlights : activeFlights}
            isSelection={isExportingSelection}
          />
        )}

        {isImportModalOpen && (
          <RosterImportModal
            isOpen={isImportModalOpen}
            onClose={() => setIsImportModalOpen(false)}
            onImportComplete={() => syncEngine.syncNow()}
          />
        )}
      </Suspense>

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        currentUser={currentUser}
        initialRegister={initialRegister}
        onAuthSuccess={handleAuthSuccess}
        onLogout={() => handleLogout()}
        onAccountDeleted={() => handleLogout({ skipPendingCheck: true })}
      />
    </div>
  );
}

export default App;
