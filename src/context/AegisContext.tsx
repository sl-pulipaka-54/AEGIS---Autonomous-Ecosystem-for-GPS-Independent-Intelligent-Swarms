import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { signInWithPopup, signOut as firebaseSignOut } from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase';
import type {
  BatteryReport,
  CustomerProfile,
  DroneRecord,
  LanguageCode,
  MissionWithDetails,
  NotificationRecord,
  UserRecord,
  UserRole,
  WeatherReport,
} from '../types/aegis';

interface AegisContextValue {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
  largeText: boolean;
  setLargeText: (val: boolean) => void;
  activePortal: UserRole;
  setActivePortal: (role: UserRole) => void;
  user: UserRecord | null;
  profile: CustomerProfile | null;
  token: string | null;
  mapsApiKey: string;
  missions: MissionWithDetails[];
  drones: DroneRecord[];
  batteryReports: BatteryReport[];
  weather: WeatherReport | null;
  notifications: NotificationRecord[];
  loadingData: boolean;
  dataError: string | null;
  authModalOpen: boolean;
  authModalRole: UserRole;
  openAuthModal: (role?: UserRole) => void;
  closeAuthModal: () => void;
  signInWithGoogle: (role?: UserRole, operatorPasscode?: string) => Promise<void>;
  signInWithCredentials: (params: {
    method: 'otp' | 'email' | 'operator';
    identifier: string;
    otpCode?: string;
    password?: string;
    name?: string;
    role?: UserRole;
    operatorPasscode?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  refreshAllData: () => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  setProfileState: (user: UserRecord, profile: CustomerProfile) => void;
}

const AegisContext = createContext<AegisContextValue | null>(null);

export const AegisProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [language, setLanguage] = useState<LanguageCode>('en');
  const [largeText, setLargeText] = useState(false);
  const [activePortal, setActivePortal] = useState<UserRole>('customer');

  const [user, setUser] = useState<UserRecord | null>(null);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const [mapsApiKey, setMapsApiKey] = useState<string>(
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''
  );

  const [missions, setMissions] = useState<MissionWithDetails[]>([]);
  const [drones, setDrones] = useState<DroneRecord[]>([]);
  const [batteryReports, setBatteryReports] = useState<BatteryReport[]>([]);
  const [weather, setWeather] = useState<WeatherReport | null>(null);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalRole, setAuthModalRole] = useState<UserRole>('customer');

  const lastNotifCountRef = useRef(0);

