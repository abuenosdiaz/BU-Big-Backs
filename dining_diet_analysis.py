"""
Forward-looking per-dining-hall statistics on vegan (and other dietary)
availability, built for sharing with dining staff to raise concerns about
limited vegan options.

Orientation in time
--------------------
There is no historical data. Today's menu is the BASELINE. As the dining
poller captures the next ~two weeks of daily menus, this module compares that
upcoming HORIZON window against the baseline and reports whether vegan
availability is set to improve, hold, or worsen going forward.

Each menu row carries a service ``date``. Days are bucketed relative to an
anchor date (default: the earliest date present, i.e. "today"):

    period == "baseline"   the anchor day itself
    period == "horizon"    anchor < day <= anchor + horizon_days (default 14)
    period == "beyond"     further out than the horizon (ignored by default)

The code runs correctly today with only the baseline present: horizon metrics
come back as NaN until future dates arrive, and the comparison columns fill in
automatically as data lands. Nothing needs to change when the new data shows up.

Input
-----
The item-level DataFrame from ``collect_menu_dfs.collect_menu_dataframes``:
one row per (snapshot, location, meal, station, item), with diet flags
(vegan/vegetarian/gluten_free/halal) and nutrition (calories, protein, ...).

Output
------
``build_forward_summary`` returns a DataFrame with **one row per dining hall**.
Columns come in three blocks:

    *_baseline   the metric computed on the baseline day
    *_horizon    the same metric computed over the horizon window
    *_change     horizon minus baseline (positive = improving)

plus a short, staff-facing ``vegan_outlook`` label per hall.

Usage
-----
    from collect_menu_dfs import collect_menu_dataframes
    from dining_diet_analysis import build_forward_summary

    items = collect_menu_dataframes()
    summary = build_forward_summary(items)            # anchor = earliest date
    summary.to_csv("vegan_outlook_by_hall.csv", index=False)
"""

from __future__ import annotations

import math
import re
from typing import Optional

import numpy as np
import pandas as pd


# ----------------------------------------------------------------------
# 1. Entree vs component classification
# ----------------------------------------------------------------------
# Most metrics depend on separating meal-style dishes from salad-bar
# components, condiments, breads, sweets and drinks. Staff will otherwise
# point at plain plant ingredients (olive oil, soy sauce) as "vegan options",
# so entree-only shares are the fairer comparison. These sets are editable as
# the station vocabulary grows.

ENTREE_STATIONS = {
    "brick oven", "concept kitchen", "grill", "home", "home zone",
    "international", "mediterranean", "mongolian", "pizza", "saute",
    "true balance", "vegan", "world", "wraps n bowls",
    "gluten free", "gluten free kitchen", "deli",
}

COMPONENT_STATIONS = {
    "bakery", "deli cyo", "gluten free cyo", "grill condiments and more",
    "hot breakfast cereals", "salad bar", "smoothie", "soup",
    "true balance cyo",
}

COMPONENT_NAME_PATTERNS = [
    r"\bdressing\b", r"\bvinaigrette\b", r"\bvinegar\b", r"\bmayonnaise\b",
    r"\bchutney\b", r"\bsauce\b", r"\bhoisin\b",
    r"\bsesame seeds?\b", r"\bscallions?\b", r"\bpickled\b", r"\bolive oil\b",
    r"\bbread\b", r"\broll\b", r"\btortilla\b", r"\bpita\b", r"\bbreadstick\b",
    r"\byogurt\b", r"\bgranola\b", r"\braisins?\b", r"\bcompote\b",
    r"\bcookie\b", r"\bcake\b", r"\bcupcake\b", r"\bbeignet\b", r"\bmuffin\b",
    r"\bsmoothie\b", r"\bcreate your own\b", r"\bgrill works\b",
]
_COMPONENT_NAME_RE = re.compile("|".join(COMPONENT_NAME_PATTERNS), re.IGNORECASE)


def classify_item_type(station: object, name: object, description: object) -> str:
    """Return "entree" or "component" for a single item.

    Priority: component keyword in name -> component station -> entree
    station -> default component (so unknown small items don't inflate the
    entree-based vegan share).
    """
    name_text = "" if name is None else str(name)
    if _COMPONENT_NAME_RE.search(name_text):
        return "component"

    station_key = "" if station is None else str(station).strip().casefold()
    if station_key in COMPONENT_STATIONS:
        return "component"
    if station_key in ENTREE_STATIONS:
        return "entree"
    return "component"


# ----------------------------------------------------------------------
# 2. Statistics helpers
# ----------------------------------------------------------------------

