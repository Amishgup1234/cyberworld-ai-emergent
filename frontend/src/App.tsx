import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, AlertTriangle, ArrowRight, Ban, BrainCircuit, ChevronRight, Clock, Cpu, Database,
  Eye, Fingerprint, GitBranch, Globe, Layers, LineChart, Lock, MonitorSmartphone, Network, Radar,
  Radio, ScanEye, Server, ShieldAlert, Signal, Sparkles, Terminal, TrendingUp, Zap,
  Router as RouterIcon, HardDrive, Cloud, User, Fingerprint as FingerprintIcon, Waves,
  ChevronsRight, ShieldOff, CircleDot, Target, FileText, Settings, Play, Pause, RotateCcw,
  Rewind, FastForward, Binary, ChevronLeft, Download, ShieldCheck, BarChart3,
} from 'lucide-react';

/* =========================================================================
   TYPES + BASE DATA
   ========================================================================= */

type NodeKind = 'gateway' | 'server' | 'workstation' | 'cloud' | 'db' | 'identity' | 'iot';
type Risk = 'safe' | 'watch' | 'warn' | 'critical';

type TwinNode = {
  id: string; label: string; kind: NodeKind;
  x: number; y: number; base: Risk;
  escalateAt?: number; peak?: Risk;
  ip: string; tier: string;
};
type TwinEdge = {
  from: string; to: string; intensity: number;
  malicious?: boolean; predicted?: boolean;
  appearsAt?: number;
};

const NODES: TwinNode[] = [
  { id: 'gw-01',   label: 'Perimeter Gateway',  kind: 'gateway',     x: 90,  y: 220, base: 'safe',  escalateAt: 4,  peak: 'watch',    ip: '10.0.0.1',   tier: 'Perimeter' },
  { id: 'fw-01',   label: 'Next-Gen Firewall',  kind: 'gateway',     x: 200, y: 130, base: 'safe',                                     ip: '10.0.0.2',   tier: 'Perimeter' },
  { id: 'vpn-01',  label: 'VPN Concentrator',   kind: 'gateway',     x: 200, y: 320, base: 'safe',  escalateAt: 6,  peak: 'warn',     ip: '10.0.0.9',   tier: 'Perimeter' },
  { id: 'ad-01',   label: 'AD-01 Domain Ctrl',  kind: 'identity',    x: 380, y: 220, base: 'safe',  escalateAt: 10, peak: 'critical', ip: '10.0.10.4',  tier: 'Core Identity' },
  { id: 'db-01',   label: 'PII Database',       kind: 'db',          x: 560, y: 130, base: 'safe',  escalateAt: 16, peak: 'critical', ip: '10.0.20.12', tier: 'Crown Jewels' },
  { id: 'db-02',   label: 'Finance Vault',      kind: 'db',          x: 560, y: 310, base: 'safe',  escalateAt: 18, peak: 'warn',     ip: '10.0.20.14', tier: 'Crown Jewels' },
  { id: 'srv-01',  label: 'File Server SMB',    kind: 'server',      x: 380, y: 380, base: 'safe',  escalateAt: 12, peak: 'warn',     ip: '10.0.30.5',  tier: 'Core' },
  { id: 'srv-02',  label: 'Mail Exchange',      kind: 'server',      x: 380, y: 60,  base: 'safe',  escalateAt: 5,  peak: 'watch',    ip: '10.0.30.7',  tier: 'Core' },
  { id: 'cld-01',  label: 'S3 Backup Bucket',   kind: 'cloud',       x: 720, y: 100, base: 'safe',  escalateAt: 22, peak: 'watch',    ip: 'aws-us-1',   tier: 'Cloud' },
  { id: 'cld-02',  label: 'K8s Prod Cluster',   kind: 'cloud',       x: 720, y: 260, base: 'safe',                                     ip: 'k8s-prod',   tier: 'Cloud' },
  { id: 'ws-01',   label: 'HR-Laptop-014',      kind: 'workstation', x: 190, y: 460, base: 'safe',                                     ip: '10.0.40.14', tier: 'Workstation' },
  { id: 'ws-02',   label: 'Dev-Workstation-22', kind: 'workstation', x: 560, y: 460, base: 'safe',  escalateAt: 14, peak: 'warn',     ip: '10.0.40.22', tier: 'Workstation' },
  { id: 'iot-01',  label: 'HVAC Controller',    kind: 'iot',         x: 720, y: 420, base: 'safe',  escalateAt: 4,  peak: 'watch',    ip: '10.0.90.3',  tier: 'OT/IoT' },
];

const EDGES: TwinEdge[] = [
  { from: 'gw-01',  to: 'fw-01',  intensity: 0.9 },
  { from: 'gw-01',  to: 'vpn-01', intensity: 0.6 },
  { from: 'fw-01',  to: 'ad-01',  intensity: 0.8 },
  { from: 'vpn-01', to: 'ad-01',  intensity: 0.7, malicious: true, appearsAt: 6 },
  { from: 'ad-01',  to: 'db-01',  intensity: 0.9, predicted: true, malicious: true, appearsAt: 16 },
  { from: 'ad-01',  to: 'db-02',  intensity: 0.5 },
  { from: 'ad-01',  to: 'srv-01', intensity: 0.75, malicious: true, appearsAt: 10 },
  { from: 'srv-02', to: 'fw-01',  intensity: 0.4 },
  { from: 'srv-01', to: 'ws-02',  intensity: 0.55, predicted: true, appearsAt: 14 },
  { from: 'db-01',  to: 'cld-01', intensity: 0.7, predicted: true, appearsAt: 22 },
  { from: 'cld-02', to: 'db-02',  intensity: 0.35 },
  { from: 'ws-01',  to: 'vpn-01', intensity: 0.5 },
  { from: 'iot-01', to: 'cld-02', intensity: 0.3 },
];

const STAGES = [
  { stage: 'Recon',            activateAt: 0,  target: 0.98, color: '#00F0FF' },
  { stage: 'Initial Access',   activateAt: 3,  target: 0.92, color: '#00F0FF' },
  { stage: 'Execution',        activateAt: 6,  target: 0.87, color: '#7C6BFF' },
  { stage: 'Persistence',      activateAt: 10, target: 0.72, color: '#7C6BFF' },
  { stage: 'Priv Escalation',  activateAt: 14, target: 0.61, color: '#FFAA00' },
  { stage: 'Lateral Movement', activateAt: 18, target: 0.44, color: '#FFAA00' },
  { stage: 'Credential Access',activateAt: 22, target: 0.29, color: '#FF2E63' },
  { stage: 'Exfiltration',     activateAt: 26, target: 0.11, color: '#FF2E63' },
];

const MITRE_MATRIX = [
  { tactic: 'Recon',            techniques: [{ id: 'T1595', name: 'Active Scanning',           conf: 0.97, activeAt: 0 }, { id: 'T1592', name: 'Victim Host Info',      conf: 0.71, activeAt: 1 }] },
  { tactic: 'Initial Access',   techniques: [{ id: 'T1078', name: 'Valid Accounts',            conf: 0.94, activeAt: 3 }, { id: 'T1566', name: 'Phishing',              conf: 0.55, activeAt: 4 }] },
  { tactic: 'Execution',        techniques: [{ id: 'T1059', name: 'Command & Scripting',       conf: 0.88, activeAt: 6 }] },
  { tactic: 'Persistence',      techniques: [{ id: 'T1136', name: 'Create Account',            conf: 0.66, activeAt: 10 }, { id: 'T1053', name: 'Scheduled Task',         conf: 0.42, activeAt: 11 }] },
  { tactic: 'Priv Escalation',  techniques: [{ id: 'T1068', name: 'Exploit Vuln (CVE-2026-1189)', conf: 0.61, activeAt: 14 }] },
  { tactic: 'Credential Access',techniques: [{ id: 'T1558', name: 'Kerberoasting',             conf: 0.58, activeAt: 22 }, { id: 'T1003', name: 'OS Credential Dumping',  conf: 0.31, activeAt: 23 }] },
  { tactic: 'Lateral Movement', techniques: [{ id: 'T1021', name: 'Remote Services (SMB)',     conf: 0.47, activeAt: 18 }] },
  { tactic: 'Exfiltration',     techniques: [{ id: 'T1041', name: 'C2 Channel Exfil',          conf: 0.12, activeAt: 26 }] },
];

const XAI_SIGNALS_BASE = [
  { name: 'SMB traffic anomaly (srv-01)',          weight: 0.34, dir: 'up',   context: 'Volume 6.4× baseline for last 480s', activeAt: 10 },
  { name: 'Kerberos service ticket bursts (ad-01)',weight: 0.28, dir: 'up',   context: '11 SPN requests / 60s window',        activeAt: 12 },
  { name: 'VPN session from novel ASN',            weight: 0.17, dir: 'up',   context: 'AS205100 first-seen in 90d window',   activeAt: 6 },
  { name: 'Dormant service account activated',     weight: 0.11, dir: 'up',   context: 'svc_backup_legacy — no auth in 214d', activeAt: 14 },
  { name: 'Reduced beaconing entropy (out-01)',    weight: 0.07, dir: 'down', context: 'Model expects broader jitter',        activeAt: 4 },
  { name: 'CVE-2026-1189 patch missing',           weight: 0.03, dir: 'up',   context: 'Endpoint SCCM confirms unpatched',    activeAt: 14 },
];

