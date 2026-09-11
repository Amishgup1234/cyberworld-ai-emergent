import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, AlertTriangle, ArrowRight, Ban, Binary, BrainCircuit, ChevronRight, Clock, Cpu, Database,
  Eye, Fingerprint, GitBranch, Globe, Layers, LineChart, Lock, MonitorSmartphone, Network, Radar,
  Radio, ScanEye, Server, ShieldAlert, ShieldCheck, Signal, Sparkles, Terminal, TrendingUp, Zap,
  Router as RouterIcon, HardDrive, Cloud, User, Fingerprint as FingerprintIcon, Waves, MoveRight,
  ChevronsRight, ShieldOff, CircleDot, Target, FileText, Settings, ChevronDown,
} from 'lucide-react';

/* =========================================================================
   MOCK DATA — CyberWorld AI Predictive Digital Twin
   ========================================================================= */

type NodeKind = 'gateway' | 'server' | 'workstation' | 'cloud' | 'db' | 'identity' | 'iot';
type Risk = 'safe' | 'watch' | 'warn' | 'critical';

type TwinNode = {
  id: string;
  label: string;
  kind: NodeKind;
  x: number; y: number;
  risk: Risk;
  ip: string;
  tier: string;
};

type TwinEdge = {
  from: string; to: string;
  intensity: number;   // 0..1
  malicious?: boolean;
  predicted?: boolean;
};

const NODES: TwinNode[] = [
  { id: 'gw-01',   label: 'Perimeter Gateway',  kind: 'gateway',     x: 90,  y: 220, risk: 'watch',    ip: '10.0.0.1',      tier: 'Perimeter' },
  { id: 'fw-01',   label: 'Next-Gen Firewall',  kind: 'gateway',     x: 200, y: 130, risk: 'safe',     ip: '10.0.0.2',      tier: 'Perimeter' },
  { id: 'vpn-01',  label: 'VPN Concentrator',   kind: 'gateway',     x: 200, y: 320, risk: 'warn',     ip: '10.0.0.9',      tier: 'Perimeter' },
  { id: 'ad-01',   label: 'AD-01 Domain Ctrl',  kind: 'identity',    x: 380, y: 220, risk: 'critical', ip: '10.0.10.4',     tier: 'Core Identity' },
  { id: 'db-01',   label: 'PII Database',       kind: 'db',          x: 560, y: 130, risk: 'critical', ip: '10.0.20.12',    tier: 'Crown Jewels' },
  { id: 'db-02',   label: 'Finance Vault',      kind: 'db',          x: 560, y: 310, risk: 'warn',     ip: '10.0.20.14',    tier: 'Crown Jewels' },
  { id: 'srv-01',  label: 'File Server SMB',    kind: 'server',      x: 380, y: 380, risk: 'warn',     ip: '10.0.30.5',     tier: 'Core' },
  { id: 'srv-02',  label: 'Mail Exchange',      kind: 'server',      x: 380, y: 60,  risk: 'watch',    ip: '10.0.30.7',     tier: 'Core' },
  { id: 'cld-01',  label: 'S3 Backup Bucket',   kind: 'cloud',       x: 720, y: 100, risk: 'watch',    ip: 'aws-us-1',      tier: 'Cloud' },
  { id: 'cld-02',  label: 'K8s Prod Cluster',   kind: 'cloud',       x: 720, y: 260, risk: 'safe',     ip: 'k8s-prod',      tier: 'Cloud' },
  { id: 'ws-01',   label: 'HR-Laptop-014',      kind: 'workstation', x: 190, y: 460, risk: 'safe',     ip: '10.0.40.14',    tier: 'Workstation' },
  { id: 'ws-02',   label: 'Dev-Workstation-22', kind: 'workstation', x: 560, y: 460, risk: 'warn',     ip: '10.0.40.22',    tier: 'Workstation' },
  { id: 'iot-01',  label: 'HVAC Controller',    kind: 'iot',         x: 720, y: 420, risk: 'watch',    ip: '10.0.90.3',     tier: 'OT/IoT' },
];

const EDGES: TwinEdge[] = [
  { from: 'gw-01',  to: 'fw-01',  intensity: 0.9 },
  { from: 'gw-01',  to: 'vpn-01', intensity: 0.6 },
  { from: 'fw-01',  to: 'ad-01',  intensity: 0.8 },
  { from: 'vpn-01', to: 'ad-01',  intensity: 0.7, malicious: true },
  { from: 'ad-01',  to: 'db-01',  intensity: 0.9, predicted: true, malicious: true },
  { from: 'ad-01',  to: 'db-02',  intensity: 0.5 },
  { from: 'ad-01',  to: 'srv-01', intensity: 0.75, malicious: true },
  { from: 'srv-02', to: 'fw-01',  intensity: 0.4 },
  { from: 'srv-01', to: 'ws-02',  intensity: 0.55, predicted: true },
  { from: 'db-01',  to: 'cld-01', intensity: 0.7, predicted: true },
  { from: 'cld-02', to: 'db-02',  intensity: 0.35 },
  { from: 'ws-01',  to: 'vpn-01', intensity: 0.5 },
  { from: 'iot-01', to: 'cld-02', intensity: 0.3 },
];

