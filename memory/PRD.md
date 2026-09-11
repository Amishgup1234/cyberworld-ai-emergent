# CyberWorld AI — Predictive Cybersecurity Command Centre

## Original Problem Statement
User provided PDF pitch deck for CyberWorld AI (Predictive Cybersecurity Platform,
Network Digital Twin, MITRE ATT&CK lifecycle). Started with "create a great ui/ux",
progressed to "now make a complete working app" — full stack, real backend, real data.

## Architecture (complete working app · 2026-01)
- **Backend**: FastAPI + Motor (async MongoDB), single-file `/app/backend/server.py`
  - Seeds 3 attack scenarios and 3 tenants on startup (idempotent upserts)
  - Server-side frame computation (kill-chain probabilities, node risk escalation, edge visibility, MITRE unlock, XAI activation, target predictions, KPIs, log tail)
  - Simulation endpoint applies mitigation deltas against peak target risk
  - Incident bundle persistence + list per tenant
- **Frontend**: Vite + React 18 + TypeScript, tactical cyber design system
  - `src/api/client.ts` fully typed API client
  - Same-origin `/api` routing (Kubernetes ingress → :8001)
  - Dark cyber aesthetic (Chakra Petch, IBM Plex, JetBrains Mono, grain, glass, corner brackets, neon)
- **Storage**: MongoDB (`cyberworld_ai` db): `scenarios`, `tenants`, `incidents`

## Backend Endpoints
- `GET  /api/health` — status + scenario count
- `GET  /api/tenants` — 3 tenants (ACME, Orbital, Fortis MSSP)
- `GET  /api/scenarios` — list scenarios
- `GET  /api/scenarios/{id}` — full scenario (nodes, edges, stages, mitre, xai, mitigations, target pool, log seed)
- `GET  /api/scenarios/{id}/frame/{frame}` — computed state for that frame
- `POST /api/simulate` — apply mitigations, return baseline + new_risk + delta
- `POST /api/incidents` — save incident bundle (server captures snapshot)
- `GET  /api/incidents?tenant_id=…` — list per tenant
- `GET  /api/incidents/{id}` — retrieve

## Scenarios seeded
1. **Ransomware Ω-7742** — VPN→AD→SMB→PII (13 nodes, 8 stages, 5 mitigations)
2. **Cloud Credential Heist γ-3311** — IAM abuse→S3 exfil (9 nodes, cloud-heavy)
3. **Supply Chain Compromise λ-9018** — CI→Registry→K8s prod (8 nodes, supply chain)

## Frontend Features
- **Multi-tenant selector** in top bar (ACME, Orbital Health, Fortis MSSP)
- **Multi-scenario selector** in top bar with instant twin re-render
- **Replay Scrubber** — play/pause/step/speed(0.5×/1×/2×) driving all panels via backend fetches
- **8 Rooms** — Overview, Twin, Forecast, XAI, MITRE, Simulate, Reports, Settings
- **What-if Simulation** — mitigation toggles POST to `/api/simulate`, real-time baseline vs mitigated delta
- **Save Incident** — captures scenario+frame+mitigations+snapshot to Mongo, toast confirmation
- **Incident export** — downloads JSON bundle to disk
- **Open incident** — reloads scenario+frame+mitigations from a saved bundle
- **Live terminal** — server-supplied log tail keyed by frame
- **Loading + error states** — boot spinner, backend-down banner, toast notifications

## User Personas
- SOC Analysts · CISO / Risk Officers · Red & Blue Teams · MSSP Providers

## Backlog / Next Actions
- **P1**: Playbook automation — chain mitigation toggles into named playbooks that auto-run on matching forecast patterns
- **P1**: PDF export (currently JSON only)
- **P2**: Real WebSocket streaming for frame progression (currently HTTP fetch per frame)
- **P2**: Real threat intel enrichment on node hover (CVE/IOC/ASN reputation)
- **P3**: Authentication + RBAC per tenant
- **P3**: Historical trend charts across saved incidents
