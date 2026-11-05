import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { cameraAt, clipNear, initialCamera, moveCamera, project, sceneGeometry, viewPoint } from './geometry';
import type { Movement } from './geometry';
import type { TourStop } from './model';

export default function TourScene({ stops, selected, onSelect, lowDetail }: { stops: TourStop[]; selected: number; onSelect: (index: number) => void; lowDetail: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null), hits = useRef<{ x: number; y: number; index: number }[]>([]);
  const [camera, setCamera] = useState(initialCamera), [error, setError] = useState('');
  useEffect(() => {
    const element = canvas.current; if (!element) return;
    const ctx = element.getContext('2d'); if (!ctx) { setError('This browser cannot draw the optional scene. The complete 2D tour and all passages remain available.'); return; }
    const geometry = sceneGeometry(lowDetail);
    const draw = () => {
      const width = Math.max(200, element.clientWidth), height = Math.max(260, element.clientHeight), ratio = Math.min(2, window.devicePixelRatio || 1);
      element.width = Math.round(width * ratio); element.height = Math.round(height * ratio); ctx.setTransform(ratio,0,0,ratio,0,0);
      const sky = ctx.createLinearGradient(0,0,0,height); sky.addColorStop(0,'#152d43'); sky.addColorStop(1,'#b2bdba'); ctx.fillStyle = sky; ctx.fillRect(0,0,width,height);
      const polygons = geometry.map(face => ({ color: face.color, points: clipNear(face.points.map(point => viewPoint(point,camera))) })).filter(face => face.points.length >= 3).sort((a,b) => b.points.reduce((sum,p) => sum + p[2],0)/b.points.length - a.points.reduce((sum,p) => sum + p[2],0)/a.points.length);
      for (const face of polygons) {
        const points = face.points.map(point => project(point,width,height)); if (points.some(point => !point)) continue;
        ctx.beginPath(); points.forEach((point,index) => { if (point) { if (index) ctx.lineTo(...point); else ctx.moveTo(...point); } }); ctx.closePath(); ctx.fillStyle = face.color; ctx.fill(); ctx.strokeStyle = '#5f5a4c55'; ctx.lineWidth = .6; ctx.stroke();
      }
      hits.current = [];
      stops.forEach((stop,index) => {
        const point = project(viewPoint([stop.position[0],2.4,stop.position[1]],camera),width,height);
        if (!point || point[0] < 20 || point[0] > width-20 || point[1] < 20 || point[1] > height-20) return;
        hits.current.push({x:point[0],y:point[1],index}); ctx.beginPath(); ctx.arc(...point, index === selected ? 21 : 17,0,Math.PI*2); ctx.fillStyle = index === selected ? '#f4d58a' : '#102337'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#faf1d4'; ctx.stroke(); ctx.fillStyle = index === selected ? '#182535' : '#fff'; ctx.font = '700 15px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(index+1),...point);
      });
    };
    draw(); const resize = new ResizeObserver(draw); resize.observe(element); return () => resize.disconnect();
  }, [camera,lowDetail,selected,stops]);
  const move = (movement: Movement) => setCamera(current => moveCamera(current,movement));
  function key(event: KeyboardEvent<HTMLCanvasElement>) {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing) return;
    const movement: Record<string,Movement> = { ArrowUp:'forward',ArrowDown:'back',ArrowLeft:'turnLeft',ArrowRight:'turnRight',w:'forward',s:'back',a:'left',d:'right',q:'lookUp',e:'lookDown' };
    const direction = movement[event.key] || movement[event.key.toLowerCase()];
    if (direction) { event.preventDefault(); move(direction); }
  }
  return <section className="tour-scene" aria-label="Optional schematic 3D walkthrough">
    <p className="tour-scene-label">Original schematic geometry · no surveyed dimensions · low-detail software 3D</p>
    {error ? <p role="alert">{error}</p> : <canvas ref={canvas} tabIndex={0} role="img" aria-label="Schematic Athens scene. Focus here and use arrow keys to walk and turn; W A S D to move. All hotspots are also available as buttons below." aria-describedby="tour-scene-help" onKeyDown={key} onClick={event => { const rectangle = event.currentTarget.getBoundingClientRect(), x = event.clientX-rectangle.left, y = event.clientY-rectangle.top; const hit = hits.current.find(hit => Math.hypot(hit.x-x,hit.y-y)<28); if (hit) onSelect(hit.index); }}/>}
    <p id="tour-scene-help">Arrow keys: walk and turn. W/A/S/D: move. Q/E: look up or down. Tab leaves the scene. Movement is user-controlled; nothing auto-animates.</p>
    <div className="tour-controls"><button type="button" onClick={() => move('forward')}>Walk forward</button><button type="button" onClick={() => move('back')}>Walk back</button><button type="button" onClick={() => move('turnLeft')}>Turn left</button><button type="button" onClick={() => move('turnRight')}>Turn right</button><button type="button" onClick={() => setCamera(initialCamera())}>Reset view</button></div>
    <div className="tour-controls" aria-label="Scene hotspots">{stops.map((stop,index) => <button type="button" key={stop.id} aria-pressed={index === selected} onClick={() => { setCamera(cameraAt(stop.position)); onSelect(index); }}>{index+1}. {stop.title}</button>)}</div>
    <p className="tour-camera-status" role="status">View position {camera.x.toFixed(1)}, {camera.z.toFixed(1)} · heading {Math.round(camera.yaw*180/Math.PI)}° · illustration units</p>
  </section>;
}