const KILL_CHAIN = [
  { stage: 'Recon',           prob: 0.98, color: '#00F0FF', done: true,  eta: null },
  { stage: 'Initial Access',  prob: 0.92, color: '#00F0FF', done: true,  eta: null },
  { stage: 'Execution',       prob: 0.87, color: '#7C6BFF', done: true,  eta: null },
  { stage: 'Persistence',     prob: 0.72, color: '#7C6BFF', done: false, eta: '02:14' },
  { stage: 'Priv Escalation', prob: 0.61, color: '#FFAA00', done: false, eta: '05:48' },
  { stage: 'Lateral Movement',prob: 0.44, color: '#FFAA00', done: false, eta: '11:20' },
  { stage: 'Credential Access',prob: 0.29, color: '#FF2E63', done: false, eta: '14:07' },
  { stage: 'Exfiltration',    prob: 0.11, color: '#FF2E63', done: false, eta: '22:36' },
];

const MITRE_MATRIX = [
  { tactic: 'Recon',            techniques: [{ id: 'T1595', name: 'Active Scanning',           conf: 0.97 }, { id: 'T1592', name: 'Victim Host Info',      conf: 0.71 }] },
  { tactic: 'Initial Access',   techniques: [{ id: 'T1078', name: 'Valid Accounts',            conf: 0.94 }, { id: 'T1566', name: 'Phishing',              conf: 0.55 }] },
  { tactic: 'Execution',        techniques: [{ id: 'T1059', name: 'Command & Scripting',       conf: 0.88 }] },
  { tactic: 'Persistence',      techniques: [{ id: 'T1136', name: 'Create Account',            conf: 0.66 }, { id: 'T1053', name: 'Scheduled Task',         conf: 0.42 }] },
  { tactic: 'Priv Escalation',  techniques: [{ id: 'T1068', name: 'Exploit Vuln (CVE-2026-1189)', conf: 0.61 }] },
  { tactic: 'Credential Access',techniques: [{ id: 'T1558', name: 'Kerberoasting',             conf: 0.58 }, { id: 'T1003', name: 'OS Credential Dumping',  conf: 0.31 }] },
  { tactic: 'Lateral Movement', techniques: [{ id: 'T1021', name: 'Remote Services (SMB)',     conf: 0.47 }] },
  { tactic: 'Exfiltration',     techniques: [{ id: 'T1041', name: 'C2 Channel Exfil',          conf: 0.12 }] },
];

const XAI_SIGNALS = [
  { name: 'SMB traffic anomaly (srv-01)',         weight: 0.34, dir: 'up',   context: 'Volume 6.4× baseline for last 480s' },
  { name: 'Kerberos service ticket bursts (ad-01)',weight: 0.28, dir: 'up',  context: '11 SPN requests / 60s window' },
  { name: 'VPN session from novel ASN',           weight: 0.17, dir: 'up',   context: 'AS205100 first-seen in 90d window' },
  { name: 'Dormant service account activated',    weight: 0.11, dir: 'up',   context: 'svc_backup_legacy — no auth in 214d' },
  { name: 'Reduced beaconing entropy (out-01)',   weight: 0.07, dir: 'down', context: 'Model expects broader jitter' },
  { name: 'CVE-2026-1189 patch missing',          weight: 0.03, dir: 'up',   context: 'Endpoint SCCM confirms unpatched' },
];

const MITIGATIONS = [
  { id: 'isolate-ad-01',    label: 'Isolate AD-01 domain controller',       delta: -47, icon: ShieldOff },
  { id: 'block-smb',        label: 'Block SMB (port 445) at core switch',   delta: -22, icon: Ban },
  { id: 'mfa-vpn',          label: 'Enforce MFA re-auth on VPN sessions',   delta: -9,  icon: Lock },
  { id: 'patch-cve',        label: 'Apply patch CVE-2026-1189',             delta: -18, icon: Binary },
  { id: 'kill-svc-account', label: 'Disable svc_backup_legacy account',     delta: -6,  icon: Fingerprint },
];

const TARGETS = [
  { host: 'db-01 (PII Database)',   pct: 0.78, eta: '11 min', color: '#FF2E63' },
  { host: 'srv-01 (SMB Fileserver)',pct: 0.61, eta: '14 min', color: '#FFAA00' },
  { host: 'cld-01 (S3 Backup)',     pct: 0.34, eta: '38 min', color: '#7C6BFF' },
];

