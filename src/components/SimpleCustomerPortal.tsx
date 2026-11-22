import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  HelpCircle,
  KeyRound,
  Mail,
  MapPin,
  Mic,
  Navigation,
  Package,
  PackageCheck,
  PackageSearch,
  RefreshCw,
  ShieldCheck,
  Square,
  Volume2,
} from 'lucide-react';
import { useAegis, type ParcelOtpChallenge } from '../context/AegisContext';
import { TRANSLATIONS } from '../lib/i18n';
import { AegisMap } from './AegisMap';
import { GoogleSignInButton } from './GoogleSignInButton';
import type { LanguageCode, MissionWithDetails } from '../types/aegis';

type SimpleView = 'home' | 'status' | 'map' | 'help';

interface SimpleCustomerPortalProps {
  activeMission: MissionWithDetails | null;
  onExitSimpleMode: () => void;
}

function getSimpleStepIndex(mission: MissionWithDetails | null): 0 | 1 | 2 {
  if (!mission) return 0;
  const stage = mission.parcel?.currentStage || '';
  if (mission.status === 'delivered' || stage === 'Delivered') {
    return 2;
  }
  if (
    mission.status === 'in_transit' ||
    mission.status === 'near_destination' ||
    stage === 'Loaded on Drone' ||
    stage === 'In Transit' ||
    stage === 'Near Destination'
  ) {
    return 1;
  }
  return 0;
}

