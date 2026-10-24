"""
Per-dining-hall dietary & nutrition summary for dining staff.

One row per dining hall, with a compact, interpretable set of columns:

Context (so the numbers can be read correctly)
    dining_hall        name of the hall
    campus             campus it sits on
    first_day          earliest menu date in the data
    last_day           latest menu date in the data
    total_items        total menu items counted for this hall (all days)

Average nutrition (mean across all of the hall's items)
    avg_calories
    avg_carbohydrates_grams
    avg_protein_grams
    avg_saturated_fat_grams

Total number of items suiting each dietary need (all days)
    total_vegetarian, total_vegan, total_gluten_free, total_halal,
    total_cool_food

Percentage of items suiting each dietary need
    pct_vegetarian, pct_vegan, pct_gluten_free, pct_halal, pct_cool_food

Change in the number of suitable items from the first day to the last day
(last-day count minus first-day count; positive = more on the last day)
    change_vegetarian, change_vegan, change_gluten_free, change_halal,
    change_cool_food

Nutrition note
--------------
The source feed carries only four nutrition numbers per item (calories,
carbohydrates, protein, saturated fat); there are no vitamins or minerals to
summarise.

Usage
-----
    from collect_menu_dfs import collect_menu_dataframes
    from dining_diet_analysis import build_hall_summary

    items = collect_menu_dataframes()
    summary = build_hall_summary(items)
    summary.to_csv("dining_hall_dietary_summary.csv", index=False)
"""

from __future__ import annotations

import numpy as np
import pandas as pd


# Dietary flags to summarise (source column -> readable word for column names).
DIETS: dict[str, str] = {
    "vegetarian": "vegetarian",
    "vegan": "vegan",
    "gluten_free": "gluten_free",
    "halal": "halal",
    "cool_food": "cool_food",
}

# Nutrition columns to average (the only nutrition fields the feed provides).
NUTRIENTS = [
    "calories",
    "carbohydrates_grams",
    "protein_grams",
    "saturated_fat_grams",
]


def _as_bool(series: pd.Series) -> pd.Series:
    return series.fillna(False).astype(bool)


def _prepare(items: pd.DataFrame) -> pd.DataFrame:
    """Validate the input frame and add helper columns (hall, day, flags)."""
    required = {"location_name", "item_name"} | set(DIETS) | set(NUTRIENTS)
    missing = required - set(items.columns)
    if missing:
        raise ValueError(
            "Input item frame is missing required columns: "
            f"{sorted(missing)}. Pass the frame from "
            "collect_menu_dfs.collect_menu_dataframes()."
        )

    df = items.copy()
    df["hall"] = df["location_name"].fillna(df.get("location_id")).fillna("Unknown")

    # A real date per row, for the first-day vs last-day comparison.
    raw_day = df["date"] if "date" in df.columns else df.get("snapshot")
    df["day"] = pd.to_datetime(raw_day, errors="coerce").dt.normalize()

    for flag in DIETS:
        df[flag] = _as_bool(df[flag])
    for nutrient in NUTRIENTS:
        df[nutrient] = pd.to_numeric(df[nutrient], errors="coerce")

    return df


def build_hall_summary(items: pd.DataFrame) -> pd.DataFrame:
    """Build the compact one-row-per-dining-hall summary described above."""
    df = _prepare(items)

    rows = []
    for hall, g in df.groupby("hall", sort=False):
        total_items = len(g)
        days = g["day"].dropna()
        first_day = days.min() if not days.empty else pd.NaT
        last_day = days.max() if not days.empty else pd.NaT

        row: dict[str, object] = {
            "dining_hall": hall,
            "campus": (
                g["campus"].dropna().iloc[0]
                if "campus" in g and g["campus"].notna().any() else np.nan
            ),
            "first_day": first_day.date().isoformat() if pd.notna(first_day) else np.nan,
            "last_day": last_day.date().isoformat() if pd.notna(last_day) else np.nan,
            "total_items": total_items,
        }

        # Average nutrition across all of the hall's items.
        for nutrient in NUTRIENTS:
            row[f"avg_{nutrient}"] = float(g[nutrient].mean()) if total_items else np.nan

        # Totals and percentages of items per dietary need. Percent values are
        # on a 0-100 scale (e.g. 63.5 means 63.5%), to match the "percent" name.
        for flag, label in DIETS.items():
            count = int(g[flag].sum())
            row[f"total_{label}"] = count
            row[f"percent_{label}"] = (100 * count / total_items) if total_items else np.nan

        # Change in count from the first day to the last day.
        first_rows = g[g["day"] == first_day] if pd.notna(first_day) else g.iloc[0:0]
        last_rows = g[g["day"] == last_day] if pd.notna(last_day) else g.iloc[0:0]
        # When only one day is present, first and last are the same day, so the
        # change is 0; it becomes meaningful once more days are collected.
        for flag, label in DIETS.items():
            first_count = int(first_rows[flag].sum())
            last_count = int(last_rows[flag].sum())
            row[f"change_{label}"] = last_count - first_count

        rows.append(row)

    summary = pd.DataFrame(rows)

    # Round the averages and percentages for readability.
    float_cols = summary.select_dtypes(include="float").columns
    summary[float_cols] = summary[float_cols].round(3)

    summary = summary.sort_values("dining_hall").reset_index(drop=True)
    return summary


# Backward-compatible alias: earlier code/notebooks imported this name.
build_forward_summary = build_hall_summary


def main() -> pd.DataFrame:
    from collect_menu_dfs import collect_menu_dataframes

    items = collect_menu_dataframes()
    summary = build_hall_summary(items)

    pd.set_option("display.max_columns", None)
    pd.set_option("display.width", None)

    print("\nDining-hall dietary & nutrition summary:\n")
    print(summary.to_string(index=False))
    print(f"\n{summary.shape[0]} halls x {summary.shape[1]} columns.")
    return summary


if __name__ == "__main__":
    main()
