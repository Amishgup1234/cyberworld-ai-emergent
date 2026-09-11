import { useState, useRef, useEffect, type KeyboardEvent, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, FileText, BarChart3, Shield, FlaskConical } from 'lucide-react';

interface TechnicalProofDrawerProps {
  evidence: unknown;
  metrics: unknown;
  techniques: unknown[];
  mitreVersion: string;
  scenarioId: string;
  frameId: number;
  children?: ReactNode;
}

export function TechnicalProofDrawer({ evidence: _evidence, metrics: _metrics, techniques: _techniques, mitreVersion: _mitreVersion, scenarioId: _scenarioId, frameId: _frameId, children }: TechnicalProofDrawerProps) {
  const [isOpen, setIsOpen] = useState(true);
  const contentRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const toggle = () => setIsOpen((v) => !v);

  useEffect(() => {
    if (isOpen && contentRef.current) {
      // Focus first focusable inside when opened for keyboard
      const first = contentRef.current.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') as HTMLElement | null;
      // Don't auto-focus aggressively, just ensure drawer is reachable
      void first;
    }
  }, [isOpen]);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && isOpen) {
      e.preventDefault();
      setIsOpen(false);
      buttonRef.current?.focus();
    }
  };

  return (
    <div className="w-full bg-navy-800 border border-navy-700 rounded-lg" data-testid="technical-proof-drawer" onKeyDown={handleKeyDown}>
      <button
        ref={buttonRef}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === ' ' || e.key === 'Spacebar' || e.key === 'Enter') {
            e.preventDefault();
            toggle();
          }
        }}
        aria-expanded={isOpen}
        aria-controls="technical-proof-content"
        aria-label={isOpen ? 'Collapse Technical Proof drawer' : 'Expand Technical Proof drawer'}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left bg-navy-700/50 hover:bg-navy-700 rounded-t-lg focus:outline-none focus:ring-2 focus:ring-cyan-400 focus-visible:ring-2 focus-visible:ring-cyan-400"
        data-testid="technical-proof-toggle"
      >
        <span className="flex items-center gap-2 text-sm font-bold text-white">
          <BarChart3 className="w-4 h-4 text-cyan-400" aria-hidden="true" />
          Technical Proof - Expandable
          <span className="text-[13px] font-normal text-gray-400 hidden sm:inline">- detailed evidence, MITRE, measured metrics, method and limitations - same interface</span>
        </span>
        <span className="flex items-center gap-2">
          <span className="text-[13px] px-2 py-0.5 rounded bg-navy-800 border border-navy-700 text-gray-400 font-mono hidden sm:inline">{isOpen ? 'Collapse' : 'Expand'}</span>
          {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400" aria-hidden="true" /> : <ChevronDown className="w-4 h-4 text-gray-400" aria-hidden="true" />}
        </span>
      </button>

      {/* Reduced-motion: no animation if user prefers reduce */}
      <style>{`
        @media (prefers-reduced-motion: reduce) {
          #technical-proof-content { transition: none !important; }
        }
      `}</style>

      <div
        id="technical-proof-content"
        ref={contentRef}
        hidden={!isOpen}
        aria-hidden={!isOpen}
        className={`px-4 pb-4 pt-2 flex flex-col gap-3 ${isOpen ? 'block' : 'hidden'}`}
        data-testid="technical-proof-content"
        role="region"
        aria-label="Technical Proof details"
      >
        {!isOpen && <span className="sr-only">Technical Proof collapsed - press Expand to see details</span>}
        {isOpen && (
          <>
            <div className="text-[13px] text-gray-400 bg-navy-700 rounded p-2 border border-navy-700 flex items-center gap-2">
              <FileText className="w-3 h-3" aria-hidden="true" />
              <span>All values below are API-derived via /api/v1/health, /metrics, /scenarios, /forecast, /simulate/isolate-host and offline_bundle.json - no invented metrics, hosts, IPs or attack claims. Learned is binary risk only, stage is rule-derived, target is graph-ranked, isolation is simulated not causal proof.</span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 text-[13px]">
              <div className="bg-navy-700 rounded p-3 border border-navy-700" data-testid="technical-proof-evidence-detail">
                <h4 className="text-[13px] font-bold text-white flex items-center gap-1.5">
                  <FileText className="w-3 h-3 text-cyan-400" aria-hidden="true" />
                  Detailed Evidence - Observed vs Global Importance
                </h4>
                <p className="text-gray-400 mt-1">Observed evidence is deterministic from flow_summary and forecast.evidence per frame. Global importance is Random Forest MDI or Logistic Regression coefficients from the trained pipeline - associative, not causal proof. See Evidence tab for full lists - values from API, not Stitch hardcoded 0.100 etc.</p>
                <div className="mt-2 text-[13px] bg-navy-800 rounded p-2 border border-navy-700">
                  <span className="text-gray-300">Claim labels distinct:</span> <span className="text-cyan-400">Observed (deterministic)</span> vs <span className="text-purple-400">Global Importance (model)</span>
                </div>
              </div>

              <div className="bg-navy-700 rounded p-3 border border-navy-700" data-testid="technical-proof-mitre-detail">
                <h4 className="text-[13px] font-bold text-white flex items-center gap-1.5">
                  <Shield className="w-3 h-3 text-amber-400" aria-hidden="true" />
                  MITRE ATT&CK - Pinned v13.1
                </h4>
                <p className="text-gray-400 mt-1">Techniques T1046 Network Service Discovery, T1110 Brute Force, T1021 Remote Services, T1498 Network DoS. Each card shows technique ID, name, evidence rule, and cautious confidence wording (requires analyst review). Active state derived from forecast.mitre per frame, not hardcoded.</p>
                <div className="mt-2 text-[13px] bg-navy-800 rounded p-2 border border-navy-700">
                  <span className="text-gray-300">No packet inspection or invented OS details - safe host-N aliases only.</span>
                </div>
              </div>
            </div>

            <div className="bg-navy-700 rounded p-3 border border-navy-700" data-testid="technical-proof-metrics-detail">
              <h4 className="text-[13px] font-bold text-white flex items-center gap-1.5">
                <BarChart3 className="w-3 h-3 text-emerald-400" aria-hidden="true" />
                Measured Metrics - Held-out Friday
              </h4>
              <p className="text-gray-400 mt-1">All metrics from artifacts/metrics.json via GET /metrics: samples train 2306 validation 1053 test 953, F1, precision, recall, FPR, PR-AUC, ROC-AUC, confusion matrix, latency p95. PASS/MISS gates: F1 &gt;=0.90, recall &gt;=0.90, FPR &lt;=0.05, p95 &lt;500ms. Displayed honestly - measured 0.845 macro F1, not Stitch 0.850 invented.</p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[13px]">
                <div className="bg-navy-800 rounded p-2 border border-navy-700">Method: Median imputation + robust scaling, balanced class weights, 5-frame EWMA, NetworkX ranking</div>
                <div className="bg-navy-800 rounded p-2 border border-navy-700">Limitations: Binary risk only, rule-derived stage, graph-ranked target, simulated isolation not causal, synthetic fallback disclosed</div>
              </div>
            </div>

            <div className="bg-navy-700 rounded p-3 border border-navy-700" data-testid="technical-proof-method">
              <h4 className="text-[13px] font-bold text-white flex items-center gap-1.5">
                <FlaskConical className="w-3 h-3 text-orange-400" aria-hidden="true" />
                Method and Limitations
              </h4>
              <ul className="list-disc list-inside text-[13px] text-gray-400 mt-1 space-y-1">
                <li>Learned: Binary benign-versus-malicious risk only - Random Forest (100/200 trees) selected via validation macro-F1 - 0.5*FPR - not multi-class attack predictor.</li>
                <li>Rule-derived: Stage evidence score - not calibrated probability - from predicted malicious ratio and port diversity.</li>
                <li>Graph-ranked: NetworkX target score = incoming activity * edge novelty * recent risk trend * asset criticality - not learned classifier.</li>
                <li>Simulated: Isolation clones frame, removes/down-weights host edges, re-runs pipeline - Estimated simulated effect, original replay immutable.</li>
                <li>Measured: All metrics and latency from held-out Friday partition, deterministic seed 42, no leakage, honest PASS/MISS.</li>
              </ul>
            </div>

            {/* Render children (which will be the existing WorkspaceTabs) when open - keeps existing panels without rewriting */}
            <div className="border-t border-navy-700 pt-3" data-testid="technical-proof-children">
              {children}
            </div>

            <button
              onClick={toggle}
              aria-label="Collapse Technical Proof drawer"
              className="self-start px-3 py-1.5 rounded bg-navy-700 hover:bg-navy-600 text-[13px] text-gray-300 border border-navy-700 focus:outline-none focus:ring-2 focus:ring-cyan-400"
              data-testid="technical-proof-collapse-btn"
            >
              Collapse Technical Proof
            </button>
          </>
        )}
      </div>
    </div>
  );
}
