import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import {
  auth,
  clearGmailAccessToken,
  connectGmailWithGoogle,
  googleAuthProvider,
  initGmailAuth,
  setGmailAccessToken as cacheGmailAccessToken,
} from '../lib/firebase';
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

export interface ParcelOtpChallenge {
  parcelNumber: string;
  recipientName: string;
  maskedEmail: string;
  deliveryMethod: 'gmail' | 'preview_email';
  gmailSent: boolean;
  expiresInSeconds: number;
  previewOtp?: string;
}

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
  gmailAccessToken: string | null;
  gmailEmail: string | null;
  connectGmail: () => Promise<void>;
  disconnectGmail: () => void;
  parcelToken: string | null;
  requestParcelOtp: (parcelNumber: string) => Promise<ParcelOtpChallenge>;
  verifyParcelOtp: (parcelNumber: string, otp: string) => Promise<void>;
  checkGmailInboxOtp: (parcelNumber: string) => Promise<string | null>;
  clearVerifiedParcel: () => void;
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
  const [gmailAccessToken, setGmailAccessToken] = useState<string | null>(null);
  const [gmailEmail, setGmailEmail] = useState<string | null>(null);
  const [parcelToken, setParcelToken] = useState<string | null>(null);

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
  const wsRef = useRef<WebSocket | null>(null);

  // Sync Tailwind v4 `.dark` class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  // Keep Gmail in-memory token synchronized with Firebase auth state
  useEffect(() => {
    const unsubscribe = initGmailAuth(
      (fbUser, accessToken) => {
        setGmailAccessToken(accessToken);
        setGmailEmail(fbUser.email || null);
      },
      () => {
        setGmailAccessToken(null);
        setGmailEmail(null);
      }
    );
    return () => unsubscribe();
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  const refreshAllData = useCallback(async () => {
    try {
      setDataError(null);
      const configRes = await fetch('/api/config/public');
      if (configRes.ok) {
        const cfg = (await configRes.json()) as { mapsApiKey?: string };
        if (cfg.mapsApiKey) setMapsApiKey(cfg.mapsApiKey);
      }

      if (user?.role === 'operator' && token) {
        const headers = { Authorization: `Bearer ${token}` };
        const [parcelsRes, fleetRes, notifRes] = await Promise.all([
          fetch('/api/parcels', { headers }),
          fetch('/api/fleet', { headers }),
          fetch('/api/notifications', { headers }),
        ]);

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
      } else if (parcelToken) {
        const res = await fetch('/api/customer/parcel', {
          headers: { 'X-Parcel-Token': parcelToken },
        });
        if (res.ok) {
          const data = (await res.json()) as {
            mission: MissionWithDetails | null;
            drone: DroneRecord | null;
            notifications: NotificationRecord[];
          };
          setMissions(data.mission ? [data.mission] : []);
          setDrones(data.drone ? [data.drone] : []);
          setNotifications(data.notifications || []);
          lastNotifCountRef.current = (data.notifications || []).length;
        } else if (res.status === 401) {
          setParcelToken(null);
          setMissions([]);
          setDrones([]);
          setNotifications([]);
        }
      } else {
        setMissions([]);
        setDrones([]);
        setBatteryReports([]);
        setNotifications([]);
      }
    } catch (err) {
      console.error('Data sync failed:', err);
      setDataError('Unable to reach AEGIS telemetry server. Retrying shortly.');
    } finally {
      setLoadingData(false);
    }
  }, [user?.role, token, parcelToken]);

  useEffect(() => {
    void refreshAllData();
  }, [refreshAllData]);

  // Real-time WebSocket Telemetry Listener (strictly scoped by role/parcel token)
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const sendSubscription = (ws: WebSocket) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      if (user?.role === 'operator' && token) {
        ws.send(JSON.stringify({ type: 'subscribe:operator', token }));
      } else if (parcelToken) {
        ws.send(JSON.stringify({ type: 'subscribe:parcel', parcelToken }));
      } else {
        ws.send(JSON.stringify({ type: 'unsubscribe' }));
      }
    };

    const connect = () => {
      socket = new WebSocket(wsUrl);
      wsRef.current = socket;
      socket.onopen = () => {
        if (socket) sendSubscription(socket);
      };
      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as {
            type: string;
            drones?: DroneRecord[];
            missions?: MissionWithDetails[];
            mission?: MissionWithDetails | null;
            drone?: DroneRecord | null;
          };
          if (msg.type === 'telemetry:tick') {
            if (msg.drones) setDrones(msg.drones);
            if (msg.missions) setMissions(msg.missions);
          } else if (msg.type === 'parcel:tick') {
            if (msg.mission) setMissions([msg.mission]);
            if (msg.drone) setDrones([msg.drone]);
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
        wsRef.current = null;
        reconnectTimer = setTimeout(connect, 4000);
      };
    };

    connect();
    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [refreshAllData, user?.role, token, parcelToken]);

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

  const connectGmail = useCallback(async () => {
    const result = await connectGmailWithGoogle();
    setGmailAccessToken(result.accessToken);
    setGmailEmail(result.user.email || null);

    if (!user) {
      try {
        const res = await fetch('/api/auth/firebase-sync', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${result.idToken}`,
          },
          body: JSON.stringify({
            name: result.user.displayName,
            role: 'customer',
          }),
        });
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
          setProfile(data.profile);
          setToken(data.token);
        }
      } catch {
        // Non-blocking customer profile sync
      }
    }
  }, [user]);

  const disconnectGmail = useCallback(() => {
    clearGmailAccessToken();
    setGmailAccessToken(null);
    setGmailEmail(null);
  }, []);

  const requestParcelOtp = useCallback(
    async (parcelNumber: string) => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (gmailAccessToken) {
        headers.Authorization = `Bearer ${gmailAccessToken}`;
      }
      const res = await fetch('/api/parcels/request-otp', {
        method: 'POST',
        headers,
        body: JSON.stringify({ parcelNumber }),
      });
      const data = (await res.json()) as ParcelOtpChallenge & {
        error?: string;
        needsGmailAuth?: boolean;
      };
      if (!res.ok) {
        if (data.needsGmailAuth) {
          clearGmailAccessToken();
          setGmailAccessToken(null);
          setGmailEmail(null);
        }
        throw new Error(data.error || 'Invalid Parcel Number');
      }
      return data;
    },
    [gmailAccessToken]
  );

  const checkGmailInboxOtp = useCallback(
    async (parcelNumber: string): Promise<string | null> => {
      if (!gmailAccessToken) return null;
      const res = await fetch(
        `/api/parcels/gmail-otp-check?parcelNumber=${encodeURIComponent(parcelNumber)}`,
        {
          headers: { Authorization: `Bearer ${gmailAccessToken}` },
        }
      );
      if (!res.ok) return null;
      const data = (await res.json()) as { found?: boolean; otp?: string };
      return data.found && data.otp ? data.otp : null;
    },
    [gmailAccessToken]
  );

  const verifyParcelOtp = useCallback(async (parcelNumber: string, otp: string) => {
    const res = await fetch('/api/parcels/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parcelNumber, otp }),
    });
    const data = (await res.json()) as {
      verified?: boolean;
      parcelToken?: string;
      mission?: MissionWithDetails | null;
      drone?: DroneRecord | null;
      notifications?: NotificationRecord[];
      error?: string;
    };
    if (!res.ok || !data.parcelToken) {
      throw new Error(data.error || 'OTP verification failed');
    }
    setParcelToken(data.parcelToken);
    setMissions(data.mission ? [data.mission] : []);
    setDrones(data.drone ? [data.drone] : []);
    setNotifications(data.notifications || []);
    lastNotifCountRef.current = (data.notifications || []).length;
  }, []);

  const clearVerifiedParcel = useCallback(() => {
    setParcelToken(null);
    if (user?.role !== 'operator') {
      setMissions([]);
      setDrones([]);
      setNotifications([]);
    }
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'unsubscribe' }));
    }
  }, [user?.role]);

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
      const oauthCred = GoogleAuthProvider.credentialFromResult(credential);
      if (oauthCred?.accessToken) {
        cacheGmailAccessToken(oauthCred.accessToken);
        setGmailAccessToken(oauthCred.accessToken);
        setGmailEmail(credential.user.email || null);
      }
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
    clearGmailAccessToken();
    setGmailAccessToken(null);
    setGmailEmail(null);
    setUser(null);
    setProfile(null);
    setToken(null);
    setParcelToken(null);
    setMissions([]);
    setDrones([]);
    setNotifications([]);
    setActivePortal('customer');
  }, []);

  const markAllNotificationsRead = useCallback(async () => {
    const headers: Record<string, string> = {};
    if (user?.role === 'operator' && token) {
      headers.Authorization = `Bearer ${token}`;
    } else if (parcelToken) {
      headers['X-Parcel-Token'] = parcelToken;
    } else {
      return;
    }
    await fetch('/api/notifications/read-all', { method: 'PATCH', headers });
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  }, [user?.role, token, parcelToken]);

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
        gmailAccessToken,
        gmailEmail,
        connectGmail,
        disconnectGmail,
        parcelToken,
        requestParcelOtp,
        verifyParcelOtp,
        checkGmailInboxOtp,
        clearVerifiedParcel,
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