def wilson_interval(successes: int, total: int, z: float = 1.96
                    ) -> tuple[float, float]:
    """95% Wilson score interval for a proportion; (nan, nan) if total == 0."""
    if total <= 0:
        return (float("nan"), float("nan"))
    phat = successes / total
    denom = 1 + z**2 / total
    center = (phat + z**2 / (2 * total)) / denom
    half = (z * math.sqrt(phat * (1 - phat) / total + z**2 / (4 * total**2))) / denom
    return (max(0.0, center - half), min(1.0, center + half))


def _share(mask_sum: int, total: int) -> float:
    return (mask_sum / total) if total else float("nan")


def _as_bool(series: pd.Series) -> pd.Series:
    return series.fillna(False).astype(bool)


# ----------------------------------------------------------------------
# 3. Thresholds and config
# ----------------------------------------------------------------------

DIET_FLAGS = ["vegan", "vegetarian", "gluten_free", "halal"]

# A vegan entree must clear these to count as "meal-capable". Tune with staff.
MEAL_PROTEIN_G = 10
MEAL_CALORIES = 200

DEFAULT_HORIZON_DAYS = 14

# Metrics computed per (hall, period). These are the per-period stat names;
# the forward summary emits <name>_baseline, <name>_horizon, <name>_change.
PERIOD_METRICS = [
    "n_days",
    "n_meal_periods",
    "total_entree_rows",
    "vegan_share_all",
    "vegan_share_entree",
    "vegetarian_share_entree",
    "vegan_vs_vegetarian_entree_gap",
    "pct_periods_with_vegan_entree",
    "pct_periods_vegan_entree_le1",
    "avg_vegan_entrees_per_period",
    "pct_stations_with_vegan",
    "pct_vegan_items_in_vegan_station",
    "distinct_vegan_entrees",
    "distinct_vegan_entrees_per_day",
    "vegan_entree_repetition_ratio",
    "vegan_variety_ratio",
    "vegan_entree_protein_mean",
    "nonvegan_entree_protein_mean",
    "vegan_protein_gap_vs_nonvegan",
    "pct_periods_meal_capable_vegan",
]


# ----------------------------------------------------------------------
# 4. Preparation and time bucketing
# ----------------------------------------------------------------------

def _prepare(items: pd.DataFrame) -> pd.DataFrame:
    """Validate input and add helper columns (day, item_type, bool flags)."""
    required = {
        "location_name", "meal", "station", "item_name",
        "vegan", "vegetarian", "gluten_free", "halal",
        "protein_grams", "calories",
    }
    missing = required - set(items.columns)
    if missing:
        raise ValueError(
            "Input item frame is missing required columns: "
            f"{sorted(missing)}. Pass the frame from "
            "collect_menu_dfs.collect_menu_dataframes()."
        )

    df = items.copy()

    df["hall"] = df["location_name"].fillna(df.get("location_id")).fillna("Unknown")

    # Day as a real date for horizon math. Prefer menu 'date'; fall back to the
    # snapshot folder's leading YYYYMMDD so the code still runs pre-date.
    raw_day = df["date"] if "date" in df.columns else df.get("snapshot")
    df["day"] = pd.to_datetime(raw_day, errors="coerce").dt.normalize()
    if df["day"].isna().all() and "snapshot" in df.columns:
        df["day"] = pd.to_datetime(
            df["snapshot"].astype(str).str[:8], format="%Y%m%d", errors="coerce"
        ).dt.normalize()

    for flag in DIET_FLAGS:
        df[flag] = _as_bool(df[flag])

    df["item_type"] = [
        classify_item_type(s, n, d)
        for s, n, d in zip(df["station"], df["item_name"], df.get("description"))
    ]
    df["is_entree"] = df["item_type"].eq("entree")

    df["protein_grams"] = pd.to_numeric(df["protein_grams"], errors="coerce")
    df["calories"] = pd.to_numeric(df["calories"], errors="coerce")

    df["vegan_meal_capable"] = (
        df["vegan"]
        & df["is_entree"]
        & (df["protein_grams"].fillna(0) >= MEAL_PROTEIN_G)
        & (df["calories"].fillna(0) >= MEAL_CALORIES)
    )

    return df


def assign_time_period(
    df: pd.DataFrame,
    anchor_date: Optional[pd.Timestamp] = None,
    horizon_days: int = DEFAULT_HORIZON_DAYS,
) -> tuple[pd.DataFrame, pd.Timestamp]:
    """Tag each row as baseline / horizon / beyond relative to the anchor.

    anchor_date defaults to the earliest day present ("today"). Returns the
    tagged frame and the resolved anchor so callers can report it.
    """
    df = df.copy()
    valid_days = df["day"].dropna()
    if anchor_date is None:
        if valid_days.empty:
            raise ValueError(
                "No usable service dates found; cannot establish a baseline. "
                "Ensure the menu JSON has a 'date' or a timestamped snapshot."
            )
        anchor_date = valid_days.min()
    anchor_date = pd.Timestamp(anchor_date).normalize()
    horizon_end = anchor_date + pd.Timedelta(days=horizon_days)

    def bucket(day: pd.Timestamp) -> str:
        if pd.isna(day):
            return "unknown"
        if day == anchor_date:
            return "baseline"
        if anchor_date < day <= horizon_end:
            return "horizon"
        if day < anchor_date:
            return "before_anchor"
        return "beyond"

    df["period"] = df["day"].map(bucket)
    return df, anchor_date


