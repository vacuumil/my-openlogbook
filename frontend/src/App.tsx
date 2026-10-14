import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, LocalFlight } from './db/db';
import { MAJOR_AIRPORTS } from './data/majorAirports';
import { Navbar, ActiveTab, ThemeMode } from './components/Navbar';
import { FlightList } from './components/FlightList';
import { AddFlightModal } from './components/AddFlightModal';
import { FlightDetailModal } from './components/FlightDetailModal';
import { FlightMap } from './components/FlightMap';
import { StatsDashboard } from './components/StatsDashboard';
import { CurrencyDashboard } from './components/CurrencyDashboard';
import { ExportModal } from './components/ExportModal';
import { RosterImportModal } from './components/RosterImportModal';
import { AuthModal } from './components/AuthModal';
import { GuestLanding } from './components/GuestLanding';
import { api } from './api/client';
import { syncEngine, SyncState } from './services/syncEngine';

export function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('flights');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [initialRegister, setInitialRegister] = useState(false);
  const [selectedFlight, setSelectedFlight] = useState<LocalFlight | null>(null);

  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Theme state: dark | light
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('openlogbook_theme');
    return saved === 'light' ? 'light' : 'dark';
  });

  const handleSetTheme = (newTheme: ThemeMode) => {
    setTheme(newTheme);
    localStorage.setItem('openlogbook_theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    document.documentElement.className = 'theme-' + newTheme;
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.className = 'theme-' + theme;
  }, [theme]);

  // User state
  const [currentUser, setCurrentUser] = useState<any>(() => api.getUser());

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
        await db.airports.bulkAdd(MAJOR_AIRPORTS);
      }
    };
    initData();
  }, []);

  // Monitor network status & auto-sync
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (api.getUser()) {
        syncEngine.syncNow();
      }
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if (navigator.onLine && api.getUser()) {
      syncEngine.syncNow();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleSaveFlight = async (updated: LocalFlight) => {
    await db.flights.put(updated);
    setSelectedFlight(null);
    syncEngine.syncNow();
  };

  const handleDeleteFlight = async (id: string) => {
    const flight = await db.flights.get(id);
    if (flight) {
      if (flight.syncStatus === 'synced') {
        await db.flights.update(id, {
          syncStatus: 'deleted',
          updatedAt: new Date().toISOString(),
        });
        syncEngine.syncNow();
      } else {
        await db.flights.delete(id);
      }
    }
    if (selectedFlight?.id === id) {
      setSelectedFlight(null);
    }
  };

  const handleAuthSuccess = (user: any) => {
    setCurrentUser(user);
    syncEngine.syncNow();
  };

  const handleLogout = () => {
    api.clearToken();
    setCurrentUser(null);
    setActiveTab('flights');
  };

  const activeFlights = flights.filter((f) => f.syncStatus !== 'deleted');

  return (
    <div
      className={`min-h-screen theme-${theme} bg-avionics-bg text-avionics-text transition-colors duration-200 flex flex-col`}
    >
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenNewFlight={() => setIsAddModalOpen(true)}
        onOpenExport={() => setIsExportModalOpen(true)}
        onOpenImport={() => setIsImportModalOpen(true)}
        onOpenAuth={() => {
          setInitialRegister(false);
          setIsAuthModalOpen(true);
        }}
        currentUser={currentUser}
        isOnline={isOnline}
        syncState={syncState}
        syncMessage={syncMessage}
        onManualSync={() => syncEngine.syncNow()}
        theme={theme}
        setTheme={handleSetTheme}
      />

      <main className="max-w-7xl mx-auto px-4 py-6 flex-1 w-full">
        {!currentUser ? (
          /* Landing Overview for unauthenticated guests */
          <GuestLanding
            onOpenAuth={(isReg) => {
              setInitialRegister(isReg);
              setIsAuthModalOpen(true);
            }}
          />
        ) : (
          /* Authenticated Pilot Experience */
          <>
            {activeTab === 'flights' && (
              <FlightList
                flights={activeFlights}
                onSelectFlight={(flight) => setSelectedFlight(flight)}
              />
            )}

            {activeTab === 'map' && (
              <FlightMap flights={activeFlights} airports={airports} theme={theme} />
            )}

            {activeTab === 'stats' && <StatsDashboard flights={activeFlights} />}

            {activeTab === 'currency' && <CurrencyDashboard flights={activeFlights} />}
          </>
        )}
      </main>

      {/* Modals */}
      <AddFlightModal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          syncEngine.syncNow();
        }}
        airports={airports}
      />

      <FlightDetailModal
        flight={selectedFlight}
        isOpen={selectedFlight !== null}
        onClose={() => setSelectedFlight(null)}
        onSave={handleSaveFlight}
        onDelete={handleDeleteFlight}
        airports={airports}
      />

      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        flights={activeFlights}
      />

      <RosterImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportComplete={() => syncEngine.syncNow()}
      />

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        currentUser={currentUser}
        initialRegister={initialRegister}
        onAuthSuccess={handleAuthSuccess}
        onLogout={handleLogout}
      />
    </div>
  );
}

export default App;
