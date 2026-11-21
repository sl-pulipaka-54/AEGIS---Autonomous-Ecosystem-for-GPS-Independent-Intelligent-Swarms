import React, { useState } from 'react';
import { X, Shield, Phone, Mail, Lock, CheckCircle2 } from 'lucide-react';
import { useAegis } from '../context/AegisContext';

export const AuthGateModal: React.FC = () => {
  const {
    authModalOpen,
    authModalRole,
    closeAuthModal,
    signInWithGoogle,
    signInWithCredentials,
  } = useAegis();

  const [roleTab, setRoleTab] = useState<'customer' | 'operator'>(authModalRole);
  const [customerMethod, setCustomerMethod] = useState<'google' | 'otp' | 'email'>(
    'google'
  );
  const [identifier, setIdentifier] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('482910');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [operatorPasscode, setOperatorPasscode] = useState('AEGIS-OPS-2026');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  React.useEffect(() => {
    setRoleTab(authModalRole);
    setError(null);
  }, [authModalRole, authModalOpen]);

  if (!authModalOpen) return null;

  const handleGoogle = async () => {
    try {
      setError(null);
      setSubmitting(true);
      await signInWithGoogle(
        roleTab,
        roleTab === 'operator' ? operatorPasscode : undefined
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Google Sign-In failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (roleTab === 'customer' && customerMethod === 'otp' && !otpSent) {
      if (!identifier.trim()) {
        setError('Please enter your 10-digit mobile number.');
        return;
      }
      setOtpSent(true);
      return;
    }

    try {
      setSubmitting(true);
      await signInWithCredentials({
        method: roleTab === 'operator' ? 'operator' : customerMethod === 'otp' ? 'otp' : 'email',
        identifier:
          identifier.trim() ||
          (roleTab === 'operator' ? 'cmdr.vikram@aegis.in' : '+91 98490 24511'),
        otpCode,
        password,
        name,
        role: roleTab,
        operatorPasscode,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="AEGIS Authentication"
    >
      <div className="w-full max-w-md rounded-3xl glass-panel shadow-2xl p-6 md:p-7 text-slate-900 dark:text-slate-100">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-xl font-bold tracking-tight">
              {roleTab === 'operator' ? 'Company Operator Login' : 'Customer Sign In'}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {roleTab === 'operator'
                ? 'Authorized AEGIS flight & fleet personnel only'
                : 'Access your deliveries, live tracking & alerts'}
            </p>
          </div>
          <button
            type="button"
            onClick={closeAuthModal}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close sign in dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Role Selector */}
        <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-200/70 dark:bg-slate-800/80 rounded-xl mb-5">
          <button
            type="button"
            onClick={() => {
              setRoleTab('customer');
              setError(null);
            }}
            className={`min-h-[44px] rounded-lg text-sm font-semibold transition-all cursor-pointer ${
              roleTab === 'customer'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-cyan-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Customer
          </button>
          <button
            type="button"
            onClick={() => {
              setRoleTab('operator');
              setError(null);
            }}
            className={`min-h-[44px] rounded-lg text-sm font-semibold transition-all cursor-pointer ${
              roleTab === 'operator'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-cyan-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Company Operator
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-sm text-rose-700 dark:text-rose-200">
            {error}
          </div>
        )}

        {roleTab === 'customer' ? (
          <div className="space-y-4">
            {/* Customer Method Tabs */}
            <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 dark:bg-slate-800/60 rounded-xl">
              {[
                { id: 'google', label: 'Google' },
                { id: 'otp', label: 'Mobile OTP' },
                { id: 'email', label: 'Email' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setCustomerMethod(m.id as 'google' | 'otp' | 'email');
                    setOtpSent(false);
                    setError(null);
                  }}
                  className={`min-h-[40px] rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    customerMethod === m.id
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-700/50'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {customerMethod === 'google' && (
              <div className="space-y-3 pt-2">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleGoogle}
                  className="w-full min-h-[48px] px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-base flex items-center justify-center gap-2.5 shadow-md transition-colors disabled:opacity-60 cursor-pointer"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  <span>{submitting ? 'Connecting...' : 'Continue with Google'}</span>
                </button>
                <p className="text-xs text-center text-slate-500 dark:text-slate-400">
                  Instant Firebase verification · Syncs your Hyderabad delivery profile
                </p>
              </div>
            )}

            {customerMethod === 'otp' && (
              <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Mobile Number
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
                    <input
                      type="tel"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="+91 98490 24511"
                      className="w-full min-h-[44px] pl-10 pr-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-base focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                </div>

                {otpSent && (
                  <>
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        Your Name
                      </label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Lakshmi Narayana"
                        className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-base focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        6-Digit Verification Code (Demo: 482910)
                      </label>
                      <input
                        type="text"
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value)}
                        className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-base tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                  </>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full min-h-[48px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-base transition-colors cursor-pointer"
                >
                  {otpSent
                    ? submitting
                      ? 'Verifying...'
                      : 'Verify OTP & Sign In'
                    : 'Send Verification OTP'}
                </button>
              </form>
            )}

            {customerMethod === 'email' && (
              <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Full Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ananya Sharma"
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-base focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
                    <input
                      type="email"
                      required
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="name@example.com"
                      className="w-full min-h-[44px] pl-10 pr-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-base focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Password</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full min-h-[44px] pl-10 pr-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-base focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full min-h-[48px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-base transition-colors cursor-pointer"
                >
                  {submitting ? 'Signing In...' : 'Sign In with Email'}
                </button>
              </form>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Operator Staff Email
              </label>
              <input
                type="email"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="cmdr.vikram@aegis.in"
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-base focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Staff Clearance Code
              </label>
              <div className="relative">
                <Shield className="w-4 h-4 absolute left-3.5 top-3.5 text-blue-600 dark:text-cyan-400" />
                <input
                  type="password"
                  required
                  value={operatorPasscode}
                  onChange={(e) => setOperatorPasscode(e.target.value)}
                  className="w-full min-h-[44px] pl-10 pr-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-base focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                Authorized demo clearance code:{' '}
                <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">
                  AEGIS-OPS-2026
                </span>
              </p>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full min-h-[48px] rounded-xl bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-700 text-white font-semibold text-base transition-colors cursor-pointer"
            >
              {submitting ? 'Verifying Clearance...' : 'Access Operator Command'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
