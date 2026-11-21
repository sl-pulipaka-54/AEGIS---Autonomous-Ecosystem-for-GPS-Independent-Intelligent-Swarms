import React from 'react';
import { ExternalLink, Globe, MapPin, Quote } from 'lucide-react';
import type { GroundingSource } from '../types/aegis';

function renderInlineBold(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={idx} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

export const FormattedAiText: React.FC<{ text: string; className?: string }> = ({
  text,
  className = '',
}) => {
  const lines = text.split('\n');
  return (
    <div className={`space-y-1.5 leading-relaxed ${className}`}>
      {lines.map((rawLine, idx) => {
        const line = rawLine.trim();
        if (!line) return <div key={idx} className="h-1" />;

        if (line.startsWith('### ') || line.startsWith('## ') || line.startsWith('# ')) {
          const clean = line.replace(/^#{1,3}\s+/, '');
          return (
            <p key={idx} className="font-bold text-sm pt-1">
              {renderInlineBold(clean)}
            </p>
          );
        }

        if (line.startsWith('- ') || line.startsWith('* ')) {
          const clean = line.slice(2);
          return (
            <div key={idx} className="flex items-start gap-2 pl-1">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-current opacity-70 shrink-0" />
              <span>{renderInlineBold(clean)}</span>
            </div>
          );
        }

        return <p key={idx}>{renderInlineBold(line)}</p>;
      })}
    </div>
  );
};

export const GroundingSourcesList: React.FC<{
  sources?: GroundingSource[];
}> = ({ sources }) => {
  if (!sources || sources.length === 0) return null;

  const mapsSources = sources.filter((s) => s.kind === 'maps');
  const webSources = sources.filter((s) => s.kind === 'web');

  return (
    <div className="mt-3 pt-3 border-t border-slate-200/80 dark:border-slate-700/80 space-y-2.5 text-xs">
      {mapsSources.length > 0 && (
        <div className="space-y-1.5">
          <p className="font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5" />
            <span>Google Maps Locations & Links</span>
          </p>
          <div className="space-y-1.5">
            {mapsSources.map((src) => (
              <div
                key={src.uri}
                className="p-2.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/60 space-y-1"
              >
                <a
                  href={src.uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-blue-700 dark:text-cyan-300 hover:underline inline-flex items-center gap-1"
                >
                  <span>{src.title}</span>
                  <ExternalLink className="w-3 h-3 shrink-0" />
                </a>
                {src.reviewSnippets && src.reviewSnippets.length > 0 && (
                  <div className="space-y-1 pl-1 text-slate-600 dark:text-slate-300">
                    {src.reviewSnippets.slice(0, 2).map((snippet, idx) => (
                      <p key={idx} className="flex items-start gap-1.5 italic">
                        <Quote className="w-3 h-3 mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                        <span>{snippet}</span>
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {webSources.length > 0 && (
        <div className="space-y-1.5">
          <p className="font-semibold text-blue-700 dark:text-cyan-400 flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5" />
            <span>Google Search Sources</span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {webSources.map((src) => (
              <a
                key={src.uri}
                href={src.uri}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/50 border border-blue-200/80 dark:border-blue-800/70 text-blue-700 dark:text-cyan-300 hover:underline inline-flex items-center gap-1 max-w-full"
              >
                <span className="truncate max-w-[220px]">{src.title}</span>
                <ExternalLink className="w-3 h-3 shrink-0" />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
