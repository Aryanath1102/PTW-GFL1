import type { Avenue, SafetyDistrict, Street } from '../../core/ptw/safetyDistricts';
export type PlantLocation = SafetyDistrict | Avenue | Street;
export const locationCenter = (item: PlantLocation) => 'center' in item ? item.center : { x: (item.x1 + item.x2) / 2, y: (item.y1 + item.y2) / 2 };
export const plantToWorld = (point: { x: number; y: number }) => ({ x: point.x - 1000, z: point.y - 610 });
export const districtVertices = (item: SafetyDistrict) => item.points.trim().split(/\s+/).map(pair => {
  const [x, y] = pair.split(',').map(Number);
  return { x, y };
});
export function focusDistance(item: PlantLocation): number {
  const points = 'center' in item ? districtVertices(item) : [{ x: item.x1, y: item.y1 }, { x: item.x2, y: item.y2 }];
  return Math.max(270, Math.min(1250, Math.max(
    Math.max(...points.map(p => p.x)) - Math.min(...points.map(p => p.x)),
    Math.max(...points.map(p => p.y)) - Math.min(...points.map(p => p.y))
  ) * 1.15));
}
