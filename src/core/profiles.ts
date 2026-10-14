import type { MapProfile, MapProfileId, QualityTargets } from './agentTypes';

const DEFAULT_TARGETS: QualityTargets = {
  tWinRate: [0.42, 0.58],
  firstContactSeconds: [5, 12],
  ctLeadSeconds: [5, 12],
  rotationSeconds: [6, 14],
  maxSightlineUnits: 3000,
};

export const MAP_PROFILES: Record<MapProfileId, MapProfile> = {
  'two-site-3v3': {
    id: 'two-site-3v3',
    label: 'Two-site 3v3',
    requiredSites: ['A', 'B'],
    targets: DEFAULT_TARGETS,
  },
  'one-site-3v3': {
    id: 'one-site-3v3',
    label: 'One-site 3v3',
    requiredSites: ['A'],
    targets: DEFAULT_TARGETS,
  },
};

export function resolveProfile(
  id: MapProfileId,
  overrides: Partial<QualityTargets> = {},
): MapProfile {
  const base = MAP_PROFILES[id];
  return { ...base, targets: { ...base.targets, ...overrides } };
}
