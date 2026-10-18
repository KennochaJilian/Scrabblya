export type BoardBounds = { x: number; y: number; width: number; height: number };
export function cellAtPoint(x: number, y: number, bounds: BoardBounds | null): number | null {
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) return null;
  const dx = x - bounds.x, dy = y - bounds.y;
  if (dx < 0 || dy < 0 || dx >= bounds.width || dy >= bounds.height) return null;
  return Math.floor(dy / (bounds.height / 15)) * 15 + Math.floor(dx / (bounds.width / 15));
}
export type Point = {x: number; y: number};
export type TileGrab = {offsetX: number; offsetY: number; width: number; height: number};
export function tilePosition(touch: Point, root: Point, grab: TileGrab): Point {
 return {x:touch.x-root.x-grab.offsetX,y:touch.y-root.y-grab.offsetY};
}
