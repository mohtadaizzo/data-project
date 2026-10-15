const EXPOSURE = {
  0: "isolated",
  1: "exposed",
  2: "edge",
  3: "sheltered",
  4: "surrounded",
};

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

/**
 * Neighbors = previous / next Bay column in the block, same Row.
 * Empty cell on that row is not a neighbor.
 */
export function stackTopology(items) {
  const stats = new Map();
  const baysByBlock = new Map();
  for (const c of items) {
    const block = String(c.block).trim();
    const bn = bayNum(c.bay);
    const rn = rowNum(c.row);
    const key = `${block}|${bn}|${rn}`;
    const h = Number(c.occupied_count || c.stack_height || c.tier || 1);
    const prev = stats.get(key);
    if (!prev) {
      stats.set(key, { block, bn, rn, height: h, occupied: 1 });
    } else {
      prev.height = Math.max(prev.height, h);
      prev.occupied += 1;
    }
    if (!baysByBlock.has(block)) baysByBlock.set(block, new Set());
    baysByBlock.get(block).add(bn);
  }

  const sortedBays = new Map();
  for (const [block, set] of baysByBlock) {
    sortedBays.set(block, [...set].sort((a, b) => a - b));
  }

  const byKey = new Map();
  for (const [key, st] of stats.entries()) {
    const bays = sortedBays.get(st.block) || [];
    const i = bays.indexOf(st.bn);
    const neigh = [];
    const leftBn = i > 0 ? bays[i - 1] : null;
    const rightBn = i >= 0 && i < bays.length - 1 ? bays[i + 1] : null;
    if (leftBn != null) {
      const nb = stats.get(`${st.block}|${leftBn}|${st.rn}`);
      if (nb) neigh.push(nb);
    }
    if (rightBn != null) {
      const nb = stats.get(`${st.block}|${rightBn}|${st.rn}`);
      if (nb) neigh.push(nb);
    }
    const neighH = neigh.map((n) => n.height);
    const neighOcc = neigh.map((n) => n.occupied);
    const count = neighH.length;
    const neighborhood = neighH.length ? Math.max(...neighH.filter((h) => h >= 3), 0) : 0;
    const gap = Math.max(0, st.height - neighborhood);
    byKey.set(key, {
      neighbor_count: count,
      neighbor_container_count: neighOcc.reduce((a, b) => a + b, 0),
      neighbor_min_height: neighH.length ? Math.min(...neighH) : st.height,
      height_gap: gap,
      stack_exposure: EXPOSURE[Math.min(count, 4)],
    });
  }

  const out = {};
  for (const c of items) {
    const key = `${String(c.block).trim()}|${bayNum(c.bay)}|${rowNum(c.row)}`;
    out[c.container_id] = byKey.get(key) || {
      neighbor_count: c.neighbor_count ?? 0,
      neighbor_container_count: c.neighbor_container_count ?? 0,
      neighbor_min_height: c.neighbor_min_height ?? 1,
      height_gap: c.height_gap ?? 0,
      stack_exposure: c.stack_exposure ?? "isolated",
    };
  }
  return out;
}

/**
 * Build TOS yard slots from containers + latest risk map.
 */
export function buildYardSlots(containers, riskByContainerId = {}, fallbackWind = 0) {
  const byBlock = new Map();
  for (const c of containers) {
    const block = String(c.block).trim();
    if (!byBlock.has(block)) byBlock.set(block, []);
    byBlock.get(block).push(c);
  }

  const slots = [];
  for (const [block, items] of [...byBlock.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const topo = stackTopology(items);
    for (const c of items) {
      const risk = riskByContainerId[c.container_id];
      const t = topo[c.container_id] || {};
      slots.push({
        container_id: c.container_id,
        block,
        bay: String(c.bay).trim(),
        row: String(c.row).trim(),
        tier: c.tier,
        stack_rank: c.stack_rank ?? risk?.stack_rank ?? null,
        occupied_count: c.occupied_count ?? risk?.occupied_count ?? c.stack_height,
        stack_height: c.occupied_count ?? risk?.occupied_count ?? c.stack_height,
        is_imdg: !!c.is_imdg,
        imo_class: c.imo_class ?? null,
        weight_kg: c.weight_kg,
        risk_score: risk?.risk_score ?? 0,
        risk_level: risk?.risk_level ?? "Low",
        alert_color: risk?.alert_color ?? "green",
        explanation: risk?.explanation ?? null,
        stability_score: risk?.stability_score ?? 0,
        container_score: risk?.container_score ?? 0,
        height_gap: t.height_gap ?? c.height_gap ?? 0,
        neighbor_count: t.neighbor_count ?? c.neighbor_count ?? 0,
        neighbor_container_count: t.neighbor_container_count ?? c.neighbor_container_count ?? 0,
        neighbor_min_height: t.neighbor_min_height ?? c.neighbor_min_height ?? 1,
        stack_exposure: t.stack_exposure ?? c.stack_exposure ?? "isolated",
        has_left_neighbor: !!c.has_left_neighbor,
        has_right_neighbor: !!c.has_right_neighbor,
        laterally_exposed: !!c.laterally_exposed,
        neighborhood_height: c.neighborhood_height ?? 0,
        wind_speed_kmh: risk?.wind_speed_kmh ?? fallbackWind,
        lat: 0,
        lng: 0,
      });
    }
  }
  return slots;
}

export function blockSummaries(slots) {
  const byBlock = new Map();
  for (const s of slots) {
    if (!byBlock.has(s.block)) byBlock.set(s.block, []);
    byBlock.get(s.block).push(s);
  }
  return [...byBlock.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([block, items], i) => {
      const scores = items.map((x) => x.risk_score);
      return {
        block,
        container_count: items.length,
        avg_risk_score: scores.length
          ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
          : 0,
        max_risk_score: scores.length ? Math.max(...scores) : 0,
        dangerous_count: items.filter((x) => x.is_imdg).length,
        lat: 0,
        lng: 0,
        south: 0,
        north: 0,
        west: 0,
        east: 0,
        origin: [i % 8, Math.floor(i / 8)],
      };
    });
}
