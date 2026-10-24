import re
from pathlib import Path

import pandas as pd
from tqdm.auto import tqdm
from playwright.sync_api import (
    sync_playwright,
    TimeoutError as PlaywrightTimeoutError
)

# ==================================================
# 1. Configuration
# ==================================================

URL = "https://www.bu.edu/dining/location/marciano/#menu"

MEALS = ["Breakfast", "Lunch", "Dinner"]

HEADLESS = True

OUTPUT_FILE = "marciano_menu.csv"
DEBUG_FILE = "marciano_debug.txt"

HEADING_SELECTOR = (
    "h1:visible, h2:visible, h3:visible, "
    "h4:visible, h5:visible, h6:visible"
)

MEAL_CONTROL_SELECTOR = (
    "[role='tab']:visible, button:visible, a:visible"
)

MONTHS = (
    "January|February|March|April|May|June|July|August|"
    "September|October|November|December"
)

WEEKDAYS = (
    "Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday"
)

# ==================================================
# 2. DataFrame columns
# ==================================================

COLUMNS = [
    "Food name",
    "Meal",
    "Station",
    "Saturated fat",
    "Carbs",
    "Sugars",
    "Proteins",
    "Calories",
    "Vegan",
    "Vegetarian",
    "Halal",
    "Gluten free"
]

# ==================================================
# 3. Nutrition extraction patterns
# ==================================================

NUTRITION_PATTERNS = {
    "Saturated fat":
        r"(\d[\d,]*(?:\.\d+)?)\s*g\s*saturated\s+fat\b",

    "Carbs":
        r"(\d[\d,]*(?:\.\d+)?)\s*g\s*(?:carbs?|carbohydrates?)\b",

    "Sugars":
        r"(\d[\d,]*(?:\.\d+)?)\s*g\s*sugars?\b",

    "Proteins":
        r"(\d[\d,]*(?:\.\d+)?)\s*g\s*proteins?\b",

    "Calories":
        r"(\d[\d,]*(?:\.\d+)?)\s*(?:cals?|calories?)\b"
}

DIETARY_PATTERNS = {
    "Vegan": r"vegan",
    "Vegetarian": r"vegetarian",
    "Halal": r"halal",
    "Gluten free": r"gluten[\s-]+free"
}

# ==================================================
# 4. Text-processing helper functions
# ==================================================

def clean_text(text):
    """Normalize whitespace."""
    return re.sub(r"\s+", " ", text or "").strip()

def clean_label(text):
    """Clean a dietary label or menu heading."""
    text = clean_text(text)

    # Remove common bullet characters.
    text = re.sub(
        r"^[\s•*▪◦\-–—]+\s*",
        "",
        text
    )

    return text.strip()

def parse_meal_heading(text):
    """
    Recognize BU-style meal headings, including:
        Breakfast
        Breakfast 7:00 AM - 11:30 AM
        3. Dinner 5:00 PM - 10:00 PM

    Avoid classifying ordinary food names such as
    'Breakfast Sandwich' as meal headings.
    """

    text = clean_text(text)

    # Remove a leading numbered list marker.
    text = re.sub(r"^\d+[.)]\s*", "", text)

    match = re.match(
        r"^(Breakfast|Lunch|Dinner|Brunch)\b(.*)$",
        text,
        re.IGNORECASE
    )

    if not match:
        return None

    meal = match.group(1).title()
    remainder = match.group(2).strip()

    if not remainder:
        return meal if meal in MEALS else None

    # Allow meal headings that include hours.
    time_pattern = (
        r"^[\s:()\-–—]*"
        r"\d{1,2}(?::\d{2})?\s*(?:AM|PM)\b"
    )

    if re.match(time_pattern, remainder, re.IGNORECASE):
        return meal if meal in MEALS else None

    return None

def is_date_heading(text):
    """Recognize date headings separating menu sections."""

    text = clean_text(text)

    has_month_and_day = bool(
        re.search(
            rf"\b(?:{MONTHS})\s+\d{{1,2}}"
            r"(?:st|nd|rd|th)?\b",
            text,
            re.IGNORECASE
        )
    )

    has_weekday = bool(
        re.search(
            rf"\b(?:{WEEKDAYS})\b",
            text,
            re.IGNORECASE
        )
    )

    return has_month_and_day or (
        has_weekday
        and bool(re.fullmatch(
            rf"(?:{WEEKDAYS})",
            text,
            re.IGNORECASE
        ))
    )

