// Rendering, movement, interaction and cutaway use this same footprint.
export const trainingBuilding = { minX: 14, maxX: 26, minZ: -7, maxZ: 7, roofY: 4.2 };
export const buildingWalls = [
  { id: 'west-wall', x: 14, z: 0, w: .24, d: 14.24, height: 4.2 },
  { id: 'east-wall', x: 26, z: 0, w: .24, d: 14.24, height: 4.2 },
  { id: 'north-wall', x: 20, z: -7, w: 12.24, d: .24, height: 4.2 },
  { id: 'front-left', x: 16.35, z: 7, w: 4.7, d: .24, height: 4.2 },
  { id: 'front-right', x: 23.65, z: 7, w: 4.7, d: .24, height: 4.2 },
  { id: 'door-lintel', x: 20, z: 7, w: 2.6, d: .24, base: 2.65, height: 4.2 },
];
export const buildingPlatforms = [
  { id: 'warehouse-roof-main', kind: 'roof', x: 18.3, z: 0, w: 8.6, d: 14, base: 3.95, height: 4.2 },
  { id: 'warehouse-roof-north', kind: 'roof', x: 24.3, z: -5.2, w: 3.4, d: 3.6, base: 3.95, height: 4.2 },
  { id: 'warehouse-roof-south', kind: 'roof', x: 24.3, z: 6.1, w: 3.4, d: 1.8, base: 3.95, height: 4.2 },
  ...Array.from({ length: 21 }, (_, i) => ({ id: `warehouse-stair-${i}`, kind: 'stair', x: 24, z: 4.8 - i * .4, w: 2.4, d: .4, height: Math.round((i + 1) * .2 * 100) / 100 })),
  { id: 'warehouse-workbench', kind: 'furniture', x: 18, z: -2.5, w: 2.4, d: 1.2, height: .8 },
];
export const buildingDoors = [{ id: 'warehouse-door', label: '훈련동 출입문', x: 20, y: 0, z: 7, w: 2.6, d: .2, height: 2.65 }];
export const buildingClimbs = [{ id: 'warehouse-wall', label: '외벽 등반', bottom: { x: 13.45, y: 0, z: 0 }, top: { x: 14.75, y: 4.2, z: 0 }, minZ: -1.2, maxZ: 1.2 }];
