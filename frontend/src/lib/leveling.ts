import type { Locale } from "../types";

export const levelThresholds = [
  0, 104, 242, 419, 640, 908, 1226, 1597, 2023, 2507, 3050, 3654, 4321, 5053, 5852, 6719,
  7655, 8662, 9741, 10893, 12120, 13423, 14803, 16262, 17800, 19418, 21118, 22900, 24766,
  26716, 28752, 30874, 33083, 35381, 37768, 40245, 42812, 45471, 48222, 51067, 54006, 57039,
  60168, 63393, 66715, 70135, 73653, 77270, 80987, 84805, 88724, 92745, 96868, 101095, 105425,
  109860, 114400, 119046, 123798, 128657, 133624, 138699, 143883, 149176, 154579, 160092,
  165716, 171452, 177300, 183261, 189335, 195523, 201825, 208242, 214774, 221422, 228186,
  235067, 242066, 249182, 256417, 263771, 271244, 278837, 286550, 294384, 302339, 310416,
  318615, 326937, 335382, 343951, 352644, 361461, 370403, 379471, 388665, 397985, 407432,
  417006,
];

const rankTitles = {
  en: {
    1: "Awakening Seed",
    10: "Novice Cartographer",
    20: "Systems Squire",
    30: "Signal Forger",
    40: "Field Tactician",
    50: "Engine Warden",
    60: "Pattern Marshal",
    70: "Realm Architect",
    80: "Mythic Operator",
    90: "Apex Sage",
    100: "Celestial Master",
  },
  zh: {
    1: "啟程之種",
    10: "初階探路者",
    20: "系統侍從",
    30: "訊號鍛造者",
    40: "實戰策士",
    50: "引擎守望者",
    60: "模式統帥",
    70: "領域建築師",
    80: "傳奇操演者",
    90: "巔峰賢者",
    100: "星穹宗師",
  },
} as const;

export function getLevelProgress(level: number, totalXp: number) {
  const currentLevel = Math.max(1, Math.min(level, 100));
  const currentFloor = levelThresholds[currentLevel - 1] ?? 0;
  const nextFloor = levelThresholds[currentLevel] ?? levelThresholds[levelThresholds.length - 1];
  const span = Math.max(1, nextFloor - currentFloor);
  return Math.max(0, Math.min(100, ((totalXp - currentFloor) / span) * 100));
}

export function getRankTitle(level: number, locale: Locale) {
  const milestones = [1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  let titleLevel = 1;
  for (const value of milestones) {
    if (level >= value) {
      titleLevel = value;
    }
  }
  return rankTitles[locale][titleLevel as keyof (typeof rankTitles)[typeof locale]];
}

export function getMilestones(locale: Locale) {
  const labels = rankTitles[locale];
  return [10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((level) => ({
    level,
    title: labels[level as keyof typeof labels],
  }));
}