def is_non_food_heading(text):
    """Exclude meal headings and nutrition-detail headings."""

    text = clean_text(text).casefold()

    if not text:
        return True

    # Exact non-food headings that were previously misidentified as dishes.
    # Normalize punctuation so minor display variations are also excluded.
    heading_key = re.sub(r"[^a-z0-9]+", " ", text).strip()
    if heading_key in {
        "the fresh food co at marciano commons",
        "sort entrees by",
    }:
        return True

    if parse_meal_heading(text):
        return True

    if is_date_heading(text):
        return True

    excluded_phrases = (
        "nutrition facts",
        "dietary restrictions",
        "allergens",
        "ingredients",
        "close nutrition facts"
    )

    if any(phrase in text for phrase in excluded_phrases):
        return True

    if text in {
        "menu",
        "notice",
        "nutrition",
        "allergen information"
    }:
        return True

    return False

# ==================================================
# 5. Station and nutrition parsing
# ==================================================

DIETARY_TOKEN_RE = re.compile(
    r"Gluten[\s-]+Free|Vegetarian|Vegan|Halal|Coolfood",
    re.IGNORECASE,
)


def normalize_dietary_token(text):
    """Normalize a dietary tag to a comparable lowercase value."""
    return re.sub(r"[\s-]+", " ", clean_text(text)).strip().casefold()


def split_station_and_labels(station_text):
    """Separate trailing dietary tags from a station name.

    Examples:
        Brick Oven Vegetarian Halal
            -> Brick Oven, {vegetarian, halal}
        Gluten Free Kitchen Gluten Free Coolfood
            -> Gluten Free Kitchen, {gluten free, coolfood}
        Vegan Vegetarian Vegan Halal
            -> Vegan, {vegetarian, vegan, halal}

    The rule only strips tags at the end of the station string. It also
    preserves a station whose actual name is "Vegan" or "Gluten Free".
    """
    station = clean_text(station_text).strip(" :-.")
    labels = set()
    suffix_pattern = re.compile(
        r"\s+(Gluten[\s-]+Free|Vegetarian|Vegan|Halal|Coolfood)\s*$",
        re.IGNORECASE,
    )

    while station:
        match = suffix_pattern.search(station)
        if not match:
            break

        label = normalize_dietary_token(match.group(1))
        candidate = station[:match.start()].strip(" :-.")

        # A trailing word that is also the entire remaining station name
        # must be kept as the station name (e.g. station "Vegan").
        if not candidate or normalize_dietary_token(candidate) == label:
            break

        labels.add(label)
        station = candidate

    return station, labels


def extract_station(text):
    """Extract the station and remove trailing dietary tags from its name."""
    for line in text.splitlines():
        line = clean_label(line)
        match = re.match(
            r"^at\s+(?:the\s+)?(.+?)\s*$",
            line,
            re.IGNORECASE,
        )
        if not match:
            continue

        station = match.group(1).strip()
        station = re.split(
            r"\s+(?:nutrition varies with options|see options)\b",
            station,
            flags=re.IGNORECASE,
        )[0].strip(" :.-")
        station, _ = split_station_and_labels(station)
        if station:
            return station

    # Fallback for text where the station appears inline.
    match = re.search(
        r"\bat\s+(?:the\s+)?([^\n]+)",
        text,
        re.IGNORECASE,
    )
    if match:
        station = match.group(1).strip()
        station = re.split(
            r"\s+(?:nutrition varies with options|see options)\b",
            station,
            flags=re.IGNORECASE,
        )[0].strip(" :.-")
        station, _ = split_station_and_labels(station)
        if station:
            return station

    return None


def labels_from_tag_only_line(line):
    """Read one or more tags when a line contains only dietary labels.

    Lines such as "Vegetarian Vegan Halal" are accepted. Food names or
    descriptions that merely mention one of these words are not accepted.
    """
    cleaned = clean_label(line)
    if not cleaned:
        return set()

    matches = list(DIETARY_TOKEN_RE.finditer(cleaned))
    if not matches:
        return set()

    remainder = DIETARY_TOKEN_RE.sub("", cleaned)
    remainder = re.sub(r"[\s•*▪◦,;|/+\-–—]+", "", remainder)
    if remainder:
        return set()

    return {
        normalize_dietary_token(match.group(0))
        for match in matches
    }

def extract_summary_text(card_text):
    """
    BU's item summaries appear before the Nutrition Facts
    button and the expanded nutrition-detail section.

    Stop at the first Nutrition Facts label so that detailed
    ingredients and nutrition panels do not contaminate the
    summary values or dietary labels.
    """

    return re.split(
        r"\bNutrition Facts\b",
        card_text,
        maxsplit=1,
        flags=re.IGNORECASE
    )[0]