# ----------------------------------------------------------------------
# 5. Per-(hall, period) metric computation
# ----------------------------------------------------------------------

def _period_metrics(g: pd.DataFrame) -> dict:
    """Compute PERIOD_METRICS for one hall within one time period.

    Returns NaN-filled metrics when the period has no rows, so a hall with no
    horizon data yet still produces a well-formed row.
    """
    out: dict[str, object] = {name: np.nan for name in PERIOD_METRICS}
    if g.empty:
        return out

    entrees = g[g["is_entree"]]
    n_entrees = len(entrees)

    out["n_days"] = int(g["day"].nunique())
    out["n_meal_periods"] = int(g.groupby(["day", "meal"]).ngroups)
    out["total_entree_rows"] = int(n_entrees)

    # Availability
    out["vegan_share_all"] = _share(int(g["vegan"].sum()), len(g))
    out["vegan_share_entree"] = _share(int(entrees["vegan"].sum()), n_entrees)
    out["vegetarian_share_entree"] = _share(int(entrees["vegetarian"].sum()), n_entrees)
    if pd.notna(out["vegan_share_entree"]) and pd.notna(out["vegetarian_share_entree"]):
        out["vegan_vs_vegetarian_entree_gap"] = (
            out["vegetarian_share_entree"] - out["vegan_share_entree"]
        )

    # Breadth across (day, meal) periods
    if out["n_meal_periods"]:
        per = g.groupby(["day", "meal"]).agg(
            vegan_entrees=("vegan_meal_capable", "sum")
        )
        out["pct_periods_with_vegan_entree"] = float((per["vegan_entrees"] > 0).mean())
        out["pct_periods_vegan_entree_le1"] = float((per["vegan_entrees"] <= 1).mean())
        out["avg_vegan_entrees_per_period"] = float(per["vegan_entrees"].mean())
        out["pct_periods_meal_capable_vegan"] = float((per["vegan_entrees"] > 0).mean())

    # Station reach / concentration
    stations_total = g["station"].nunique()
    out["pct_stations_with_vegan"] = _share(
        g.loc[g["vegan"], "station"].nunique(), stations_total
    )
    vegan_rows = g[g["vegan"]]
    if len(vegan_rows):
        out["pct_vegan_items_in_vegan_station"] = float(
            vegan_rows["station"].astype(str).str.strip().str.casefold().eq("vegan").mean()
        )

    # Variety / repetition
    vegan_entrees = entrees[entrees["vegan"]]
    distinct_vegan = vegan_entrees["item_name"].str.casefold().nunique()
    out["distinct_vegan_entrees"] = int(distinct_vegan)
    n_days = out["n_days"] or 0
    out["distinct_vegan_entrees_per_day"] = (
        distinct_vegan / n_days if n_days else np.nan
    )
    if distinct_vegan:
        out["vegan_entree_repetition_ratio"] = len(vegan_entrees) / distinct_vegan
    distinct_all_entrees = entrees["item_name"].str.casefold().nunique()
    out["vegan_variety_ratio"] = _share(distinct_vegan, distinct_all_entrees)

    # Adequacy
    if len(vegan_entrees):
        out["vegan_entree_protein_mean"] = float(vegan_entrees["protein_grams"].mean())
    nonvegan_entrees = entrees[~entrees["vegan"]]
    if len(nonvegan_entrees):
        out["nonvegan_entree_protein_mean"] = float(nonvegan_entrees["protein_grams"].mean())
    if pd.notna(out["vegan_entree_protein_mean"]) and pd.notna(out["nonvegan_entree_protein_mean"]):
        out["vegan_protein_gap_vs_nonvegan"] = (
            out["nonvegan_entree_protein_mean"] - out["vegan_entree_protein_mean"]
        )

    return out


# ----------------------------------------------------------------------
# 6. Forward-looking summary (one row per hall)
# ----------------------------------------------------------------------

# Metrics where a higher value is better for vegan diners (used to judge the
# outlook direction). Gaps are "lower is better" and handled separately.
_HIGHER_IS_BETTER = {
    "vegan_share_all", "vegan_share_entree", "pct_periods_with_vegan_entree",
    "avg_vegan_entrees_per_period", "pct_stations_with_vegan",
    "distinct_vegan_entrees", "distinct_vegan_entrees_per_day",
    "vegan_variety_ratio", "vegan_entree_protein_mean",
    "pct_periods_meal_capable_vegan",
}


