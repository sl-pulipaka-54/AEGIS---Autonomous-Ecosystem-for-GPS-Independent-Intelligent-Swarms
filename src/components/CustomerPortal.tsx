import React, { useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  BatteryCharging,
  Bell,
  CheckCircle2,
  Clock,
  Compass,
  History,
  KeyRound,
  LocateFixed,
  Mail,
  MapPin,
  MessageSquareHeart,
  Mic,
  Navigation,
  PackageCheck,
  PackageSearch,
  QrCode,
  RefreshCw,
  ShieldCheck,
  User,
  Volume2,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { motion } from 'motion/react';
import { useAegis, type ParcelOtpChallenge } from '../context/AegisContext';
import { TRANSLATIONS } from '../lib/i18n';
import { AegisMap } from './AegisMap';
import { SimpleCustomerPortal } from './SimpleCustomerPortal';
import { GoogleSignInButton } from './GoogleSignInButton';
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
    gmailAccessToken,
    gmailEmail,
    connectGmail,
    disconnectGmail,
    parcelToken,
    requestParcelOtp,
    verifyParcelOtp,
    checkGmailInboxOtp,
    clearVerifiedParcel,
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
  const g = t.otpGate;

  const [simpleMode, setSimpleMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('aegis_simple_mode') === 'true';
  });
  const [tab, setTab] = useState<CustomerTab>('home');

  // Parcel Number + Gmail OTP Verification Gate state
  const [parcelInput, setParcelInput] = useState('');
  const [challenge, setChallenge] = useState<ParcelOtpChallenge | null>(null);
  const [otpInput, setOtpInput] = useState('');
  const [gateLoading, setGateLoading] = useState(false);
  const [gateError, setGateError] = useState<string | null>(null);
  const [confirmEmailModalOpen, setConfirmEmailModalOpen] = useState(false);
  const [gmailConnecting, setGmailConnecting] = useState(false);
  const [checkingInbox, setCheckingInbox] = useState(false);
  const [inboxStatusMsg, setInboxStatusMsg] = useState<string | null>(null);
  const [listeningVoice, setListeningVoice] = useState(false);

  const toggleSimpleMode = (next: boolean) => {
    setSimpleMode(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('aegis_simple_mode', String(next));
    }
    if (next) {
      setLargeText(true);
    }
  };

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

  // Strictly scoped to the single OTP-verified parcel
  const activeMission: MissionWithDetails | null = parcelToken
    ? missions[0] || null
    : null;

  const handleVoiceParcelInput = () => {
    const SpeechRecognitionCtor =
      (
        window as unknown as {
          SpeechRecognition?: new () => any;
          webkitSpeechRecognition?: new () => any;
        }
      ).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => any })
        .webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang =
      language === 'te' ? 'te-IN' : language === 'hi' ? 'hi-IN' : 'en-IN';
    setListeningVoice(true);
    recognition.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript || '';
      if (transcript.trim()) {
        setParcelInput(transcript.replace(/\s+/g, '').toUpperCase());
        setGateError(null);
      }
      setListeningVoice(false);
    };
    recognition.onerror = () => setListeningVoice(false);
    recognition.onend = () => setListeningVoice(false);
    recognition.start();
  };

  const handleConnectGmail = async () => {
    setGmailConnecting(true);
    setGateError(null);
    try {
      await connectGmail();
    } catch (err: unknown) {
      setGateError(
        err instanceof Error
          ? err.message
          : 'Unable to connect Google Gmail account.'
      );
    } finally {
      setGmailConnecting(false);
    }
  };

  const executeRequestOtp = async () => {
    const trimmed = (challenge?.parcelNumber || parcelInput).trim();
    if (!trimmed) {
      setGateError(g.invalidParcel);
      return;
    }
    setConfirmEmailModalOpen(false);
    setGateLoading(true);
    setGateError(null);
    setInboxStatusMsg(null);
    try {
      const nextChallenge = await requestParcelOtp(trimmed);
      setChallenge(nextChallenge);
      setOtpInput('');
    } catch (err: unknown) {
      setGateError(
        err instanceof Error ? err.message : 'Invalid Parcel Number'
      );
    } finally {
      setGateLoading(false);
    }
  };

  const handleRequestOtp = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = (challenge?.parcelNumber || parcelInput).trim();
    if (!trimmed) {
      setGateError(g.invalidParcel);
      return;
    }
    if (gmailAccessToken) {
      setGateError(null);
      setConfirmEmailModalOpen(true);
      return;
    }
    await executeRequestOtp();
  };

  const handleCheckInboxOtp = async () => {
    if (!challenge) return;
    setCheckingInbox(true);
    setInboxStatusMsg(null);
    try {
      const foundOtp = await checkGmailInboxOtp(challenge.parcelNumber);
      if (foundOtp) {
        setOtpInput(foundOtp);
        setInboxStatusMsg(`OTP ${foundOtp} retrieved from your Gmail inbox.`);
      } else {
        setInboxStatusMsg(
          'No matching OTP email found yet. Please check your Gmail inbox or wait a moment.'
        );
      }
    } catch {
      setInboxStatusMsg(
        'Unable to read Gmail inbox right now. Please enter the 6-digit code from your email.'
      );
    } finally {
      setCheckingInbox(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challenge) return;
    setGateLoading(true);
    setGateError(null);
    try {
      await verifyParcelOtp(challenge.parcelNumber, otpInput.trim());
      setChallenge(null);
      setOtpInput('');
      setInboxStatusMsg(null);
      setQrInput('');
      setQrVerifyResult(null);
      setTab('home');
    } catch (err: unknown) {
      setGateError(
        err instanceof Error ? err.message : 'Invalid or expired OTP.'
      );
    } finally {
      setGateLoading(false);
    }
  };

  const handleResetParcel = () => {
    setChallenge(null);
    setOtpInput('');
    setParcelInput('');
    setGateError(null);
    setInboxStatusMsg(null);
    setConfirmEmailModalOpen(false);
    setQrInput('');
    setQrVerifyResult(null);
    setMapsResult(null);
    setTab('home');
    clearVerifiedParcel();
  };

  const handleVerifyQr = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeMission?.parcel || !parcelToken) return;
    const res = await fetch('/api/parcels/verify-qr', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Parcel-Token': parcelToken,
      },
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
    ? Math.max(
        0,
        STAGES.indexOf(
          activeMission.parcel.currentStage as (typeof STAGES)[number]
        )
      )
    : 0;

  if (simpleMode) {
    return (
      <SimpleCustomerPortal
        activeMission={activeMission}
        onExitSimpleMode={() => toggleSimpleMode(false)}
      />
    );
  }

  const isVerified = Boolean(parcelToken && activeMission?.parcel);

  return (
    <div className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 ${textScale}`}>
      {/* Sub-navigation bar inside Customer Workspace */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex flex-wrap items-center gap-2">
          {isVerified && (
            <>
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
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isVerified && (
            <button
              type="button"
              onClick={handleResetParcel}
              className="min-h-[44px] px-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:border-blue-500 text-sm font-semibold flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <RefreshCw className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
              <span>{g.checkAnother}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => toggleSimpleMode(true)}
            className="min-h-[44px] px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-bold flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 shadow-sm"
          >
            <Volume2 className="w-4 h-4" />
            <span>{t.simple.modeBtn}</span>
          </button>
          <button
            type="button"
            onClick={() => setLargeText(!largeText)}
            className={`min-h-[44px] px-3.5 rounded-xl text-sm font-semibold border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
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
            className="min-h-[44px] px-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm font-semibold flex items-center gap-2 hover:border-blue-500 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <User className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
            <span>{user ? user.name : 'My Profile'}</span>
          </button>
        </div>
      </div>

      {/* UNVERIFIED STATE: MANDATORY PARCEL NUMBER + OTP VERIFICATION GATE */}
      {!isVerified && tab !== 'profile' && (
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          <div className="lg:col-span-7 glass-panel rounded-3xl p-6 sm:p-8 flex flex-col justify-between shadow-sm space-y-6">
            <div className="space-y-2">
              <p className="text-sm font-semibold text-blue-600 dark:text-cyan-400">
                Gajularamaram Hub · Protected Parcel Verification
              </p>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white [text-wrap:balance]">
                {g.title}
              </h1>
              <p className="text-slate-600 dark:text-slate-300 text-base sm:text-lg max-w-xl">
                {g.subtitle}
              </p>
            </div>

            {/* Gmail OAuth Connection Bar */}
            <div className="rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              {gmailAccessToken ? (
                <>
                  <div className="flex items-center gap-2.5 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="w-5 h-5 shrink-0" />
                    <span>
                      {g.gmailConnected}
                      {gmailEmail ? ` · ${gmailEmail}` : ''}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={disconnectGmail}
                    className="min-h-[40px] px-3.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer self-start sm:self-auto"
                  >
                    Disconnect Gmail
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    {g.connectGmailHint}
                  </p>
                  <GoogleSignInButton
                    onClick={() => void handleConnectGmail()}
                    disabled={gmailConnecting}
                    label={gmailConnecting ? 'Connecting...' : 'Sign in with Google'}
                    className="shrink-0"
                  />
                </>
              )}
            </div>

            {gateError && (
              <div
                role="alert"
                className="rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 p-4 flex items-center gap-3 text-rose-800 dark:text-rose-200 font-semibold"
              >
                <AlertCircle className="w-5 h-5 shrink-0 text-rose-600 dark:text-rose-400" />
                <span>{gateError}</span>
              </div>
            )}

            {!challenge ? (
              <form onSubmit={handleRequestOtp} className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <PackageSearch className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={parcelInput}
                      onChange={(e) => {
                        setParcelInput(e.target.value);
                        if (gateError) setGateError(null);
                      }}
                      placeholder={g.parcelPlaceholder}
                      aria-label="Parcel Number"
                      className="w-full min-h-[54px] pl-12 pr-12 rounded-2xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono text-base font-semibold focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                    <button
                      type="button"
                      onClick={handleVoiceParcelInput}
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
                    disabled={gateLoading}
                    className="min-h-[54px] px-6 rounded-2xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold text-base shadow-md flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Mail className="w-5 h-5" />
                    <span>{gateLoading ? g.sendingOtp : g.sendOtpBtn}</span>
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <div className="rounded-2xl bg-blue-50/90 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 p-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-blue-800 dark:text-cyan-300">
                    <KeyRound className="w-4 h-4 shrink-0" />
                    <span>
                      {g.otpSentTo}: {challenge.maskedEmail}
                    </span>
                  </div>
                  <p className="text-sm text-slate-700 dark:text-slate-300 font-medium">
                    {challenge.parcelNumber} · {challenge.recipientName}
                  </p>
                  {challenge.gmailSent ? (
                    <div className="pt-1 space-y-2">
                      <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                        Verification email dispatched via Gmail API.
                      </p>
                      {gmailAccessToken && (
                        <button
                          type="button"
                          disabled={checkingInbox}
                          onClick={() => void handleCheckInboxOtp()}
                          className="min-h-[40px] px-3.5 rounded-xl bg-white dark:bg-slate-900 border border-blue-300 dark:border-blue-700 text-xs font-semibold text-blue-700 dark:text-cyan-300 hover:bg-blue-50 dark:hover:bg-slate-800 inline-flex items-center gap-2 cursor-pointer"
                        >
                          <Mail className="w-4 h-4" />
                          <span>
                            {checkingInbox ? 'Checking Gmail...' : g.checkInboxBtn}
                          </span>
                        </button>
                      )}
                      {inboxStatusMsg && (
                        <p className="text-xs text-slate-700 dark:text-slate-300">
                          {inboxStatusMsg}
                        </p>
                      )}
                    </div>
                  ) : (
                    challenge.previewOtp && (
                      <p className="text-sm font-mono font-bold text-emerald-700 dark:text-emerald-300 pt-1">
                        Email Preview ({challenge.maskedEmail}): OTP {challenge.previewOtp}
                      </p>
                    )
                  )}
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={otpInput}
                    onChange={(e) => {
                      setOtpInput(e.target.value.replace(/\D/g, ''));
                      if (gateError) setGateError(null);
                    }}
                    placeholder={g.otpPlaceholder}
                    aria-label="6-digit OTP"
                    className="flex-1 min-h-[54px] px-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono text-xl font-bold tracking-[0.25em] text-center focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                  <button
                    type="submit"
                    disabled={gateLoading || otpInput.length < 6}
                    className="min-h-[54px] px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold text-base shadow-md flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <ShieldCheck className="w-5 h-5" />
                    <span>{gateLoading ? g.verifying : g.verifyBtn}</span>
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <button
                    type="button"
                    disabled={gateLoading}
                    onClick={() => void handleRequestOtp()}
                    className="min-h-[44px] px-4 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-sm font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>{g.resendOtp}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setChallenge(null);
                      setOtpInput('');
                      setGateError(null);
                      setInboxStatusMsg(null);
                    }}
                    className="min-h-[44px] px-4 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-sm font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>{g.changeParcel}</span>
                  </button>
                </div>
              </form>
            )}
          </div>

          <div className="lg:col-span-5 rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900 relative min-h-[280px]">
            <img
              src="/src/assets/images/hero_aegis_drone_1795193986147.jpg"
              alt="AEGIS autonomous delivery drone flying over city skyline"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/25 to-transparent flex flex-col justify-end p-6 text-white">
              <p className="font-mono text-xs text-cyan-300 mb-1">
                GMAIL OTP PARCEL ACCESS
              </p>
              <p className="text-lg font-bold">
                Gmail OTP verification ensures only you can view your parcel details and live drone route.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* VERIFIED SINGLE-PARCEL CUSTOMER VIEWS */}
      {isVerified && activeMission?.parcel && (
        <>
          {/* HOME DASHBOARD VIEW */}
          {tab === 'home' && (
            <div className="space-y-8">
              <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                <div className="lg:col-span-7 glass-panel rounded-3xl p-6 sm:p-8 flex flex-col justify-between shadow-sm space-y-6">
                  <div>
                    <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 mb-2 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4" />
                      <span>
                        Verified Parcel · {activeMission.parcel.parcelNumber}
                      </span>
                    </p>
                    <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white [text-wrap:balance] mb-2">
                      {activeMission.parcel.recipientName}
                    </h1>
                    <p className="text-slate-600 dark:text-slate-300 text-base sm:text-lg max-w-xl">
                      Stage:{' '}
                      <span className="font-semibold text-blue-600 dark:text-cyan-400">
                        {t.stages[activeMission.parcel.currentStage] ||
                          activeMission.parcel.currentStage}
                      </span>
                    </p>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
                      {activeMission.parcel.pickupAddress} →{' '}
                      {activeMission.parcel.destinationAddress}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => setTab('track')}
                      className="min-h-[48px] px-5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm flex items-center gap-2 cursor-pointer"
                    >
                      <PackageSearch className="w-4 h-4" />
                      <span>{t.trackParcel}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTab('live-map')}
                      className="min-h-[48px] px-5 rounded-2xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white font-semibold text-sm flex items-center gap-2 cursor-pointer"
                    >
                      <Navigation className="w-4 h-4" />
                      <span>{t.liveTracking}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTab('details')}
                      className="min-h-[48px] px-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:border-blue-500 font-semibold text-sm flex items-center gap-2 cursor-pointer"
                    >
                      <QrCode className="w-4 h-4" />
                      <span>QR & Delivery Proof</span>
                    </button>
                  </div>
                </div>

                {/* Hero Visual Card (strictly for verified parcel's drone) */}
                <div className="lg:col-span-5 rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900 relative min-h-[260px]">
                  <img
                    src="/src/assets/images/hero_aegis_drone_1795193986147.jpg"
                    alt="AEGIS autonomous delivery drone flying over city skyline"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover lg:h-full"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/20 to-transparent flex flex-col justify-end p-6 text-white">
                    <p className="font-mono text-xs text-cyan-300 mb-1">
                      ASSIGNED FLIGHT · {activeMission.drone?.code || 'PHANTOM-01'}
                    </p>
                    <p className="text-lg font-bold">
                      {activeMission.parcel.currentStage} ·{' '}
                      {activeMission.distanceKm ?? 4.2} km corridor
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
                      accent:
                        'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60',
                    },
                    {
                      id: 'deliveries',
                      title: t.myDeliveries,
                      desc: 'Verified parcel doorstep delivery status',
                      icon: PackageCheck,
                      accent:
                        'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60',
                    },
                    {
                      id: 'live-map',
                      title: t.liveTracking,
                      desc: 'Watch your drone fly on the live map',
                      icon: Navigation,
                      accent:
                        'text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950/60',
                    },
                    {
                      id: 'history',
                      title: t.deliveryHistory,
                      desc: 'Delivery timeline & proof of drop',
                      icon: History,
                      accent:
                        'text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800',
                    },
                    {
                      id: 'support',
                      title: t.support,
                      desc: 'Friendly AI care in English, Telugu & Hindi',
                      icon: MessageSquareHeart,
                      accent:
                        'text-blue-600 dark:text-cyan-400 bg-blue-50 dark:bg-slate-800',
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

              {/* Recent Alerts Strip (strictly for verified parcel) */}
              <section className="glass-surface rounded-2xl p-5 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <Bell className="w-5 h-5 text-blue-600 dark:text-cyan-400" />
                    <span>
                      Latest Updates · {activeMission.parcel.parcelNumber}
                    </span>
                  </h2>
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Push · SMS · Email synced
                  </span>
                </div>
                <div className="divide-y divide-slate-200/80 dark:divide-slate-800">
                  {notifications.length === 0 ? (
                    <p className="py-4 text-sm text-slate-500">
                      Live delivery notifications for{' '}
                      {activeMission.parcel.parcelNumber} will appear here.
                    </p>
                  ) : (
                    notifications.slice(0, 4).map((n) => (
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
                    ))
                  )}
                </div>
              </section>
            </div>
          )}

          {/* TRACK PARCEL PAGE (7-Stage Progress Bar + QR Verification Link) */}
          {tab === 'track' && (
            <div className="space-y-6">
              <div className="glass-surface rounded-3xl p-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                  <div>
                    <h2 className="text-2xl font-bold">Track Your Parcel</h2>
                    <p className="text-slate-600 dark:text-slate-400">
                      Real-time 7-stage autonomous flight progression for{' '}
                      {activeMission.parcel.parcelNumber}
                    </p>
                  </div>
                </div>

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
                        Recipient: {activeMission.parcel.recipientName} ·
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
              </div>
            </div>
          )}

          {/* LIVE DRONE TRACKING PAGE (Strictly Verified Parcel's Drone & Route) */}
          {tab === 'live-map' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-8">
                  <AegisMap
                    apiKey={mapsApiKey}
                    drones={drones}
                    missions={missions}
                    focusedDroneId={activeMission.drone?.id || null}
                    heightClass="h-[440px] md:h-[540px]"
                    language={language}
                  />
                </div>

                <div className="lg:col-span-4 space-y-4">
                  <div className="glass-panel rounded-3xl p-6 space-y-4">
                    <div>
                      <p className="text-xs font-mono text-cyan-600 dark:text-cyan-400">
                        LIVE FLIGHT TELEMETRY · {activeMission.parcel.parcelNumber}
                      </p>
                      <h2 className="text-2xl font-bold mt-1">
                        {activeMission.drone?.code || 'PHANTOM-01'}
                      </h2>
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        {activeMission.drone?.model || 'AEGIS MK-IV Quadrotor'} · ID #
                        {activeMission.drone?.id || 1}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 font-mono">
                      <div className="p-3.5 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800">
                        <p className="text-xs text-slate-500">Speed</p>
                        <p className="text-xl font-bold tabular-nums">
                          {activeMission.drone?.speedKmh ?? 58} km/h
                        </p>
                      </div>
                      <div className="p-3.5 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800">
                        <p className="text-xs text-slate-500">Battery</p>
                        <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums flex items-center gap-1">
                          <BatteryCharging className="w-5 h-5" />
                          {activeMission.drone?.batteryPct ?? 86}%
                        </p>
                      </div>
                      <div className="p-3.5 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800">
                        <p className="text-xs text-slate-500">Altitude</p>
                        <p className="text-xl font-bold tabular-nums">
                          {activeMission.drone?.altitudeM ?? 95} m
                        </p>
                      </div>
                      <div className="p-3.5 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800">
                        <p className="text-xs text-slate-500">Est. Arrival</p>
                        <p className="text-xl font-bold text-blue-600 dark:text-cyan-400 tabular-nums">
                          {activeMission.completedAt
                            ? 'Delivered'
                            : activeMission.eta
                              ? new Date(activeMission.eta).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : '6 mins'}
                        </p>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-200 dark:border-slate-800 text-sm space-y-1">
                      <p className="font-semibold text-slate-900 dark:text-white">
                        {activeMission.parcel.recipientName}
                      </p>
                      <p className="text-slate-600 dark:text-slate-400">
                        {activeMission.parcel.destinationAddress}
                      </p>
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
                      <span>
                        Nearby Drop Zones &amp; Landmarks (Google Maps Grounding)
                      </span>
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      Real-world Google Maps context anchored to{' '}
                      {activeMission.parcel.destinationAddress}
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
                    <span>
                      {mapsLoading ? 'Searching Maps...' : 'Query Google Maps'}
                    </span>
                  </button>
                </form>

                {mapsError && (
                  <p className="text-sm text-rose-600 dark:text-rose-400">
                    {mapsError}
                  </p>
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

          {/* MY DELIVERIES & DELIVERY HISTORY (Strictly Verified Single Parcel) */}
          {(tab === 'deliveries' || tab === 'history') && (
            <div className="glass-surface rounded-3xl p-6 space-y-5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold">
                    {tab === 'deliveries' ? t.myDeliveries : t.deliveryHistory}
                  </h2>
                  <p className="text-slate-600 dark:text-slate-400">
                    Showing verified parcel details strictly for{' '}
                    {activeMission.parcel.parcelNumber}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleResetParcel}
                  className="min-h-[44px] px-4 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-semibold flex items-center gap-2 cursor-pointer self-start"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>{g.checkAnother}</span>
                </button>
              </div>

              <div className="py-4 border-t border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs font-mono text-slate-500 dark:text-slate-400">
                    <span className="font-bold text-slate-900 dark:text-white text-sm">
                      {activeMission.parcel.parcelNumber}
                    </span>
                    <span>·</span>
                    <span>{activeMission.drone?.code}</span>
                    <span>·</span>
                    <span className="capitalize">
                      {activeMission.parcel.priority} priority
                    </span>
                  </div>
                  <p className="font-semibold text-base">
                    {activeMission.parcel.recipientName} —{' '}
                    {activeMission.parcel.destinationAddress}
                  </p>
                  <p className="text-sm text-emerald-700 dark:text-emerald-400 font-medium">
                    {activeMission.parcel.currentStage}
                  </p>
                </div>
                <div className="flex items-center gap-2.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setTab('live-map')}
                    className="min-h-[44px] px-4 rounded-xl bg-blue-600 text-white text-sm font-semibold cursor-pointer"
                  >
                    Live Map
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab('details')}
                    className="min-h-[44px] px-4 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-semibold cursor-pointer"
                  >
                    Delivery Details
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* DELIVERY DETAILS & QR PROOF PAGE */}
          {tab === 'details' && (
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
                    <p className="font-semibold">
                      {activeMission.parcel.pickupAddress}
                    </p>
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
                activeParcelNumber={activeMission.parcel.parcelNumber}
                defaultLatLng={{
                  latitude: activeMission.parcel.destLat,
                  longitude: activeMission.parcel.destLng,
                }}
                messages={chatMessages}
                onMessagesChange={setChatMessages}
              />
            </div>
          )}
        </>
      )}

      {/* CUSTOMER PROFILE & ALERT PREFERENCES */}
      {tab === 'profile' && (
        <div className="glass-surface rounded-3xl p-6 max-w-3xl mx-auto space-y-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-2xl font-bold">My Profile & Alert Preferences</h2>
            <button
              type="button"
              onClick={() => setTab('home')}
              className="min-h-[44px] px-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-sm font-semibold flex items-center gap-2 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </button>
          </div>
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
                <label className="block text-sm font-medium mb-1">
                  Mobile Number
                </label>
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

      {/* Explicit Confirmation Dialog before Sending OTP via Gmail API */}
      {confirmEmailModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={g.confirmEmailTitle}
        >
          <div className="w-full max-w-md rounded-3xl glass-panel shadow-2xl p-6 space-y-5 text-slate-900 dark:text-slate-100">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-2xl bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-cyan-400 flex items-center justify-center shrink-0">
                <Mail className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h2 className="text-lg font-bold">{g.confirmEmailTitle}</h2>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  {g.confirmEmailBody}{' '}
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    {(challenge?.parcelNumber || parcelInput).trim().toUpperCase()}
                  </span>
                  .
                </p>
                {gmailEmail && (
                  <p className="text-xs font-mono text-slate-500 dark:text-slate-400 pt-1">
                    Sender: {gmailEmail}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmEmailModalOpen(false)}
                className="min-h-[44px] px-4 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-sm font-semibold cursor-pointer"
              >
                {g.cancelBtn}
              </button>
              <button
                type="button"
                disabled={gateLoading}
                onClick={() => void executeRequestOtp()}
                className="min-h-[44px] px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold flex items-center gap-2 cursor-pointer"
              >
                <Mail className="w-4 h-4" />
                <span>{g.confirmSendBtn}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