def extract_number(text, pattern):
    """Return a numeric nutrition value or NaN."""

    match = re.search(
        pattern,
        text,
        re.IGNORECASE
    )

    if not match:
        return float("nan")

    value = float(
        match.group(1).replace(",", "")
    )

    return int(value) if value.is_integer() else value

def has_dietary_label(text, pattern):
    """Check explicit dietary tags without matching food descriptions.

    Labels may be displayed as separate lines, grouped on one line, or
    appended to the station line. Ingredients and ordinary descriptions
    are intentionally not searched for arbitrary word mentions.
    """
    for raw_line in text.splitlines():
        line = clean_label(raw_line)
        if not line:
            continue

        # Standard layout: each restriction occupies its own line.
        if re.fullmatch(pattern, line, re.IGNORECASE):
            return True

        # Some versions of the page append the tags to "at the [station]".
        station_match = re.match(
            r"^at\s+(?:the\s+)?(.+?)\s*$",
            line,
            re.IGNORECASE,
        )
        if station_match:
            _, station_labels = split_station_and_labels(
                station_match.group(1)
            )
            if any(
                re.fullmatch(pattern, label, re.IGNORECASE)
                for label in station_labels
            ):
                return True

        # Some cards render multiple tag labels on a single line.
        line_labels = labels_from_tag_only_line(line)
        if any(
            re.fullmatch(pattern, label, re.IGNORECASE)
            for label in line_labels
        ):
            return True

    return False

# ==================================================
# 6. Find food cards in the rendered DOM
# ==================================================

def find_food_card(heading, food_name):
    """
    Start at a food-name heading and walk up its ancestors.

    Return the nearest compact ancestor containing both:
        1. The food name.
        2. Its 'at the [station]' information.

    Unlike the previous code, this does not require the
    ancestor to contain exactly one visible heading.
    """

    candidate = heading.locator("xpath=..")

    for _ in range(14):

        try:

            tag_name = candidate.evaluate(
                "(element) => element.tagName.toLowerCase()"
            )

            # Stop before reaching the entire page.
            if tag_name in {"body", "html"}:
                break

            card_text = candidate.inner_text(
                timeout=1500
            )

        except Exception:
            break

        # Ancestors only get larger as we move upward.
        # Stop if the ancestor is clearly a whole section.
        if len(card_text) > 10000:
            break

        contains_food_name = (
            food_name.casefold() in card_text.casefold()
        )

        station = extract_station(card_text)

        if contains_food_name and station:
            return candidate, card_text

        candidate = candidate.locator("xpath=..")

    return None, None

def infer_meal_from_ancestors(heading):
    """
    Fallback for pages in which a food item is inside a
    meal-specific section but DOM heading order is unclear.
    """

    candidate = heading.locator("xpath=..")

    for _ in range(10):

        try:

            tag_name = candidate.evaluate(
                "(element) => element.tagName.toLowerCase()"
            )

            if tag_name in {"body", "html"}:
                break

            text = candidate.inner_text(timeout=1000)

            if len(text) > 12000:
                break

            descendant_headings = candidate.locator(
                HEADING_SELECTOR
            ).all_inner_texts()

        except Exception:
            break

        meals_found = {
            parse_meal_heading(item)
            for item in descendant_headings
        }

        meals_found.discard(None)

        # A section containing one distinct meal heading
        # can be used to infer the current item's meal.
        if len(meals_found) == 1:
            return next(iter(meals_found))

        candidate = candidate.locator("xpath=..")

    return None

# ==================================================
# 7. Inspect the rendered page and detect meal tabs
# ==================================================

def get_visible_headings(page):
    """Get only headings visible in the rendered browser DOM."""

    return page.locator(HEADING_SELECTOR).all()

def get_heading_snapshot(page):
    """Return the current visible food and section heading texts."""

    return tuple(
        clean_text(heading.inner_text())
        for heading in get_visible_headings(page)
    )

def find_meal_control(page, meal):
    """
    Find an actual visible button, tab, or link for a meal.

    Prioritize tabs and buttons over ordinary links.
    """

    selectors = [
        "[role='tab']:visible",
        "button:visible",
        "a:visible"
    ]

    for selector in selectors:

        controls = page.locator(selector).all()

        for control in controls:

            try:
                label = clean_text(control.inner_text())
            except Exception:
                continue

            if parse_meal_heading(label) == meal:
                return control

    return None

