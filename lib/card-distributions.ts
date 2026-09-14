export const englishCardDistributions: Record<string, string> = {
  "OP01-015_P1": "Offline Regional Participation Pack 2024 Vol. 3",
  "OP01-021_P2": "Tournament Pack Vol.2",
  "OP01-033_P1": "Tournament Pack Vol.2",
  "OP01-035_P1": "Tournament Pack Vol.4",
  "OP01-041_P1": "Tournament Pack Vol.7",
  "OP01-052_P1": "Included in Event Pack Vol.2",
  "OP01-070_P2": "Treasure Cup August – September",
  "OP01-101_P1": "Included in Event Pack Vol.2",
  "OP02-035_P1": "Included in Online Regional Participation Pack Vol.1",
  "OP02-063_P1": "Offline Regional Participation Pack 2024 Vol. 3",
  "OP02-098_P1": "Included in Online Regional Participation Pack Vol.1",
  "OP02-106_P1": "Included in Event Pack Vol.2",
  "OP03-033_P1": "Tournament Pack Vol.6",
  "OP03-044_P1": "Tournament Pack Vol.6",
  "OP03-088_P1": "Tournament Pack Vol.6",
  "OP03-089_P1": "Offline Regional Participation Pack 2024 Vol. 1",
  "OP03-102_P1": "Offline Regional Participation Pack 2024 Vol. 1",
  "OP03-112_P2": "Regional 2024 wave2",
  "OP03-112_P3": "Tournament Pack 2024 Oct.-Dec.",
  "OP03-112_P6": "CS 25-26 Celebration Pack",
  "OP03-114_P3": "Regional 2024 wave2",
  "OP03-116_P1": "Tournament Pack Vol.6",
  "OP03-116_P2": "Regionals Wave 3",
  "OP03-123_P2": "Regional 2024 wave2",
  "OP04-010_P1": "Tournament Pack 2024 Oct.-Dec.",
  "OP04-010_P2": "CS 25-26 Celebration Pack",
  "OP04-083_P3": "Winner prize for Sealed Battle 2023 Vol.1",
  "OP04-092_P1": "Tournament Kit 2025 Vol.2",
  "OP04-092_P2": "Winner Pack 2025 Vol.2",
  "OP04-092_P3": "CS 25-26 Celebration Pack",
  "OP05-036_P1": "Event Pack Vol.3",
  "OP05-037_P1": "Tournament Pack 2025 Vol. 4",
  "OP05-037_P2": "Winner Pack 2025 Vol. 4",
  "OP05-067_P2": "Event Pack Vol.5",
  "OP05-067_P5": "CS 25-26 Event Pack",
  "OP05-067_P6": "CS 25-26 Event Pack Finalist Ver.",
  "OP05-086_P1": "Regionals Wave 3",
  "OP05-091_P3": "Regionals Wave 3",
  "OP05-106_P1": "Tournament Pack Vol.7",
  "ST01-012_P4": "Tournament Pack Vol.5",
  "ST04-003_P2": "Tournament Pack Vol.5",
};

export const japaneseCardDistributions: Record<string, string> = {
  "OP02-096_P3": "Championship 2023",
  "OP02-099_P4": "Championship 2023",
};

export function distributionsForLanguage(language: "EN" | "FR" | "JP") {
  if (language === "EN") return englishCardDistributions;
  if (language === "JP") return japaneseCardDistributions;
  return {};
}

export function distributionCardIds(distribution: string, language: "EN" | "FR" | "JP") {
  return Object.entries(distributionsForLanguage(language)).filter(([, value]) => value === distribution).map(([cardId]) => cardId);
}