const MITIGATIONS = [
  { id: 'isolate-ad-01',    label: 'Isolate AD-01 domain controller',       delta: -47, icon: ShieldOff },
  { id: 'block-smb',        label: 'Block SMB (port 445) at core switch',   delta: -22, icon: Ban },
  { id: 'mfa-vpn',          label: 'Enforce MFA re-auth on VPN sessions',   delta: -9,  icon: Lock },
  { id: 'patch-cve',        label: 'Apply patch CVE-2026-1189',             delta: -18, icon: Binary },
  { id: 'kill-svc-account', label: 'Disable svc_backup_legacy account',     delta: -6,  icon: Fingerprint },
];

const RISK_COLOR: Record<Risk, string> = { safe:'#7CFFB0', watch:'#00F0FF', warn:'#FFAA00', critical:'#FF2E63' };
const KIND_ICON: Record<NodeKind, typeof Server> = { gateway: RouterIcon, server: Server, workstation: MonitorSmartphone, cloud: Cloud, db: Database, identity: User, iot: HardDrive };

const FRAME_COUNT = 30;

/* =========================================================================
   FRAME-DERIVED HELPERS
   ========================================================================= */

function stageProbAt(activateAt: number, target: number, frame: number) {
  if (frame < activateAt) return 0;
  const ramp = Math.min(1, (frame - activateAt) / 4);
  return target * ramp;
}
function stageDoneAt(activateAt: number, frame: number) { return frame > activateAt + 4; }

function riskAtFrame(n: TwinNode, frame: number): Risk {
  if (!n.escalateAt || !n.peak) return n.base;
  if (frame < n.escalateAt) return n.base === 'safe' ? 'safe' : n.base;
  if (frame < n.escalateAt + 4) {
    const ladder: Risk[] = ['safe','watch','warn','critical'];
    const from = ladder.indexOf(n.base);
    const to = ladder.indexOf(n.peak);
    return ladder[Math.min(to, from + 1)];
  }
  if (frame < n.escalateAt + 8) {
    const ladder: Risk[] = ['safe','watch','warn','critical'];
    const to = ladder.indexOf(n.peak);
    return ladder[Math.max(0, to - 1)];
  }
  return n.peak;
}
function edgeVisibleAt(e: TwinEdge, frame: number) { return (e.appearsAt ?? -1) <= frame; }