def _outlook_label(baseline: float, horizon: float, rel_tol: float = 0.05) -> str:
    """Human-readable outlook for the headline vegan entree share."""
    if pd.isna(horizon):
        return "no horizon data yet"
    if pd.isna(baseline):
        return "no baseline"
    if baseline == 0:
        return "improving" if horizon > 0 else "flat (none either way)"
    change = (horizon - baseline) / baseline
    if change > rel_tol:
        return "improving"
    if change < -rel_tol:
        return "worsening"
    return "flat"


def build_forward_summary(
    items: pd.DataFrame,
    anchor_date: Optional[str | pd.Timestamp] = None,
    horizon_days: int = DEFAULT_HORIZON_DAYS,
) -> pd.DataFrame:
    """One row per hall: baseline vs upcoming-horizon vegan availability.

    Parameters
    ----------
    items:
        Item-level frame from ``collect_menu_dfs.collect_menu_dataframes``.
    anchor_date:
        The baseline day. Defaults to the earliest date present ("today").
    horizon_days:
        Size of the forward window in days (default 14, i.e. two weeks).

    Returns
    -------
    pandas.DataFrame
        Columns: hall/context, then for each metric in PERIOD_METRICS a
        ``_baseline``, ``_horizon`` and ``_change`` column, a Wilson CI on the
        headline horizon share, and a ``vegan_outlook`` label. Sorted worst
        baseline vegan entree share first.
    """
    df = _prepare(items)
    df, resolved_anchor = assign_time_period(df, anchor_date, horizon_days)

    horizon_end = resolved_anchor + pd.Timedelta(days=horizon_days)

    rows = []
    for hall, g_hall in df.groupby("hall", sort=False):
        base = g_hall[g_hall["period"] == "baseline"]
        hor = g_hall[g_hall["period"] == "horizon"]

        base_m = _period_metrics(base)
        hor_m = _period_metrics(hor)

        row: dict[str, object] = {
            "hall": hall,
            "campus": (
                g_hall["campus"].dropna().iloc[0]
                if "campus" in g_hall and g_hall["campus"].notna().any() else np.nan
            ),
            "anchor_date": resolved_anchor.date().isoformat(),
            "horizon_end_date": horizon_end.date().isoformat(),
            "horizon_days": horizon_days,
            "baseline_days_present": int(base["day"].nunique()),
            "horizon_days_present": int(hor["day"].nunique()),
        }

        for name in PERIOD_METRICS:
            b, h = base_m[name], hor_m[name]
            row[f"{name}_baseline"] = b
            row[f"{name}_horizon"] = h
            if pd.notna(b) and pd.notna(h):
                row[f"{name}_change"] = h - b
            else:
                row[f"{name}_change"] = np.nan

        # Wilson CI on the headline horizon vegan entree share.
        hor_entrees = hor[hor["is_entree"]]
        low, high = wilson_interval(int(hor_entrees["vegan"].sum()), len(hor_entrees))
        row["vegan_share_entree_horizon_ci_low"] = low
        row["vegan_share_entree_horizon_ci_high"] = high

        row["vegan_outlook"] = _outlook_label(
            base_m["vegan_share_entree"], hor_m["vegan_share_entree"]
        )

        rows.append(row)

    summary = pd.DataFrame(rows)

    float_cols = summary.select_dtypes(include="float").columns
    summary[float_cols] = summary[float_cols].round(4)

    summary = summary.sort_values(
        "vegan_share_entree_baseline", na_position="last"
    ).reset_index(drop=True)

    return summary


def main() -> pd.DataFrame:
    from collect_menu_dfs import collect_menu_dataframes

    items = collect_menu_dataframes()
    summary = build_forward_summary(items)

    pd.set_option("display.max_columns", None)
    pd.set_option("display.width", None)

    anchor = summary["anchor_date"].iloc[0] if len(summary) else "n/a"
    print(f"\nForward vegan-availability outlook (baseline = {anchor}, "
          f"horizon = {summary['horizon_days'].iloc[0] if len(summary) else '?'} days):\n")
    headline = [
        "hall", "baseline_days_present", "horizon_days_present",
        "vegan_share_entree_baseline", "vegan_share_entree_horizon",
        "vegan_share_entree_change", "vegan_outlook",
        "distinct_vegan_entrees_baseline", "distinct_vegan_entrees_horizon",
        "vegan_entree_protein_mean_baseline", "vegan_entree_protein_mean_horizon",
    ]
    print(summary[headline].to_string(index=False))

    return summary


if __name__ == "__main__":
    main()
