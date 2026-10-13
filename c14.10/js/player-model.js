const STORAGE_KEY = "chain-reaction-ai-profile-v1";
const MAX_RECENT_OUTCOMES = 12;

function createEmptyGrid(rows = 12, cols = 12) {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0));
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function cloneData(data) {
  return JSON.parse(JSON.stringify(data));
}

export function createPlayerModel(seedData) {
  const profile = seedData
    ? cloneData(seedData)
    : {
        gamesPlayed: 0,
        humanWins: 0,
        aiWins: 0,
        recentOutcomes: [],
        moveHeatmap: createEmptyGrid(),
        openingPreferences: { corners: 0, edges: 0, center: 0 },
        regionCounts: { corners: 0, edges: 0, center: 0 },
        averageRiskSamples: [],
        aggressionSamples: [],
        chainPreferenceSamples: [],
        criticalTargetingMoves: 0,
        threatResponses: 0,
        threatIgnores: 0,
        moveCount: 0,
      };

  function ensureGrid(row, col) {
    while (profile.moveHeatmap.length <= row) {
      profile.moveHeatmap.push(Array.from({ length: Math.max(col + 1, 12) }, () => 0));
    }
    for (const heatRow of profile.moveHeatmap) {
      while (heatRow.length <= col) {
        heatRow.push(0);
      }
    }
  }

  return {
    recordMove(state, action, features) {
      ensureGrid(action.row, action.col);
      profile.moveHeatmap[action.row][action.col] += 1;
      profile.moveCount += 1;

      profile.regionCounts[features.region] += 1;
      if (state.moveCounts[features.playerId] === 0) {
        profile.openingPreferences[features.region] += 1;
      }

      profile.averageRiskSamples.push(features.riskScore);
      profile.aggressionSamples.push(features.aggressionScore);
      profile.chainPreferenceSamples.push(features.chainIntentScore);
      if (features.targetsCriticalCell) {
        profile.criticalTargetingMoves += 1;
      }
      if (features.respondsToThreat) {
        profile.threatResponses += 1;
      } else if (features.ignoredThreat) {
        profile.threatIgnores += 1;
      }
    },

    summarizeTendencies() {
      const moveCount = Math.max(profile.moveCount, 1);
      const preferredRegion = Object.entries(profile.regionCounts)
        .sort((a, b) => b[1] - a[1])[0]?.[0] ?? "center";
      const opening = Object.entries(profile.openingPreferences)
        .sort((a, b) => b[1] - a[1])[0]?.[0] ?? "center";
      const avgRisk = average(profile.averageRiskSamples);
      const aggression = average(profile.aggressionSamples);
      const chainBias = average(profile.chainPreferenceSamples);
      const criticalRate = profile.criticalTargetingMoves / moveCount;
      const threatResponseRate =
        profile.threatResponses / Math.max(profile.threatResponses + profile.threatIgnores, 1);

      const traits = [];
      if (preferredRegion === "corners") traits.push("player leans on corners");
      if (preferredRegion === "edges") traits.push("player prefers edge buildup");
      if (preferredRegion === "center") traits.push("player contests the center");
      if (avgRisk > 0.62) traits.push("takes volatile critical fights");
      if (avgRisk < 0.35) traits.push("keeps a conservative shape");
      if (aggression > 0.55) traits.push("presses captures early");
      if (chainBias > 0.45) traits.push("hunts chain reactions");
      if (criticalRate > 0.38) traits.push("targets near-critical cells");
      if (threatResponseRate > 0.6) traits.push("usually answers local threats");

      return {
        preferredRegion,
        opening,
        averageRisk: avgRisk,
        aggression,
        chainBias,
        criticalRate,
        threatResponseRate,
        summary: traits.length ? `Adaptive read: ${traits.slice(0, 2).join(", ")}.` : "Adaptive read: profile still warming up.",
      };
    },

    getBiasAdjustments(candidateMoves) {
      const summary = this.summarizeTendencies();
      const adjustments = new Map();

      for (const move of candidateMoves) {
        let score = 0;

        if (summary.preferredRegion === "corners" && move.features.region === "corners") {
          score += 2.6;
        }
        if (summary.preferredRegion === "edges" && move.features.region === "edges") {
          score += 1.7;
        }
        if (summary.preferredRegion === "center" && move.features.region === "center") {
          score += 1.2;
        }
        if (summary.criticalRate > 0.35 && move.features.protectsCriticalCells) {
          score += 1.8;
        }
        if (summary.averageRisk > 0.6 && move.features.createsTrap) {
          score += 2.1;
        }
        if (summary.averageRisk < 0.4 && move.features.expansionValue > 0.5) {
          score += 1.4;
        }
        if (summary.chainBias > 0.45 && move.features.blocksOpponentChain) {
          score += 2.4;
        }
        if (summary.aggression > 0.55 && move.features.defensiveValue > 0.4) {
          score += 1.6;
        }
        if (summary.threatResponseRate > 0.6 && move.features.invitesOverreaction) {
          score += 1.2;
        }

        adjustments.set(`${move.action.row},${move.action.col}`, score);
      }

      return adjustments;
    },

    recordOutcome({ didHumanWin, difficulty }) {
      profile.gamesPlayed += 1;
      if (didHumanWin) {
        profile.humanWins += 1;
      } else {
        profile.aiWins += 1;
      }

      profile.recentOutcomes.unshift({
        didHumanWin,
        difficulty,
        timestamp: Date.now(),
      });
      profile.recentOutcomes = profile.recentOutcomes.slice(0, MAX_RECENT_OUTCOMES);
    },

    exportSnapshot() {
      return cloneData(profile);
    },

    save() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    },

    load() {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return null;
      }

      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    },
  };
}