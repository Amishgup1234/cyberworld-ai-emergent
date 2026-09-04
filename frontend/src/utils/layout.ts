import type { NetworkNode } from '../api/generated';

export interface Position {
  x: number;
  y: number;
}

// Deterministic hash for jitter and alias sanitization
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Sanitize displayed alias: only values matching host-N may be rendered,
 * even if API supplies unsafe alias like raw IP. Deterministic fallback via hash.
 */
export function sanitizeAlias(alias: string | null | undefined): string {
  if (!alias) return 'host-1';
  if (/^host-\d+$/.test(alias)) return alias;
  const h = hashString(alias);
  const n = (h % 1000) + 1;
  return `host-${n}`;
}

// Deterministic grid layout that guarantees no overlap for 20 hosts at both viewports - Phase 14 increased spacing for 13px body text height + host alias/role/risk 13px (5 lines)
export function getNodePosition(node: NetworkNode, index: number, total: number): Position {
  const cols = 5;
  const rows = Math.ceil(Math.max(1, total) / cols);
  const cellW = 150;
  const cellH = 135;
  const gridW = cols * cellW;
  const gridH = rows * cellH;
  const offsetX = 350 - gridW / 2;
  const offsetY = 220 - gridH / 2;
  const col = index % cols;
  const row = Math.floor(index / cols);
  const hash = hashString(node.id || '');
  // small deterministic jitter +-5px to avoid perfect grid look, < spacing/3
  const jitterX = (hash % 11) - 5;
  const jitterY = ((hash >> 4) % 11) - 5;
  let x = offsetX + col * cellW + cellW / 2 + jitterX;
  let y = offsetY + row * cellH + cellH / 2 + jitterY;

  // For default 20 hosts, grid fits with 13px text height; clamp safely with larger cellH 135.
  // For larger totals (Show All), do not clamp Y tightly to avoid collapsing.
  if (total <= 25) {
    x = Math.max(30, Math.min(670, x));
    y = Math.max(30, Math.min(500, y));
  } else {
    x = Math.max(10, Math.min(690, x));
    y = Math.max(10, y);
  }
  return { x, y };
}

export function getAllPositions(nodes: NetworkNode[]): Map<string, Position> {
  const sorted = [...nodes].sort((a, b) => a.id.localeCompare(b.id));
  const map = new Map<string, Position>();
  sorted.forEach((n, idx) => {
    map.set(n.id, getNodePosition(n, idx, sorted.length));
  });
  return map;
}
