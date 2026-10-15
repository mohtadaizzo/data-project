"""Yard topology from real TOS coordinates (Block, Bay, Row, Tier).

Physical height = occupied CTR count in the same Block+Bay+Row.
Stack_Rank 1 = bottom of that pile (sorted by TOS Tier).

Voisinage = pile in the previous / next Bay column of the block, same Row.
An empty cell on that row is not a neighbor (do not skip dashed slots).
A pile of height 1–2 is not a supporting neighbor (4th/5th stay isolated).
Neighborhood height = max(left support, right support), 0 if none.
A unit is exposed when its rank is above the neighborhood.
A line of equal height is protected. Isolated / taller than neighbors is not.
"""

from __future__ import annotations

import re

import pandas as pd

MIN_SUPPORT_HEIGHT = 3


def _support_height(h: int) -> int:
    return h if h >= MIN_SUPPORT_HEIGHT else 0


def _bay_num(value) -> int:
    digits = re.sub(r"\D", "", str(value))
    return int(digits) if digits else 0


def _row_num(value) -> int:
    text = str(value).strip().upper()
    digits = re.sub(r"\D", "", text)
    base = int(digits) if digits else 0
    letters = re.sub(r"[^A-Z]", "", text)
    letter_part = sum((ord(c) - 64) for c in letters) if letters else 0
    return base * 100 + letter_part


def compute_yard_topology(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    out["Block"] = out["Block"].astype(str).str.strip()
    out["Bay"] = out["Bay"].astype(str).str.strip()
    out["Row"] = out["Row"].astype(str).str.strip()
    out["Tier"] = pd.to_numeric(out["Tier"], errors="coerce").fillna(1).astype(int)

    occupied: dict[tuple, int] = {}
    bays_by_block: dict[str, set[int]] = {}

    for (block, bay, row), grp in out.groupby(["Block", "Bay", "Row"], sort=False):
        bn, rn = _bay_num(bay), _row_num(row)
        key = (str(block), bn, rn)
        height = int(len(grp))
        occupied[key] = height
        bays_by_block.setdefault(str(block), set()).add(bn)

    sorted_bays = {block: sorted(bns) for block, bns in bays_by_block.items()}

    ranks = pd.Series(0, index=out.index, dtype=int)
    for _, grp in out.groupby(["Block", "Bay", "Row"], sort=False):
        order = grp.sort_values("Tier").index
        for rank, idx in enumerate(order, start=1):
            ranks.at[idx] = rank
    out["Stack_Rank"] = ranks

    stack_h = []
    occ = []
    lefts = []
    rights = []
    exposed = []
    n_count = []
    n_ctr = []
    n_min = []
    gaps = []
    neighborhoods = []
    anys = []

    for idx, row in out.iterrows():
        block = str(row["Block"])
        bn, rn = _bay_num(row["Bay"]), _row_num(row["Row"])
        key = (block, bn, rn)
        height = occupied[key]
        rank = int(out.at[idx, "Stack_Rank"])
        bays = sorted_bays.get(block, [])
        i = bays.index(bn) if bn in bays else -1
        left_bn = bays[i - 1] if i > 0 else None
        right_bn = bays[i + 1] if 0 <= i < len(bays) - 1 else None
        left_h = _support_height(occupied.get((block, left_bn, rn), 0) if left_bn is not None else 0)
        right_h = _support_height(occupied.get((block, right_bn, rn), 0) if right_bn is not None else 0)
        neighborhood = max(left_h, right_h)
        has_left = left_h > 0
        has_right = right_h > 0
        lat_exposed = bool(height >= 3 and rank >= 3 and rank > neighborhood)

        neigh_h = [h for h in (left_h, right_h) if h > 0]
        neigh_occ = sum(neigh_h)
        count = int(left_h > 0) + int(right_h > 0)
        gap = max(0, height - neighborhood)

        stack_h.append(height)
        occ.append(height)
        lefts.append(has_left)
        rights.append(has_right)
        exposed.append(lat_exposed)
        n_count.append(count)
        n_ctr.append(neigh_occ)
        n_min.append(int(neighborhood))
        gaps.append(int(max(0, gap)))
        neighborhoods.append(int(neighborhood))
        anys.append(bool(has_left or has_right))

    out["Stack_Height"] = stack_h
    out["Occupied_Count"] = occ
    out["Has_Left_Neighbor"] = lefts
    out["Has_Right_Neighbor"] = rights
    out["Laterally_Exposed"] = exposed
    out["Neighbor_Count"] = n_count
    out["Neighbor_Container_Count"] = n_ctr
    out["Neighbor_Min_Height"] = n_min
    out["Neighborhood_Height"] = neighborhoods
    out["Has_Any_Neighbor"] = anys
    out["Height_Gap"] = gaps
    out["Has_Height_Gap_Alert"] = [g >= 2 for g in gaps]
    out["Stack_Exposure"] = [
        "exposed" if e else ("protected" if r >= 3 else "low")
        for e, r in zip(exposed, out["Stack_Rank"].tolist())
    ]
    return out


def compute_neighbor_height_gaps(df: pd.DataFrame) -> pd.DataFrame:
    return compute_yard_topology(df)
