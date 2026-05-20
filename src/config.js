// Central tuning + dimensions (meters, seconds). Real-ish basketball scale.
export const CONFIG = {
  gravity: 9.8,

  rim: {
    center: { x: 0, y: 3.05, z: 0 }, // hoop center in world space
    radius: 0.2286,                  // 18" rim
    tube: 0.02,                      // rim ring thickness
  },

  ball: {
    radius: 0.12,
    restitutionFloor: 0.62,
    restitutionRim: 0.5,
    restitutionBoard: 0.45,
    frictionBounce: 0.78,
  },

  backboard: {
    z: -0.15,        // face plane (rim sits 0.15m in front)
    halfW: 0.915,    // 1.83m wide
    bottom: 2.90,
    top: 3.97,
  },

  // Player shooting spots along the 3pt arc (radius from basket).
  spotRadius: 6.9,
  spotAnglesDeg: [-30, -15, 0, 15, 30], // 2 left of center, center, 2 right
  eyeHeight: 1.65,
  launchAngleDeg: 58, // fixed shot arc (steep enough to clear the near rim on a perfect shot)

  // Shot power meter (ping-pong). 0..1, sweet spot centered at 0.5.
  meter: {
    baseSpeed: 1.05,     // cycles/sec at level 1
    speedPerLevel: 0.10,
    basePerfectTol: 0.085, // half-width of the swish zone at level 1
    tolPerLevel: 0.006,
    minPerfectTol: 0.035,
    spread: 0.20,        // speed = vIdeal * (1 + spread*(2m-1)) outside perfect zone
  },

  game: {
    startLives: 5,
    baseRequired: 3,     // makes needed to clear level 1
    requiredPerLevel: 1,
    pointsMake: 3,
    pointsPerfect: 2,
  },
};

export const D2R = Math.PI / 180;
