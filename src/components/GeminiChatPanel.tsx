import React, { useEffect, useRef, useState } from 'react';
import {
  Compass,
  Globe,
  LocateFixed,
  MessageSquareHeart,
  RotateCcw,
  Send,
  Sparkles,
  Volume2,
  Zap,
} from 'lucide-react';
import type { ChatMessage, ChatMode, GroundingSource } from '../types/aegis';
import { FormattedAiText, GroundingSourcesList } from './GroundingSourcesList';

interface ModeOption {
  id: ChatMode;
  label: string;
  roleTitle: string;
  modelTag: string;
  icon: React.ComponentType<{ className?: string }>;
  prompts: string[];
}

const ALL_MODES: ModeOption[] = [
  {
    id: 'care',
    label: 'AEGIS Care',
    roleTitle: 'Customer Delivery Concierge',
    modelTag: 'gemini-4-hydrogen',
    icon: MessageSquareHeart,
    prompts: [
      'Where is my parcel right now?',
      'How do I verify my QR code when the drone lands?',
      'What should I clear in my courtyard before drop-off?',
    ],
  },
  {
    id: 'fast',
    label: 'Fast Express',
    roleTitle: 'Quick Status & FAQ Assistant',
    modelTag: 'gemini-3.1-flash-lite',
    icon: Zap,
    prompts: [
      'Give me a 3-step checklist for drone arrival.',
      'What is the maximum parcel weight for AEGIS drones?',
      'Summarize emergency RTB safety behavior.',
    ],
  },
  {
    id: 'maps',
    label: 'Maps Scout',
    roleTitle: 'Hyderabad Drop-Zone & Place Scout',
    modelTag: 'gemini-4-hydrogen · Google Maps',
    icon: Compass,
    prompts: [
      'Find nearby open parks or safe drone drop zones near Gajularamaram',
      'Show pharmacies and medical clinics near Kukatpally KPHB',
      'What landmarks are near Plot No 68, Gajularamaram, Hyderabad?',
    ],
  },
  {
    id: 'search',
    label: 'Web Intel',
    roleTitle: 'Live Weather & Airspace Analyst',
    modelTag: 'gemini-4-hydrogen · Google Search',
    icon: Globe,
    prompts: [
      'What is the current weather and wind forecast in Hyderabad today?',
      'Latest India DGCA rules for commercial drone delivery corridors',
      'Any severe rain or storm alerts in Telangana today?',
    ],
  },
  {
    id: 'strategist',
    label: 'Ops Strategist',
    roleTitle: 'Deep Fleet & Risk Reasoning',
    modelTag: 'gemini-4-hydrogen · Deep Thinking',
    icon: Sparkles,
    prompts: [
      'Analyze current fleet battery reserves and suggest optimal mission assignments.',
      'If wind gusts exceed 25 km/h in Gajularamaram, which missions should be held or RTB?',
      'Compare energy efficiency across active Hyderabad corridors.',
    ],
  },
];

interface GeminiChatPanelProps {
  title: string;
  subtitle: string;
  availableModes?: ChatMode[];
  defaultMode?: ChatMode;
  language: string;
  activeParcelNumber?: string;
  defaultLatLng?: { latitude: number; longitude: number };
  messages: ChatMessage[];
  onMessagesChange: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
}

