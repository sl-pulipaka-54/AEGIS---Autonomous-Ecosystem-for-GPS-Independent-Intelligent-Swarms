import React, { useState } from 'react';
import { Bell, X, CheckCheck, Smartphone, Mail, Radio } from 'lucide-react';
import { useAegis } from '../context/AegisContext';

interface NotificationDrawerProps {
  open: boolean;
  onClose: () => void;
}

export const NotificationDrawer: React.FC<NotificationDrawerProps> = ({
  open,
  onClose,
}) => {
  const { notifications, markAllNotificationsRead } = useAegis();
  const [pushStatus, setPushStatus] = useState<string>(
    typeof window !== 'undefined' && 'Notification' in window
      ? Notification.permission
      : 'default'
  );

  if (!open) return null;

  const requestPush = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      const perm = await Notification.requestPermission();
      setPushStatus(perm);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-950/50 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="Delivery Notifications"
    >
      <div className="w-full max-w-md h-full bg-white dark:bg-slate-950 border-l border-slate-200 dark:border-slate-800 p-6 flex flex-col shadow-2xl">
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-blue-600 dark:text-cyan-400" />
            <h2 className="text-lg font-bold">Notifications</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-900 cursor-pointer"
            aria-label="Close notifications"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center justify-between gap-2 py-3 border-b border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => void markAllNotificationsRead()}
            className="text-xs font-semibold text-blue-600 dark:text-cyan-400 flex items-center gap-1.5 cursor-pointer"
          >
            <CheckCheck className="w-4 h-4" />
            <span>Mark all read</span>
          </button>

          {pushStatus !== 'granted' && (
            <button
              type="button"
              onClick={() => void requestPush()}
              className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer"
            >
              Enable Browser Push
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800">
          {notifications.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-500">
              No delivery alerts yet.
            </p>
          ) : (
            notifications.map((n) => {
              const ChannelIcon =
                n.channel === 'sms'
                  ? Smartphone
                  : n.channel === 'email'
                    ? Mail
                    : Radio;
              return (
                <div
                  key={n.id}
                  className={`py-4 space-y-1 ${
                    n.isRead ? 'opacity-70' : ''
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-mono text-slate-500 dark:text-slate-400">
                    <span className="flex items-center gap-1.5 uppercase font-semibold text-blue-600 dark:text-cyan-400">
                      <ChannelIcon className="w-3.5 h-3.5" />
                      {n.channel} · {n.eventType}
                    </span>
                    <span>{n.parcelNumber}</span>
                  </div>
                  <p className="font-semibold text-sm text-slate-900 dark:text-white">
                    {n.title}
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    {n.message}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
