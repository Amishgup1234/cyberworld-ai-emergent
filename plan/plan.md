# CyberWorld AI — Current Workflow

This document describes how the shipped app actually behaves today, end to end.
No new work is proposed here; it is a read-out of the live workflow so it can be
challenged or extended.

---

## 1. Entry & Boot

- The user lands directly on the command centre — no login screen.
- On boot, the app pulls the list of scenarios and the list of tenants from the
  backend, then auto-selects:
  - Scenario **Ransomware Ω-7742** (falls back to the first scenario if missing)
  - Tenant **ACME Financial Group** (first tenant in list)
- A boot spinner is shown until the first frame of state is fetched. If the
  backend is unreachable, a red banner explains the failure.

## 2. Persistent Top Bar

Always visible. Contains, left to right:

- Brand mark + tagline "Predict · Explain · Simulate · Defend"
- Live status chips: Twin Synced · Node count · Model version
- **Tenant dropdown** — switches the tenant context; used to filter incidents
- **Scenario dropdown** — switches the entire attack replay (topology, stages,
  MITRE map, XAI signals, mitigations and log all change)
- AI forecast confidence (updates with each frame)
- UTC clock (ticks every second)
- **Save Incident** button — captures the current snapshot to the backend

## 3. Left Navigation — Eight Rooms

The nav rail switches the main canvas between eight rooms. Every room shares
the same scrubber and top bar; only the panels change.

1. **Command Overview** — full stack: KPIs, twin, forecast rail, MITRE matrix,
   XAI, simulation, target segments, terminal, roadmap
2. **Digital Twin** — full-height twin canvas + tier breakdown + terminal
3. **Attack Forecast** — kill-chain probability trajectory (per-stage ramp
   window plus a live frame marker) + forecast rail + terminal
4. **Explainability** — SHAP-style contribution bars and an AI reasoning
   narrative that names the top three active signals
5. **MITRE ATT&CK** — matrix (tactics × techniques with confidence chips) plus a
   flat observed / awaiting techniques table
6. **What-if Simulate** — mitigation toggles side by side with a compact twin
7. **Incident Reports** — list of saved incident bundles for the current tenant
8. **Settings** — sensor sources (all mocked as active) and model / scenario
   metadata

Every room also has a **Prev / Next** pair to walk through the rooms sequentially.

## 4. Replay Scrubber

Sits directly under the section header on every room.

- Frames 0 through 29, with named milestones at 0 %, 20 %, 35 %, 55 % and 75 %:
  Baseline · Emerging · Early Warning · Critical Path · Exfil Risk.
- Controls: Restart · Step back · Play / Pause · Step forward · Speeds 0.5 ×,
  1 ×, 2 ×. Speeds change the auto-advance interval only.
- Scrubbing (drag) or stepping updates the `frame` state. On every change the
  app fetches the whole frame state from the backend and re-renders. Everything
  reactive — nodes, edges, kill-chain, MITRE, XAI, targets, KPIs, terminal —
  is derived from that response.

## 5. Live Panels (all driven by the current frame)

- **Network Digital Twin** — SVG graph. Nodes coloured by current risk
  (safe / watch / warn / critical), with pulsing rings on critical nodes.
  Edges show malicious flows (rose) and predicted paths (violet) with animated
  dashes. Hovering a node opens an inspector with id / ip / tier / kind.
- **Attack Forecast rail** — eight kill-chain stages with rising probabilities
  and a lead-time badge. Predicted next targets with per-host probability and
  ETA in minutes.
- **MITRE ATT&CK matrix** — techniques stay dim until the frame reaches their
  activation point, then unlock with a confidence colour (rose ≥ 0.75,
  amber ≥ 0.5, cyan otherwise).
- **Explainable AI** — active signals only, ordered by weight, each with the
  direction (up / down) and a short evidence sentence.
- **Live event terminal** — the log seed for the current scenario, tailed to
  the current frame. Filter chips exist but are visual only for now.

## 6. What-if Defense Simulation

- Each scenario ships with five mitigations relevant to that attack family
  (e.g. isolate AD-01 for the ransomware scenario, revoke IAM sessions for the
  cloud scenario, quarantine registry image for the supply-chain scenario).
- Toggling any mitigation immediately posts the full active set to the backend
  along with the current scenario id and frame. The backend returns the peak
  target risk, the cumulative delta, and the mitigated risk. The two side-by-
  side risk cards animate to the new numbers.
- "Rerun Forecast With Defense" is currently a visual affordance — every toggle
  already triggers a rerun.

## 7. Save & Export Incident

- **Save Incident** (top bar) — sends the current scenario, tenant, frame,
  active mitigations, operator name and a note to the backend. The backend
  captures a full snapshot (KPIs, targets, stages, active MITRE techniques,
  active XAI signals, simulation delta) and stores it in Mongo. A toast
  confirms with the generated incident id. The app then jumps to the Reports
  room.
- **Reports room** — one card per saved incident with title, scenario, frame,
  timestamp, baseline / mitigated risk, technique count, signal count.
  - **Open** — reloads that exact state (scenario, frame, mitigations) into the
    live view and returns the user to Command Overview.
  - **Export** — downloads the bundle as a `<incident-id>.json` file. There is
    no PDF export yet.
- Reports are scoped to the currently selected tenant.

## 8. Scenarios & Tenants Available

- Scenarios (three seeded on backend startup):
  - **Ransomware Ω-7742** — VPN → AD → SMB → PII
  - **Cloud Credential Heist γ-3311** — VPN → IAM → S3 exfil
  - **Supply Chain Compromise λ-9018** — dev laptop → CI → registry → K8s prod
- Tenants (three seeded):
  - **ACME Financial Group** (Enterprise, US-EAST-1)
  - **Orbital Health Systems** (Enterprise, EU-WEST-2)
  - **Fortis MSSP · Client 14** (MSSP, AP-SOUTH-1)

## 9. What Is Not Yet Wired

- No authentication; anyone with the URL can operate any tenant.
- No PDF export — bundles are JSON only.
- No WebSocket streaming — every frame change is a fresh HTTP call.
- No real telemetry ingestion — scenarios are seeded, not fed by live sensors.
- No playbook automation — mitigations are chosen manually each time.
- Threat intel on node hover is limited to what is baked into the seeded data.

## 10. Open Questions for the User

- Which of the missing pieces above should come next, and in what order?
- Should tenants become isolated (an ACME operator cannot see Orbital) or stay
  shared as they are today for demo purposes?
- Is the current attack story arc (0 → 29 frames, five milestones) the right
  granularity, or should scenarios be longer / branching?
