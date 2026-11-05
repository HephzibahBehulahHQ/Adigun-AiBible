export type Point3 = [number, number, number];
export interface Camera { x: number; z: number; yaw: number; pitch: number }
export interface Face { points: Point3[]; color: string }
export const initialCamera = (): Camera => ({ x: 0, z: 17, yaw: 0, pitch: -0.14 });
export type Movement = 'forward' | 'back' | 'left' | 'right' | 'turnLeft' | 'turnRight' | 'lookUp' | 'lookDown';
export function moveCamera(camera: Camera, movement: Movement): Camera {
  const next = { ...camera }, speed = .8;
  if (movement === 'turnLeft') next.yaw -= .14;
  if (movement === 'turnRight') next.yaw += .14;
  if (movement === 'lookUp') next.pitch = Math.min(.4, next.pitch + .08);
  if (movement === 'lookDown') next.pitch = Math.max(-.65, next.pitch - .08);
  const direction = movement === 'forward' ? 1 : movement === 'back' ? -1 : 0;
  const sideways = movement === 'right' ? 1 : movement === 'left' ? -1 : 0;
  next.x += speed * (Math.sin(next.yaw) * direction + Math.cos(next.yaw) * sideways);
  next.z += speed * (-Math.cos(next.yaw) * direction + Math.sin(next.yaw) * sideways);
  next.x = Math.max(-18, Math.min(18, next.x)); next.z = Math.max(-16, Math.min(20, next.z));
  return next;
}
export function cameraAt(position: [number, number]): Camera { return { x: position[0], z: Math.min(20, position[1] + 6), yaw: 0, pitch: -.14 }; }
export function viewPoint(point: Point3, camera: Camera): Point3 {
  const dx = point[0] - camera.x, dy = point[1] - 2.3, dz = point[2] - camera.z;
  const x = dx * Math.cos(camera.yaw) + dz * Math.sin(camera.yaw), z = dx * Math.sin(camera.yaw) - dz * Math.cos(camera.yaw);
  return [x, dy * Math.cos(camera.pitch) - z * Math.sin(camera.pitch), dy * Math.sin(camera.pitch) + z * Math.cos(camera.pitch)];
}
export function project(point: Point3, width: number, height: number): [number, number] | null {
  if (point.some(value => !Number.isFinite(value)) || point[2] < .2 || width <= 0 || height <= 0) return null;
  const focal = Math.min(width, height) * .9;
  return [width / 2 + point[0] * focal / point[2], height / 2 - point[1] * focal / point[2]];
}
export function clipNear(points: Point3[]): Point3[] {
  const result: Point3[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length], insideA = a[2] >= .2, insideB = b[2] >= .2;
    if (insideA) result.push(a);
    if (insideA !== insideB) { const t = (.2 - a[2]) / (b[2] - a[2]); result.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), .2]); }
  }
  return result;
}
function box(x: number, y: number, z: number, width: number, height: number, depth: number, color = '#b39a77'): Face[] {
  const a = x - width / 2, b = x + width / 2, c = z - depth / 2, d = z + depth / 2, t = y + height;
  return [
    { points: [[a,y,c],[b,y,c],[b,t,c],[a,t,c]], color }, { points: [[b,y,d],[a,y,d],[a,t,d],[b,t,d]], color },
    { points: [[a,y,d],[a,y,c],[a,t,c],[a,t,d]], color: '#a18c70' }, { points: [[b,y,c],[b,y,d],[b,t,d],[b,t,c]], color: '#c1ac8c' },
    { points: [[a,t,c],[b,t,c],[b,t,d],[a,t,d]], color: '#d1b998' },
  ];
}
export function sceneGeometry(lowDetail: boolean): Face[] {
  const faces: Face[] = [
    { points: [[-24,0,-24],[24,0,-24],[24,0,24],[-24,0,24]], color: '#8e9279' },
    { points: [[-10,.01,-8],[1,.01,-8],[1,.01,2],[-10,.01,2]], color: '#b6ab8e' },
    { points: [[-10,.02,5],[11,.02,5],[11,.02,8],[-10,.02,8]], color: '#c7b896' },
    ...box(-6,0,-9,13,.35,3), ...box(-6,3.2,-9,13,.5,3),
    ...box(8,0,-6,6,.7,4,'#8a847a'), ...box(8,.7,-6,4,.5,3,'#969085'),
    ...box(-12,0,0,2,2,5), ...box(0,0,-3,2,2,3),
  ];
  for (let x = -12; x <= 0; x += lowDetail ? 4 : 2) faces.push(...box(x,.35,-8,.45,2.85,.45,'#cfbea2'));
  if (!lowDetail) for (let z = -14; z <= 5; z += 6) faces.push(...box(15,0,z,2,2.8,3,'#a9977a'));
  return faces;
}
