"""
Walk a directory tree of BU dining-menu JSON files, convert each one into a
Pandas DataFrame with ``menu_json_to_df``, and combine them into a single
DataFrame.

Expected layout (any depth works, the search is recursive):

    server/
        data/
            20261024T170131Z/          <- a snapshot folder (UTC timestamp)
                locations.json         <- skipped (not a menu payload)
                menu_marciano.json     <- parsed
                menu_warren.json       <- parsed
                menu_west.json         <- parsed
            20261025T.../
                ...

Only files whose JSON actually contains a "meals" list are parsed, so sibling
files such as ``locations.json`` are ignored automatically.

Every row in the combined DataFrame is tagged with provenance columns so you
can tell which snapshot and which file it came from:

    source_file       absolute path to the JSON file
    source_filename   just the file name, e.g. "menu_marciano.json"
    snapshot          the immediate parent folder name, e.g. "20261024T170131Z"

How to use
----------
    from collect_menu_dfs import collect_menu_dataframes

    # one combined DataFrame for everything under the tree
    combined = collect_menu_dataframes(r"C:\\path\\to\\server\\data")

    # or keep the per-file frames too
    combined, per_file = collect_menu_dataframes(
        r"C:\\path\\to\\server\\data", return_parts=True
    )

Run directly to parse the default tree and print a summary:

    python collect_menu_dfs.py
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pandas as pd

from marciano_json_to_df import menu_json_to_df


# ======================================================================
# USER SETTING: the root folder to search for menu JSON files.
# The search is recursive, so point this at any folder that contains the
# snapshot subfolders (or a single snapshot folder) and it will find every
# menu_*.json beneath it.
# ======================================================================
DATA_ROOT = r"C:\Users\erict\OneDrive\Desktop\BU-Big-Backs\server\data"


def _looks_like_menu(data: Any) -> bool:
    """Return True if the parsed JSON looks like a menu payload.

    A menu document has a top-level "meals" list. Files such as
    ``locations.json`` do not, so they are skipped.
    """
    return isinstance(data, dict) and isinstance(data.get("meals"), list)


def _add_provenance(df: pd.DataFrame, json_file: Path) -> pd.DataFrame:
    """Attach columns that record where each row came from."""
    df = df.copy()
    # Insert provenance columns at the front so they are easy to see.
    df.insert(0, "snapshot", json_file.parent.name)
    df.insert(1, "source_filename", json_file.name)
    df.insert(2, "source_file", str(json_file.resolve()))
    return df


def iter_menu_json_files(root: str | Path, pattern: str = "*.json"):
    """Yield every JSON file under ``root`` (recursively), sorted by path.

    ``pattern`` can be narrowed (e.g. "menu_*.json") if you only want files
    matching a naming convention. The default scans all ``.json`` files and
    relies on content checking to skip non-menu files.
    """
    root = Path(root)
    if not root.exists():
        raise FileNotFoundError(f"Data root does not exist: {root.resolve()}")
    yield from sorted(root.rglob(pattern))


def collect_menu_dataframes(
    root: str | Path = DATA_ROOT,
    pattern: str = "*.json",
    return_parts: bool = False,
):
    """Convert every menu JSON under ``root`` and concatenate the results.

    Parameters
    ----------
    root:
        Directory to search recursively for JSON files.
    pattern:
        Glob pattern for candidate files. Default "*.json". Use e.g.
        "menu_*.json" to restrict by file name.
    return_parts:
        When True, also return a dict mapping each source file path to its
        individual DataFrame.

    Returns
    -------
    pandas.DataFrame
        All rows from all menu files, with provenance columns added. If no
        menu files are found, an empty DataFrame is returned.
    (pandas.DataFrame, dict)
        When ``return_parts`` is True.
    """
    per_file: dict[str, pd.DataFrame] = {}
    frames: list[pd.DataFrame] = []

    for json_file in iter_menu_json_files(root, pattern):
        try:
            data = json.loads(json_file.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as exc:
            print(f"Skipping {json_file} (could not read/parse: {exc})")
            continue

        if not _looks_like_menu(data):
            # Non-menu file such as locations.json; quietly skip.
            continue

        df = menu_json_to_df(data)
        df = _add_provenance(df, json_file)

        per_file[str(json_file.resolve())] = df
        frames.append(df)
        print(f"Parsed {len(df):>4} rows from {json_file}")

    if frames:
        combined = pd.concat(frames, ignore_index=True)
    else:
        combined = pd.DataFrame()
        print(f"No menu JSON files found under {Path(root).resolve()}.")

    if return_parts:
        return combined, per_file
    return combined


def main() -> pd.DataFrame:
    combined = collect_menu_dataframes(DATA_ROOT)

    if combined.empty:
        return combined

    pd.set_option("display.max_columns", None)
    pd.set_option("display.width", None)

    print(f"\nCombined {len(combined)} rows from "
          f"{combined['source_file'].nunique()} menu file(s).\n")
    print("Rows per location:")
    print(combined["location_name"].value_counts(dropna=False).to_string())
    print("\nRows per snapshot:")
    print(combined["snapshot"].value_counts(dropna=False).to_string())
    print("\nRows per meal:")
    print(combined["meal"].value_counts(dropna=False).to_string())
    print("\nPreview:")
    print(combined.head(15).to_string(index=False))

    return combined


if __name__ == "__main__":
    main()