def detect_meal_tabs(page):
    """
    Determine whether the three meal controls actually switch
    the rendered menu, rather than merely scrolling to sections.

    The visible heading list should change when a genuine tab
    switches between different sets of menu items.
    """

    controls = {
        meal: find_meal_control(page, meal)
        for meal in MEALS
    }

    if any(control is None for control in controls.values()):
        return False

    baseline = get_heading_snapshot(page)
    changed = False

    print("Checking whether the meal controls switch menus...", flush=True)

    for meal in MEALS:

        # Reacquire the locator in case the page was rerendered.
        control = find_meal_control(page, meal)

        if control is None:
            continue

        try:

            control.click(timeout=5000)
            page.wait_for_timeout(400)

            snapshot = get_heading_snapshot(page)

            if snapshot != baseline:
                changed = True

        except PlaywrightTimeoutError:

            print(
                f"Could not test the {meal} control; "
                "continuing with the rendered page.",
                flush=True
            )

    if changed:
        print("Meal tabs detected.", flush=True)
    else:
        print(
            "No changing meal tabs detected; "
            "scanning the displayed meal sections.",
            flush=True
        )

    return changed

def open_meal(page, meal):
    """Open a meal tab when the page uses a tabbed interface."""

    control = find_meal_control(page, meal)

    if control is None:
        return False

    control.click(timeout=5000)
    page.wait_for_timeout(400)

    return True

# ==================================================
# 8. Scrape food items from one rendered menu view
# ==================================================

def scan_visible_menu(page, forced_meal=None):
    """
    Scan the visible browser headings.

    If forced_meal is specified, the current view is treated
    as that meal's tab. Otherwise, meal headings are tracked
    in document order.
    """

    headings = get_visible_headings(page)

    print(
        f"Visible headings in this view: {len(headings)}",
        flush=True
    )

    records = {}
    current_meal = None

    progress = tqdm(
        headings,
        desc=(
            f"Scanning {forced_meal}"
            if forced_meal
            else "Scanning rendered menu"
        ),
        unit="heading"
    )

    for heading in progress:

        try:
            heading_text = clean_text(heading.inner_text())
        except Exception:
            continue

        if not heading_text:
            continue

        # Reset when a new date section is encountered.
        if is_date_heading(heading_text):
            if forced_meal is None:
                current_meal = None
            continue

        # Track meal headings such as "Dinner 5:00 PM - 10:00 PM".
        detected_meal = parse_meal_heading(heading_text)

        if detected_meal:
            current_meal = detected_meal
            continue

        # Avoid treating the expanded nutrition panel as another dish.
        if is_non_food_heading(heading_text):
            continue

        # Search the heading's ancestors for its menu-item card.
        _, card_text = find_food_card(
            heading,
            heading_text
        )

        if not card_text:
            continue

        summary_text = extract_summary_text(card_text)

        station = extract_station(summary_text)

        if not station:
            station = extract_station(card_text)

        if not station:
            continue

        # Determine the meal from the active tab, the preceding
        # meal heading, or the nearest meal-specific section.
        meal = (
            forced_meal
            or current_meal
            or infer_meal_from_ancestors(heading)
        )

        record = {
            "Food name": heading_text,
            "Meal": meal if meal else float("nan"),
            "Station": station,

            **{
                column: extract_number(
                    summary_text,
                    pattern
                )
                for column, pattern in NUTRITION_PATTERNS.items()
            },

            **{
                column: has_dietary_label(
                    summary_text,
                    pattern
                )
                for column, pattern in DIETARY_PATTERNS.items()
            }
        }

        # Deduplicate food items within the same meal and station.
        key = (
            heading_text.casefold(),
            str(meal).casefold(),
            station.casefold()
        )

        if key not in records:

            records[key] = record

        else:

            existing = records[key]

            # Use another occurrence if it supplies a missing value.
            for column in NUTRITION_PATTERNS:

                if (
                    pd.isna(existing[column])
                    and not pd.isna(record[column])
                ):
                    existing[column] = record[column]

            # Preserve dietary labels explicitly found in either copy.
            for column in DIETARY_PATTERNS:
                existing[column] = (
                    existing[column] or record[column]
                )

        # Keep the user's progress bar informative throughout the scan.
        progress.set_postfix(items=len(records), refresh=False)

    return records

# ==================================================
# 9. Save diagnostics if extraction fails
# ==================================================