function useClock() {
  const [now, setNow] = useState<Date>(new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  return now;
}

/* =========================================================================
   TOP + NAV
   ========================================================================= */

function BrandMark() {
  return (
    <div className="flex items-center gap-2.5" data-testid="brand-mark">
      <div className="relative w-8 h-8 flex items-center justify-center">
        <div className="absolute inset-0 rounded-sm border border-cyan-400/60 rotate-45"></div>
        <div className="absolute inset-1 rounded-sm border border-cyan-400/30 rotate-45"></div>
        <div className="absolute inset-0 rounded-full bg-cyan-400/10 pulse-ring"></div>
        <ShieldAlert className="w-4 h-4 text-cyan-300 relative" strokeWidth={2.2}/>
      </div>
      <div className="leading-tight">
        <div className="font-display text-[15px] font-bold tracking-wider text-white">CYBERWORLD<span className="text-cyan-300"> AI</span></div>
        <div className="font-mono text-[9.5px] text-cyan-300/70 tracking-[0.3em]">PREDICT · EXPLAIN · SIMULATE · DEFEND</div>
      </div>
    </div>
  );
}

function TopBar({ conf }: { conf: number }) {
  const now = useClock();
  const utc = now.toISOString().slice(11, 19);
  return (
    <div className="sticky top-0 z-40 h-[60px] border-b border-cyan-400/10 bg-[#05070C]/85 backdrop-blur-xl" data-testid="top-bar">
      <div className="h-full px-5 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <BrandMark/>
          <div className="hidden md:flex items-center gap-2">
            <span className="chip"><CircleDot className="w-3 h-3 text-lime-300 blink"/>TWIN SYNCED</span>
            <span className="chip"><Cpu className="w-3 h-3 text-cyan-300"/>NODES 12,480</span>
            <span className="chip"><GitBranch className="w-3 h-3 text-violet-300"/>MODEL tw-v3.4.1</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden lg:flex items-center gap-2 pr-3 border-r border-white/5">
            <TrendingUp className="w-3.5 h-3.5 text-lime-300"/>
            <span className="font-mono text-[11px] text-white/90">AI CONF <span className="text-lime-300 font-bold">{conf.toFixed(1)}%</span></span>
          </div>
          <div className="flex items-center gap-2 pr-3 border-r border-white/5">
            <Clock className="w-3.5 h-3.5 text-cyan-300"/>
            <span className="font-mono text-[11px] text-white/80">{utc} UTC</span>
          </div>
          <button className="btn-tactical" data-testid="btn-strategy-deck"><span className="flex items-center gap-1.5"><FileText className="w-3.5 h-3.5"/>STRATEGY</span></button>
          <button className="btn-tactical primary" data-testid="btn-deploy"><span className="flex items-center gap-1.5"><Zap className="w-3.5 h-3.5"/>DEPLOY</span></button>
        </div>
      </div>
    </div>
  );
}

type NavId = 'overview' | 'twin' | 'forecast' | 'xai' | 'mitre' | 'simulate' | 'reports' | 'settings';

function NavRail({ current, setCurrent }: { current: NavId; setCurrent: (s: NavId) => void }) {
  const items: { id: NavId; label: string; icon: typeof Server }[] = [
    { id: 'overview', label: 'Command Overview', icon: Radar },
    { id: 'twin', label: 'Digital Twin', icon: Network },
    { id: 'forecast', label: 'Attack Forecast', icon: TrendingUp },
    { id: 'xai', label: 'Explainability', icon: BrainCircuit },
    { id: 'mitre', label: 'MITRE ATT&CK', icon: ScanEye },
    { id: 'simulate', label: 'What-if Simulate', icon: Sparkles },
    { id: 'reports', label: 'Reports', icon: FileText },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];
  return (
    <nav className="w-[220px] shrink-0 hidden lg:flex flex-col border-r border-cyan-400/10 bg-[#070B18]/70 backdrop-blur-md sticky top-[60px] self-start" style={{ height: 'calc(100vh - 60px)' }} data-testid="nav-rail">
      <div className="p-4 border-b border-white/5">
        <div className="text-[10px] font-mono tracking-[0.24em] text-cyan-300/50">STATION 01 · SOC-EAST</div>
        <div className="mt-2 flex items-center gap-2 text-[11px] text-white/70"><Signal className="w-3 h-3 text-lime-300"/> Uplink stable · 4.2ms</div>
      </div>
      <div className="p-2 flex-1 overflow-y-auto">
        {items.map(({ id, label, icon: Icon }) => {
          const active = current === id;
          return (
            <button key={id} onClick={() => setCurrent(id)} data-testid={`nav-${id}`}
              className={`w-full flex items-center gap-3 px-3 py-2.5 my-0.5 text-left rounded-sm relative ${active ? 'text-white' : 'text-white/60 hover:text-white hover:bg-cyan-400/5'}`}>
              {active && <span className="absolute left-0 top-1 bottom-1 w-[3px] bg-cyan-300 shadow-[0_0_12px_rgba(0,240,255,0.7)]"/>}
              <Icon className={`w-4 h-4 ${active ? 'text-cyan-300' : ''}`} strokeWidth={active ? 2.4 : 1.8}/>
              <span className={`text-[13px] ${active ? 'font-medium' : ''}`}>{label}</span>
              {active && <ChevronRight className="w-3.5 h-3.5 ml-auto text-cyan-300"/>}
            </button>
          );
        })}
      </div>
      <div className="p-3 border-t border-white/5">
        <div className="glass rounded-sm p-3">
          <div className="font-mono text-[9.5px] tracking-[0.24em] text-cyan-300/60 mb-2">OPERATOR</div>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-sm bg-lime-300/20 border border-lime-300/40 flex items-center justify-center"><FingerprintIcon className="w-3.5 h-3.5 text-lime-300"/></div>
            <div className="leading-tight"><div className="text-[12px] text-white/90">A. Kowalski</div><div className="text-[10px] text-white/40">Tier-2 · Blue Team</div></div>
          </div>
        </div>
      </div>
    </nav>
  );
}

/* =========================================================================
   REPLAY SCRUBBER
   ========================================================================= */

const MILESTONES = [
  { frame: 0,  id: 'baseline',   label: 'Baseline',        color: '#7CFFB0' },
  { frame: 6,  id: 'emerging',   label: 'Emerging',        color: '#00F0FF' },
  { frame: 10, id: 'warning',    label: 'Early Warning',   color: '#FFAA00' },
  { frame: 16, id: 'critical',   label: 'Critical Path',   color: '#FF2E63' },
  { frame: 22, id: 'exfil',      label: 'Exfil Risk',      color: '#FF2E63' },
];

function ReplayScrubber({
  frame, setFrame, playing, setPlaying, speed, setSpeed,
}: {
  frame: number; setFrame: (f: number) => void;
  playing: boolean; setPlaying: (p: boolean) => void;
  speed: number; setSpeed: (s: number) => void;
}) {
  useEffect(() => {
    if (!playing) return;
    const ms = speed === 0.5 ? 1600 : speed === 2 ? 400 : 800;
    const id = setInterval(() => {
      setFrame(Math.min(FRAME_COUNT - 1, frame + 1) === frame ? 0 : Math.min(FRAME_COUNT - 1, frame + 1));
    }, ms);
    return () => clearInterval(id);
  }, [playing, frame, speed, setFrame]);

  const pct = (frame / (FRAME_COUNT - 1)) * 100;

  return (
    <div className="corners relative glass rounded-sm px-4 py-3 mb-5" data-testid="replay-scrubber">
      <div className="cbr"></div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1">
          <button className="btn-tactical !py-1.5 !px-2" onClick={() => setFrame(0)} data-testid="scrub-restart"><RotateCcw className="w-3.5 h-3.5"/></button>
          <button className="btn-tactical !py-1.5 !px-2" onClick={() => setFrame(Math.max(0, frame - 1))} data-testid="scrub-back"><Rewind className="w-3.5 h-3.5"/></button>
          <button className="btn-tactical primary !py-1.5 !px-3" onClick={() => setPlaying(!playing)} data-testid="scrub-play">
            {playing ? <Pause className="w-3.5 h-3.5"/> : <Play className="w-3.5 h-3.5"/>}
          </button>
          <button className="btn-tactical !py-1.5 !px-2" onClick={() => setFrame(Math.min(FRAME_COUNT - 1, frame + 1))} data-testid="scrub-forward"><FastForward className="w-3.5 h-3.5"/></button>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] tracking-[0.24em] text-cyan-300/70 uppercase">Attack Replay</span>
              <span className="chip"><CircleDot className={`w-2 h-2 ${playing ? 'text-lime-300 blink' : 'text-white/40'}`}/>{playing ? 'PLAYING' : 'PAUSED'}</span>
            </div>
            <div className="flex items-center gap-3 text-[10.5px] font-mono">
              <span className="text-white/50">Frame</span>
              <span className="text-cyan-300 font-bold">{String(frame).padStart(2, '0')} / {FRAME_COUNT - 1}</span>
              <span className="text-white/50">T+{(frame * 12).toString().padStart(3, '0')}s</span>
            </div>
          </div>
          <div className="relative">
            {/* track */}
            <div className="h-2 bg-white/5 rounded-full relative">
              {MILESTONES.map(m => (
                <div key={m.id} className="absolute top-1/2 -translate-y-1/2 flex flex-col items-center" style={{ left: `${(m.frame / (FRAME_COUNT - 1)) * 100}%`, transform: 'translate(-50%, -50%)' }} title={m.label}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: m.color, boxShadow: `0 0 8px ${m.color}` }}/>
                </div>
              ))}
              <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #00F0FF, #B6FF3D)' }}/>
              <input
                type="range" min={0} max={FRAME_COUNT - 1} step={1} value={frame}
                onChange={(e) => setFrame(parseInt(e.target.value))}
                className="absolute inset-0 w-full opacity-0 cursor-pointer"
                data-testid="scrub-slider"
              />
              <div className="absolute top-1/2 w-3.5 h-3.5 rounded-full bg-white -translate-y-1/2 -translate-x-1/2 pointer-events-none" style={{ left: `${pct}%`, boxShadow: '0 0 0 3px rgba(0,240,255,0.35), 0 0 20px rgba(0,240,255,0.6)' }}/>
            </div>
            {/* milestone labels */}
            <div className="relative h-4 mt-1">
              {MILESTONES.map(m => (
                <span key={m.id} className="absolute font-mono text-[9px] tracking-wider uppercase text-white/55" style={{ left: `${(m.frame / (FRAME_COUNT - 1)) * 100}%`, transform: 'translateX(-50%)', color: frame >= m.frame ? m.color : undefined }}>
                  {m.label}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {[0.5, 1, 2].map(s => (
            <button key={s} onClick={() => setSpeed(s)} data-testid={`scrub-speed-${s}`}
              className={`px-2 py-1 font-mono text-[10.5px] tracking-wider rounded-sm border ${speed === s ? 'bg-cyan-400/15 border-cyan-400/50 text-cyan-200' : 'border-white/10 text-white/50 hover:text-white'}`}>
              {s}×
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   KPI TILE
   ========================================================================= */

function KpiTile({ icon: Icon, label, value, unit, tone, trend, testid }:
  { icon: typeof Server; label: string; value: string; unit?: string; tone: 'cyan'|'lime'|'amber'|'rose'|'violet'; trend?: string; testid: string; }) {
  const toneMap: Record<string, string> = { cyan:'text-cyan-300', lime:'text-lime-300', amber:'text-amber-300', rose:'text-rose-300', violet:'text-violet-300' };
  const glowMap: Record<string, string> = { cyan:'neon-cyan', lime:'neon-lime', amber:'neon-amber', rose:'neon-rose', violet:'' };
  return (
    <div className={`corners relative glass rounded-sm p-4 ${glowMap[tone]}`} data-testid={testid}>
      <div className="cbr"></div>
      <div className="flex items-start justify-between">
        <div>
          <div className="font-mono text-[10px] tracking-[0.22em] text-white/50 uppercase">{label}</div>
          <div className="mt-3 flex items-baseline gap-1.5">
            <span className={`font-display text-[28px] leading-none font-bold ${toneMap[tone]}`}>{value}</span>
            {unit && <span className="font-mono text-[11px] text-white/50">{unit}</span>}
          </div>
          {trend && <div className="mt-2 font-mono text-[10.5px] text-white/45">{trend}</div>}
        </div>
        <Icon className={`w-5 h-5 ${toneMap[tone]}`} strokeWidth={2}/>
      </div>
    </div>
  );
}

/* =========================================================================
   TWIN CANVAS (frame aware)
   ========================================================================= */

function TwinCanvas({ frame, hovered, setHovered, compact = false }: { frame: number; hovered: string | null; setHovered: (id: string | null) => void; compact?: boolean }) {
  const nodeById = useMemo(() => Object.fromEntries(NODES.map(n => [n.id, n])), []);
  return (
    <div className="corners relative glass rounded-sm overflow-hidden" data-testid="twin-canvas">
      <div className="cbr"></div>
      <div className="flex items-center justify-between px-4 py-3 border-b border-cyan-400/10">
        <div className="flex items-center gap-3">
          <Network className="w-4 h-4 text-cyan-300"/>
          <h3 className="font-display text-[13px] tracking-wider text-white/90">NETWORK DIGITAL TWIN</h3>
          <span className="chip"><CircleDot className="w-2.5 h-2.5 text-lime-300 blink"/>LIVE · F{String(frame).padStart(2,'0')}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {['All','Critical','Targeted','Isolated'].map((f, i) => (
            <button key={f} data-testid={`twin-filter-${f.toLowerCase()}`} className={`px-2.5 py-1 font-mono text-[10.5px] tracking-wider rounded-sm border ${i === 1 ? 'bg-rose-500/15 border-rose-400/40 text-rose-200' : 'border-white/10 text-white/55 hover:text-white'}`}>{f.toUpperCase()}</button>
          ))}
        </div>
      </div>

      <div className={`relative bg-grid overflow-hidden ${compact ? 'h-[520px]' : 'h-[640px]'}`}>
        <div className="absolute inset-x-0 h-24 pointer-events-none scan-line" style={{ background: 'linear-gradient(180deg, transparent, rgba(0,240,255,0.10), transparent)' }}/>
        <div className="absolute -right-24 -top-24 w-80 h-80 rounded-full border border-cyan-400/10 rotate-slow" style={{ background: 'conic-gradient(from 0deg, rgba(0,240,255,0.16), transparent 30%)' }}/>

        <svg viewBox="0 0 820 520" preserveAspectRatio="xMidYMid meet" className="absolute inset-0 w-full h-full" data-testid="twin-svg">
          <defs>
            <linearGradient id="grad-cyan" x1="0" x2="1">
              <stop offset="0%" stopColor="#00F0FF" stopOpacity="0.05"/>
              <stop offset="50%" stopColor="#00F0FF" stopOpacity="0.75"/>
              <stop offset="100%" stopColor="#00F0FF" stopOpacity="0.05"/>
            </linearGradient>
            <linearGradient id="grad-rose" x1="0" x2="1">
              <stop offset="0%" stopColor="#FF2E63" stopOpacity="0.05"/>
              <stop offset="50%" stopColor="#FF2E63" stopOpacity="0.85"/>
              <stop offset="100%" stopColor="#FF2E63" stopOpacity="0.05"/>
            </linearGradient>
          </defs>

          {EDGES.map((e, i) => {
            const visible = edgeVisibleAt(e, frame);
            const a = nodeById[e.from]; const b = nodeById[e.to];
            if (!a || !b) return null;
            const grad = e.malicious ? 'url(#grad-rose)' : 'url(#grad-cyan)';
            const stroke = e.malicious ? '#FF2E63' : e.predicted ? '#7C6BFF' : '#00F0FF';
            const opacity = visible ? 0.35 + e.intensity * 0.5 : 0.06;
            return (
              <g key={i}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={grad} strokeWidth={1 + e.intensity * 2} opacity={opacity}/>
                {(e.malicious || e.predicted) && visible && (
                  <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={stroke} strokeWidth={1.4} strokeDasharray="6 6" className="flow-dash" opacity={0.9}/>
                )}
              </g>
            );
          })}

          {NODES.map(n => {
            const r = riskAtFrame(n, frame);
            const c = RISK_COLOR[r];
            const isHover = hovered === n.id;
            const rad = isHover ? 15 : 12;
            return (
              <g key={n.id} onMouseEnter={() => setHovered(n.id)} onMouseLeave={() => setHovered(null)} style={{ cursor: 'pointer' }} data-testid={`twin-node-${n.id}`}>
                <circle cx={n.x} cy={n.y} r={26} fill={c} opacity={0.10}/>
                {r === 'critical' && <circle cx={n.x} cy={n.y} r={rad + 6} fill="none" stroke={c} strokeWidth={1} className="pulse-ring"/>}
                <circle cx={n.x} cy={n.y} r={rad} fill="#05070C" stroke={c} strokeWidth={1.6}/>
                <circle cx={n.x} cy={n.y} r={4} fill={c}/>
                <text x={n.x} y={n.y + 30} textAnchor="middle" fill="#E9F0FF" fontSize="9.5" fontFamily="JetBrains Mono" opacity={0.72}>{n.label}</text>
                <text x={n.x} y={n.y + 42} textAnchor="middle" fill={c} fontSize="8" fontFamily="JetBrains Mono" opacity={0.55}>{n.ip}</text>
              </g>
            );
          })}
        </svg>

        {hovered && nodeById[hovered] && (
          <div className="absolute top-3 left-3 glass rounded-sm p-3 w-[260px]" data-testid="twin-hover-inspector">
            {(() => {
              const n = nodeById[hovered];
              const Icon = KIND_ICON[n.kind];
              const r = riskAtFrame(n, frame);
              return (
                <>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2"><Icon className="w-4 h-4" style={{ color: RISK_COLOR[r] }}/><span className="font-display text-[12.5px] tracking-wide text-white">{n.label}</span></div>
                    <span className="chip" style={{ borderColor: RISK_COLOR[r], color: RISK_COLOR[r] }}>{r.toUpperCase()}</span>
                  </div>
                  <div className="mt-2 font-mono text-[10.5px] text-white/60 space-y-0.5">
                    <div>ID   {n.id}</div><div>IP   {n.ip}</div><div>TIER {n.tier}</div><div>KIND {n.kind}</div>
                  </div>
                </>
              );
            })()}
          </div>
        )}

        <div className="absolute bottom-3 left-3 glass rounded-sm px-3 py-2 flex items-center gap-4 flex-wrap">
          {(['safe','watch','warn','critical'] as Risk[]).map(r => (
            <div key={r} className="flex items-center gap-1.5 font-mono text-[10px] text-white/60 uppercase"><span className="w-2 h-2 rounded-full" style={{ background: RISK_COLOR[r] }}/>{r}</div>
          ))}
          <div className="pl-3 ml-1 border-l border-white/10 flex items-center gap-2 font-mono text-[10px] text-white/60 uppercase">
            <span className="w-4 h-[2px] bg-rose-400"/>Malicious <span className="w-4 h-[2px] bg-violet-400 ml-2"/>Predicted
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   FORECAST RAIL / KILLCHAIN
   ========================================================================= */

function useForecastAt(frame: number) {
  return useMemo(() => STAGES.map(s => ({
    ...s,
    prob: stageProbAt(s.activateAt, s.target, frame),
    done: stageDoneAt(s.activateAt, frame),
    eta: (() => {
      const remaining = Math.max(0, (s.activateAt + 4) - frame) * 12;
      return remaining > 0 ? `${Math.floor(remaining/60).toString().padStart(2,'0')}:${(remaining%60).toString().padStart(2,'0')}` : null;
    })(),
  })), [frame]);
}

function ForecastRail({ frame }: { frame: number }) {
  const stages = useForecastAt(frame);
  const targets = useMemo(() => [
    { host: 'db-01 (PII Database)',   pct: stageProbAt(16, 0.78, frame), eta: `${Math.max(0, 22 - frame)} min`, color: '#FF2E63' },
    { host: 'srv-01 (SMB Fileserver)',pct: stageProbAt(10, 0.61, frame), eta: `${Math.max(0, 14 - frame)} min`, color: '#FFAA00' },
    { host: 'cld-01 (S3 Backup)',     pct: stageProbAt(22, 0.34, frame), eta: `${Math.max(0, 38 - frame)} min`, color: '#7C6BFF' },
  ], [frame]);
  const lead = Math.max(0, (22 - frame)) * 60;
  const leadStr = `${Math.floor(lead / 60).toString().padStart(2,'0')}:${(lead % 60).toString().padStart(2,'0')}`;

  return (
    <div className="corners relative glass rounded-sm p-4" data-testid="forecast-rail">
      <div className="cbr"></div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2"><TrendingUp className="w-4 h-4 text-violet-300"/><h3 className="font-display text-[13px] tracking-wider text-white/90">ATTACK FORECAST</h3></div>
        <span className="chip" style={{ color: '#FFAA00', borderColor: 'rgba(255,170,0,0.35)' }}><AlertTriangle className="w-2.5 h-2.5"/>LEAD {leadStr}</span>
      </div>

      <div className="space-y-1.5">
        {stages.map((s) => (
          <div key={s.stage} data-testid={`kc-${s.stage.replace(/\s/g, '-').toLowerCase()}`}>
            <div className="flex items-center justify-between mb-0.5">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.color, opacity: s.prob > 0.1 ? 1 : 0.35 }}/>
                <span className="font-mono text-[11px] text-white/75">{s.stage}</span>
                {s.done && <span className="font-mono text-[9px] text-lime-300/80">✓ observed</span>}
              </div>
              <span className="font-mono text-[11px] font-bold" style={{ color: s.color, opacity: s.prob > 0.05 ? 1 : 0.4 }}>{(s.prob * 100).toFixed(0)}%</span>
            </div>
            <div className="h-[6px] bg-white/[0.04] rounded-sm overflow-hidden border border-white/5">
              <div className="h-full" style={{ width: `${s.prob * 100}%`, background: `linear-gradient(90deg, transparent, ${s.color})`, transition: 'width 300ms cubic-bezier(0.16,1,0.3,1)' }}/>
            </div>
            {s.eta && <div className="mt-0.5 font-mono text-[9.5px] text-white/40">ETA {s.eta} · {(s.prob * 100).toFixed(0)}% conf</div>}
          </div>
        ))}
      </div>

      <div className="mt-4 pt-3 border-t border-white/5">
        <div className="font-mono text-[10px] tracking-[0.22em] text-white/45 uppercase mb-2">Predicted Next Targets</div>
        {targets.map((t) => (
          <div key={t.host} className="flex items-center justify-between py-1.5" data-testid={`target-${t.host.split(' ')[0]}`}>
            <div className="flex items-center gap-2"><Target className="w-3 h-3" style={{ color: t.color }}/><span className="font-mono text-[11px] text-white/85">{t.host}</span></div>
            <div className="flex items-center gap-2"><span className="font-mono text-[11px] font-bold" style={{ color: t.color, opacity: t.pct > 0.05 ? 1 : 0.3 }}>{(t.pct * 100).toFixed(0)}%</span><span className="font-mono text-[9.5px] text-white/40">{t.eta}</span></div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* =========================================================================
   MITRE
   ========================================================================= */

function MitreMatrix({ frame }: { frame: number }) {
  return (
    <div className="corners relative glass rounded-sm p-4" data-testid="mitre-panel">
      <div className="cbr"></div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2"><ScanEye className="w-4 h-4 text-cyan-300"/><h3 className="font-display text-[13px] tracking-wider text-white/90">MITRE ATT&CK MAPPING</h3></div>
        <span className="chip">v13.1 · 8 tactics · 12 techniques</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {MITRE_MATRIX.map((col) => (
          <div key={col.tactic} className="rounded-sm border border-white/5 bg-white/[0.015] p-2">
            <div className="font-mono text-[9.5px] tracking-[0.16em] text-cyan-300/70 uppercase mb-2">{col.tactic}</div>
            <div className="space-y-1.5">
              {col.techniques.map((t) => {
                const active = frame >= t.activeAt;
                const conf = active ? t.conf : 0;
                return (
                  <div key={t.id} data-testid={`mitre-${t.id}`} className="rounded-sm border p-1.5"
                    style={{
                      borderColor: !active ? 'rgba(255,255,255,0.06)' : t.conf > 0.75 ? 'rgba(255,46,99,0.5)' : t.conf > 0.5 ? 'rgba(255,170,0,0.4)' : 'rgba(0,240,255,0.25)',
                      background: !active ? 'rgba(255,255,255,0.008)' : t.conf > 0.75 ? 'rgba(255,46,99,0.06)' : t.conf > 0.5 ? 'rgba(255,170,0,0.05)' : 'rgba(0,240,255,0.04)',
                      opacity: active ? 1 : 0.4,
                    }}>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[9.5px] text-white/75">{t.id}</span>
                      <span className="font-mono text-[9.5px] font-bold" style={{ color: !active ? '#4A536B' : t.conf > 0.75 ? '#FF6B8B' : t.conf > 0.5 ? '#FFC66B' : '#7DE6F3' }}>{(conf * 100).toFixed(0)}%</span>
                    </div>
                    <div className="text-[11px] text-white/85 leading-tight">{t.name}</div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* =========================================================================
   XAI
   ========================================================================= */

function XaiPanel({ frame }: { frame: number }) {
  const active = XAI_SIGNALS_BASE.filter(s => frame >= s.activeAt);
  const displayed = active.length ? active : XAI_SIGNALS_BASE.slice(0, 1).map(s => ({ ...s, weight: 0.01 }));
  const max = Math.max(...displayed.map(s => s.weight));
  return (
    <div className="corners relative glass rounded-sm p-4" data-testid="xai-panel">
      <div className="cbr"></div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2"><BrainCircuit className="w-4 h-4 text-lime-300"/><h3 className="font-display text-[13px] tracking-wider text-white/90">EXPLAINABLE AI · EVIDENCE</h3></div>
        <span className="chip"><Eye className="w-2.5 h-2.5"/>SHAP · 80 FEAT</span>
      </div>
      <p className="text-[11.5px] text-white/55 mb-3 leading-relaxed">Contribution of behavioral signals at frame F{String(frame).padStart(2,'0')}. Copy evidence to attach to SOC incident.</p>
      <div className="space-y-2">
        {displayed.map((s, i) => {
          const w = (s.weight / max) * 100;
          return (
            <div key={i} data-testid={`xai-signal-${i}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 min-w-0">
                  {s.dir === 'up' ? <ArrowRight className="w-3 h-3 text-rose-300 rotate-[-45deg]"/> : <ArrowRight className="w-3 h-3 text-lime-300 rotate-[45deg]"/>}
                  <span className="font-mono text-[11px] text-white/85 truncate">{s.name}</span>
                </div>
                <span className="font-mono text-[11px] font-bold text-white/90">{s.weight.toFixed(2)}</span>
              </div>
              <div className="mt-1 h-[6px] bg-white/[0.04] rounded-sm overflow-hidden">
                <div className="h-full" style={{ width: `${w}%`, background: s.dir === 'up' ? 'linear-gradient(90deg, rgba(255,46,99,0.25), #FF2E63)' : 'linear-gradient(90deg, rgba(182,255,61,0.25), #B6FF3D)', transition: 'width 300ms ease' }}/>
              </div>
              <div className="mt-0.5 font-mono text-[9.5px] text-white/40">{s.context}</div>
            </div>
          );
        })}
      </div>
      <button className="btn-tactical mt-4 w-full" data-testid="btn-copy-evidence"><span className="flex items-center justify-center gap-1.5"><ChevronsRight className="w-3.5 h-3.5"/>COPY EVIDENCE TO INCIDENT</span></button>
    </div>
  );
}

/* =========================================================================
   SIMULATION
   ========================================================================= */

function SimulationPanel({ frame }: { frame: number }) {
  const [active, setActive] = useState<Record<string, boolean>>({ 'isolate-ad-01': true });
  const delta = MITIGATIONS.filter(m => active[m.id]).reduce((s, m) => s + m.delta, 0);
  const baseline = stageProbAt(16, 0.78, frame);
  const newRisk = Math.max(0.02, baseline + delta / 100);
  return (
    <div className="corners relative glass rounded-sm p-4" data-testid="sim-panel">
      <div className="cbr"></div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-violet-300"/><h3 className="font-display text-[13px] tracking-wider text-white/90">WHAT-IF DEFENSE SIMULATION</h3></div>
        <span className="chip"><Waves className="w-2.5 h-2.5 text-violet-300"/>SANDBOX · F{String(frame).padStart(2,'0')}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-sm border border-white/5 p-3">
          <div className="font-mono text-[9.5px] tracking-[0.2em] text-white/45 uppercase">Baseline Risk</div>
          <div className="mt-1 font-display text-[26px] font-bold text-rose-300">{(baseline * 100).toFixed(0)}<span className="text-[13px] text-white/40">%</span></div>
          <div className="font-mono text-[10px] text-white/40">db-01 · lead {Math.max(0, 22 - frame)} min</div>
        </div>
        <div className="rounded-sm border p-3 relative overflow-hidden" style={{ borderColor: newRisk < 0.35 ? 'rgba(182,255,61,0.45)' : 'rgba(255,170,0,0.4)' }}>
          <div className="font-mono text-[9.5px] tracking-[0.2em] text-white/45 uppercase">After Mitigation</div>
          <div className="mt-1 font-display text-[26px] font-bold" style={{ color: newRisk < 0.35 ? '#B6FF3D' : '#FFC66B' }}>{(newRisk * 100).toFixed(0)}<span className="text-[13px] text-white/40">%</span></div>
          <div className="font-mono text-[10px] text-white/40">Δ {delta}% risk reduction</div>
        </div>
      </div>
      <div className="space-y-1.5">
        {MITIGATIONS.map(m => {
          const on = !!active[m.id]; const Icon = m.icon;
          return (
            <button key={m.id} data-testid={`sim-toggle-${m.id}`} onClick={() => setActive(a => ({ ...a, [m.id]: !on }))}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-sm border text-left ${on ? 'bg-lime-300/8 border-lime-300/40' : 'border-white/8 hover:border-cyan-400/25 hover:bg-cyan-400/5'}`}>
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={`w-6 h-6 shrink-0 rounded-sm flex items-center justify-center ${on ? 'bg-lime-300/15 text-lime-300' : 'bg-white/5 text-white/60'}`}><Icon className="w-3.5 h-3.5"/></div>
                <span className={`text-[12px] ${on ? 'text-white' : 'text-white/70'}`}>{m.label}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`font-mono text-[10.5px] font-bold ${on ? 'text-lime-300' : 'text-white/40'}`}>{m.delta}%</span>
                <span className={`w-8 h-4 rounded-full relative ${on ? 'bg-lime-300/40' : 'bg-white/10'}`}>
                  <span className="absolute top-0.5 w-3 h-3 rounded-full bg-white" style={{ left: on ? '18px' : '2px', transition: 'left 200ms cubic-bezier(0.16, 1, 0.3, 1)' }}/>
                </span>
              </div>
            </button>
          );
        })}
      </div>
      <button className="btn-tactical primary mt-4 w-full" data-testid="btn-rerun-sim"><span className="flex items-center justify-center gap-1.5"><Zap className="w-3.5 h-3.5"/>RERUN FORECAST WITH DEFENSE</span></button>
    </div>
  );
}

/* =========================================================================
   TERMINAL — event lines tied to frame progression
   ========================================================================= */

function LiveTerminal({ frame }: { frame: number }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lines = useMemo(() => {
    const seed = [
      { at: 0,  tag: 'MODEL',    color: 'cyan',   text: 'Temporal model checkpoint tw-v3.4.1 loaded (80 features)' },
      { at: 1,  tag: 'PREDICT',  color: 'lime',   text: 'Twin sync 12,480 nodes · 42,110 edges committed' },
      { at: 3,  tag: 'ANOMALY',  color: 'amber',  text: 'Novel ASN AS205100 first-seen on vpn-01 tunnel' },
      { at: 5,  tag: 'MITRE',    color: 'violet', text: 'T1078 Valid Accounts observed on vpn-01' },
      { at: 6,  tag: 'FORECAST', color: 'cyan',   text: 'Path prob vpn-01 -> ad-01 = 0.42 (rising)' },
      { at: 8,  tag: 'ANOMALY',  color: 'amber',  text: 'Kerberos SPN request burst on ad-01 (11/60s)' },
      { at: 10, tag: 'MITRE',    color: 'violet', text: 'T1059 Command & Scripting matched on ad-01' },
      { at: 11, tag: 'ANOMALY',  color: 'amber',  text: 'SMB burst detected srv-01 <- ad-01 (6.4x baseline)' },
      { at: 12, tag: 'FORECAST', color: 'cyan',   text: 'Attack path predicted ad-01 -> srv-01 -> db-01 (p=0.61)' },
      { at: 14, tag: 'DEFEND',   color: 'lime',   text: 'Recommendation: isolate ad-01 (est. delta -47%)' },
      { at: 15, tag: 'ANOMALY',  color: 'amber',  text: 'svc_backup_legacy activated after 214d dormant window' },
      { at: 16, tag: 'CRITICAL', color: 'rose',   text: 'db-01 (Crown Jewel) elevated to CRITICAL — lead 6 min' },
      { at: 18, tag: 'ATTACK',   color: 'rose',   text: 'Lateral pivot ad-01 -> srv-01 -> ws-02 confirmed' },
      { at: 20, tag: 'MITRE',    color: 'violet', text: 'T1021 Remote Services (SMB) mapped conf=0.47' },
      { at: 22, tag: 'MITRE',    color: 'violet', text: 'T1558 Kerberoasting mapped conf=0.58 on ad-01' },
      { at: 24, tag: 'CRITICAL', color: 'rose',   text: 'Predicted exfil path db-01 -> cld-01 (S3) p=0.34' },
      { at: 26, tag: 'ATTACK',   color: 'rose',   text: 'C2 beaconing signature match on outbound cld-01' },
      { at: 28, tag: 'DEFEND',   color: 'lime',   text: 'Auto-suggested playbook: isolate + patch + block-445' },
    ];
    return seed.filter(l => l.at <= frame).map(l => ({ ...l, t: (l.at * 0.12).toFixed(3) }));
  }, [frame]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [lines]);
  const colorMap: Record<string, string> = { cyan:'#00F0FF', lime:'#B6FF3D', amber:'#FFAA00', rose:'#FF2E63', violet:'#7C6BFF' };

  return (
    <div className="corners relative rounded-sm border border-cyan-400/15 bg-[#070A14]" data-testid="terminal">
      <div className="cbr"></div>
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5">
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-lime-300"/>
          <span className="font-display text-[12px] tracking-widest text-white/85">LIVE EVENT STREAM</span>
          <span className="chip"><CircleDot className="w-2 h-2 text-lime-300 blink"/>tail -f twin.jsonl @ F{String(frame).padStart(2,'0')}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {['ALL','ANOMALY','ATTACK','FORECAST','DEFEND'].map((f, i) => (
            <button key={f} className={`px-2 py-0.5 font-mono text-[9.5px] tracking-wider rounded-sm border ${i === 0 ? 'bg-cyan-400/10 border-cyan-400/40 text-cyan-200' : 'border-white/8 text-white/50'}`} data-testid={`term-filter-${f.toLowerCase()}`}>{f}</button>
          ))}
        </div>
      </div>
      <div ref={scrollRef} className="h-[240px] overflow-y-auto p-3 font-mono text-[11.5px] leading-relaxed">
        {lines.length === 0 && <div className="text-white/30">// awaiting activity...</div>}
        {lines.map((l, i) => (
          <div key={i} className="flex gap-3 rise-in">
            <span className="text-white/30 shrink-0">{l.t}</span>
            <span className="shrink-0 font-bold" style={{ color: colorMap[l.color] }}>[{l.tag.padEnd(8)}]</span>
            <span className="text-white/80">{l.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* =========================================================================
   ROADMAP + SEGMENTS
   ========================================================================= */

function RoadmapStrip() {
  const items = [
    { phase: 'PHASE 1', title: 'Twin Graph & Hackathon Prototype', status: 'shipped', color: '#B6FF3D' },
    { phase: 'PHASE 2', title: 'Predictive XAI Engine & MITRE Layer', status: 'active', color: '#00F0FF' },
    { phase: 'PHASE 3', title: 'Autonomous Remediation Playbooks', status: 'next', color: '#7C6BFF' },
    { phase: 'PHASE 4', title: 'SOAR Integration · MSSP Multi-tenant', status: 'planned', color: '#FFAA00' },
  ];
  return (
    <div className="corners relative glass rounded-sm p-4" data-testid="roadmap-strip">
      <div className="cbr"></div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2"><GitBranch className="w-4 h-4 text-cyan-300"/><h3 className="font-display text-[13px] tracking-wider text-white/90">COMMERCIALIZATION ROADMAP</h3></div>
        <span className="chip">Predictive Intelligence Layer for Modern SecOps</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {items.map((r) => (
          <div key={r.phase} className="rounded-sm p-3 border border-white/5 relative overflow-hidden" data-testid={`roadmap-${r.phase.replace(' ', '-').toLowerCase()}`}>
            <div className="absolute top-0 left-0 h-full w-[3px]" style={{ background: r.color }}/>
            <div className="font-mono text-[10px] tracking-[0.22em] text-white/50">{r.phase}</div>
            <div className="mt-1 text-[13px] text-white/90 font-medium">{r.title}</div>
            <div className="mt-2 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full" style={{ background: r.color }}/><span className="font-mono text-[10px] tracking-wider uppercase" style={{ color: r.color }}>{r.status}</span></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TargetSegments() {
  const segs = [
    { icon: Radar,    label: 'SOC Analysts',        detail: 'Prioritise evolving threats · lead time' },
    { icon: Layers,   label: 'CISO / Risk Officers',detail: 'Board-ready predictive posture reports' },
    { icon: Zap,      label: 'Red & Blue Teams',    detail: 'Replay attacks · train on twin fidelity' },
    { icon: Globe,    label: 'MSSP Providers',      detail: 'Multi-tenant, prioritised triage' },
  ];
  return (
    <div className="corners relative glass rounded-sm p-4" data-testid="segments-panel">
      <div className="cbr"></div>
      <div className="flex items-center gap-2 mb-3"><User className="w-4 h-4 text-cyan-300"/><h3 className="font-display text-[13px] tracking-wider text-white/90">TARGET SEGMENTS</h3></div>
      <div className="grid grid-cols-2 gap-2">
        {segs.map(s => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="rounded-sm border border-white/5 p-3 hover:border-cyan-400/30" data-testid={`segment-${s.label.replace(/\s|\//g, '-').toLowerCase()}`}>
              <Icon className="w-4 h-4 text-cyan-300 mb-2"/>
              <div className="text-[12px] text-white/90 font-medium leading-tight">{s.label}</div>
              <div className="font-mono text-[10px] text-white/45 mt-1">{s.detail}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* =========================================================================
   SECTION HEADER
   ========================================================================= */

function SectionHead({ nav, setNav, frame }: { nav: NavId; setNav: (n: NavId) => void; frame: number }) {
  const meta: Record<NavId, { title: string; sub: string; icon: typeof Server; tone: string }> = {
    overview: { title: 'Command Overview',   sub: 'Full situational picture across the predictive stack', icon: Radar,        tone: '#00F0FF' },
    twin:     { title: 'Digital Twin',       sub: 'Continuously synchronised graph of hosts, flows and risk', icon: Network, tone: '#00F0FF' },
    forecast: { title: 'Attack Forecast',    sub: 'Kill-chain probability trajectory across the MITRE lifecycle', icon: TrendingUp, tone: '#7C6BFF' },
    xai:      { title: 'Explainable AI',     sub: 'Behavioural evidence and feature contributions behind each prediction', icon: BrainCircuit, tone: '#B6FF3D' },
    mitre:    { title: 'MITRE ATT&CK',       sub: 'Observed & predicted techniques mapped to v13.1', icon: ScanEye,     tone: '#00F0FF' },
    simulate: { title: 'What-if Simulate',   sub: 'Test mitigations virtually before touching production', icon: Sparkles, tone: '#7C6BFF' },
    reports:  { title: 'Reports',            sub: 'Board-ready posture reports and incident bundles', icon: FileText,    tone: '#FFAA00' },
    settings: { title: 'Settings',           sub: 'Sensors, integrations, and model preferences', icon: Settings,        tone: '#FFAA00' },
  };
  const m = meta[nav];
  const Icon = m.icon;
  const order: NavId[] = ['overview','twin','forecast','xai','mitre','simulate','reports','settings'];
  const idx = order.indexOf(nav);
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3 rise-in" data-testid="section-head">
      <div>
        <div className="flex items-center gap-2 font-mono text-[10.5px] tracking-[0.3em] text-cyan-300/70 uppercase">
          <Radio className="w-3 h-3 blink text-lime-300"/> Predictive Command Centre · Session ω-7742 · F{String(frame).padStart(2,'0')}
        </div>
        <h1 className="mt-2 font-display text-[30px] lg:text-[38px] leading-[1.05] font-bold tracking-tight text-white flex items-center gap-3">
          <Icon className="w-8 h-8" style={{ color: m.tone }}/>
          {m.title}
        </h1>
        <p className="mt-2 max-w-[640px] text-[13px] text-white/55 leading-relaxed">{m.sub}</p>
      </div>
      <div className="flex items-center gap-2">
        <button className="btn-tactical" onClick={() => setNav(order[Math.max(0, idx - 1)])} data-testid="btn-prev-room"><span className="flex items-center gap-1.5"><ChevronLeft className="w-3.5 h-3.5"/>PREV</span></button>
        <button className="btn-tactical" onClick={() => setNav(order[Math.min(order.length - 1, idx + 1)])} data-testid="btn-next-room"><span className="flex items-center gap-1.5">NEXT<ChevronRight className="w-3.5 h-3.5"/></span></button>
      </div>
    </div>
  );
}

/* =========================================================================
   SECTION ROOMS
   ========================================================================= */

function KpiRow({ frame }: { frame: number }) {
  const stages = useForecastAt(frame);
  const activeThreats = Math.min(3, Math.floor(frame / 8));
  const conf = 90 + Math.min(6, frame * 0.3);
  const lead = Math.max(0, (22 - frame)) * 60;
  const leadStr = `${Math.floor(lead / 60).toString().padStart(2,'0')}:${(lead % 60).toString().padStart(2,'0')}`;
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5" data-testid="kpi-row">
      <KpiTile icon={ShieldAlert} label="Active Threat Vectors"  value={String(activeThreats)}       tone="rose"   trend={`↑ ${activeThreats} · last 15 min`} testid="kpi-threats"/>
      <KpiTile icon={LineChart}   label="Forecast Confidence"    value={conf.toFixed(1)}             unit="%" tone="lime"   trend="tw-v3.4.1 · 80 features" testid="kpi-confidence"/>
      <KpiTile icon={Clock}       label="Mean Lead Time"         value={leadStr}                     tone="cyan"   trend="Δ vs SIEM +8:42"         testid="kpi-leadtime"/>
      <KpiTile icon={Network}     label="Twin Nodes Synced"      value="12,480"                       tone="violet" trend={`${stages.filter(s => s.done).length}/8 stages observed`} testid="kpi-nodes"/>
    </div>
  );
}

function OverviewRoom({ frame, hovered, setHovered }: { frame: number; hovered: string | null; setHovered: (s: string | null) => void }) {
  return (
    <>
      <KpiRow frame={frame}/>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 mb-5">
        <div className="xl:col-span-2 min-w-0"><TwinCanvas frame={frame} hovered={hovered} setHovered={setHovered}/></div>
        <div className="min-w-0"><ForecastRail frame={frame}/></div>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 mb-5">
        <div className="xl:col-span-2 min-w-0"><MitreMatrix frame={frame}/></div>
        <div className="min-w-0"><XaiPanel frame={frame}/></div>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 mb-5">
        <div className="xl:col-span-2 min-w-0"><SimulationPanel frame={frame}/></div>
        <div className="min-w-0"><TargetSegments/></div>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 min-w-0"><LiveTerminal frame={frame}/></div>
        <div className="min-w-0"><RoadmapStrip/></div>
      </div>
    </>
  );
}

function TwinRoom({ frame, hovered, setHovered }: { frame: number; hovered: string | null; setHovered: (s: string | null) => void }) {
  const criticals = NODES.filter(n => riskAtFrame(n, frame) === 'critical').length;
  const warns = NODES.filter(n => riskAtFrame(n, frame) === 'warn').length;
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <KpiTile icon={Network}     label="Nodes Tracked"  value="12,480" tone="cyan"   trend="42,110 edges" testid="kpi-nodes-twin"/>
        <KpiTile icon={ShieldAlert} label="Critical Nodes" value={String(criticals)} tone="rose" trend="Crown jewels at risk" testid="kpi-critical-nodes"/>
        <KpiTile icon={AlertTriangle} label="Warn Nodes"   value={String(warns)}     tone="amber" trend="Elevated observation" testid="kpi-warn-nodes"/>
        <KpiTile icon={ShieldCheck} label="Twin Fidelity"  value="99.4" unit="%"     tone="lime"  trend="drift < 0.02 rmse" testid="kpi-fidelity"/>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 min-w-0"><TwinCanvas frame={frame} hovered={hovered} setHovered={setHovered}/></div>
        <div className="min-w-0 flex flex-col gap-5">
          <div className="corners relative glass rounded-sm p-4" data-testid="tier-breakdown">
            <div className="cbr"></div>
            <div className="flex items-center gap-2 mb-3"><Layers className="w-4 h-4 text-cyan-300"/><h3 className="font-display text-[13px] tracking-wider text-white/90">TIER BREAKDOWN</h3></div>
            {Array.from(new Set(NODES.map(n => n.tier))).map(tier => {
              const list = NODES.filter(n => n.tier === tier);
              return (
                <div key={tier} className="py-2 border-b border-white/5 last:border-b-0">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10.5px] tracking-wider text-white/60 uppercase">{tier}</span>
                    <span className="font-mono text-[10.5px] text-cyan-300">{list.length}</span>
                  </div>
                  <div className="mt-1 flex gap-1">
                    {list.map(n => (<span key={n.id} className="h-1.5 flex-1 rounded-sm" style={{ background: RISK_COLOR[riskAtFrame(n, frame)] }}/>))}
                  </div>
                </div>
              );
            })}
          </div>
          <LiveTerminal frame={frame}/>
        </div>
      </div>
    </>
  );
}

function ForecastRoom({ frame }: { frame: number }) {
  const stages = useForecastAt(frame);
  return (
    <>
      <KpiRow frame={frame}/>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 mb-5">
        <div className="xl:col-span-2 corners relative glass rounded-sm p-4" data-testid="killchain-timeline">
          <div className="cbr"></div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2"><BarChart3 className="w-4 h-4 text-violet-300"/><h3 className="font-display text-[13px] tracking-wider text-white/90">KILL-CHAIN PROBABILITY TRAJECTORY</h3></div>
            <span className="chip">Frame F{String(frame).padStart(2,'0')} · {FRAME_COUNT} total</span>
          </div>
          <div className="space-y-3">
            {stages.map(s => (
              <div key={s.stage} className="grid grid-cols-[140px_1fr_60px] gap-3 items-center">
                <div className="font-mono text-[11px] text-white/80">{s.stage}</div>
                <div className="h-3 bg-white/[0.04] rounded-sm relative overflow-hidden border border-white/5">
                  {/* full ramp indication */}
                  <div className="absolute inset-y-0 rounded-sm" style={{ left: `${(s.activateAt / (FRAME_COUNT - 1)) * 100}%`, width: `${(4 / (FRAME_COUNT - 1)) * 100}%`, background: `${s.color}20` }}/>
                  <div className="absolute inset-y-0 left-0" style={{ width: `${s.prob * 100}%`, background: `linear-gradient(90deg, transparent, ${s.color})`, transition: 'width 300ms cubic-bezier(0.16,1,0.3,1)' }}/>
                  {/* frame marker */}
                  <div className="absolute top-0 bottom-0 w-[2px] bg-white" style={{ left: `${(frame / (FRAME_COUNT - 1)) * 100}%`, opacity: 0.7 }}/>
                </div>
                <div className="font-mono text-[11px] font-bold text-right" style={{ color: s.color }}>{(s.prob * 100).toFixed(0)}%</div>
              </div>
            ))}
          </div>
        </div>
        <div className="min-w-0"><ForecastRail frame={frame}/></div>
      </div>
      <LiveTerminal frame={frame}/>
    </>
  );
}

function XaiRoom({ frame }: { frame: number }) {
  return (
    <>
      <KpiRow frame={frame}/>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-5">
        <XaiPanel frame={frame}/>
        <div className="corners relative glass rounded-sm p-4" data-testid="reasoning-panel">
          <div className="cbr"></div>
          <div className="flex items-center gap-2 mb-3"><BrainCircuit className="w-4 h-4 text-lime-300"/><h3 className="font-display text-[13px] tracking-wider text-white/90">AI REASONING NARRATIVE</h3></div>
          <div className="space-y-3 text-[12.5px] text-white/75 leading-relaxed">
            <p>At <span className="font-mono text-cyan-300">F{String(frame).padStart(2,'0')}</span>, temporal model <span className="font-mono text-cyan-300">tw-v3.4.1</span> observed a shift in behaviour on the identity tier.</p>
            <p className="pl-3 border-l-2 border-lime-300/40">Primary contributor: <span className="text-white">SMB volume from ad-01 to srv-01</span> at 6.4× baseline. This coincides with elevated Kerberos SPN requests suggesting service ticket enumeration.</p>
            <p className="pl-3 border-l-2 border-amber-300/40">Secondary contributor: a <span className="text-white">novel ASN</span> on the vpn-01 tunnel matches a first-seen window, corroborated by activation of a dormant service account.</p>
            <p className="pl-3 border-l-2 border-rose-300/40">Model projects an attack path via <span className="text-white">ad-01 → srv-01 → db-01</span> with predicted lead time of <span className="font-mono text-rose-300">{Math.max(0, 22 - frame)} min</span>.</p>
          </div>
        </div>
      </div>
      <LiveTerminal frame={frame}/>
    </>
  );
}

function MitreRoom({ frame }: { frame: number }) {
  const flat = MITRE_MATRIX.flatMap(c => c.techniques.map(t => ({ tactic: c.tactic, ...t })));
  return (
    <>
      <KpiRow frame={frame}/>
      <MitreMatrix frame={frame}/>
      <div className="corners relative glass rounded-sm p-4 mt-5" data-testid="technique-list">
        <div className="cbr"></div>
        <div className="flex items-center gap-2 mb-3"><ScanEye className="w-4 h-4 text-cyan-300"/><h3 className="font-display text-[13px] tracking-wider text-white/90">TECHNIQUES OBSERVED / PREDICTED</h3></div>
        <div className="grid grid-cols-[70px_140px_1fr_80px_100px] font-mono text-[9.5px] tracking-[0.16em] uppercase text-white/45 border-b border-white/5 pb-2 mb-1">
          <span>ID</span><span>Tactic</span><span>Technique</span><span>Conf</span><span>Status</span>
        </div>
        {flat.map(t => {
          const active = frame >= t.activeAt;
          return (
            <div key={t.id} className="grid grid-cols-[70px_140px_1fr_80px_100px] py-1.5 border-b border-white/5 last:border-b-0 items-center" style={{ opacity: active ? 1 : 0.4 }}>
              <span className="font-mono text-[11px] text-white/85">{t.id}</span>
              <span className="font-mono text-[10.5px] text-cyan-300/80">{t.tactic}</span>
              <span className="text-[12px] text-white/90">{t.name}</span>
              <span className="font-mono text-[11px] font-bold" style={{ color: active ? (t.conf > 0.75 ? '#FF6B8B' : t.conf > 0.5 ? '#FFC66B' : '#7DE6F3') : '#4A536B' }}>{(active ? t.conf * 100 : 0).toFixed(0)}%</span>
              <span className="font-mono text-[10px] tracking-wider uppercase" style={{ color: active ? '#B6FF3D' : '#4A536B' }}>{active ? 'OBSERVED' : 'AWAITING'}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}

function SimulateRoom({ frame, hovered, setHovered }: { frame: number; hovered: string | null; setHovered: (s: string | null) => void }) {
  return (
    <>
      <KpiRow frame={frame}/>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-5">
        <SimulationPanel frame={frame}/>
        <div className="min-w-0"><TwinCanvas frame={frame} hovered={hovered} setHovered={setHovered} compact/></div>
      </div>
      <LiveTerminal frame={frame}/>
    </>
  );
}

function ReportsRoom({ frame }: { frame: number }) {
  const items = [
    { name: 'Weekly Posture Report — CyberWorld AI',       date: '2026-01-08', pages: 12, kind: 'PDF' },
    { name: 'Incident Bundle · ω-7742 (in progress)',      date: '2026-01-09', pages: 8,  kind: 'ZIP' },
    { name: 'MITRE Coverage Snapshot v13.1',               date: '2026-01-05', pages: 4,  kind: 'PDF' },
    { name: 'Executive Dashboard — Board Readout',         date: '2026-01-01', pages: 3,  kind: 'PDF' },
  ];
  return (
    <>
      <KpiRow frame={frame}/>
      <div className="corners relative glass rounded-sm p-4 mb-5" data-testid="reports-list">
        <div className="cbr"></div>
        <div className="flex items-center gap-2 mb-3"><FileText className="w-4 h-4 text-amber-300"/><h3 className="font-display text-[13px] tracking-wider text-white/90">GENERATED REPORTS</h3></div>
        {items.map((it, i) => (
          <div key={i} className="flex items-center justify-between py-2.5 border-b border-white/5 last:border-b-0">
            <div>
              <div className="text-[13px] text-white/90">{it.name}</div>
              <div className="font-mono text-[10.5px] text-white/40 mt-0.5">{it.date} · {it.pages} pages · {it.kind}</div>
            </div>
            <button className="btn-tactical !py-1.5"><span className="flex items-center gap-1.5"><Download className="w-3.5 h-3.5"/>EXPORT</span></button>
          </div>
        ))}
      </div>
    </>
  );
}

function SettingsRoom({ frame }: { frame: number }) {
  return (
    <>
      <KpiRow frame={frame}/>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className="corners relative glass rounded-sm p-4">
          <div className="cbr"></div>
          <div className="flex items-center gap-2 mb-3"><Settings className="w-4 h-4 text-amber-300"/><h3 className="font-display text-[13px] tracking-wider text-white/90">SENSOR SOURCES</h3></div>
          {['NetFlow · pcap ingest', 'Zeek logs (bro)', 'Windows event forwarders', 'AWS VPC flow logs', 'K8s audit stream'].map((s, i) => (
            <div key={i} className="flex items-center justify-between py-2 border-b border-white/5 last:border-b-0">
              <span className="text-[12.5px] text-white/85">{s}</span>
              <span className="chip"><CircleDot className="w-2 h-2 text-lime-300 blink"/>ACTIVE</span>
            </div>
          ))}
        </div>
        <div className="corners relative glass rounded-sm p-4">
          <div className="cbr"></div>
          <div className="flex items-center gap-2 mb-3"><BrainCircuit className="w-4 h-4 text-cyan-300"/><h3 className="font-display text-[13px] tracking-wider text-white/90">MODEL PREFERENCES</h3></div>
          {[
            { k: 'Temporal window',    v: '5 frames EWMA' },
            { k: 'Threshold',          v: '0.45' },
            { k: 'Feature schema',     v: 'phase03-v1-sealed' },
            { k: 'Seed',               v: '42' },
            { k: 'Explanation method', v: 'SHAP · 80 features' },
          ].map((r) => (
            <div key={r.k} className="flex items-center justify-between py-2 border-b border-white/5 last:border-b-0">
              <span className="text-[12.5px] text-white/70">{r.k}</span>
              <span className="font-mono text-[11px] text-cyan-300">{r.v}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/* =========================================================================
   APP
   ========================================================================= */

function App() {
  const [nav, setNav] = useState<NavId>('overview');
  const [hovered, setHovered] = useState<string | null>(null);
  const [frame, setFrame] = useState(12);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  // auto-stop on last frame
  useEffect(() => { if (frame >= FRAME_COUNT - 1 && playing) setPlaying(false); }, [frame, playing]);

  const conf = 90 + Math.min(6, frame * 0.3);

  return (
    <div className="grain bg-radial min-h-screen text-white">
      <TopBar conf={conf}/>
      <div className="flex">
        <NavRail current={nav} setCurrent={setNav}/>
        <main className="flex-1 min-w-0 p-4 lg:p-6 xl:p-8">
          <SectionHead nav={nav} setNav={setNav} frame={frame}/>
          <ReplayScrubber frame={frame} setFrame={setFrame} playing={playing} setPlaying={setPlaying} speed={speed} setSpeed={setSpeed}/>

          <div key={nav} className="rise-in">
            {nav === 'overview' && <OverviewRoom frame={frame} hovered={hovered} setHovered={setHovered}/>}
            {nav === 'twin'     && <TwinRoom     frame={frame} hovered={hovered} setHovered={setHovered}/>}
            {nav === 'forecast' && <ForecastRoom frame={frame}/>}
            {nav === 'xai'      && <XaiRoom      frame={frame}/>}
            {nav === 'mitre'    && <MitreRoom    frame={frame}/>}
            {nav === 'simulate' && <SimulateRoom frame={frame} hovered={hovered} setHovered={setHovered}/>}
            {nav === 'reports'  && <ReportsRoom  frame={frame}/>}
            {nav === 'settings' && <SettingsRoom frame={frame}/>}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 mt-8 border-t border-white/5 text-[11px] text-white/40 font-mono" data-testid="footer-strip">
            <div>CyberWorld AI · Predictive Intelligence Layer · Twin v3.4.1</div>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5"><CircleDot className="w-2 h-2 text-lime-300"/>Predict</span>
              <span className="flex items-center gap-1.5"><CircleDot className="w-2 h-2 text-violet-300"/>Explain</span>
              <span className="flex items-center gap-1.5"><CircleDot className="w-2 h-2 text-amber-300"/>Simulate</span>
              <span className="flex items-center gap-1.5"><CircleDot className="w-2 h-2 text-cyan-300"/>Defend</span>
            </div>
            <div>Preview build · demo scenario CIC-IDS2017-α · Seed 42</div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
