/**
 * Per-container risk — same rules as ai/pipeline/labeling.py
 *
 * Physical pile = how many CTR sit in the same Block+Bay+Row (not TOS Tier).
 * 1–2 containers: no height-stability risk (petite hauteur).
 * 3rd exposed (no covering neighbor): low risk.
 * 4th+ exposed: high risk, then wind and IMO add more.
 * Voisinage = case Bay immédiatement à gauche / droite sur la même Row (grille à l’écran).
 * Une case vide (pointillés) n’est pas un voisin : on ne saute pas jusqu’à une pile lointaine.
 * Same-height neighbors → no height risk (green).
 * Has a supporting neighbor (height ≥ 3) but taller → at most orange, never red.
 * Isolated, or only a pile of 1–2 beside you → 4e/5e both red.
 */

const IMO_POINTS = {
  1: 28,
  2: 24,
  3: 18,
  4: 16,
  5: 22,
  6: 18,
  8: 16,
  9: 12,
};

function imoDigit(imo) {
  if (imo == null) return null;
  const text = String(imo).trim();
  if (!text || text === "nan" || text === "None" || text === "UNK") return null;
  const ch = [...text].find((c) => c >= "0" && c <= "9");
  return ch || null;
}

function isImdg(c) {
  if (c.is_imdg === true || c.is_imdg === 1 || c.is_imdg === "Y") return true;
  return imoDigit(c.imo_class) != null;
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function bayNum(v) {
  const d = String(v).replace(/\D/g, "");
  return d ? parseInt(d, 10) : 0;
}

function rowNum(v) {
  const text = String(v).trim().toUpperCase();
  const digits = text.replace(/\D/g, "");
  const base = digits ? parseInt(digits, 10) : 0;
  const letters = text.replace(/[^A-Z]/g, "");
  const letterPart = [...letters].reduce((s, c) => s + (c.charCodeAt(0) - 64), 0);
  return base * 100 + letterPart;
}

/** Continuous wind so each climate day changes the score. */
export function windBoost(windKmh, gustKmh) {
  const wind = Math.max(0, Number(windKmh) || 0);
  const gust = Math.max(0, Number(gustKmh) || 0);
  return clamp(wind * 0.38 + Math.max(0, gust - wind) * 0.16, 0, 36);
}

function stackKey(block, bn, rn) {
  return `${block}|${bn}|${rn}`;
}

/** A 1–2 CTR pile does not support a 4th/5th container. */
const MIN_SUPPORT_HEIGHT = 3;

function supportHeight(h) {
  return h >= MIN_SUPPORT_HEIGHT ? h : 0;
}

/**
 * Voisin = pile dans la colonne Bay précédente / suivante du block, même Row.
 * Case vide à l’écran = pas de voisin (on ne saute pas les pointillés).
 * Hauteur 1–2 = pas un voisin de stabilité.
 */
export function applyLateralNeighbors(containers) {
  const groups = new Map();
  for (const c of containers) {
    const key = stackKey(String(c.block).trim(), bayNum(c.bay), rowNum(c.row));
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }

  const occ = new Map();
  const baysByBlock = new Map();

  for (const [key, list] of groups) {
    list.sort((a, b) => Number(a.tier || 1) - Number(b.tier || 1));
    const n = list.length;
    const sample = list[0];
    const block = String(sample.block).trim();
    const bn = bayNum(sample.bay);
    occ.set(key, n);
    list.forEach((c, i) => {
      c.occupied_count = n;
      c.stack_rank = i + 1;
    });
    if (!baysByBlock.has(block)) baysByBlock.set(block, new Set());
    baysByBlock.get(block).add(bn);
  }

  const sortedBays = new Map();
  for (const [block, set] of baysByBlock) {
    sortedBays.set(block, [...set].sort((a, b) => a - b));
  }

  for (const c of containers) {
    const block = String(c.block).trim();
    const bn = bayNum(c.bay);
    const rn = rowNum(c.row);
    const rank = Number(c.stack_rank || 1);
    const n = Number(c.occupied_count || 1);
    const bays = sortedBays.get(block) || [];
    const i = bays.indexOf(bn);
    const leftBn = i > 0 ? bays[i - 1] : null;
    const rightBn = i >= 0 && i < bays.length - 1 ? bays[i + 1] : null;
    const leftH = supportHeight(leftBn == null ? 0 : occ.get(stackKey(block, leftBn, rn)) || 0);
    const rightH = supportHeight(rightBn == null ? 0 : occ.get(stackKey(block, rightBn, rn)) || 0);
    const neighborhood = Math.max(leftH, rightH);
    c.neighborhood_height = neighborhood;
    c.has_left_neighbor = leftH > 0;
    c.has_right_neighbor = rightH > 0;
    c.has_any_neighbor = leftH > 0 || rightH > 0;
    c.laterally_exposed = n >= 3 && rank >= 3 && rank > neighborhood;
  }
  return containers;
}

export function riskLevelFromScore(score) {
  if (score >= 70) return "High";
  if (score >= 40) return "Medium";
  return "Low";
}

export function alertColorFromScore(score) {
  if (score >= 70) return "red";
  if (score >= 40) return "orange";
  return "green";
}

export function buildExplanation(score, factors, level) {
  if (!factors.length) return `Risque ${level} (score ${score.toFixed(0)}/100) — conditions nominales.`;
  const suffix =
    level === "High" ? " = Risque critique." : level === "Medium" ? " = Risque modéré." : " = Risque faible.";
  return `${factors.join(" + ")}${suffix}`;
}

export function scoreBreakdown(c, windKmh, gustKmh) {
  const occ = Number(c.occupied_count || c.stack_height || 1);
  const rank = Number(c.stack_rank || Math.min(Number(c.tier || 1), occ) || 1);
  const wind = Number(windKmh || 0);
  const gust = Number(gustKmh || 0);
  const boost = windBoost(wind, gust);
  const factors = [];
  let stability = 0;

  const neighborhood = Number(c.neighborhood_height ?? 0);
  const hasLeft = !!c.has_left_neighbor;
  const hasRight = !!c.has_right_neighbor;
  const hasVoisinage = !!c.has_any_neighbor || hasLeft || hasRight || neighborhood > 0;
  const tallerThanNeighbors = rank > neighborhood;

  if (occ <= 2 || rank < 3) {
    factors.push(`Pile de ${occ} CTR · rang ${rank} : hauteur trop petite, pas de risque de stabilité`);
  } else if (!tallerThanNeighbors) {
    factors.push(`Rang ${rank}/${occ} protégé (voisinage hauteur ${neighborhood})`);
  } else {
    factors.push(`Rang ${rank}/${occ} plus haut que le voisinage (${neighborhood})`);

    if (rank === 3) {
      stability = clamp(18 + boost * 0.45, 0, 38);
      factors.push("3e conteneur : risque faible");
    } else if (hasVoisinage) {
      const extraH = rank - neighborhood;
      stability = clamp(42 + extraH * 3 + boost * 0.35, 40, 69);
      factors.push(`${rank}e : risque modéré (il y a du voisinage)`);
    } else {
      stability = 72;
      factors.push(`${rank}e isolé : même règle pour toute pile ≥ 4 sans voisin`);
    }

    if (wind > 0) factors.push(`vent ${Math.round(wind)} km/h`);
    if (gust >= 55) factors.push(`rafales ${Math.round(gust)} km/h`);
  }

  stability = clamp(stability, 0, 80);

  let cargo = 0;
  const imdg = isImdg(c);
  const digit = imoDigit(c.imo_class);
  if (imdg) {
    cargo += IMO_POINTS[digit] ?? 16;
    factors.push(`marchandises dangereuses IMO ${digit || "?"}`);
  }
  cargo = clamp(cargo, 0, 40);

  let extra = 0;
  if (imdg && stability >= 40) {
    extra += 10;
    factors.push("IMO sur unité exposée");
  }
  if (imdg && wind >= 50) {
    extra += 8;
    factors.push("combinaison IMDG + vent");
  }

  const scoreRaw = clamp(stability + cargo + extra, 0, 100);
  let score = scoreRaw;
  if (hasVoisinage && score >= 70) {
    score = 69;
    factors.push("voisinage : pas de rouge");
  }

  const level = riskLevelFromScore(score);
  const color = alertColorFromScore(score);
  return {
    risk_score: Math.round(score * 10) / 10,
    stability_score: Math.round(stability * 10) / 10,
    container_score: Math.round(cargo * 10) / 10,
    risk_level: level,
    alert_color: color,
    factors,
    explanation: buildExplanation(score, factors, level),
    wind_speed_kmh: wind,
    stack_rank: rank,
    occupied_count: occ,
    has_left_neighbor: hasLeft,
    has_right_neighbor: hasRight,
    has_any_neighbor: hasVoisinage,
    laterally_exposed: occ >= 3 && rank >= 3 && rank > neighborhood,
    neighborhood_height: neighborhood,
  };
}

export function scoreYard(containers, windKmh, gustKmh, options = {}) {
  if (options.applyNeighbors !== false) applyLateralNeighbors(containers);
  const byId = {};
  for (const c of containers) {
    byId[c.container_id] = scoreBreakdown(c, windKmh, gustKmh);
  }
  return byId;
}

export function summarizeScores(byId) {
  const rows = Object.values(byId);
  const n = rows.length || 1;
  const avg = rows.reduce((a, r) => a + r.risk_score, 0) / n;
  const high = rows.filter((r) => r.risk_level === "High").length;
  const medium = rows.filter((r) => r.risk_level === "Medium").length;
  const low = rows.filter((r) => r.risk_level === "Low").length;
  const red = rows.filter((r) => r.alert_color === "red").length;
  const orange = rows.filter((r) => r.alert_color === "orange").length;
  const green = rows.filter((r) => r.alert_color === "green").length;
  return {
    avg_risk_score: Math.round(avg * 10) / 10,
    max_risk_score: rows.reduce((m, r) => Math.max(m, r.risk_score), 0),
    high,
    medium,
    low,
    red,
    orange,
    green,
    risk_level_counts: { High: high, Medium: medium, Low: low },
  };
}
