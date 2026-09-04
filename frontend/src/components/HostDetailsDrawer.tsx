import { useEffect, useRef } from 'react';
import { X, Server, Shield, Database, Monitor, Globe, HardDrive, Activity } from 'lucide-react';
import type { NetworkNode, TargetRankingEntry } from '../api/generated';
import { sanitizeAlias } from '../utils/layout';

interface HostDetailsDrawerProps {
  host: NetworkNode | null;
  rankingEntry?: TargetRankingEntry | null;
  onClose: () => void;
}

function getRoleIcon(role: string) {
  switch (role) {
    case 'server':
      return Server;
    case 'database':
      return Database;
    case 'domain_controller':
      return Shield;
    case 'web_server':
      return Globe;
    case 'firewall':
      return HardDrive;
    default:
      return Monitor;
  }
}

export function HostDetailsDrawer({ host, rankingEntry, onClose }: HostDetailsDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!host) return;
    // focus close button or drawer on open
    const timer = setTimeout(() => {
      closeBtnRef.current?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, [host]);

  useEffect(() => {
    if (!host) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
      // simple focus trap: keep focus within drawer
      if (e.key === 'Tab' && drawerRef.current) {
        const focusable = drawerRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    // prevent body scroll when open
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [host, onClose]);

  if (!host) return null;

  const RoleIcon = getRoleIcon(host.role);
  const critColor =
    host.criticality === 'high' ? 'bg-coral-500' : host.criticality === 'medium' ? 'bg-orange-500' : 'bg-cyan-500';
  const critText =
    host.criticality === 'high' ? 'text-coral-400' : host.criticality === 'medium' ? 'text-orange-400' : 'text-cyan-400';
  const displayAlias = sanitizeAlias(host.alias || host.id);
  const safeAliasId = sanitizeAlias(host.id);

  return (
    <>
      {/* overlay */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        aria-hidden="true"
        onClick={onClose}
        data-testid="drawer-overlay"
      />
      <aside
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        data-testid="host-details-drawer"
        className="fixed right-0 top-0 h-full w-96 max-w-[90vw] bg-cyber-900 sm:bg-navy-800 border-l border-cyber-800 sm:border-navy-700 shadow-2xl z-50 flex flex-col overflow-hidden"
      >
        {/* header */}
        <div className="h-12 px-4 flex items-center justify-between bg-cyber-950 sm:bg-navy-900 border-b border-cyber-800 sm:border-navy-700 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-6 h-6 rounded bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0">
              <RoleIcon className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
            </div>
            <div className="flex flex-col min-w-0">
              <h2 id="drawer-title" className="text-[13px] font-bold font-mono text-white truncate">
                {displayAlias} - Host Details
              </h2>
              <span className="text-[13px] font-mono text-gray-400 truncate">safe alias {safeAliasId} - role {host.role}</span>
            </div>
          </div>
          <button
            ref={closeBtnRef}
            onClick={onClose}
            aria-label="Close host details drawer"
            data-testid="drawer-close"
            className="p-1.5 rounded hover:bg-cyber-800 sm:hover:bg-navy-700 text-gray-400 hover:text-white border border-transparent hover:border-cyber-700 sm:hover:border-navy-700 focus:outline-none focus:ring-2 focus:ring-cyan-400"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Properties grid - safe alias only, no raw IP, no OS/database, no packet inspection */}
          <div className="space-y-2">
            <h3 className="text-[13px] font-bold tracking-wide uppercase text-gray-300">Host Properties</h3>
            <div className="grid grid-cols-2 gap-2 text-[13px]">
              <div className="bg-navy-700 sm:bg-cyber-900 rounded p-2.5 border border-navy-700 sm:border-cyber-800">
                <span className="text-gray-400 text-[13px]">Safe Alias</span>
                <div className="font-mono font-bold text-white mt-0.5">{displayAlias}</div>
                <span className="text-gray-500 text-[13px]">host-N alias only - never raw IP</span>
              </div>
              <div className="bg-navy-700 sm:bg-cyber-900 rounded p-2.5 border border-navy-700 sm:border-cyber-800">
                <span className="text-gray-400 text-[13px]">Role</span>
                <div className="flex items-center gap-1.5 font-medium text-white mt-0.5">
                  <RoleIcon className="w-3 h-3 text-cyan-400" aria-hidden="true" />
                  {host.role}
                </div>
              </div>
              <div className="bg-navy-700 sm:bg-cyber-900 rounded p-2.5 border border-navy-700 sm:border-cyber-800">
                <span className="text-gray-400 text-[13px]">Criticality</span>
                <div className={`flex items-center gap-1.5 font-medium mt-0.5 ${critText}`}>
                  <span className={`w-2 h-2 rounded-full ${critColor}`} aria-hidden="true"></span>
                  {host.criticality}
                  <span className="text-gray-400 text-[13px]">({host.criticality_numeric ?? (host.criticality === 'high' ? 3 : host.criticality === 'medium' ? 2 : 1)})</span>
                </div>
              </div>
              <div className="bg-navy-700 sm:bg-cyber-900 rounded p-2.5 border border-navy-700 sm:border-cyber-800">
                <span className="text-gray-400 text-[13px]">Risk - learned</span>
                <div className="font-mono font-bold text-white mt-0.5 flex items-center gap-1">
                  <Activity className="w-3 h-3 text-cyan-400" aria-hidden="true" />
                  {host.risk.toFixed(2)}
                </div>
                <span className="text-gray-500 text-[13px]">malicious probability 0-1</span>
              </div>
              <div className="bg-navy-700 sm:bg-cyber-900 rounded p-2.5 border border-navy-700 sm:border-cyber-800">
                <span className="text-gray-400 text-[13px]">Observed State</span>
                <div className={`font-medium mt-0.5 ${host.observed_state === 'suspicious' ? 'text-orange-400' : 'text-cyan-400'}`}>
                  {host.observed_state}
                </div>
                <span className="text-gray-500 text-[13px]">cyan observed - orange suspicious</span>
              </div>
              <div className="bg-navy-700 sm:bg-cyber-900 rounded p-2.5 border border-navy-700 sm:border-cyber-800">
                <span className="text-gray-400 text-[13px]">Status</span>
                <div className="font-mono text-white mt-0.5">{host.status}</div>
                <span className="text-gray-500 text-[13px]">observed topology</span>
              </div>
            </div>
          </div>

          {/* Graph-derived ranking info if available */}
          {rankingEntry && (
            <div className="space-y-2">
              <h3 className="text-[13px] font-bold tracking-wide uppercase text-gray-300">Graph Ranking - NetworkX</h3>
              <div className="bg-purple-500/10 border border-purple-500/20 rounded p-2.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400 text-[13px]">Rank</span>
                  <span className="text-[13px] font-mono font-bold text-purple-400">#{rankingEntry.rank ?? '-'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400 text-[13px]">Target score</span>
                  <span className="text-[13px] font-mono font-bold text-purple-400">{rankingEntry.target_score.toFixed(2)}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[13px]">
                  <div className="bg-navy-800 sm:bg-cyber-950 rounded p-2 border border-navy-700 sm:border-cyber-800">
                    <span className="text-gray-500 text-[13px]">Incoming activity</span>
                    <div className="font-mono text-white">{rankingEntry.incoming_activity}</div>
                  </div>
                  <div className="bg-navy-800 sm:bg-cyber-950 rounded p-2 border border-navy-700 sm:border-cyber-800">
                    <span className="text-gray-500 text-[13px]">Edge novelty</span>
                    <div className="font-mono text-white">{rankingEntry.edge_novelty.toFixed(2)}</div>
                  </div>
                  <div className="bg-navy-800 sm:bg-cyber-950 rounded p-2 border border-navy-700 sm:border-cyber-800">
                    <span className="text-gray-500 text-[13px]">Risk trend</span>
                    <div className="font-mono text-white">{rankingEntry.recent_risk_trend.toFixed(2)}</div>
                  </div>
                  <div className="bg-navy-800 sm:bg-cyber-950 rounded p-2 border border-navy-700 sm:border-cyber-800">
                    <span className="text-gray-500 text-[13px]">Asset criticality</span>
                    <div className="text-white">{rankingEntry.asset_criticality}</div>
                  </div>
                </div>
                <p className="text-[13px] text-gray-500">Score = suspicious incoming * edge novelty * recent risk trend * asset criticality - graph-ranked, not learned classifier</p>
              </div>
            </div>
          )}

          {!rankingEntry && (
            <div className="text-[13px] text-gray-500 bg-navy-700 sm:bg-cyber-900 rounded p-2.5 border border-navy-700 sm:border-cyber-800">
              No ranking entry - low suspicious activity - background host
            </div>
          )}

          <div className="text-[13px] text-gray-500 bg-navy-800 sm:bg-cyber-950 rounded p-2 border border-navy-700 sm:border-cyber-800">
            Safe host-N aliases only - never expose raw IP. No invented OS or database details or packet inspection blocked per design-system.
          </div>
        </div>

        <div className="p-3 border-t border-navy-700 sm:border-cyber-800 bg-navy-900 sm:bg-cyber-950 shrink-0">
          <button
            onClick={onClose}
            className="w-full py-2 rounded bg-navy-700 sm:bg-cyber-800 hover:bg-navy-600 sm:hover:bg-cyber-700 text-gray-200 text-[13px] font-medium border border-navy-700 sm:border-cyber-700 focus:outline-none focus:ring-2 focus:ring-cyan-400"
            data-testid="drawer-close-bottom"
          >
            Close
          </button>
        </div>
      </aside>
    </>
  );
}