export const SimpleCustomerPortal: React.FC<SimpleCustomerPortalProps> = ({
  activeMission,
  onExitSimpleMode,
}) => {
  const {
    language,
    setLanguage,
    mapsApiKey,
    missions,
    drones,
    parcelToken,
    gmailAccessToken,
    gmailEmail,
    connectGmail,
    disconnectGmail,
    requestParcelOtp,
    verifyParcelOtp,
    checkGmailInboxOtp,
    clearVerifiedParcel,
  } = useAegis();
  const t = TRANSLATIONS[language];
  const s = t.simple;
  const g = t.otpGate;

  const [view, setView] = useState<SimpleView>('home');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [listeningMic, setListeningMic] = useState(false);

  // OTP Gate state
  const [parcelInput, setParcelInput] = useState('');
  const [challenge, setChallenge] = useState<ParcelOtpChallenge | null>(null);
  const [otpInput, setOtpInput] = useState('');
  const [gateLoading, setGateLoading] = useState(false);
  const [gateError, setGateError] = useState<string | null>(null);
  const [confirmEmailModalOpen, setConfirmEmailModalOpen] = useState(false);
  const [gmailConnecting, setGmailConnecting] = useState(false);
  const [checkingInbox, setCheckingInbox] = useState(false);
  const [inboxStatusMsg, setInboxStatusMsg] = useState<string | null>(null);

  // Help screen state
  const [helpQuestion, setHelpQuestion] = useState<string | null>(null);
  const [helpAnswer, setHelpAnswer] = useState<string | null>(null);
  const [helpLoading, setHelpLoading] = useState(false);

  const stopSpeech = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  };

  useEffect(() => {
    return () => {
      stopSpeech();
    };
  }, []);

  useEffect(() => {
    if (!parcelToken) {
      setView('home');
    }
  }, [parcelToken]);

  const speakText = (text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang =
      language === 'te' ? 'te-IN' : language === 'hi' ? 'hi-IN' : 'en-IN';
    utterance.rate = 0.9;
    utterance.pitch = 1.0;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  const stepIndex = getSimpleStepIndex(activeMission);
  const statusHeadline =
    stepIndex === 2 ? s.step3 : stepIndex === 1 ? s.step2 : s.step1;
  const statusSentence =
    stepIndex === 2
      ? s.statusDelivered
      : stepIndex === 1
        ? s.statusFlying
        : s.statusPacked;

  const etaFormatted = activeMission?.completedAt
    ? s.deliveredSafely
    : activeMission?.eta
      ? `${s.arrivingAround} ${new Date(activeMission.eta).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })}`
      : s.statusPacked;

  const buildSpokenSummary = () => {
    if (!parcelToken || !activeMission?.parcel) {
      if (gateError) return gateError;
      if (challenge) {
        return `${g.otpSentTo} ${challenge.maskedEmail}. ${g.otpPlaceholder}.`;
      }
      return `${g.title}. ${g.subtitle}`;
    }
    return `${activeMission.parcel.recipientName}. ${activeMission.parcel.parcelNumber}. ${statusSentence} ${etaFormatted}.`;
  };

  const handleToggleSpeech = (customText?: string) => {
    if (isSpeaking) {
      stopSpeech();
    } else {
      speakText(customText || buildSpokenSummary());
    }
  };

  const handleConnectGmail = async () => {
    setGmailConnecting(true);
    setGateError(null);
    try {
      await connectGmail();
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Unable to connect Google Gmail account.';
      setGateError(msg);
      speakText(msg);
    } finally {
      setGmailConnecting(false);
    }
  };

  const executeRequestOtp = async () => {
    const trimmed = (challenge?.parcelNumber || parcelInput).trim();
    if (!trimmed) {
      setGateError(g.invalidParcel);
      speakText(g.invalidParcel);
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
      speakText(`${g.otpSentTo} ${nextChallenge.maskedEmail}`);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Invalid Parcel Number';
      setGateError(message);
      speakText(message);
    } finally {
      setGateLoading(false);
    }
  };

  const handleRequestOtp = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = (challenge?.parcelNumber || parcelInput).trim();
    if (!trimmed) {
      setGateError(g.invalidParcel);
      speakText(g.invalidParcel);
      return;
    }
    if (gmailAccessToken) {
      setGateError(null);
      setConfirmEmailModalOpen(true);
      speakText(g.confirmEmailTitle);
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
        const msg = `OTP ${foundOtp} retrieved from your Gmail inbox.`;
        setInboxStatusMsg(msg);
        speakText(msg);
      } else {
        const msg = 'No recent OTP email found yet. Please check Gmail or try again.';
        setInboxStatusMsg(msg);
        speakText(msg);
      }
    } catch {
      setInboxStatusMsg(
        'Could not check Gmail inbox. Please enter the 6-digit code from your email.'
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
      setView('home');
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Invalid or expired OTP.';
      setGateError(message);
      speakText(message);
    } finally {
      setGateLoading(false);
    }
  };

  const handleResetParcel = () => {
    stopSpeech();
    setChallenge(null);
    setOtpInput('');
    setParcelInput('');
    setGateError(null);
    setInboxStatusMsg(null);
    setConfirmEmailModalOpen(false);
    setHelpQuestion(null);
    setHelpAnswer(null);
    setView('home');
    clearVerifiedParcel();
  };

  const handleVoiceAction = (mode: 'parcel' | 'help') => {
    const SpeechRecognitionCtor =
      (
        window as unknown as {
          SpeechRecognition?: new () => {
            lang: string;
            onresult: (event: {
              results?: ArrayLike<ArrayLike<{ transcript?: string }>>;
            }) => void;
            onerror: () => void;
            onend: () => void;
            start: () => void;
          };
          webkitSpeechRecognition?: new () => {
            lang: string;
            onresult: (event: {
              results?: ArrayLike<ArrayLike<{ transcript?: string }>>;
            }) => void;
            onerror: () => void;
            onend: () => void;
            start: () => void;
          };
        }
      ).SpeechRecognition ||
      (
        window as unknown as {
          webkitSpeechRecognition?: new () => {
            lang: string;
            onresult: (event: {
              results?: ArrayLike<ArrayLike<{ transcript?: string }>>;
            }) => void;
            onerror: () => void;
            onend: () => void;
            start: () => void;
          };
        }
      ).webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      if (mode === 'help') {
        void askSimpleHelp(s.helpQ1);
      }
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang =
      language === 'te' ? 'te-IN' : language === 'hi' ? 'hi-IN' : 'en-IN';
    setListeningMic(true);
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript || '';
      setListeningMic(false);
      if (mode === 'parcel' && transcript.trim()) {
        setParcelInput(transcript.replace(/\s+/g, '').toUpperCase());
        setGateError(null);
      } else if (mode === 'help' && transcript.trim()) {
        void askSimpleHelp(transcript.trim());
      }
    };
    recognition.onerror = () => setListeningMic(false);
    recognition.onend = () => setListeningMic(false);
    recognition.start();
  };

  const askSimpleHelp = async (question: string) => {
    stopSpeech();
    setHelpQuestion(question);
    setHelpLoading(true);
    setHelpAnswer(null);
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'care',
          language,
          parcelNumber: activeMission?.parcel?.parcelNumber,
          messages: [
            {
              role: 'user',
              text: `${question} Please reply in 2 very short, simple, warm sentences easy for an elderly person to understand.`,
            },
          ],
        }),
      });
      if (!res.ok) {
        throw new Error('Help service unavailable');
      }
      const data = (await res.json()) as { text?: string };
      const reply = data.text?.trim() || buildSpokenSummary();
      setHelpAnswer(reply);
      speakText(reply);
    } catch {
      const fallback = buildSpokenSummary();
      setHelpAnswer(fallback);
      speakText(fallback);
    } finally {
      setHelpLoading(false);
    }
  };

  const isVerified = Boolean(parcelToken && activeMission?.parcel);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 pb-24 space-y-6">
      {/* Top Accessibility Control Bar */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-700 p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3 shadow-sm">
        {/* Direct 1-Tap Language Buttons */}
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Language">
          {(
            [
              { code: 'en', label: 'English' },
              { code: 'te', label: 'తెలుగు' },
              { code: 'hi', label: 'हिन्दी' },
            ] as Array<{ code: LanguageCode; label: string }>
          ).map((item) => (
            <button
              key={item.code}
              type="button"
              onClick={() => {
                stopSpeech();
                setLanguage(item.code);
              }}
              className={`min-h-[48px] px-4 rounded-2xl text-base font-bold border-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                language === item.code
                  ? 'bg-blue-700 text-white border-blue-700'
                  : 'bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white border-slate-300 dark:border-slate-600 hover:border-blue-500'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Audio Read-Aloud & View Switcher */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => handleToggleSpeech()}
            className={`min-h-[48px] px-5 rounded-2xl text-base font-bold flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0 border-2 ${
              isSpeaking
                ? 'bg-rose-700 text-white border-rose-700'
                : 'bg-emerald-700 hover:bg-emerald-800 text-white border-emerald-700'
            }`}
          >
            {isSpeaking ? (
              <>
                <Square className="w-5 h-5 fill-current" />
                <span>{s.stopAudio}</span>
              </>
            ) : (
              <>
                <Volume2 className="w-5 h-5" />
                <span>{s.listen}</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              stopSpeech();
              onExitSimpleMode();
            }}
            className="min-h-[48px] px-4 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white border-2 border-slate-300 dark:border-slate-600 text-base font-bold cursor-pointer whitespace-nowrap shrink-0"
          >
            {s.standardBtn}
          </button>
        </div>
      </div>

      {/* UNVERIFIED STATE: SIMPLE PARCEL NUMBER + OTP GATE */}
      {!isVerified ? (
        <div className="rounded-3xl bg-white dark:bg-slate-900 border-2 border-blue-600 dark:border-cyan-500 p-6 sm:p-10 space-y-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-2xl bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-cyan-300 flex items-center justify-center shrink-0">
              {challenge ? (
                <KeyRound className="w-9 h-9" />
              ) : (
                <PackageSearch className="w-9 h-9" />
              )}
            </div>
            <div className="space-y-1.5">
              <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white [text-wrap:balance]">
                {g.title}
              </h1>
              <p className="text-xl text-slate-700 dark:text-slate-300 font-medium">
                {g.subtitle}
              </p>
            </div>
          </div>

          {/* Gmail Connection Box */}
          <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/70 border-2 border-slate-300 dark:border-slate-700 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            {gmailAccessToken ? (
              <>
                <div className="flex items-center gap-3 text-lg font-bold text-emerald-800 dark:text-emerald-300">
                  <CheckCircle2 className="w-7 h-7 shrink-0" />
                  <span>
                    {g.gmailConnected}
                    {gmailEmail ? ` · ${gmailEmail}` : ''}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={disconnectGmail}
                  className="min-h-[52px] px-5 rounded-2xl bg-white dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-600 text-base font-bold text-slate-900 dark:text-white cursor-pointer shrink-0"
                >
                  Disconnect Gmail
                </button>
              </>
            ) : (
              <>
                <p className="text-lg font-semibold text-slate-800 dark:text-slate-200">
                  {g.connectGmailHint}
                </p>
                <GoogleSignInButton
                  onClick={() => void handleConnectGmail()}
                  disabled={gmailConnecting}
                  label={gmailConnecting ? 'Connecting...' : 'Sign in with Google'}
                  className="min-h-[56px] text-lg shrink-0"
                />
              </>
            )}
          </div>

          {gateError && (
            <div
              role="alert"
              className="rounded-2xl bg-rose-50 dark:bg-rose-950/70 border-2 border-rose-600 p-5 flex items-center gap-3 text-rose-900 dark:text-rose-100"
            >
              <AlertCircle className="w-7 h-7 shrink-0 text-rose-600 dark:text-rose-400" />
              <p className="text-2xl font-bold">{gateError}</p>
            </div>
          )}

          {!challenge ? (
            <form onSubmit={handleRequestOtp} className="space-y-5">
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  value={parcelInput}
                  onChange={(e) => {
                    setParcelInput(e.target.value);
                    if (gateError) setGateError(null);
                  }}
                  placeholder={g.parcelPlaceholder}
                  aria-label="Parcel Number"
                  className="flex-1 min-h-[68px] px-5 rounded-2xl bg-slate-50 dark:bg-slate-800 border-2 border-slate-400 dark:border-slate-600 text-2xl font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:border-blue-700"
                />
                <button
                  type="button"
                  onClick={() => handleVoiceAction('parcel')}
                  className={`min-h-[68px] px-6 rounded-2xl text-lg font-bold flex items-center justify-center gap-2.5 cursor-pointer border-2 shrink-0 ${
                    listeningMic
                      ? 'bg-rose-700 text-white border-rose-700'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border-slate-400 dark:border-slate-600'
                  }`}
                >
                  <Mic className="w-6 h-6" />
                  <span>{listeningMic ? s.listeningNow : s.speakParcel}</span>
                </button>
              </div>

              <button
                type="submit"
                disabled={gateLoading}
                className="w-full min-h-[72px] px-6 rounded-2xl bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-2xl font-bold flex items-center justify-center gap-3 cursor-pointer shadow-md"
              >
                <Mail className="w-7 h-7" />
                <span>{gateLoading ? g.sendingOtp : g.sendOtpBtn}</span>
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-5">
              <div className="rounded-2xl bg-blue-50 dark:bg-blue-950/60 border-2 border-blue-600 p-5 space-y-2.5">
                <p className="text-xl font-bold text-blue-900 dark:text-cyan-200">
                  {g.otpSentTo}: {challenge.maskedEmail}
                </p>
                <p className="text-lg font-semibold text-slate-800 dark:text-slate-200">
                  {challenge.parcelNumber} · {challenge.recipientName}
                </p>
                {challenge.gmailSent ? (
                  <div className="pt-1 space-y-2.5">
                    <p className="text-lg font-bold text-emerald-800 dark:text-emerald-300">
                      Verification email sent via Gmail!
                    </p>
                    {gmailAccessToken && (
                      <button
                        type="button"
                        disabled={checkingInbox}
                        onClick={() => void handleCheckInboxOtp()}
                        className="min-h-[54px] px-5 rounded-2xl bg-white dark:bg-slate-900 border-2 border-blue-600 text-blue-800 dark:text-cyan-300 text-lg font-bold inline-flex items-center gap-2.5 cursor-pointer"
                      >
                        <Mail className="w-6 h-6" />
                        <span>
                          {checkingInbox ? 'Checking Gmail...' : g.checkInboxBtn}
                        </span>
                      </button>
                    )}
                    {inboxStatusMsg && (
                      <p className="text-base font-semibold text-slate-800 dark:text-slate-200">
                        {inboxStatusMsg}
                      </p>
                    )}
                  </div>
                ) : (
                  challenge.previewOtp && (
                    <p className="text-lg font-mono font-bold text-emerald-800 dark:text-emerald-300 pt-1">
                      Email Preview ({challenge.maskedEmail}): {challenge.previewOtp}
                    </p>
                  )
                )}
              </div>

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
                className="w-full min-h-[72px] px-5 rounded-2xl bg-slate-50 dark:bg-slate-800 border-2 border-slate-400 dark:border-slate-600 text-3xl font-mono font-bold tracking-[0.25em] text-center text-slate-900 dark:text-white focus:outline-none focus:border-emerald-700"
              />

              <button
                type="submit"
                disabled={gateLoading || otpInput.length < 6}
                className="w-full min-h-[72px] px-6 rounded-2xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-2xl font-bold flex items-center justify-center gap-3 cursor-pointer shadow-md"
              >
                <ShieldCheck className="w-7 h-7" />
                <span>{gateLoading ? g.verifying : g.verifyBtn}</span>
              </button>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={gateLoading}
                  onClick={() => void handleRequestOtp()}
                  className="min-h-[58px] px-5 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border-2 border-slate-300 dark:border-slate-600 text-lg font-bold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <RefreshCw className="w-5 h-5" />
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
                  className="min-h-[58px] px-5 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border-2 border-slate-300 dark:border-slate-600 text-lg font-bold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <ArrowLeft className="w-5 h-5" />
                  <span>{g.changeParcel}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      ) : (
        <>
          {/* Back Home Button on Sub-views */}
          {view !== 'home' && (
            <button
              type="button"
              onClick={() => {
                stopSpeech();
                setView('home');
              }}
              className="w-full sm:w-auto min-h-[58px] px-6 rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-lg font-bold flex items-center justify-center gap-3 cursor-pointer shadow-sm"
            >
              <ArrowLeft className="w-6 h-6" />
              <span>{s.backHome}</span>
            </button>
          )}

          {/* VIEW 1: SIMPLE HOME (STRICTLY VERIFIED PARCEL ONLY) */}
          {view === 'home' && activeMission?.parcel && (
            <div className="space-y-6">
              <div className="rounded-3xl bg-white dark:bg-slate-900 border-2 border-blue-600 dark:border-cyan-500 p-6 sm:p-8 space-y-5 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-2">
                    <p className="text-base font-bold text-slate-600 dark:text-slate-300">
                      {s.selectedParcel} · {activeMission.parcel.parcelNumber}
                    </p>
                    <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white [text-wrap:balance]">
                      {statusHeadline}
                    </h1>
                    <p className="text-xl text-slate-700 dark:text-slate-200 font-medium">
                      {statusSentence}
                    </p>
                    <p className="text-lg font-bold text-blue-700 dark:text-cyan-400">
                      {activeMission.parcel.recipientName} · {etaFormatted}
                    </p>
                  </div>

                  <div
                    className={`w-20 h-20 rounded-3xl flex items-center justify-center shrink-0 ${
                      stepIndex === 2
                        ? 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300'
                        : stepIndex === 1
                          ? 'bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-cyan-300'
                          : 'bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300'
                    }`}
                  >
                    {stepIndex === 2 ? (
                      <CheckCircle2 className="w-11 h-11" />
                    ) : stepIndex === 1 ? (
                      <Navigation className="w-11 h-11" />
                    ) : (
                      <Package className="w-11 h-11" />
                    )}
                  </div>
                </div>

                {/* 3 Big Visual Steps */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                  {[
                    { idx: 0, label: s.step1, icon: Package },
                    { idx: 1, label: s.step2, icon: Navigation },
                    { idx: 2, label: s.step3, icon: PackageCheck },
                  ].map((step) => {
                    const Icon = step.icon;
                    const active = stepIndex === step.idx;
                    const done = stepIndex > step.idx;
                    return (
                      <div
                        key={step.idx}
                        className={`p-4 rounded-2xl border-2 flex items-center gap-3 ${
                          active
                            ? 'bg-blue-700 text-white border-blue-700'
                            : done
                              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-200 border-emerald-600'
                              : 'bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700'
                        }`}
                      >
                        <Icon className="w-7 h-7 shrink-0" />
                        <span className="text-lg font-bold">{step.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 3 Giant Action Buttons */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button
                  type="button"
                  onClick={() => {
                    stopSpeech();
                    setView('status');
                  }}
                  className="min-h-[124px] p-6 rounded-3xl bg-blue-700 hover:bg-blue-800 text-white text-left flex flex-col justify-between gap-4 cursor-pointer shadow-md transition-colors"
                >
                  <PackageSearch className="w-10 h-10" />
                  <div>
                    <p className="text-2xl font-bold leading-snug">{s.whereIsParcel}</p>
                    <p className="text-base text-blue-100 mt-1">{s.whereIsParcelSub}</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    stopSpeech();
                    setView('map');
                  }}
                  className="min-h-[124px] p-6 rounded-3xl bg-emerald-700 hover:bg-emerald-800 text-white text-left flex flex-col justify-between gap-4 cursor-pointer shadow-md transition-colors"
                >
                  <MapPin className="w-10 h-10" />
                  <div>
                    <p className="text-2xl font-bold leading-snug">{s.seeOnMap}</p>
                    <p className="text-base text-emerald-100 mt-1">{s.seeOnMapSub}</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    stopSpeech();
                    setView('help');
                  }}
                  className="min-h-[124px] p-6 rounded-3xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white text-left flex flex-col justify-between gap-4 cursor-pointer shadow-md transition-colors"
                >
                  <HelpCircle className="w-10 h-10" />
                  <div>
                    <p className="text-2xl font-bold leading-snug">{s.askHelp}</p>
                    <p className="text-base text-slate-300 mt-1">{s.askHelpSub}</p>
                  </div>
                </button>
              </div>

              {/* Verified Single Parcel Summary & Switch Button */}
              <div className="rounded-3xl bg-white dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-700 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-lg font-bold text-slate-900 dark:text-white">
                    {activeMission.parcel.parcelNumber} · {activeMission.parcel.recipientName}
                  </p>
                  <p className="text-base text-slate-600 dark:text-slate-300">
                    {activeMission.parcel.destinationAddress}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleResetParcel}
                  className="min-h-[58px] px-6 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white border-2 border-slate-400 dark:border-slate-600 text-lg font-bold cursor-pointer shrink-0"
                >
                  {g.checkAnother}
                </button>
              </div>
            </div>
          )}

          {/* VIEW 2: SIMPLE PARCEL STATUS */}
          {view === 'status' && activeMission?.parcel && (
            <div className="rounded-3xl bg-white dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-700 p-6 sm:p-8 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b-2 border-slate-200 dark:border-slate-800 pb-5">
                <div className="space-y-1.5">
                  <p className="text-lg font-mono font-bold text-slate-600 dark:text-slate-300">
                    {activeMission.parcel.parcelNumber} · {activeMission.parcel.recipientName}
                  </p>
                  <h2 className="text-3xl sm:text-4xl font-bold text-blue-700 dark:text-cyan-400">
                    {statusHeadline}
                  </h2>
                  <p className="text-xl font-medium text-slate-800 dark:text-slate-100">
                    {statusSentence}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleSpeech()}
                  className="min-h-[60px] px-6 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white text-lg font-bold flex items-center justify-center gap-2.5 cursor-pointer shrink-0"
                >
                  <Volume2 className="w-6 h-6" />
                  <span>{isSpeaking ? s.stopAudio : s.listen}</span>
                </button>
              </div>

              <div className="space-y-3">
                {[
                  {
                    idx: 0,
                    title: s.step1,
                    desc: s.statusPacked,
                    icon: Package,
                  },
                  {
                    idx: 1,
                    title: s.step2,
                    desc: s.statusFlying,
                    icon: Navigation,
                  },
                  {
                    idx: 2,
                    title: s.step3,
                    desc: s.statusDelivered,
                    icon: CheckCircle2,
                  },
                ].map((step) => {
                  const Icon = step.icon;
                  const active = stepIndex === step.idx;
                  const done = stepIndex > step.idx;
                  return (
                    <div
                      key={step.idx}
                      className={`p-5 rounded-2xl border-2 flex items-center gap-4 ${
                        active
                          ? 'bg-blue-700 text-white border-blue-700'
                          : done
                            ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-600 text-emerald-950 dark:text-emerald-100'
                            : 'bg-slate-50 dark:bg-slate-800/50 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <Icon className="w-10 h-10 shrink-0" />
                      <div>
                        <p className="text-2xl font-bold">{step.title}</p>
                        <p className="text-base mt-0.5 opacity-95">{step.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    stopSpeech();
                    setView('map');
                  }}
                  className="min-h-[64px] px-6 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white text-xl font-bold flex items-center justify-center gap-3 cursor-pointer"
                >
                  <MapPin className="w-7 h-7" />
                  <span>{s.seeOnMap}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    stopSpeech();
                    setView('help');
                  }}
                  className="min-h-[64px] px-6 rounded-2xl bg-slate-900 dark:bg-slate-800 text-white text-xl font-bold flex items-center justify-center gap-3 cursor-pointer"
                >
                  <HelpCircle className="w-7 h-7" />
                  <span>{s.askHelp}</span>
                </button>
              </div>
            </div>
          )}

          {/* VIEW 3: SIMPLE LIVE MAP */}
          {view === 'map' && activeMission?.parcel && (
            <div className="space-y-5">
              <div className="rounded-3xl bg-white dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-700 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">
                    {s.droneName}: {activeMission.drone?.code || 'PHANTOM-01'} ·{' '}
                    {etaFormatted}
                  </p>
                  <p className="text-lg text-slate-700 dark:text-slate-300">
                    {s.mapBannerSub}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleSpeech()}
                  className="min-h-[56px] px-6 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white text-lg font-bold flex items-center justify-center gap-2 cursor-pointer shrink-0"
                >
                  <Volume2 className="w-6 h-6" />
                  <span>{isSpeaking ? s.stopAudio : s.listen}</span>
                </button>
              </div>

              <AegisMap
                apiKey={mapsApiKey}
                drones={drones}
                missions={missions}
                focusedDroneId={activeMission.drone?.id || null}
                heightClass="h-[460px] md:h-[540px]"
                language={language}
              />
            </div>
          )}

          {/* VIEW 4: SIMPLE VOICE & TAP HELP */}
          {view === 'help' && (
            <div className="rounded-3xl bg-white dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-700 p-6 sm:p-8 space-y-6">
              <h2 className="text-3xl font-bold text-slate-900 dark:text-white">
                {s.helpTitle}
              </h2>

              <button
                type="button"
                onClick={() => handleVoiceAction('help')}
                className={`w-full min-h-[82px] px-6 rounded-3xl text-xl sm:text-2xl font-bold flex items-center justify-center gap-3.5 cursor-pointer border-2 shadow-sm ${
                  listeningMic
                    ? 'bg-rose-700 text-white border-rose-700'
                    : 'bg-blue-700 hover:bg-blue-800 text-white border-blue-700'
                }`}
              >
                <Mic className="w-8 h-8" />
                <span>{listeningMic ? s.listeningNow : s.helpSpeakBtn}</span>
              </button>

              <div className="grid grid-cols-1 gap-3.5">
                {[s.helpQ1, s.helpQ2, s.helpQ3].map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => void askSimpleHelp(q)}
                    className="min-h-[68px] p-5 rounded-2xl bg-slate-50 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950 border-2 border-slate-300 dark:border-slate-700 text-left text-xl font-bold text-slate-900 dark:text-white cursor-pointer transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>

              {(helpLoading || helpAnswer) && (
                <div className="rounded-3xl bg-emerald-50 dark:bg-emerald-950/60 border-2 border-emerald-600 p-6 space-y-4">
                  {helpQuestion && (
                    <p className="text-base font-bold text-emerald-900 dark:text-emerald-300">
                      {helpQuestion}
                    </p>
                  )}
                  {helpLoading ? (
                    <p className="text-xl font-bold text-slate-900 dark:text-white">
                      ...
                    </p>
                  ) : (
                    helpAnswer && (
                      <>
                        <p className="text-2xl font-bold text-slate-900 dark:text-white leading-relaxed">
                          {helpAnswer}
                        </p>
                        <button
                          type="button"
                          onClick={() => handleToggleSpeech(helpAnswer)}
                          className="min-h-[54px] px-6 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white text-lg font-bold flex items-center gap-2.5 cursor-pointer"
                        >
                          <Volume2 className="w-6 h-6" />
                          <span>{isSpeaking ? s.stopAudio : s.listen}</span>
                        </button>
                      </>
                    )
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Explicit Large Confirmation Dialog before Sending OTP via Gmail API */}
      {confirmEmailModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={g.confirmEmailTitle}
        >
          <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border-2 border-blue-600 shadow-2xl p-6 sm:p-8 space-y-6 text-slate-900 dark:text-white">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-cyan-300 flex items-center justify-center shrink-0">
                <Mail className="w-8 h-8" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold">{g.confirmEmailTitle}</h2>
                <p className="text-lg text-slate-700 dark:text-slate-200 leading-relaxed">
                  {g.confirmEmailBody}{' '}
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    {(challenge?.parcelNumber || parcelInput).trim().toUpperCase()}
                  </span>
                  .
                </p>
                {gmailEmail && (
                  <p className="text-base font-mono text-slate-600 dark:text-slate-300">
                    Sender: {gmailEmail}
                  </p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setConfirmEmailModalOpen(false)}
                className="min-h-[58px] px-5 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border-2 border-slate-300 dark:border-slate-600 text-lg font-bold cursor-pointer"
              >
                {g.cancelBtn}
              </button>
              <button
                type="button"
                disabled={gateLoading}
                onClick={() => void executeRequestOtp()}
                className="min-h-[58px] px-5 rounded-2xl bg-blue-700 hover:bg-blue-800 text-white text-lg font-bold flex items-center justify-center gap-2 cursor-pointer"
              >
                <Mail className="w-6 h-6" />
                <span>{g.confirmSendBtn}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