  // Sync Tailwind v4 `.dark` class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  const refreshAllData = useCallback(async () => {
    try {
      setDataError(null);
      const [configRes, parcelsRes, fleetRes, notifRes] = await Promise.all([
        fetch('/api/config/public'),
        fetch('/api/parcels'),
        fetch('/api/fleet'),
        fetch('/api/notifications'),
      ]);

      if (configRes.ok) {
        const cfg = (await configRes.json()) as { mapsApiKey?: string };
        if (cfg.mapsApiKey) setMapsApiKey(cfg.mapsApiKey);
      }

      if (parcelsRes.ok) {
        const data = (await parcelsRes.json()) as MissionWithDetails[];
        setMissions(data);
      }

      if (fleetRes.ok) {
        const fleetData = (await fleetRes.json()) as {
          drones: DroneRecord[];
          batteryReports: BatteryReport[];
          weather: WeatherReport | null;
        };
        setDrones(fleetData.drones);
        setBatteryReports(fleetData.batteryReports);
        setWeather(fleetData.weather);
      }

      if (notifRes.ok) {
        const notifs = (await notifRes.json()) as NotificationRecord[];
        setNotifications(notifs);
        lastNotifCountRef.current = notifs.length;
      }
    } catch (err) {
      console.error('Data sync failed:', err);
      setDataError('Unable to reach AEGIS telemetry server. Retrying shortly.');
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    void refreshAllData();
  }, [refreshAllData]);

  // Real-time WebSocket Telemetry Listener
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      socket = new WebSocket(wsUrl);
      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as {
            type: string;
            drones?: DroneRecord[];
            missions?: MissionWithDetails[];
            notifications?: NotificationRecord[];
          };
          if (msg.type === 'telemetry:tick') {
            if (msg.drones) setDrones(msg.drones);
            if (msg.missions) setMissions(msg.missions);
          } else if (
            msg.type === 'mission:created' ||
            msg.type === 'mission:updated' ||
            msg.type === 'fleet:updated'
          ) {
            void refreshAllData();
          }
        } catch {
          // Ignore malformed ws messages
        }
      };
      socket.onclose = () => {
        reconnectTimer = setTimeout(connect, 4000);
      };
    };

    connect();
    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [refreshAllData]);

  // Trigger browser Push Notification when unread notifications increase
  useEffect(() => {
    if (
      notifications.length > lastNotifCountRef.current &&
      lastNotifCountRef.current > 0 &&
      typeof window !== 'undefined' &&
      'Notification' in window &&
      Notification.permission === 'granted'
    ) {
      const latest = notifications[0];
      if (latest) {
        new Notification(latest.title, { body: latest.message });
      }
    }
    lastNotifCountRef.current = notifications.length;
  }, [notifications]);

  const openAuthModal = useCallback((role: UserRole = 'customer') => {
    setAuthModalRole(role);
    setAuthModalOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setAuthModalOpen(false);
  }, []);

  const signInWithGoogle = useCallback(
    async (role: UserRole = 'customer', operatorPasscode?: string) => {
      const credential = await signInWithPopup(auth, googleAuthProvider);
      const idToken = await credential.user.getIdToken();
      const res = await fetch('/api/auth/firebase-sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          name: credential.user.displayName,
          role,
          operatorPasscode,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Google Sign-In verification failed');
      }
      setUser(data.user);
      setProfile(data.profile);
      setToken(data.token);
      setActivePortal(data.user.role);
      setAuthModalOpen(false);
    },
    []
  );

  const signInWithCredentials = useCallback(
    async (params: {
      method: 'otp' | 'email' | 'operator';
      identifier: string;
      otpCode?: string;
      password?: string;
      name?: string;
      role?: UserRole;
      operatorPasscode?: string;
    }) => {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed');
      }
      setUser(data.user);
      setProfile(data.profile);
      setToken(data.token);
      setActivePortal(data.user.role);
      setAuthModalOpen(false);
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      await firebaseSignOut(auth);
    } catch {
      // Ignore if signed in via OTP/Email session
    }
    setUser(null);
    setProfile(null);
    setToken(null);
    setActivePortal('customer');
  }, []);

  const markAllNotificationsRead = useCallback(async () => {
    await fetch('/api/notifications/read-all', { method: 'PATCH' });
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  }, []);

  const setProfileState = useCallback(
    (nextUser: UserRecord, nextProfile: CustomerProfile) => {
      setUser(nextUser);
      setProfile(nextProfile);
    },
    []
  );

  return (
    <AegisContext.Provider
      value={{
        theme,
        toggleTheme,
        language,
        setLanguage,
        largeText,
        setLargeText,
        activePortal,
        setActivePortal,
        user,
        profile,
        token,
        mapsApiKey,
        missions,
        drones,
        batteryReports,
        weather,
        notifications,
        loadingData,
        dataError,
        authModalOpen,
        authModalRole,
        openAuthModal,
        closeAuthModal,
        signInWithGoogle,
        signInWithCredentials,
        logout,
        refreshAllData,
        markAllNotificationsRead,
        setProfileState,
      }}
    >
      {children}
    </AegisContext.Provider>
  );
};

export function useAegis() {
  const ctx = useContext(AegisContext);
  if (!ctx) throw new Error('useAegis must be used inside AegisProvider');
  return ctx;
}