/* Terminal log seeds */
const LOG_SEED = [
  { t: '00.014', tag: 'ANOMALY',  color: 'amber', text: 'SMB burst detected srv-01 <- ad-01 (6.4x baseline, 480s)' },
  { t: '00.089', tag: 'FORECAST', color: 'cyan',  text: 'Attack path predicted vpn-01 -> ad-01 -> db-01 (p=0.78)' },
  { t: '00.144', tag: 'MITRE',    color: 'violet',text: 'Mapped T1558 Kerberoasting conf=0.58 on ad-01' },
  { t: '00.201', tag: 'ANOMALY',  color: 'amber', text: 'Novel ASN AS205100 first-seen on vpn-01 tunnel' },
  { t: '00.312', tag: 'PREDICT',  color: 'lime',  text: 'Digital Twin sync: 12,480 nodes / 42,110 edges committed' },
  { t: '00.447', tag: 'DEFEND',   color: 'lime',  text: 'What-if simulation queued: isolate-ad-01 (delta -47%)' },
  { t: '00.512', tag: 'CRITICAL', color: 'rose',  text: 'db-01 (Crown Jewel) elevated to CRITICAL — lead 11m' },
  { t: '00.633', tag: 'MODEL',    color: 'cyan',  text: 'Temporal model checkpoint tw-v3.4.1 confidence=0.948' },
  { t: '00.771', tag: 'ANOMALY',  color: 'amber', text: 'svc_backup_legacy activated after 214d dormant window' },
  { t: '00.902', tag: 'ATTACK',   color: 'rose',  text: 'Lateral path pivots via SMB 445 ad-01 -> srv-01 -> ws-02' },
];

/* =========================================================================
   HELPERS
   ========================================================================= */

const RISK_COLOR: Record<Risk, string> = {
  safe:     '#7CFFB0',
  watch:    '#00F0FF',
  warn:     '#FFAA00',
  critical: '#FF2E63',
};
const RISK_BG: Record<Risk, string> = {
  safe:     'rgba(124,255,176,0.10)',
  watch:    'rgba(0,240,255,0.10)',
  warn:     'rgba(255,170,0,0.12)',
  critical: 'rgba(255,46,99,0.14)',
};

const KIND_ICON: Record<NodeKind, typeof Server> = {
  gateway: RouterIcon,
  server: Server,
  workstation: MonitorSmartphone,
  cloud: Cloud,
  db: Database,
  identity: User,
  iot: HardDrive,
};