def save_debug_dump(page):
    """
    Save the rendered page's visible text and the heading list.
    This makes subsequent HTML-structure problems diagnosable.
    """

    try:
        visible_text = page.locator("body").inner_text()
    except Exception:
        visible_text = "(Could not retrieve visible page text.)"

    headings = []

    try:
        headings = [
            clean_text(item.inner_text())
            for item in get_visible_headings(page)
        ]
    except Exception:
        pass

    with open(DEBUG_FILE, "w", encoding="utf-8") as file:

        file.write(f"URL: {page.url}\n\n")

        file.write("VISIBLE HEADINGS\n")
        file.write("================\n")

        for heading in headings:
            file.write(heading + "\n")

        file.write("\nVISIBLE PAGE TEXT\n")
        file.write("=================\n")

        file.write(visible_text[:60000])

    print(f"Diagnostic information saved to {DEBUG_FILE}")

    print("\nFirst 30 visible headings:")

    for heading in headings[:30]:
        print(f"  {heading}")

# ==================================================
# 10. Launch Chromium and scrape Marciano Commons
# ==================================================

print("Launching Chromium...", flush=True)

all_records = {}

with sync_playwright() as playwright:

    browser = playwright.chromium.launch(
        headless=HEADLESS
    )

    page = browser.new_page(
        viewport={
            "width": 1365,
            "height": 1000
        }
    )

    try:

        print("Opening the Marciano Commons page...", flush=True)

        page.goto(
            URL,
            wait_until="domcontentloaded",
            timeout=90000
        )

        # Client-side menu rendering may continue after navigation.
        try:

            page.wait_for_load_state(
                "networkidle",
                timeout=15000
            )

        except PlaywrightTimeoutError:

            print(
                "Network activity has not settled; "
                "continuing with the current rendered DOM.",
                flush=True
            )

        page.wait_for_timeout(1500)

        print(f"Loaded page: {page.url}")
        print(f"Page title: {page.title()}")

        # Detect whether the menu uses real meal-switching tabs.
        has_meal_tabs = detect_meal_tabs(page)

        if has_meal_tabs:

            # Each meal is collected separately, so items do not
            # inherit a meal label from a different tab.
            for meal in MEALS:

                print(f"\nOpening {meal}...", flush=True)

                opened = open_meal(page, meal)

                if not opened:
                    print(
                        f"No clickable {meal} control found; "
                        "skipping this tab.",
                        flush=True
                    )
                    continue

                meal_records = scan_visible_menu(
                    page,
                    forced_meal=meal
                )

                all_records.update(meal_records)

                print(
                    f"{meal}: "
                    f"{sum(1 for r in all_records.values() if r['Meal'] == meal)} "
                    "total records collected so far for this meal.",
                    flush=True
                )

        else:

            # BU may display all meal sections in document order.
            all_records = scan_visible_menu(page)

        # If extraction fails, capture the actual DOM text while
        # the browser is still open.
        if not all_records:
            save_debug_dump(page)

    finally:
        browser.close()

# ==================================================
# 11. Create the DataFrame
# ==================================================

if not all_records:

    raise RuntimeError(
        "No food items were extracted from the rendered menu. "
        f"Review {DEBUG_FILE} for the visible headings and page text. "
        "The current page structure may differ from the expected "
        "BU dining-menu format."
    )

df = pd.DataFrame(
    list(all_records.values()),
    columns=COLUMNS
)

# Enforce numeric nutrition columns.
nutrition_columns = list(NUTRITION_PATTERNS)

for column in nutrition_columns:

    df[column] = pd.to_numeric(
        df[column],
        errors="coerce"
    )

# Keep dietary flags Boolean.
for column in DIETARY_PATTERNS:
    df[column] = df[column].astype(bool)

# Sort Breakfast, Lunch, Dinner, then any unclassified rows.
meal_order = {
    "Breakfast": 0,
    "Lunch": 1,
    "Dinner": 2
}

df["_meal_order"] = df["Meal"].map(meal_order)

df = (
    df.sort_values(
        "_meal_order",
        na_position="last"
    )
    .drop(columns="_meal_order")
    .reset_index(drop=True)
)

# ==================================================
# 12. Display and export the results
# ==================================================

print(f"\nExtracted {len(df)} menu items.")

print("\nItems by meal:")

print(
    df["Meal"].value_counts(dropna=False)
)

print("\nMissing nutrition values:")

print(
    df[nutrition_columns].isna().sum()
)

print("\nDataFrame:")

pd.set_option("display.max_rows", None)
pd.set_option("display.max_columns", None)
pd.set_option("display.width", None)

print(df)

df.to_csv(
    OUTPUT_FILE,
    index=False,
    na_rep="NaN"
)

print(f"\nSaved CSV to {Path(OUTPUT_FILE).resolve()}")
