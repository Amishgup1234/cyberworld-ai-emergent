# CyberWorld AI — Predictive Cybersecurity Command Centre

## Original Problem Statement
"create a great ui ux for this" — user provided PDF pitch deck for CyberWorld AI, a
Predictive Cybersecurity Platform that uses a Network Digital Twin to forecast attacks
across the MITRE ATT&CK lifecycle. Tagline: *Predict · Explain · Simulate · Defend*.

## User Choices (2026-01)
- Interactive product dashboard demo (not a marketing landing page)
- Dark cyber / tactical aesthetic (midnight bg, neon cyan/lime, mono terminal)
- Content sourced directly from the PDF
- Animated interactive Network Digital Twin as the hero centerpiece
- Goal: "great UI/UX that looks like a great cybersecurity app in an AI way"

## Architecture
- **Frontend only** demo — Vite + React + TypeScript + TailwindCSS + Lucide Icons
- Existing complex backend-connected app was replaced by a fresh demo App.tsx with
  mocked scenario data faithful to the PDF (nodes, kill-chain, MITRE, XAI, mitigations, roadmap)
- Fonts: Chakra Petch (display) · IBM Plex Sans (body) · JetBrains Mono (data)
- Custom CSS: grain overlay, scan grid, neon glows, tactical clip-path buttons, corner brackets, blink/pulse animations
- Vite config: allowedHosts:true, port 3000, HMR over wss for preview URL

## User Personas (from PDF)
- SOC Analysts · CISO / Risk Officers · Red & Blue Teams · MSSP Providers

## Implemented (2026-01)
- Sticky top command bar: brand mark, twin-synced chip, model chip, AI confidence, UTC clock, STRATEGY & DEPLOY buttons
- Left nav rail with 8 sections + operator card
- Hero band: tagline, description, 3 CTAs (Inspect / Run Forecast / Contain)
- 4 KPI tiles: threats, forecast confidence, mean lead time, twin nodes
- Interactive Network Digital Twin SVG canvas (13 nodes, 13 edges) with:
  - Risk-colored nodes with hover inspector
  - Animated packet flow dashes (malicious=rose, predicted=violet, normal=cyan)
  - Pulsing critical-node rings, radar sweep, scan line
- Attack Forecast rail: 8-stage kill-chain probability bars + predicted next targets
- MITRE ATT&CK matrix: 8 tactics × 12 techniques with confidence chips
- Explainable AI panel: 6 SHAP-style feature contributions with directional bars
- What-if Defense Simulation: 5 toggleable mitigations with live risk delta baseline→after
- Live event terminal: auto-appending event stream (1.8s cadence), filter chips
- Commercialization Roadmap: 4 phases from PDF (Prototype→XAI→Autonomous→SOAR)
- Target Segments grid: 4 user personas from PDF
- Footer strip with Predict · Explain · Simulate · Defend indicators

## Core Requirements (static)
- Must feel like a real cybersecurity mission-control app (not "AI slop")
- Content faithful to CyberWorld AI PDF pitch deck
- All interactive elements have `data-testid` attributes
- Dark tactical theme; no purple/violet gradient on white; no generic centered layout

## Backlog / Next Actions
- **P1**: Multi-view routing — switch left-nav sections to filter/reshape main canvas
- **P1**: Attack replay timeline scrubber with phase milestones
- **P2**: XAI drill-down modal per signal with raw event snippets
- **P2**: Multi-tenant / MSSP view (tenant switcher in top bar)
- **P2**: Real backend integration (currently 100% mocked)
- **P3**: Export incident report PDF with evidence bundle
