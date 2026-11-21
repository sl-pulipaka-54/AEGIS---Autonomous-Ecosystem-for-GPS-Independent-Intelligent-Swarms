import React, { useMemo, useState } from 'react';
import {
  PackageSearch,
  PackageCheck,
  Navigation,
  History,
  MessageSquareHeart,
  Mic,
  QrCode,
  CheckCircle2,
  Clock,
  BatteryCharging,
  MapPin,
  Send,
  User,
  Bell,
  ArrowLeft,
  ShieldCheck,
  Compass,
  LocateFixed,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { motion } from 'motion/react';
import { useAegis } from '../context/AegisContext';
import { TRANSLATIONS } from '../lib/i18n';
import { AegisMap } from './AegisMap';
import { GeminiChatPanel } from './GeminiChatPanel';
import { FormattedAiText, GroundingSourcesList } from './GroundingSourcesList';
import type {
  ChatMessage,
  CustomerTab,
  GroundingLookupResponse,
  MissionWithDetails,
} from '../types/aegis';

const STAGES = [
  'Parcel Received',
  'Drone Assigned',
  'Mission Prepared',
  'Loaded on Drone',
  'In Transit',
  'Near Destination',
  'Delivered',
] as const;

export const CustomerPortal: React.FC = () => {
  const {
    user,
    profile,
    token,
    language,
    largeText,
    setLargeText,
    mapsApiKey,
    missions,
    drones,
    notifications,
    openAuthModal,
    setProfileState,
  } = useAegis();

  const t = TRANSLATIONS[language];
  const [tab, setTab] = useState<CustomerTab>('home');
  const [parcelInput, setParcelInput] = useState('AEG-1042');
  const [selectedMissionId, setSelectedMissionId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'delivered'>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [listeningVoice, setListeningVoice] = useState(false);

  // QR Verification state
  const [qrInput, setQrInput] = useState('');
  const [qrVerifyResult, setQrVerifyResult] = useState<string | null>(null);

  // Multi-turn AI Chat Support state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'Hello! I am AEGIS Care. Ask me anything about your parcel delivery, live drone arrival, nearby drop zones (Google Maps), or live Hyderabad weather (Google Search).',
      mode: 'care',
      modelUsed: 'gemini-4-hydrogen',
      createdAt: new Date().toISOString(),
    },
  ]);

  // Maps Grounding Drop-Zone Explorer state (Live Map tab)
  const [mapsQuery, setMapsQuery] = useState(
    'Safe open parks or clear drop zones and landmarks near my delivery destination'
  );
  const [mapsLoading, setMapsLoading] = useState(false);
  const [mapsResult, setMapsResult] = useState<GroundingLookupResponse | null>(null);
  const [mapsError, setMapsError] = useState<string | null>(null);
  const [customerGps, setCustomerGps] = useState<{
    lat: number;
    lng: number;
  } | null>(null);

  // Profile Edit state
  const [editName, setEditName] = useState(user?.name || '');
  const [editPhone, setEditPhone] = useState(user?.phone || '');
  const [editAddress, setEditAddress] = useState(
    profile?.defaultAddress ||
      'Plot No 68, Flat 201, Gajularamaram, Hyderabad 500055'
  );
  const [pushPref, setPushPref] = useState(profile?.pushEnabled ?? true);
  const [smsPref, setSmsPref] = useState(profile?.smsEnabled ?? true);
  const [emailPref, setEmailPref] = useState(profile?.emailEnabled ?? true);
  const [profileSavedMsg, setProfileSavedMsg] = useState<string | null>(null);

  React.useEffect(() => {
    if (user) {
      setEditName(user.name);
      setEditPhone(user.phone || '');
    }
    if (profile) {
      setEditAddress(profile.defaultAddress);
      setPushPref(profile.pushEnabled);
      setSmsPref(profile.smsEnabled);
      setEmailPref(profile.emailEnabled);
    }
  }, [user, profile]);

  const activeMission: MissionWithDetails | null = useMemo(() => {
    if (selectedMissionId) {
      const byId = missions.find((m) => m.id === selectedMissionId);
      if (byId) return byId;
    }
    const normalized = parcelInput.trim().toLowerCase().replace('#', '');
    const byParcel = missions.find((m) => {
      const pNum = m.parcel?.parcelNumber.toLowerCase().replace('#', '') || '';
      return pNum === normalized;
    });
    return byParcel || missions[0] || null;
  }, [missions, selectedMissionId, parcelInput]);

  const filteredMissions = useMemo(() => {
    return missions.filter((m) => {
      const p = m.parcel;
      if (!p) return false;
      const q = searchQuery.trim().toLowerCase();
      const matchesQ =
        !q ||
        p.parcelNumber.toLowerCase().includes(q) ||
        p.recipientName.toLowerCase().includes(q) ||
        p.destinationAddress.toLowerCase().includes(q);

      const isDelivered = m.status === 'delivered';
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'delivered' && isDelivered) ||
        (statusFilter === 'active' && !isDelivered);

      const matchesPriority =
        priorityFilter === 'all' || p.priority === priorityFilter;

      return matchesQ && matchesStatus && matchesPriority;
    });
  }, [missions, searchQuery, statusFilter, priorityFilter]);

  const handleVoiceSearch = (target: 'parcel' | 'history') => {
    const SpeechRecognitionCtor =
      (window as unknown as { SpeechRecognition?: new () => any; webkitSpeechRecognition?: new () => any })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => any })
        .webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      setParcelInput('AEG-1042');
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang =
      language === 'te' ? 'te-IN' : language === 'hi' ? 'hi-IN' : 'en-IN';
    setListeningVoice(true);
    recognition.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript || '';
      if (target === 'parcel') {
        setParcelInput(transcript.replace(/\s+/g, ''));
      } else {
        setSearchQuery(transcript);
      }
      setListeningVoice(false);
    };
    recognition.onerror = () => setListeningVoice(false);
    recognition.onend = () => setListeningVoice(false);
    recognition.start();
  };

  const handleVerifyQr = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeMission?.parcel) return;
    const res = await fetch('/api/parcels/verify-qr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parcelNumber: activeMission.parcel.parcelNumber,
        qrCode: qrInput || activeMission.parcel.qrCode,
      }),
    });
    const data = (await res.json()) as { verified?: boolean; error?: string };
    setQrVerifyResult(
      data.verified
        ? `Verified authentic AEGIS parcel ${activeMission.parcel.parcelNumber} for ${activeMission.parcel.recipientName}.`
        : data.error || 'Verification code did not match this parcel.'
    );
  };

  const handleExploreNearbyMaps = async (
    customQuery?: string,
    useBrowserGps = false
  ) => {
    const q = (customQuery ?? mapsQuery).trim();
    if (!q) return;
    setMapsLoading(true);
    setMapsError(null);

    let lat = activeMission?.parcel?.destLat ?? 17.5212;
    let lng = activeMission?.parcel?.destLng ?? 78.4119;

    if (useBrowserGps && 'geolocation' in navigator) {
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            timeout: 5000,
          })
        );
        lat = Number(pos.coords.latitude.toFixed(6));
        lng = Number(pos.coords.longitude.toFixed(6));
        setCustomerGps({ lat, lng });
      } catch {
        // Fallback smoothly to destination coordinates
      }
    } else if (customerGps && useBrowserGps) {
      lat = customerGps.lat;
      lng = customerGps.lng;
    }

    try {
      const res = await fetch('/api/ai/maps-grounding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: q,
          lat,
          lng,
          address: activeMission?.parcel?.destinationAddress,
        }),
      });
      const data = (await res.json()) as GroundingLookupResponse & {
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || 'Maps grounding unavailable');
      }
      setMapsResult(data);
    } catch (err: unknown) {
      setMapsError(
        err instanceof Error ? err.message : 'Unable to query Google Maps data'
      );
    } finally {
      setMapsLoading(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      openAuthModal('customer');
      return;
    }
    const res = await fetch('/api/profile', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: editName,
        phone: editPhone,
        defaultAddress: editAddress,
        languagePref: language,
        pushEnabled: pushPref,
        smsEnabled: smsPref,
        emailEnabled: emailPref,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setProfileState(data.user, data.profile);
      setProfileSavedMsg('Your delivery profile and alert preferences are saved.');
      setTimeout(() => setProfileSavedMsg(null), 4000);
    }
  };

  const textScale = largeText ? 'text-lg' : 'text-base';
  const currentStageIndex = activeMission?.parcel
    ? Math.max(0, STAGES.indexOf(activeMission.parcel.currentStage as (typeof STAGES)[number]))
    : 0;

  return (
    <div className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 ${textScale}`}>
      {/* Sub-navigation bar inside Customer Workspace */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex flex-wrap items-center gap-2">
          {tab !== 'home' && (
            <button
              type="button"
              onClick={() => setTab('home')}
              className="min-h-[44px] px-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-semibold text-sm flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Dashboard</span>
            </button>
          )}
          {[
            { id: 'home', label: 'Home' },
            { id: 'track', label: t.trackParcel },
            { id: 'live-map', label: t.liveTracking },
            { id: 'deliveries', label: t.myDeliveries },
            { id: 'history', label: t.deliveryHistory },
            { id: 'support', label: t.support },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id as CustomerTab)}
              className={`min-h-[44px] px-4 rounded-xl text-sm font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                tab === item.id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white/80 dark:bg-slate-900/80 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:border-blue-400'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setLargeText(!largeText)}
            className={`min-h-[44px] px-3.5 rounded-xl text-sm font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
              largeText
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
            }`}
          >
            {t.largeTextLabel}
          </button>
          <button
            type="button"
            onClick={() => (user ? setTab('profile') : openAuthModal('customer'))}
            className="min-h-[44px] px-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm font-semibold flex items-center gap-2 hover:border-blue-500 transition-colors cursor-pointer whitespace-nowrap"
          >
            <User className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
            <span>{user ? user.name : 'My Profile'}</span>
          </button>
        </div>
      </div>

      {/* HOME DASHBOARD VIEW */}
      {tab === 'home' && (
        <div className="space-y-8">
          {/* Welcome Hero Split */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            <div className="lg:col-span-7 glass-panel rounded-3xl p-6 sm:p-8 flex flex-col justify-between shadow-sm">
              <div>
                <p className="text-sm font-semibold text-blue-600 dark:text-cyan-400 mb-2">
                  Gajularamaram Hub · Hyderabad Airspace
                </p>
                <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white [text-wrap:balance] mb-3">
                  {user ? `Welcome back, ${user.name}` : t.welcome}
                </h1>
                <p className="text-slate-600 dark:text-slate-300 text-base sm:text-lg max-w-xl mb-6">
                  {t.subtitle}
                </p>

                {/* Instant Parcel Lookup */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setSelectedMissionId(null);
                    setTab('track');
                  }}
                  className="flex flex-col sm:flex-row gap-3 mb-4"
                >
                  <div className="relative flex-1">
                    <PackageSearch className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={parcelInput}
                      onChange={(e) => setParcelInput(e.target.value)}
                      placeholder={t.enterParcelPrompt}
                      className="w-full min-h-[52px] pl-12 pr-12 rounded-2xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-base font-medium focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                    <button
                      type="button"
                      onClick={() => handleVoiceSearch('parcel')}
                      title={t.voiceSearch}
                      className={`absolute right-2 top-1/2 -translate-y-1/2 min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
                        listeningVoice
                          ? 'bg-rose-600 text-white'
                          : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <Mic className="w-5 h-5" />
                    </button>
                  </div>
                  <button
                    type="submit"
                    className="min-h-[52px] px-6 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-base shadow-md transition-colors cursor-pointer whitespace-nowrap"
                  >
                    {t.trackNow}
                  </button>
                </form>

                {/* Quick Parcel Picks */}
                <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                  <span>Active parcels:</span>
                  {missions.slice(0, 3).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setParcelInput(m.parcel?.parcelNumber || 'AEG-1042');
                        setSelectedMissionId(m.id);
                        setTab('track');
                      }}
                      className="min-h-[36px] px-3 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950 font-mono font-semibold text-blue-700 dark:text-cyan-300 transition-colors cursor-pointer"
                    >
                      {m.parcel?.parcelNumber}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Hero Visual Card */}
            <div className="lg:col-span-5 rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900 relative min-h-[260px]">
              <img
                src="/src/assets/images/hero_aegis_drone_1795193986147.jpg"
                alt="AEGIS autonomous delivery drone flying over city skyline"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover lg:h-full"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/20 to-transparent flex flex-col justify-end p-6 text-white">
                <p className="font-mono text-xs text-cyan-300 mb-1">
                  ACTIVE FLIGHT · {activeMission?.drone?.code || 'PHANTOM-01'}
                </p>
                <p className="text-lg font-bold">
                  {activeMission?.parcel?.currentStage || 'In Transit'} ·{' '}
                  {activeMission?.distanceKm ?? 4.2} km corridor
                </p>
              </div>
            </div>
          </section>

          {/* 5 Accessible Main Action Cards */}
          <section aria-label="Customer Services">
            <h2 className="text-xl font-bold mb-4">Quick Services</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {[
                {
                  id: 'track',
                  title: t.trackParcel,
                  desc: '7-step live parcel progress & QR check',
                  icon: PackageSearch,
                  accent: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60',
                },
                {
                  id: 'deliveries',
                  title: t.myDeliveries,
                  desc: 'Active & incoming doorstep drops',
                  icon: PackageCheck,
                  accent: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60',
                },
                {
                  id: 'live-map',
                  title: t.liveTracking,
                  desc: 'Watch your drone fly on the live map',
                  icon: Navigation,
                  accent: 'text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950/60',
                },
                {
                  id: 'history',
                  title: t.deliveryHistory,
                  desc: 'Search past orders & delivery photos',
                  icon: History,
                  accent: 'text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800',
                },
                {
                  id: 'support',
                  title: t.support,
                  desc: 'Friendly AI care in English, Telugu & Hindi',
                  icon: MessageSquareHeart,
                  accent: 'text-blue-600 dark:text-cyan-400 bg-blue-50 dark:bg-slate-800',
                },
              ].map((card) => {
                const Icon = card.icon;
                return (
                  <motion.button
                    key={card.id}
                    type="button"
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => setTab(card.id as CustomerTab)}
                    className="text-left p-5 rounded-2xl glass-surface hover:border-blue-500/60 transition-all shadow-sm flex flex-col justify-between min-h-[164px] cursor-pointer"
                  >
                    <div
                      className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${card.accent}`}
                    >
                      <Icon className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-slate-900 dark:text-white mb-1">
                        {card.title}
                      </h3>
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        {card.desc}
                      </p>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </section>

          {/* Recent Alerts Strip */}
          <section className="glass-surface rounded-2xl p-5 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Bell className="w-5 h-5 text-blue-600 dark:text-cyan-400" />
                <span>Latest Delivery Updates</span>
              </h2>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Push · SMS · Email synced
              </span>
            </div>
            <div className="divide-y divide-slate-200/80 dark:divide-slate-800">
              {notifications.slice(0, 3).map((n) => (
                <div
                  key={n.id}
                  className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">
                      {n.title}
                    </p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      {n.message}
                    </p>
                  </div>
                  <div className="text-xs font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {n.channel.toUpperCase()} · {n.parcelNumber}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* TRACK PARCEL PAGE (7-Stage Progress Bar + QR Verification) */}
      {tab === 'track' && (
        <div className="space-y-6">
          <div className="glass-surface rounded-3xl p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div>
                <h2 className="text-2xl font-bold">Track Your Parcel</h2>
                <p className="text-slate-600 dark:text-slate-400">
                  Real-time 7-stage autonomous flight progression
                </p>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={parcelInput}
                  onChange={(e) => {
                    setSelectedMissionId(null);
                    setParcelInput(e.target.value);
                  }}
                  placeholder="Enter Parcel # (e.g. AEG-1042)"
                  className="min-h-[48px] px-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono text-base"
                />
                <button
                  type="button"
                  onClick={() => handleVoiceSearch('parcel')}
                  className="min-h-[48px] min-w-[48px] rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center cursor-pointer"
                  aria-label="Voice search parcel number"
                >
                  <Mic className="w-5 h-5" />
                </button>
              </div>
            </div>

            {activeMission?.parcel ? (
              <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
                  <div>
                    <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
                      PARCEL {activeMission.parcel.parcelNumber} · MISSION{' '}
                      {activeMission.missionCode}
                    </p>
                    <h3 className="text-2xl font-bold text-blue-600 dark:text-cyan-400 mt-1">
                      {t.stages[activeMission.parcel.currentStage] ||
                        activeMission.parcel.currentStage}
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                      Destination: {activeMission.parcel.destinationAddress}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => setTab('live-map')}
                      className="min-h-[48px] px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center gap-2 cursor-pointer"
                    >
                      <Navigation className="w-4 h-4" />
                      <span>Open Live Map</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTab('details')}
                      className="min-h-[48px] px-5 rounded-xl bg-slate-900 dark:bg-slate-800 text-white font-semibold flex items-center gap-2 cursor-pointer"
                    >
                      <QrCode className="w-4 h-4" />
                      <span>Details & Delivery Proof</span>
                    </button>
                  </div>
                </div>

                {/* Progress Bar */}
                <div>
                  <div className="h-3 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden mb-6">
                    <div
                      className="h-full bg-gradient-to-r from-blue-600 via-cyan-500 to-emerald-500 transition-all duration-500"
                      style={{
                        width: `${Math.round(((currentStageIndex + 1) / STAGES.length) * 100)}%`,
                      }}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
                    {STAGES.map((stage, idx) => {
                      const done = idx <= currentStageIndex;
                      const current = idx === currentStageIndex;
                      return (
                        <div
                          key={stage}
                          className={`p-3.5 rounded-2xl border transition-colors ${
                            current
                              ? 'border-blue-600 bg-blue-50/80 dark:bg-blue-950/50'
                              : done
                                ? 'border-emerald-500/40 bg-emerald-50/50 dark:bg-emerald-950/20'
                                : 'border-slate-200 dark:border-slate-800 opacity-60'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1.5">
                            {done ? (
                              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            ) : (
                              <Clock className="w-5 h-5 text-slate-400 shrink-0" />
                            )}
                            <span className="text-xs font-mono text-slate-500">
                              Step {idx + 1}
                            </span>
                          </div>
                          <p className="text-sm font-semibold">
                            {t.stages[stage] || stage}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center">
                <p className="text-lg font-semibold mb-2">
                  No parcel found matching "{parcelInput}"
                </p>
                <p className="text-slate-600 dark:text-slate-400 mb-4">
                  Try AEG-1042, #203, or AEG-1039.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* LIVE DRONE TRACKING PAGE */}
      {tab === 'live-map' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8">
              <AegisMap
                apiKey={mapsApiKey}
                drones={drones}
                missions={missions}
                focusedDroneId={activeMission?.drone?.id || null}
                heightClass="h-[440px] md:h-[540px]"
                language={language}
              />
            </div>

            <div className="lg:col-span-4 space-y-4">
              <div className="glass-panel rounded-3xl p-6 space-y-4">
                <div>
                  <p className="text-xs font-mono text-cyan-600 dark:text-cyan-400">
                    LIVE FLIGHT TELEMETRY
                  </p>
                  <h2 className="text-2xl font-bold mt-1">
                    {activeMission?.drone?.code || 'PHANTOM-01'}
                  </h2>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {activeMission?.drone?.model || 'AEGIS MK-IV Quadrotor'} · ID #
                    {activeMission?.drone?.id || 1}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 font-mono">
                  <div className="p-3.5 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800">
                    <p className="text-xs text-slate-500">Speed</p>
                    <p className="text-xl font-bold tabular-nums">
                      {activeMission?.drone?.speedKmh ?? 58} km/h
                    </p>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800">
                    <p className="text-xs text-slate-500">Battery</p>
                    <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums flex items-center gap-1">
                      <BatteryCharging className="w-5 h-5" />
                      {activeMission?.drone?.batteryPct ?? 86}%
                    </p>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800">
                    <p className="text-xs text-slate-500">Altitude</p>
                    <p className="text-xl font-bold tabular-nums">
                      {activeMission?.drone?.altitudeM ?? 95} m
                    </p>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800">
                    <p className="text-xs text-slate-500">Est. Arrival</p>
                    <p className="text-xl font-bold text-blue-600 dark:text-cyan-400 tabular-nums">
                      {activeMission?.eta
                        ? new Date(activeMission.eta).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '6 mins'}
                    </p>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                  <p className="text-sm font-semibold mb-2">Switch Active Flight</p>
                  <div className="flex flex-wrap gap-2">
                    {missions.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setSelectedMissionId(m.id);
                          setParcelInput(m.parcel?.parcelNumber || '');
                        }}
                        className={`min-h-[40px] px-3 rounded-xl text-xs font-mono font-semibold border cursor-pointer ${
                          activeMission?.id === m.id
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        {m.parcel?.parcelNumber} · {m.drone?.code}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Google Maps Grounding: Nearby Drop Zones & Corridor Landmarks */}
          <div className="glass-surface rounded-3xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <Compass className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  <span>Nearby Drop Zones &amp; Landmarks (Google Maps Grounding)</span>
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Real-world Google Maps context anchored to{' '}
                  {activeMission?.parcel?.destinationAddress || 'Hyderabad Corridor'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleExploreNearbyMaps(mapsQuery, true)}
                disabled={mapsLoading}
                className="min-h-[40px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <LocateFixed className="w-4 h-4" />
                <span>Use My GPS &amp; Scan</span>
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {[
                'Find safe open parks or clear drop zones near this destination',
                'Nearby pharmacies, hospitals, and medical clinics in this sector',
                'Prominent landmarks and road intersections near the delivery address',
              ].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setMapsQuery(preset);
                    void handleExploreNearbyMaps(preset, false);
                  }}
                  disabled={mapsLoading}
                  className="min-h-[36px] px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950 text-xs font-medium cursor-pointer"
                >
                  {preset}
                </button>
              ))}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleExploreNearbyMaps();
              }}
              className="flex flex-col sm:flex-row gap-2"
            >
              <input
                type="text"
                value={mapsQuery}
                onChange={(e) => setMapsQuery(e.target.value)}
                placeholder="Ask Google Maps about nearby landmarks, open spaces, or pharmacies..."
                className="flex-1 min-h-[46px] px-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-sm"
              />
              <button
                type="submit"
                disabled={mapsLoading}
                className="min-h-[46px] px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer"
              >
                <Compass className="w-4 h-4" />
                <span>{mapsLoading ? 'Searching Maps...' : 'Query Google Maps'}</span>
              </button>
            </form>

            {mapsError && (
              <p className="text-sm text-rose-600 dark:text-rose-400">{mapsError}</p>
            )}

            {mapsResult && (
              <div className="p-4 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 text-sm">
                <FormattedAiText text={mapsResult.text} />
                <GroundingSourcesList sources={mapsResult.sources} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* MY DELIVERIES & DELIVERY HISTORY (With Search & Advanced Filters) */}
      {(tab === 'deliveries' || tab === 'history') && (
        <div className="glass-surface rounded-3xl p-6 space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold">
                {tab === 'deliveries' ? t.myDeliveries : t.deliveryHistory}
              </h2>
              <p className="text-slate-600 dark:text-slate-400">
                Search by parcel number, recipient, or Hyderabad address
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t.searchPlaceholder}
                  className="min-h-[46px] pl-4 pr-11 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-sm w-64"
                />
                <button
                  type="button"
                  onClick={() => handleVoiceSearch('history')}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 min-w-[36px] min-h-[36px] rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  aria-label="Voice search delivery history"
                >
                  <Mic className="w-4 h-4" />
                </button>
              </div>
              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as 'all' | 'active' | 'delivered')
                }
                className="min-h-[46px] px-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-sm"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active Flights</option>
                <option value="delivered">Delivered</option>
              </select>
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="min-h-[46px] px-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-sm"
              >
                <option value="all">All Priorities</option>
                <option value="emergency">Emergency</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>

          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {filteredMissions.length === 0 ? (
              <p className="py-8 text-center text-slate-500">
                No deliveries match your current search or filter.
              </p>
            ) : (
              filteredMissions.map((m) => (
                <div
                  key={m.id}
                  className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs font-mono text-slate-500 dark:text-slate-400">
                      <span className="font-bold text-slate-900 dark:text-white text-sm">
                        {m.parcel?.parcelNumber}
                      </span>
                      <span>·</span>
                      <span>{m.drone?.code}</span>
                      <span>·</span>
                      <span className="capitalize">{m.parcel?.priority} priority</span>
                    </div>
                    <p className="font-semibold text-base">
                      {m.parcel?.recipientName} — {m.parcel?.destinationAddress}
                    </p>
                    <p className="text-sm text-emerald-700 dark:text-emerald-400 font-medium">
                      {m.parcel?.currentStage}
                    </p>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMissionId(m.id);
                        setParcelInput(m.parcel?.parcelNumber || '');
                        setTab('live-map');
                      }}
                      className="min-h-[44px] px-4 rounded-xl bg-blue-600 text-white text-sm font-semibold cursor-pointer"
                    >
                      Live Map
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMissionId(m.id);
                        setParcelInput(m.parcel?.parcelNumber || '');
                        setTab('details');
                      }}
                      className="min-h-[44px] px-4 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-semibold cursor-pointer"
                    >
                      Delivery Details
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* DELIVERY DETAILS & QR PROOF PAGE */}
      {tab === 'details' && activeMission?.parcel && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 glass-surface rounded-3xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
              <div>
                <p className="text-xs font-mono text-slate-500">
                  DELIVERY RECORD · {activeMission.missionCode}
                </p>
                <h2 className="text-2xl font-bold mt-1">
                  Parcel {activeMission.parcel.parcelNumber}
                </h2>
              </div>
              <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                {activeMission.parcel.currentStage}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div className="p-4 rounded-2xl bg-slate-100/80 dark:bg-slate-900/80">
                <p className="text-slate-500 mb-1 flex items-center gap-1.5">
                  <MapPin className="w-4 h-4" /> Pickup Hub
                </p>
                <p className="font-semibold">{activeMission.parcel.pickupAddress}</p>
              </div>
              <div className="p-4 rounded-2xl bg-slate-100/80 dark:bg-slate-900/80">
                <p className="text-slate-500 mb-1 flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-blue-600" /> Destination
                </p>
                <p className="font-semibold">
                  {activeMission.parcel.destinationAddress}
                </p>
              </div>
              <div className="p-4 rounded-2xl bg-slate-100/80 dark:bg-slate-900/80">
                <p className="text-slate-500 mb-1">Delivery Time / ETA</p>
                <p className="font-semibold font-mono">
                  {activeMission.completedAt
                    ? `Delivered ${new Date(activeMission.completedAt).toLocaleString()}`
                    : activeMission.eta
                      ? `ETA ${new Date(activeMission.eta).toLocaleTimeString()}`
                      : 'Scheduled'}
                </p>
              </div>
              <div className="p-4 rounded-2xl bg-slate-100/80 dark:bg-slate-900/80">
                <p className="text-slate-500 mb-1">Drone Assigned</p>
                <p className="font-semibold font-mono">
                  {activeMission.drone?.code} ({activeMission.drone?.model})
                </p>
              </div>
            </div>

            {/* Delivery Proof Photo */}
            <div>
              <h3 className="font-bold text-lg mb-2">Delivery Proof</h3>
              <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900">
                <img
                  src={
                    activeMission.parcel.deliveryProofUrl ||
                    '/src/assets/images/delivery_proof_porch_1795193986831.jpg'
                  }
                  alt="AEGIS autonomous parcel drop proof"
                  referrerPolicy="no-referrer"
                  className="w-full h-56 object-cover"
                />
                <div className="p-4 text-sm text-slate-700 dark:text-slate-300">
                  {activeMission.parcel.deliveryProofNote ||
                    'Delivery proof photo is captured automatically upon autonomous pad release.'}
                </div>
              </div>
            </div>
          </div>

          {/* QR Code Parcel Verification Card */}
          <div className="lg:col-span-5 glass-panel rounded-3xl p-6 space-y-5">
            <div>
              <h3 className="text-xl font-bold flex items-center gap-2">
                <QrCode className="w-5 h-5 text-blue-600 dark:text-cyan-400" />
                <span>QR Code Parcel Verification</span>
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                Scan or enter the verification token to confirm custody & release.
              </p>
            </div>

            <div className="flex flex-col items-center p-6 rounded-2xl bg-white text-slate-900 border border-slate-200">
              <QRCodeSVG value={activeMission.parcel.qrCode} size={172} />
              <p className="font-mono text-sm font-bold mt-3">
                {activeMission.parcel.qrCode}
              </p>
            </div>

            <form onSubmit={handleVerifyQr} className="space-y-3">
              <input
                type="text"
                value={qrInput}
                onChange={(e) => setQrInput(e.target.value)}
                placeholder={`Enter code (e.g. ${activeMission.parcel.qrCode})`}
                className="w-full min-h-[46px] px-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono text-sm"
              />
              <button
                type="submit"
                className="w-full min-h-[48px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer"
              >
                Verify Parcel Release Code
              </button>
            </form>

            {qrVerifyResult && (
              <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-sm text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 shrink-0" />
                <span>{qrVerifyResult}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MULTI-TURN AI CHAT SUPPORT PAGE */}
      {tab === 'support' && (
        <div className="max-w-4xl mx-auto">
          <GeminiChatPanel
            title="AEGIS Care AI Assistant"
            subtitle="Multi-turn support in English, Telugu, or Hindi with Fast Express, Google Maps Grounding, and Google Search Grounding"
            availableModes={['care', 'fast', 'maps', 'search']}
            defaultMode="care"
            language={language}
            activeParcelNumber={activeMission?.parcel?.parcelNumber}
            defaultLatLng={
              activeMission?.parcel
                ? {
                    latitude: activeMission.parcel.destLat,
                    longitude: activeMission.parcel.destLng,
                  }
                : { latitude: 17.5212, longitude: 78.4119 }
            }
            messages={chatMessages}
            onMessagesChange={setChatMessages}
          />
        </div>
      )}

      {/* CUSTOMER PROFILE & ALERT PREFERENCES */}
      {tab === 'profile' && (
        <div className="glass-surface rounded-3xl p-6 max-w-3xl mx-auto space-y-6">
          <h2 className="text-2xl font-bold">My Profile & Alert Preferences</h2>
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Full Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full min-h-[46px] px-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Mobile Number</label>
                <input
                  type="tel"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full min-h-[46px] px-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Default Delivery Address (Hyderabad)
              </label>
              <input
                type="text"
                value={editAddress}
                onChange={(e) => setEditAddress(e.target.value)}
                className="w-full min-h-[46px] px-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
              />
            </div>

            <div className="pt-2 space-y-2">
              <p className="font-semibold text-sm">Notification Channels</p>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 min-h-[44px] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pushPref}
                    onChange={(e) => setPushPref(e.target.checked)}
                    className="w-5 h-5 accent-blue-600"
                  />
                  <span>Push Notifications</span>
                </label>
                <label className="flex items-center gap-2 min-h-[44px] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={smsPref}
                    onChange={(e) => setSmsPref(e.target.checked)}
                    className="w-5 h-5 accent-blue-600"
                  />
                  <span>SMS Alerts</span>
                </label>
                <label className="flex items-center gap-2 min-h-[44px] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={emailPref}
                    onChange={(e) => setEmailPref(e.target.checked)}
                    className="w-5 h-5 accent-blue-600"
                  />
                  <span>Email Receipts</span>
                </label>
              </div>
            </div>

            {profileSavedMsg && (
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-sm">
                {profileSavedMsg}
              </div>
            )}

            <button
              type="submit"
              className="min-h-[48px] px-6 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer"
            >
              Save Profile Settings
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