export const GeminiChatPanel: React.FC<GeminiChatPanelProps> = ({
  title,
  subtitle,
  availableModes = ['care', 'fast', 'maps', 'search'],
  defaultMode = 'care',
  language,
  activeParcelNumber,
  defaultLatLng,
  messages,
  onMessagesChange,
}) => {
  const [mode, setMode] = useState<ChatMode>(defaultMode);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [gpsCoords, setGpsCoords] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [gpsStatus, setGpsStatus] = useState<string | null>(null);

  const threadEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const modes = ALL_MODES.filter((m) => availableModes.includes(m.id));
  const currentMode = modes.find((m) => m.id === mode) || modes[0];

  const handleRequestGps = () => {
    if (!('geolocation' in navigator)) {
      setGpsStatus('Browser GPS unavailable — using Hyderabad corridor.');
      return;
    }
    setGpsStatus('Locating...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsCoords({
          latitude: Number(pos.coords.latitude.toFixed(6)),
          longitude: Number(pos.coords.longitude.toFixed(6)),
        });
        setGpsStatus('GPS locked');
      },
      () => {
        setGpsStatus('Location denied — using corridor coords');
      },
      { timeout: 6000 }
    );
  };

  const handleSend = async (textOverride?: string) => {
    const text = (textOverride ?? input).trim();
    if (!text || loading) return;

    setErrorMsg(null);
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text,
      mode,
      createdAt: new Date().toISOString(),
    };

    const historyForApi = messages
      .filter((m) => m.id !== 'welcome')
      .map((m) => ({
        role: m.role === 'user' ? ('user' as const) : ('model' as const),
        text: m.text,
      }));

    onMessagesChange((prev) => [...prev, userMsg]);
    if (!textOverride) setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: historyForApi,
          mode,
          language,
          parcelNumber: activeParcelNumber,
          userLocation: gpsCoords || defaultLatLng,
        }),
      });

      const data = (await res.json()) as {
        reply?: string;
        modelUsed?: string;
        sources?: GroundingSource[];
        error?: string;
      };

      if (!res.ok) {
        throw new Error(data.error || 'Gemini assistant unavailable');
      }

      const assistantMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        text:
          data.reply ||
          'I could not generate a response right now. Please try again.',
        mode,
        modelUsed: data.modelUsed || currentMode.modelTag,
        sources: data.sources || [],
        createdAt: new Date().toISOString(),
      };

      onMessagesChange((prev) => [...prev, assistantMsg]);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Network error reaching Gemini';
      setErrorMsg(msg);
      onMessagesChange((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          text: `Unable to reach assistant: ${msg}`,
          mode,
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setErrorMsg(null);
    onMessagesChange([
      {
        id: 'welcome',
        role: 'assistant',
        text: 'Conversation reset. Ask a follow-up question anytime — I remember our multi-turn thread.',
        mode,
        modelUsed: currentMode.modelTag,
        createdAt: new Date().toISOString(),
      },
    ]);
  };

  return (
    <div className="glass-surface rounded-3xl p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <MessageSquareHeart className="w-6 h-6 text-blue-600 dark:text-cyan-400" />
            <span>{title}</span>
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {subtitle}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const last = [...messages]
                .reverse()
                .find((m) => m.role === 'assistant');
              if (last && 'speechSynthesis' in window) {
                window.speechSynthesis.cancel();
                window.speechSynthesis.speak(
                  new SpeechSynthesisUtterance(last.text)
                );
              }
            }}
            className="min-h-[40px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <Volume2 className="w-4 h-4" />
            <span>Read Aloud</span>
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="min-h-[40px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <RotateCcw className="w-4 h-4" />
            <span>New Thread</span>
          </button>
        </div>
      </div>

      {/* Role & Model Selector */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {modes.map((m) => {
              const Icon = m.icon;
              const active = m.id === mode;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMode(m.id)}
                  className={`min-h-[40px] px-3.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition-colors cursor-pointer ${
                    active
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-blue-400'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{m.label}</span>
                </button>
              );
            })}
          </div>

          {mode === 'maps' && (
            <button
              type="button"
              onClick={handleRequestGps}
              className="min-h-[36px] px-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <LocateFixed className="w-3.5 h-3.5" />
              <span>{gpsStatus || 'Use My GPS'}</span>
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span>
            Role: <strong className="text-slate-700 dark:text-slate-200">{currentMode.roleTitle}</strong>
          </span>
          <span className="font-mono text-blue-600 dark:text-cyan-400">
            {currentMode.modelTag}
          </span>
        </div>
      </div>

      {/* Contextual Starter Prompts */}
      <div className="flex flex-wrap gap-2">
        {currentMode.prompts.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => void handleSend(q)}
            disabled={loading}
            className="min-h-[36px] px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950 text-xs font-medium text-left cursor-pointer transition-colors"
          >
            {q}
          </button>
        ))}
      </div>

      {/* Scrollable Multi-Turn Conversation Thread */}
      <div className="space-y-3 h-[360px] overflow-y-auto p-4 rounded-2xl bg-slate-100/80 dark:bg-slate-900/80 border border-slate-200/70 dark:border-slate-800">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`p-4 rounded-2xl max-w-[88%] text-sm ${
              msg.role === 'user'
                ? 'ml-auto bg-blue-600 text-white shadow-sm'
                : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 shadow-sm'
            }`}
          >
            {msg.role === 'assistant' && msg.modelUsed && (
              <div className="flex items-center justify-between gap-2 mb-1.5 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                <span>AEGIS AI</span>
                <span>{msg.modelUsed}</span>
              </div>
            )}
            {msg.role === 'user' ? (
              <p className="whitespace-pre-wrap">{msg.text}</p>
            ) : (
              <FormattedAiText text={msg.text} />
            )}
            {msg.role === 'assistant' && (
              <GroundingSourcesList sources={msg.sources} />
            )}
          </div>
        ))}
        {loading && (
          <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 w-56 text-xs text-slate-500 font-medium">
            {mode === 'maps'
              ? 'Querying Google Maps grounding...'
              : mode === 'search'
                ? 'Searching live web sources...'
                : mode === 'fast'
                  ? 'Express reply generating...'
                  : 'AEGIS AI is thinking...'}
          </div>
        )}
        <div ref={threadEndRef} />
      </div>

      {errorMsg && (
        <p className="text-xs text-rose-600 dark:text-rose-400">{errorMsg}</p>
      )}

      {/* Input Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleSend();
        }}
        className="flex gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Ask ${currentMode.label} a follow-up question...`}
          className="flex-1 min-h-[48px] px-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="min-h-[48px] px-5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold flex items-center gap-2 cursor-pointer"
        >
          <Send className="w-4 h-4" />
          <span>Send</span>
        </button>
      </form>
    </div>
  );
};