function useClock() {
  const [now, setNow] = useState<Date>(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/* =========================================================================
   COMPONENTS
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

function TopBar() {
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
            <span className="font-mono text-[11px] text-white/90">AI CONF <span className="text-lime-300 font-bold">94.8%</span></span>
          </div>
          <div className="flex items-center gap-2 pr-3 border-r border-white/5">
            <Clock className="w-3.5 h-3.5 text-cyan-300"/>
            <span className="font-mono text-[11px] text-white/80">{utc} UTC</span>
          </div>
          <button className="btn-tactical" data-testid="btn-strategy-deck">
            <span className="flex items-center gap-1.5"><FileText className="w-3.5 h-3.5"/>STRATEGY</span>
          </button>
          <button className="btn-tactical primary" data-testid="btn-deploy">
            <span className="flex items-center gap-1.5"><Zap className="w-3.5 h-3.5"/>DEPLOY</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function NavRail({ current, setCurrent }: { current: string; setCurrent: (s: string) => void }) {
  const items = [
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
    <nav className="w-[220px] shrink-0 hidden lg:flex flex-col border-r border-cyan-400/10 bg-[#070B18]/70 backdrop-blur-md" data-testid="nav-rail">
      <div className="p-4 border-b border-white/5">
        <div className="text-[10px] font-mono tracking-[0.24em] text-cyan-300/50">STATION 01 · SOC-EAST</div>
        <div className="mt-2 flex items-center gap-2 text-[11px] text-white/70">
          <Signal className="w-3 h-3 text-lime-300"/> Uplink stable · 4.2ms
        </div>
      </div>
      <div className="p-2 flex-1">
        {items.map(({ id, label, icon: Icon }) => {
          const active = current === id;
          return (
            <button
              key={id}
              onClick={() => setCurrent(id)}
              data-testid={`nav-${id}`}
              className={`w-full flex items-center gap-3 px-3 py-2.5 my-0.5 text-left rounded-sm relative ${active ? 'text-white' : 'text-white/60 hover:text-white hover:bg-cyan-400/5'}`}
            >
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
            <div className="w-7 h-7 rounded-sm bg-lime-300/20 border border-lime-300/40 flex items-center justify-center">
              <FingerprintIcon className="w-3.5 h-3.5 text-lime-300"/>
            </div>
            <div className="leading-tight">
              <div className="text-[12px] text-white/90">A. Kowalski</div>
              <div className="text-[10px] text-white/40">Tier-2 · Blue Team</div>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}

function KpiTile({ icon: Icon, label, value, unit, tone, trend, testid }:
  { icon: typeof Server; label: string; value: string; unit?: string; tone: 'cyan'|'lime'|'amber'|'rose'|'violet'; trend?: string; testid: string; }) {
  const toneMap: Record<string, string> = {
    cyan: 'text-cyan-300', lime: 'text-lime-300', amber: 'text-amber-300', rose: 'text-rose-300', violet: 'text-violet-300',
  };
  const glowMap: Record<string, string> = {
    cyan: 'neon-cyan', lime: 'neon-lime', amber: 'neon-amber', rose: 'neon-rose', violet: '',
  };
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

/* -------- Digital Twin Canvas ---------- */
function TwinCanvas({ hovered, setHovered }: { hovered: string | null; setHovered: (id: string | null) => void; }) {
  const nodeById = useMemo(() => Object.fromEntries(NODES.map(n => [n.id, n])), []);
  return (
    <div className="corners relative glass rounded-sm overflow-hidden" data-testid="twin-canvas">
      <div className="cbr"></div>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-cyan-400/10">
        <div className="flex items-center gap-3">
          <Network className="w-4 h-4 text-cyan-300"/>
          <h3 className="font-display text-[13px] tracking-wider text-white/90">NETWORK DIGITAL TWIN</h3>
          <span className="chip"><CircleDot className="w-2.5 h-2.5 text-lime-300 blink"/>LIVE</span>
        </div>
        <div className="flex items-center gap-1.5">
          {['All','Critical','Targeted','Isolated'].map((f, i) => (
            <button key={f} data-testid={`twin-filter-${f.toLowerCase()}`} className={`px-2.5 py-1 font-mono text-[10.5px] tracking-wider rounded-sm border ${i === 1 ? 'bg-rose-500/15 border-rose-400/40 text-rose-200' : 'border-white/10 text-white/55 hover:text-white'}`}>
              {f.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* SVG stage */}
      <div className="relative h-[520px] bg-grid overflow-hidden">
        {/* Scan line */}
        <div className="absolute inset-x-0 h-24 pointer-events-none scan-line" style={{ background: 'linear-gradient(180deg, transparent, rgba(0,240,255,0.10), transparent)' }}/>
        {/* Rotating radar ring */}
        <div className="absolute -right-24 -top-24 w-80 h-80 rounded-full border border-cyan-400/10 rotate-slow" style={{ background: 'conic-gradient(from 0deg, rgba(0,240,255,0.16), transparent 30%)' }}/>

        <svg viewBox="0 0 820 520" className="absolute inset-0 w-full h-full" data-testid="twin-svg">
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
            <radialGradient id="node-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#00F0FF" stopOpacity="0.55"/>
              <stop offset="100%" stopColor="#00F0FF" stopOpacity="0"/>
            </radialGradient>
          </defs>

          {/* Edges */}
          {EDGES.map((e, i) => {
            const a = nodeById[e.from]; const b = nodeById[e.to];
            if (!a || !b) return null;
            const stroke = e.malicious ? '#FF2E63' : e.predicted ? '#7C6BFF' : '#00F0FF';
            const opacity = 0.35 + e.intensity * 0.5;
            const grad = e.malicious ? 'url(#grad-rose)' : 'url(#grad-cyan)';
            return (
              <g key={i}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={grad} strokeWidth={1 + e.intensity * 2} opacity={opacity}/>
                {(e.malicious || e.predicted) && (
                  <line
                    x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                    stroke={stroke} strokeWidth={1.4} strokeDasharray="6 6"
                    className="flow-dash" opacity={0.9}
                  />
                )}
              </g>
            );
          })}

          {/* Nodes */}
          {NODES.map(n => {
            const c = RISK_COLOR[n.risk];
            const isHover = hovered === n.id;
            const r = isHover ? 15 : 12;
            return (
              <g key={n.id} onMouseEnter={() => setHovered(n.id)} onMouseLeave={() => setHovered(null)} style={{ cursor: 'pointer' }} data-testid={`twin-node-${n.id}`}>
                <circle cx={n.x} cy={n.y} r={26} fill={c} opacity={0.10}/>
                {n.risk === 'critical' && <circle cx={n.x} cy={n.y} r={r + 6} fill="none" stroke={c} strokeWidth={1} className="pulse-ring"/>}
                <circle cx={n.x} cy={n.y} r={r} fill="#05070C" stroke={c} strokeWidth={1.6}/>
                <circle cx={n.x} cy={n.y} r={4} fill={c}/>
                <text x={n.x} y={n.y + 30} textAnchor="middle" fill="#E9F0FF" fontSize="9.5" fontFamily="JetBrains Mono" opacity={0.72}>{n.label}</text>
                <text x={n.x} y={n.y + 42} textAnchor="middle" fill={c} fontSize="8" fontFamily="JetBrains Mono" opacity={0.55}>{n.ip}</text>
              </g>
            );
          })}
        </svg>

        {/* Hover inspector */}
        {hovered && nodeById[hovered] && (
          <div className="absolute top-3 left-3 glass rounded-sm p-3 w-[260px]" data-testid="twin-hover-inspector">
            {(() => {
              const n = nodeById[hovered];
              const Icon = KIND_ICON[n.kind];
              return (
                <>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4" style={{ color: RISK_COLOR[n.risk] }}/>
                      <span className="font-display text-[12.5px] tracking-wide text-white">{n.label}</span>
                    </div>
                    <span className="chip" style={{ borderColor: RISK_COLOR[n.risk], color: RISK_COLOR[n.risk] }}>{n.risk.toUpperCase()}</span>
                  </div>
                  <div className="mt-2 font-mono text-[10.5px] text-white/60 space-y-0.5">
                    <div>ID   {n.id}</div>
                    <div>IP   {n.ip}</div>
                    <div>TIER {n.tier}</div>
                    <div>KIND {n.kind}</div>
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {/* Legend */}
        <div className="absolute bottom-3 left-3 glass rounded-sm px-3 py-2 flex items-center gap-4">
          {(['safe','watch','warn','critical'] as Risk[]).map(r => (
            <div key={r} className="flex items-center gap-1.5 font-mono text-[10px] text-white/60 uppercase">
              <span className="w-2 h-2 rounded-full" style={{ background: RISK_COLOR[r] }}/>{r}
            </div>
          ))}
          <div className="pl-3 ml-1 border-l border-white/10 flex items-center gap-2 font-mono text-[10px] text-white/60 uppercase">
            <span className="w-4 h-[2px] bg-rose-400"/>Malicious flow
            <span className="w-4 h-[2px] bg-violet-400 ml-2"/>Predicted path
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------- Attack Forecast Rail ---------- */
function ForecastRail() {
  return (
    <div className="corners relative glass rounded-sm p-4" data-testid="forecast-rail">
      <div className="cbr"></div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-violet-300"/>
          <h3 className="font-display text-[13px] tracking-wider text-white/90">ATTACK FORECAST</h3>
        </div>
        <span className="chip" style={{ color: '#FFAA00', borderColor: 'rgba(255,170,0,0.35)' }}><AlertTriangle className="w-2.5 h-2.5"/>LEAD 11:20</span>
      </div>

      {/* Kill-chain probability bars */}
      <div className="space-y-1.5">
        {KILL_CHAIN.map((s) => (
          <div key={s.stage} className="group" data-testid={`kc-${s.stage.replace(/\s/g, '-').toLowerCase()}`}>
            <div className="flex items-center justify-between mb-0.5">
              <div className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full`} style={{ background: s.color, opacity: s.done ? 1 : 0.55 }}/>
                <span className="font-mono text-[11px] text-white/75">{s.stage}</span>
                {s.done && <span className="font-mono text-[9px] text-lime-300/80">✓ observed</span>}
              </div>
              <span className="font-mono text-[11px] font-bold" style={{ color: s.color }}>{(s.prob * 100).toFixed(0)}%</span>
            </div>
            <div className="h-[6px] bg-white/[0.04] rounded-sm overflow-hidden border border-white/5">
              <div className="h-full" style={{ width: `${s.prob * 100}%`, background: `linear-gradient(90deg, transparent, ${s.color})` }}/>
            </div>
            {s.eta && <div className="mt-0.5 font-mono text-[9.5px] text-white/40">ETA {s.eta} · {(s.prob * 100).toFixed(0)}% conf</div>}
          </div>
        ))}
      </div>

      {/* Predicted targets */}
      <div className="mt-4 pt-3 border-t border-white/5">
        <div className="font-mono text-[10px] tracking-[0.22em] text-white/45 uppercase mb-2">Predicted Next Targets</div>
        {TARGETS.map((t) => (
          <div key={t.host} className="flex items-center justify-between py-1.5" data-testid={`target-${t.host.split(' ')[0]}`}>
            <div className="flex items-center gap-2">
              <Target className="w-3 h-3" style={{ color: t.color }}/>
              <span className="font-mono text-[11px] text-white/85">{t.host}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] font-bold" style={{ color: t.color }}>{(t.pct * 100).toFixed(0)}%</span>
              <span className="font-mono text-[9.5px] text-white/40">{t.eta}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------- MITRE Matrix -------- */
function MitreMatrix() {
  return (
    <div className="corners relative glass rounded-sm p-4" data-testid="mitre-panel">
      <div className="cbr"></div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ScanEye className="w-4 h-4 text-cyan-300"/>
          <h3 className="font-display text-[13px] tracking-wider text-white/90">MITRE ATT&CK MAPPING</h3>
        </div>
        <span className="chip">v13.1 · 8 tactics · 12 techniques</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {MITRE_MATRIX.map((col) => (
          <div key={col.tactic} className="rounded-sm border border-white/5 bg-white/[0.015] p-2">
            <div className="font-mono text-[9.5px] tracking-[0.16em] text-cyan-300/70 uppercase mb-2">{col.tactic}</div>
            <div className="space-y-1.5">
              {col.techniques.map((t) => (
                <div
                  key={t.id}
                  data-testid={`mitre-${t.id}`}
                  className="rounded-sm border p-1.5"
                  style={{
                    borderColor: t.conf > 0.75 ? 'rgba(255,46,99,0.5)' : t.conf > 0.5 ? 'rgba(255,170,0,0.4)' : 'rgba(0,240,255,0.25)',
                    background: t.conf > 0.75 ? 'rgba(255,46,99,0.06)' : t.conf > 0.5 ? 'rgba(255,170,0,0.05)' : 'rgba(0,240,255,0.04)',
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[9.5px] text-white/75">{t.id}</span>
                    <span className="font-mono text-[9.5px] font-bold" style={{ color: t.conf > 0.75 ? '#FF6B8B' : t.conf > 0.5 ? '#FFC66B' : '#7DE6F3' }}>{(t.conf * 100).toFixed(0)}%</span>
                  </div>
                  <div className="text-[11px] text-white/85 leading-tight">{t.name}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------- XAI Panel ---------- */
function XaiPanel() {
  const max = Math.max(...XAI_SIGNALS.map(s => s.weight));
  return (
    <div className="corners relative glass rounded-sm p-4" data-testid="xai-panel">
      <div className="cbr"></div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <BrainCircuit className="w-4 h-4 text-lime-300"/>
          <h3 className="font-display text-[13px] tracking-wider text-white/90">EXPLAINABLE AI · EVIDENCE</h3>
        </div>
        <span className="chip"><Eye className="w-2.5 h-2.5"/>SHAP · 80 FEAT</span>
      </div>
      <p className="text-[11.5px] text-white/55 mb-3 leading-relaxed">
        Contribution of behavioral signals to the current forecast. Copy evidence to attach to SOC incident.
      </p>

      <div className="space-y-2">
        {XAI_SIGNALS.map((s, i) => {
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
                <div className="h-full" style={{ width: `${w}%`, background: s.dir === 'up' ? 'linear-gradient(90deg, rgba(255,46,99,0.25), #FF2E63)' : 'linear-gradient(90deg, rgba(182,255,61,0.25), #B6FF3D)' }}/>
              </div>
              <div className="mt-0.5 font-mono text-[9.5px] text-white/40">{s.context}</div>
            </div>
          );
        })}
      </div>

      <button className="btn-tactical mt-4 w-full" data-testid="btn-copy-evidence">
        <span className="flex items-center justify-center gap-1.5"><ChevronsRight className="w-3.5 h-3.5"/>COPY EVIDENCE TO INCIDENT</span>
      </button>
    </div>
  );
}

/* -------- What-If Simulation -------- */
function SimulationPanel() {
  const [active, setActive] = useState<Record<string, boolean>>({ 'isolate-ad-01': true });
  const delta = MITIGATIONS.filter(m => active[m.id]).reduce((s, m) => s + m.delta, 0);
  const baseline = 0.78;
  const newRisk = Math.max(0.02, baseline + delta / 100);
  return (
    <div className="corners relative glass rounded-sm p-4" data-testid="sim-panel">
      <div className="cbr"></div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-violet-300"/>
          <h3 className="font-display text-[13px] tracking-wider text-white/90">WHAT-IF DEFENSE SIMULATION</h3>
        </div>
        <span className="chip"><Waves className="w-2.5 h-2.5 text-violet-300"/>SANDBOX</span>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-sm border border-white/5 p-3">
          <div className="font-mono text-[9.5px] tracking-[0.2em] text-white/45 uppercase">Baseline Risk</div>
          <div className="mt-1 font-display text-[26px] font-bold text-rose-300">{(baseline * 100).toFixed(0)}<span className="text-[13px] text-white/40">%</span></div>
          <div className="font-mono text-[10px] text-white/40">db-01 · 11 min ETA</div>
        </div>
        <div className="rounded-sm border p-3 relative overflow-hidden" style={{ borderColor: newRisk < 0.35 ? 'rgba(182,255,61,0.45)' : 'rgba(255,170,0,0.4)' }}>
          <div className="font-mono text-[9.5px] tracking-[0.2em] text-white/45 uppercase">After Mitigation</div>
          <div className="mt-1 font-display text-[26px] font-bold" style={{ color: newRisk < 0.35 ? '#B6FF3D' : '#FFC66B' }}>
            {(newRisk * 100).toFixed(0)}<span className="text-[13px] text-white/40">%</span>
          </div>
          <div className="font-mono text-[10px] text-white/40">Δ {delta}% risk reduction</div>
        </div>
      </div>

      <div className="space-y-1.5">
        {MITIGATIONS.map(m => {
          const on = !!active[m.id];
          const Icon = m.icon;
          return (
            <button
              key={m.id}
              data-testid={`sim-toggle-${m.id}`}
              onClick={() => setActive(a => ({ ...a, [m.id]: !on }))}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-sm border text-left ${on ? 'bg-lime-300/8 border-lime-300/40' : 'border-white/8 hover:border-cyan-400/25 hover:bg-cyan-400/5'}`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={`w-6 h-6 shrink-0 rounded-sm flex items-center justify-center ${on ? 'bg-lime-300/15 text-lime-300' : 'bg-white/5 text-white/60'}`}>
                  <Icon className="w-3.5 h-3.5"/>
                </div>
                <span className={`text-[12px] ${on ? 'text-white' : 'text-white/70'}`}>{m.label}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`font-mono text-[10.5px] font-bold ${on ? 'text-lime-300' : 'text-white/40'}`}>{m.delta}%</span>
                <span className={`w-8 h-4 rounded-full relative ${on ? 'bg-lime-300/40' : 'bg-white/10'}`}>
                  <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white`} style={{ left: on ? '18px' : '2px', transition: 'left 200ms cubic-bezier(0.16, 1, 0.3, 1)' }}/>
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <button className="btn-tactical primary mt-4 w-full" data-testid="btn-rerun-sim">
        <span className="flex items-center justify-center gap-1.5"><Zap className="w-3.5 h-3.5"/>RERUN FORECAST WITH DEFENSE</span>
      </button>
    </div>
  );
}

/* -------- Terminal ---------- */
function LiveTerminal() {
  const [lines, setLines] = useState(LOG_SEED);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = setInterval(() => {
      setLines(prev => {
        const nextT = (parseFloat(prev[prev.length - 1].t) + Math.random() * 0.4 + 0.05).toFixed(3);
        const templates = [
          { tag: 'ANOMALY',  color: 'amber',  text: 'Kerberos SPN request burst on ad-01 (window=60s, count=11)' },
          { tag: 'PREDICT',  color: 'lime',   text: `Twin state committed · confidence=${(0.9 + Math.random() * 0.08).toFixed(3)}` },
          { tag: 'MITRE',    color: 'violet', text: 'Mapped technique T1021.002 SMB/Windows Admin Shares' },
          { tag: 'FORECAST', color: 'cyan',   text: `Path prob updated ad-01 -> db-01 = ${(0.72 + Math.random() * 0.1).toFixed(2)}` },
          { tag: 'DEFEND',   color: 'lime',   text: 'What-if diff · isolate-ad-01 reduces db-01 exposure by 47%' },
          { tag: 'ANOMALY',  color: 'amber',  text: 'DNS beaconing entropy dropped below 0.31 threshold' },
        ];
        const t = templates[Math.floor(Math.random() * templates.length)];
        const nxt = { t: nextT, tag: t.tag, color: t.color, text: t.text };
        const arr = [...prev.slice(-40), nxt];
        return arr;
      });
    }, 1800);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [lines]);

  const colorMap: Record<string, string> = {
    cyan: '#00F0FF', lime: '#B6FF3D', amber: '#FFAA00', rose: '#FF2E63', violet: '#7C6BFF',
  };

  return (
    <div className="corners relative rounded-sm border border-cyan-400/15 bg-[#070A14]" data-testid="terminal">
      <div className="cbr"></div>
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5">
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-lime-300"/>
          <span className="font-display text-[12px] tracking-widest text-white/85">LIVE EVENT STREAM</span>
          <span className="chip"><CircleDot className="w-2 h-2 text-lime-300 blink"/>tail -f twin.jsonl</span>
        </div>
        <div className="flex items-center gap-1.5">
          {['ALL','ANOMALY','ATTACK','FORECAST','DEFEND'].map((f, i) => (
            <button key={f} className={`px-2 py-0.5 font-mono text-[9.5px] tracking-wider rounded-sm border ${i === 0 ? 'bg-cyan-400/10 border-cyan-400/40 text-cyan-200' : 'border-white/8 text-white/50'}`} data-testid={`term-filter-${f.toLowerCase()}`}>
              {f}
            </button>
          ))}
        </div>
      </div>
      <div ref={scrollRef} className="h-[220px] overflow-y-auto p-3 font-mono text-[11.5px] leading-relaxed">
        {lines.map((l, i) => (
          <div key={i} className="flex gap-3 rise-in" style={{ animationDelay: `${Math.min(i, 8) * 20}ms` }}>
            <span className="text-white/30 shrink-0">{l.t}</span>
            <span className="shrink-0 font-bold" style={{ color: colorMap[l.color] }}>[{l.tag.padEnd(8)}]</span>
            <span className="text-white/80">{l.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------- Roadmap Strip (from PDF) ---------- */
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
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-cyan-300"/>
          <h3 className="font-display text-[13px] tracking-wider text-white/90">COMMERCIALIZATION ROADMAP</h3>
        </div>
        <span className="chip">Predictive Intelligence Layer for Modern SecOps</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {items.map((r) => (
          <div key={r.phase} className="rounded-sm p-3 border border-white/5 relative overflow-hidden" data-testid={`roadmap-${r.phase.replace(' ', '-').toLowerCase()}`}>
            <div className="absolute top-0 left-0 h-full w-[3px]" style={{ background: r.color }}/>
            <div className="font-mono text-[10px] tracking-[0.22em] text-white/50">{r.phase}</div>
            <div className="mt-1 text-[13px] text-white/90 font-medium">{r.title}</div>
            <div className="mt-2 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: r.color }}/>
              <span className="font-mono text-[10px] tracking-wider uppercase" style={{ color: r.color }}>{r.status}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------- Target Segments ---------- */
function TargetSegments() {
  const segs = [
    { icon: Radar,    label: 'SOC Analysts',        detail: 'Prioritise evolving threats · lead time'  },
    { icon: Layers,   label: 'CISO / Risk Officers',detail: 'Board-ready predictive posture reports' },
    { icon: Zap,      label: 'Red & Blue Teams',    detail: 'Replay attacks · train on twin fidelity' },
    { icon: Globe,    label: 'MSSP Providers',      detail: 'Multi-tenant, prioritised triage' },
  ];
  return (
    <div className="corners relative glass rounded-sm p-4" data-testid="segments-panel">
      <div className="cbr"></div>
      <div className="flex items-center gap-2 mb-3">
        <User className="w-4 h-4 text-cyan-300"/>
        <h3 className="font-display text-[13px] tracking-wider text-white/90">TARGET SEGMENTS</h3>
      </div>
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
   APP SHELL
   ========================================================================= */

function App() {
  const [nav, setNav] = useState('overview');
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div className="grain bg-radial min-h-screen text-white">
      <TopBar/>

      <div className="flex">
        <NavRail current={nav} setCurrent={setNav}/>

        <main className="flex-1 min-w-0 p-4 lg:p-6 xl:p-8">
          {/* Hero band */}
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3" data-testid="hero-band">
            <div>
              <div className="flex items-center gap-2 font-mono text-[10.5px] tracking-[0.3em] text-cyan-300/70 uppercase">
                <Radio className="w-3 h-3 blink text-lime-300"/> Predictive Command Centre · Session ω-7742
              </div>
              <h1 className="mt-2 font-display text-[32px] lg:text-[42px] leading-[1.05] font-bold tracking-tight text-white">
                Forecast, explain, and dismantle attacks<br/>
                <span className="text-cyan-300 text-glow-cyan">before the first breach.</span>
              </h1>
              <p className="mt-2 max-w-[640px] text-[13px] text-white/55 leading-relaxed">
                A predictive network digital twin continuously learns temporal behaviour, forecasts attack trajectories across the MITRE ATT&CK lifecycle, and quantifies mitigation impact — long before traditional detection alerts fire.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button className="btn-tactical" data-testid="btn-inspect"><span className="flex items-center gap-1.5"><Eye className="w-3.5 h-3.5"/>INSPECT TWIN</span></button>
              <button className="btn-tactical primary" data-testid="btn-run-forecast"><span className="flex items-center gap-1.5"><Activity className="w-3.5 h-3.5"/>RUN FORECAST</span></button>
              <button className="btn-tactical danger" data-testid="btn-contain"><span className="flex items-center gap-1.5"><ShieldOff className="w-3.5 h-3.5"/>CONTAIN</span></button>
            </div>
          </div>

          {/* KPI row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5" data-testid="kpi-row">
            <KpiTile icon={ShieldAlert} label="Active Threat Vectors"  value="3"       tone="rose"   trend="↑ 2 · last 15 min" testid="kpi-threats"/>
            <KpiTile icon={LineChart}   label="Forecast Confidence"    value="94.8"   unit="%" tone="lime"   trend="tw-v3.4.1 · 80 features" testid="kpi-confidence"/>
            <KpiTile icon={Clock}       label="Mean Lead Time"         value="11:20" tone="cyan"   trend="Δ vs SIEM +8:42"     testid="kpi-leadtime"/>
            <KpiTile icon={Network}     label="Twin Nodes Synced"      value="12,480" tone="violet" trend="42,110 edges live"   testid="kpi-nodes"/>
          </div>

          {/* Twin + Forecast rail */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 mb-5">
            <div className="xl:col-span-2 min-w-0">
              <TwinCanvas hovered={hovered} setHovered={setHovered}/>
            </div>
            <div className="min-w-0">
              <ForecastRail/>
            </div>
          </div>

          {/* MITRE + XAI + Simulation */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 mb-5">
            <div className="xl:col-span-2 min-w-0">
              <MitreMatrix/>
            </div>
            <div className="min-w-0">
              <XaiPanel/>
            </div>
          </div>

          {/* Simulation + Segments */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 mb-5">
            <div className="xl:col-span-2 min-w-0"><SimulationPanel/></div>
            <div className="min-w-0"><TargetSegments/></div>
          </div>

          {/* Terminal + Roadmap */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 mb-8">
            <div className="xl:col-span-2 min-w-0"><LiveTerminal/></div>
            <div className="min-w-0"><RoadmapStrip/></div>
          </div>

          {/* Footer strip */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-white/5 text-[11px] text-white/40 font-mono" data-testid="footer-strip">
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
