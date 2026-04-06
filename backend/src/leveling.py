import csv
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path


DATA_PATH = Path(__file__).resolve().parent / "data" / "level_exp.csv"


@dataclass(frozen=True)
class LevelThreshold:
    level: int
    cumulative_xp: int
    xp_to_next_level: int


@lru_cache(maxsize=1)
def load_level_thresholds() -> list[LevelThreshold]:
    rows: list[LevelThreshold] = []
    with DATA_PATH.open("r", encoding="utf-8") as csv_file:
        reader = csv.DictReader(csv_file)
        for row in reader:
            rows.append(
                LevelThreshold(
                    level=int(row["level"]),
                    cumulative_xp=int(row["cumulative_xp"]),
                    xp_to_next_level=int(row["xp_to_next_level"]),
                )
            )
    return rows


def get_max_level() -> int:
    return load_level_thresholds()[-1].level


def cumulative_xp_for_level(level: int) -> int:
    thresholds = load_level_thresholds()
    safe_level = max(1, min(level, thresholds[-1].level))
    return thresholds[safe_level - 1].cumulative_xp


def level_for_total_xp(total_xp: int) -> int:
    thresholds = load_level_thresholds()
    safe_xp = max(0, total_xp)
    current_level = 1
    for threshold in thresholds:
        if safe_xp >= threshold.cumulative_xp:
            current_level = threshold.level
        else:
            break
    return current_level


def xp_to_next_level(total_xp: int) -> int:
    current_level = level_for_total_xp(total_xp)
    max_level = get_max_level()
    if current_level >= max_level:
        return 0
    next_threshold = cumulative_xp_for_level(current_level + 1)
    return max(0, next_threshold - max(0, total_xp))

