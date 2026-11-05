import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  SafetyDistrict,
  Avenue,
  Street,
  SAFETY_DISTRICTS,
  AVENUES,
  STREETS
} from '../../core/ptw/safetyDistricts';
import {
  SelectedEntity,
  SelectedEntityCategory,
  ActivePermitPin,
  MapLayerVisibility,
  CanvasTheme,
  InteractionMode
} from './types';

interface PlantInteractiveSvgProps {
  currentSelection: SelectedEntity;
  onSelectEntity: (
    category: SelectedEntityCategory,
    item: SafetyDistrict | Avenue | Street,
    customCoords?: { x: number; y: number }
  ) => void;
  activePermits: ActivePermitPin[];
  onSelectPermit: (permit: ActivePermitPin) => void;
  layers: MapLayerVisibility;
  theme: CanvasTheme;
  hoverTarget: string;
  onHoverTargetChange: (target: string) => void;
  cursorCoords: { x: number; y: number };
  onCursorCoordsChange: (coords: { x: number; y: number }) => void;
  interactionMode: InteractionMode;
  onTriggerPinDropModal: () => void;
  viewState: { x: number; y: number; scale: number };
  setViewState: React.Dispatch<React.SetStateAction<{ x: number; y: number; scale: number }>>;
}

const PIN_COLOR_MAP: Record<string, string> = {
  'Hot Work': '#ef4444',
  'Cold Work': '#0ea5e9',
  'Confined Space': '#a855f7',
  'Height / Crane': '#f59e0b',
  'Excavation / Road': '#10b981'
};

export const PlantInteractiveSvg: React.FC<PlantInteractiveSvgProps> = ({
  currentSelection,
  onSelectEntity,
  activePermits,
  onSelectPermit,
  layers,
  theme,
  onHoverTargetChange,
  interactionMode,
  onTriggerPinDropModal,
  viewState,
  setViewState
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const viewportGroupRef = useRef<SVGGElement>(null);

  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const hasMovedRef = useRef<boolean>(false);
  const [flashId, setFlashId] = useState<string | null>(null);

  // Trigger flash animation on newly selected item
  useEffect(() => {
    if (currentSelection?.item?.id) {
      setFlashId(currentSelection.item.id);
      const timer = setTimeout(() => setFlashId(null), 2100);
      return () => clearTimeout(timer);
    }
  }, [currentSelection?.item?.id]);

  // Convert client mouse event to SVG world coordinates
  const getSvgCoordinates = useCallback((clientX: number, clientY: number): { x: number; y: number } | null => {
    if (!svgRef.current || !viewportGroupRef.current) return null;
    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const grpCTM = viewportGroupRef.current.getScreenCTM();
    if (!grpCTM) return null;
    const transformed = pt.matrixTransform(grpCTM.inverse());
    return {
      x: Math.round(transformed.x),
      y: Math.round(transformed.y)
    };
  }, []);

  // Keep navigation in viewBox units, regardless of the rendered map size.
  const getViewportPoint = useCallback((clientX: number, clientY: number) => {
    const matrix = svgRef.current?.getScreenCTM();
    if (!matrix) return null;
    return new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
  }, []);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const point = getViewportPoint(event.clientX, event.clientY);
      if (!point) return;
      setViewState(prev => {
        const scale = Math.min(4.5, Math.max(0.55, prev.scale * (event.deltaY < 0 ? 1.12 : 1 / 1.12)));
        return { scale, x: point.x - (point.x - prev.x) * scale / prev.scale, y: point.y - (point.y - prev.y) * scale / prev.scale };
      });
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [getViewportPoint, setViewState]);

  const handlePointerDown = useCallback((event: React.PointerEvent) => {
    if (event.button !== 0 || !event.isPrimary) return;
    const point = getViewportPoint(event.clientX, event.clientY);
    if (!point) return;
    setIsPanning(true);
    hasMovedRef.current = false;
    panStartRef.current = { x: point.x - viewState.x, y: point.y - viewState.y };
  }, [getViewportPoint, viewState]);

  useEffect(() => {
    if (!isPanning) return;
    const move = (event: PointerEvent) => {
      if (!event.isPrimary) return;
      const point = getViewportPoint(event.clientX, event.clientY);
      if (!point) return;
      const x = point.x - panStartRef.current.x;
      const y = point.y - panStartRef.current.y;
      if (Math.hypot(x - viewState.x, y - viewState.y) > 4) hasMovedRef.current = true;
      if (hasMovedRef.current) setViewState(prev => ({ ...prev, x, y }));
    };
    const end = () => setIsPanning(false);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
  }, [isPanning, getViewportPoint, setViewState, viewState.x, viewState.y]);

  // Click on background canvas to pin-point or drop permit
  const handleCanvasClick = (e: React.MouseEvent) => {
    if (hasMovedRef.current) return;
    const pt = getSvgCoordinates(e.clientX, e.clientY);
    if (!pt) return;

    if (interactionMode === 'pin') {
      // Find nearest district
      const nearest = SAFETY_DISTRICTS.reduce((prev, curr) => {
        const dPrev = Math.hypot(prev.center.x - pt.x, prev.center.y - pt.y);
        const dCurr = Math.hypot(curr.center.x - pt.x, curr.center.y - pt.y);
        return dCurr < dPrev ? curr : prev;
      }, SAFETY_DISTRICTS[0]);

      onSelectEntity('DISTRICT', nearest, pt);
      onTriggerPinDropModal();
    }
  };

  const isDark = theme === 'dark';

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      style={{ touchAction: 'none' }}
      onClick={handleCanvasClick}
      className={`flex-1 w-full h-full relative overflow-hidden select-none cursor-grab active:cursor-grabbing ${
        isDark ? 'dark-gis-paper' : 'cad-paper'
      }`}
    >
      <style>{`
        .sd-block {
          transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
          cursor: pointer;
          vector-effect: non-scaling-stroke;
        }
        .sd-block:hover {
          filter: brightness(1.18) drop-shadow(0 0 8px rgba(56, 189, 248, 0.55));
          stroke: #0284c7 !important;
          stroke-width: 3px !important;
        }
        .sd-block.selected {
          filter: none;
          stroke: #1d4ed8 !important;
          stroke-width: 4px !important;
          stroke-dasharray: none !important;
        }
        .road-segment {
          transition: all 0.15s ease;
          cursor: pointer;
        }
        .road-segment:hover {
          opacity: 1 !important;
          filter: drop-shadow(0 0 6px rgba(245, 158, 11, 0.85));
        }
        .road-segment.selected {
          opacity: 1 !important;
          stroke: #dc2626 !important;
          filter: drop-shadow(0 0 10px rgba(239, 68, 68, 0.95));
        }
        @keyframes pulseRing {
          0% { transform: scale(0.8); opacity: 0.9; }
          70% { transform: scale(2.3); opacity: 0; }
          100% { transform: scale(2.4); opacity: 0; }
        }
        .pin-pulse {
          transform-origin: center;
          transform-box: fill-box;
          animation: pulseRing 1.8s infinite cubic-bezier(0.2, 0.8, 0.4, 1);
        }
        @keyframes blockFlash {
          0%, 100% { filter: brightness(1); }
          50% { filter: brightness(1.6) drop-shadow(0 0 18px #f59e0b); }
        }
        .flash-highlight {
          animation: none;
        }
        .cad-paper {
          background-color: #f8fafc;
          background-image: 
            linear-gradient(to right, rgba(148, 163, 184, 0.14) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(148, 163, 184, 0.14) 1px, transparent 1px);
          background-size: 25px 25px;
        }
        .dark-gis-paper {
          background-color: #091120;
          background-image: 
            linear-gradient(to right, rgba(56, 189, 248, 0.07) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(56, 189, 248, 0.07) 1px, transparent 1px);
          background-size: 25px 25px;
        }
      `}</style>

      <svg
        ref={svgRef}
        id="plotPlanSvg"
        role="img"
        aria-label="Dahej plant safety districts, avenues and streets"
        viewBox="0 0 2000 1220"
        className="w-full h-full select-none"
      >
        <defs>
          {/* CAD HATCH PATTERNS FOR THE 26 SAFETY DISTRICTS */}
          <pattern id="hatch-diag-red" width="14" height="14" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
            <rect width="14" height="14" fill={isDark ? '#2a1215' : '#fee2e2'} fillOpacity={isDark ? '0.85' : '0.72'} />
            <line x1="0" y1="0" x2="0" y2="14" stroke="#dc2626" strokeWidth="3" strokeOpacity="0.55" />
          </pattern>
          <pattern id="hatch-diag-pink" width="14" height="14" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
            <rect width="14" height="14" fill={isDark ? '#281220' : '#fce7f3'} fillOpacity={isDark ? '0.85' : '0.75'} />
            <line x1="0" y1="0" x2="0" y2="14" stroke="#db2777" strokeWidth="2.5" strokeOpacity="0.5" />
          </pattern>
          <pattern id="hatch-cross-orange" width="14" height="14" patternUnits="userSpaceOnUse">
            <rect width="14" height="14" fill={isDark ? '#2e1808' : '#ffedd5'} fillOpacity={isDark ? '0.85' : '0.8'} />
            <path d="M 0,0 L 14,14 M 14,0 L 0,14" stroke="#ea580c" strokeWidth="1.8" strokeOpacity="0.55" />
          </pattern>
          <pattern id="hatch-cross-yellow" width="16" height="16" patternUnits="userSpaceOnUse">
            <rect width="16" height="16" fill={isDark ? '#261f06' : '#fef9c3'} fillOpacity={isDark ? '0.85' : '0.78'} />
            <path d="M 0,0 L 16,16 M 16,0 L 0,16" stroke="#ca8a04" strokeWidth="1.6" strokeOpacity="0.45" />
          </pattern>
          <pattern id="hatch-grid-green" width="12" height="12" patternUnits="userSpaceOnUse">
            <rect width="12" height="12" fill={isDark ? '#0b2618' : '#dcfce7'} fillOpacity={isDark ? '0.85' : '0.8'} />
            <path d="M 12 0 L 0 0 0 12" fill="none" stroke="#16a34a" strokeWidth="1.5" strokeOpacity="0.55" />
          </pattern>
          <pattern id="hatch-lime-dots" width="12" height="12" patternUnits="userSpaceOnUse">
            <rect width="12" height="12" fill={isDark ? '#19260a' : '#ecfccb'} fillOpacity={isDark ? '0.85' : '0.82'} />
            <circle cx="4" cy="4" r="1.7" fill="#65a30d" fillOpacity="0.65" />
            <circle cx="10" cy="10" r="1.7" fill="#65a30d" fillOpacity="0.65" />
          </pattern>
          <pattern id="hatch-cyan-lines" width="12" height="12" patternTransform="rotate(-45 0 0)" patternUnits="userSpaceOnUse">
            <rect width="12" height="12" fill={isDark ? '#082530' : '#cffafe'} fillOpacity={isDark ? '0.85' : '0.82'} />
            <line x1="0" y1="0" x2="0" y2="12" stroke="#0891b2" strokeWidth="2.5" strokeOpacity="0.55" />
          </pattern>
          <pattern id="hatch-purple-diag" width="14" height="14" patternTransform="rotate(-35 0 0)" patternUnits="userSpaceOnUse">
            <rect width="14" height="14" fill={isDark ? '#230f33' : '#f3e8ff'} fillOpacity={isDark ? '0.85' : '0.82'} />
            <line x1="0" y1="0" x2="0" y2="14" stroke="#9333ea" strokeWidth="2.5" strokeOpacity="0.55" />
          </pattern>
          <pattern id="hatch-brown-dense" width="10" height="10" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
            <rect width="10" height="10" fill={isDark ? '#2b1b0b' : '#fef3c7'} fillOpacity={isDark ? '0.85' : '0.85'} />
            <line x1="0" y1="0" x2="0" y2="10" stroke="#92400e" strokeWidth="2.5" strokeOpacity="0.55" />
          </pattern>
          <pattern id="hatch-slate-dash" width="16" height="16" patternTransform="rotate(135 0 0)" patternUnits="userSpaceOnUse">
            <rect width="16" height="16" fill={isDark ? '#1a2233' : '#e2e8f0'} fillOpacity={isDark ? '0.85' : '0.85'} />
            <line x1="0" y1="0" x2="0" y2="16" stroke="#475569" strokeWidth="2.5" strokeDasharray="4,3" strokeOpacity="0.6" />
          </pattern>
          <pattern id="hatch-blue-cross" width="14" height="14" patternUnits="userSpaceOnUse">
            <rect width="14" height="14" fill={isDark ? '#0b1d3a' : '#dbeafe'} fillOpacity={isDark ? '0.85' : '0.82'} />
            <path d="M 0,7 L 14,7 M 7,0 L 7,14" stroke="#2563eb" strokeWidth="1.6" strokeOpacity="0.5" />
          </pattern>
          <pattern id="hatch-orange-solid" width="12" height="12" patternUnits="userSpaceOnUse">
            <rect width="12" height="12" fill={isDark ? '#381608' : '#fb923c'} fillOpacity={isDark ? '0.85' : '0.78'} />
            <circle cx="6" cy="6" r="1.5" fill="#9a3412" fillOpacity="0.5" />
          </pattern>
          <pattern id="hatch-greenbelt" width="16" height="16" patternUnits="userSpaceOnUse">
            <rect width="16" height="16" fill={isDark ? '#0a2215' : '#bbf7d0'} fillOpacity={isDark ? '0.7' : '0.65'} />
            <path d="M 4,12 L 8,4 L 12,12 Z" fill="#15803d" fillOpacity="0.35" />
          </pattern>

          {/* Drop Shadow Filter for Badges & Pins */}
          <filter id="badgeShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="1.5" stdDeviation="2" floodColor="#000000" floodOpacity="0.45" />
          </filter>
        </defs>

        {/* MAIN PAN/ZOOM GROUP */}
        <g
          ref={viewportGroupRef}
          id="viewportGroup"
          transform={`translate(${viewState.x}, ${viewState.y}) scale(${viewState.scale})`}
        >
          {/* 1. OUTER PLANT BOUNDARY, NEIGHBORING INDUSTRIES & PERIMETER ROADS */}
          <g id="layerContext">
            {/* Outer Drawing Frame */}
            <rect
              x="15"
              y="15"
              width="1970"
              height="1190"
              fill="none"
              stroke={isDark ? '#334155' : '#64748b'}
              strokeWidth="2"
              strokeDasharray="8,4"
              opacity="0.5"
            />

            {/* North Road: PROPOSED GIDC ROAD */}
            <polygon
              points="30,15 1960,115 1960,150 30,50"
              fill={isDark ? '#1e293b' : '#e2e8f0'}
              stroke={isDark ? '#475569' : '#475569'}
              strokeWidth="1.5"
              opacity="0.85"
            />
            <text
              x="820"
              y="75"
              transform="rotate(3, 820, 75)"
              fill={isDark ? '#94a3b8' : '#1e293b'}
              fontSize="15"
              fontWeight="800"
              letterSpacing="2"
            >
              PROPOSED GIDC ROAD (NORTH CORRIDOR)
            </text>
            <text
              x="1350"
              y="55"
              transform="rotate(3, 1350, 55)"
              fill={isDark ? '#64748b' : '#334155'}
              fontSize="14"
              fontWeight="700"
            >
              Deepak Nitrite Ltd / Deepak Phenolics Ltd
            </text>

            {/* West / South-West Angled Road: EXISTING AMBHETA ROAD */}
            <polygon
              points="15,55 40,55 155,645 450,1145 415,1160 120,660"
              fill={isDark ? '#1e293b' : '#e2e8f0'}
              stroke={isDark ? '#475569' : '#475569'}
              strokeWidth="1.5"
              opacity="0.85"
            />
            <text
              x="72"
              y="420"
              transform="rotate(79, 72, 420)"
              fill={isDark ? '#94a3b8' : '#1e293b'}
              fontSize="13"
              fontWeight="800"
              letterSpacing="1.5"
            >
              EXISTING AMBHETA ROAD
            </text>
            <text
              x="275"
              y="910"
              transform="rotate(59, 275, 910)"
              fill={isDark ? '#94a3b8' : '#1e293b'}
              fontSize="13"
              fontWeight="800"
              letterSpacing="1.5"
            >
              EXISTING AMBHETA ROAD
            </text>
            <text
              x="65"
              y="745"
              transform="rotate(58, 65, 745)"
              fill={isDark ? '#64748b' : '#334155'}
              fontSize="22"
              fontWeight="800"
              letterSpacing="4"
            >
              I S G E C
            </text>
            <text
              x="150"
              y="1090"
              fill={isDark ? '#64748b' : '#475569'}
              fontSize="15"
              fontWeight="700"
            >
              Village Ambheta
            </text>

            {/* East Neighbor: Nocil Ltd */}
            <text
              x="1950"
              y="560"
              transform="rotate(90, 1950, 560)"
              fill={isDark ? '#64748b' : '#334155'}
              fontSize="18"
              fontWeight="800"
              letterSpacing="3"
            >
              NOCIL LTD (EAST BOUNDARY)
            </text>

            {/* GFL Plant Perimeter Polygon */}
            <polygon
              points="55,58 1915,155 1915,960 1750,1115 465,1150 165,645"
              fill={isDark ? '#0b162c' : '#f1f5f9'}
              stroke="#15803d"
              strokeWidth="6"
              strokeLinejoin="round"
            />

            {/* North Green Belt Strip */}
            <polygon
              points="60,62 1910,158 1910,185 65,92"
              fill="url(#hatch-greenbelt)"
              stroke="#16a34a"
              strokeWidth="1"
            />

            {/* Compass Rose */}
            <g transform="translate(1890, 70)">
              <circle cx="0" cy="0" r="28" fill="#0f172a" stroke="#f59e0b" strokeWidth="2" />
              <polygon points="0,-22 -6,0 0,-5 6,0" fill="#ef4444" />
              <polygon points="0,22 -6,0 0,5 6,0" fill="#94a3b8" />
              <text x="-4" y="-26" fill="#ef4444" fontSize="11" fontWeight="800">
                N
              </text>
              <text x="26" y="4" fill="#64748b" fontSize="10" fontWeight="700">
                E
              </text>
              <text x="-4" y="34" fill="#64748b" fontSize="10" fontWeight="700">
                S
              </text>
              <text x="-35" y="4" fill="#64748b" fontSize="10" fontWeight="700">
                W
              </text>
            </g>
          </g>

          {/* 2. SAFETY DISTRICTS LAYER (26 CLICKABLE BLOCKS) */}
          {layers.districts && (
            <g id="layerDistricts">
              {SAFETY_DISTRICTS.map((sd) => {
                const isSelected =
                  currentSelection.category === 'DISTRICT' && currentSelection.item.id === sd.id;
                const isFlashing = flashId === sd.id;

                return (
                  <polygon
                    key={sd.id}
                    id={`svg-${sd.id}`}
                    points={sd.points}
                    fill={layers.hatches ? sd.hatch : isDark ? '#1e293b' : '#bae6fd'}
                    stroke={sd.stroke}
                    strokeWidth={isSelected ? 4 : 2}
                    className={`sd-block ${isSelected ? 'selected' : ''} ${
                      isFlashing ? 'flash-highlight' : ''
                    }`}
                    onMouseEnter={() => onHoverTargetChange(`${sd.id}: ${sd.shortLabel}`)}
                    onClick={(e) => {
                      if (hasMovedRef.current) return;
                      e.stopPropagation();
                      const pt = getSvgCoordinates(e.clientX, e.clientY);
                      onSelectEntity('DISTRICT', sd, pt || { x: sd.center.x, y: sd.center.y });
                      if (interactionMode === 'pin') {
                        onTriggerPinDropModal();
                      }
                    }}
                  />
                );
              })}
            </g>
          )}

          {/* 3. EAST-TO-WEST STREETS LAYER (40 CLICKABLE STREETS) */}
          {layers.streets && (
            <g id="layerStreets">
              {STREETS.map((st) => {
                const isSelected =
                  currentSelection.category === 'STREET' && currentSelection.item.id === st.id;
                const midX = Math.round((st.x1 + st.x2) / 2);
                const midY = Math.round((st.y1 + st.y2) / 2);
                const isFlashing = flashId === st.id;

                return (
                  <g
                    key={st.id}
                    id={`svg-${st.id}`}
                    className={`road-segment ${isSelected ? 'selected' : ''} ${
                      isFlashing ? 'flash-highlight' : ''
                    }`}
                    onMouseEnter={() => onHoverTargetChange(`${st.id}: ${st.name}`)}
                    onClick={(e) => {
                      if (hasMovedRef.current) return;
                      e.stopPropagation();
                      const pt = getSvgCoordinates(e.clientX, e.clientY);
                      onSelectEntity('STREET', st, pt || { x: midX, y: midY });
                      if (interactionMode === 'pin') {
                        onTriggerPinDropModal();
                      }
                    }}
                  >
                    {/* Hit area & border */}
                    <line
                      x1={st.x1}
                      y1={st.y1}
                      x2={st.x2}
                      y2={st.y2}
                      stroke={isSelected ? '#ef4444' : '#38bdf8'}
                      strokeWidth={isSelected ? 11 : 7}
                      strokeLinecap="round"
                      strokeOpacity={isSelected ? 0.95 : 0.45}
                    />
                    {/* Dashed centerline */}
                    <line
                      x1={st.x1}
                      y1={st.y1}
                      x2={st.x2}
                      y2={st.y2}
                      stroke={isSelected ? '#fef08a' : '#0284c7'}
                      strokeWidth={1.6}
                      strokeDasharray="5,4"
                    />
                    {/* Street pill tag at midpoint */}
                    <rect
                      x={midX - 15}
                      y={midY - 7}
                      width={30}
                      height={14}
                      rx={3}
                      fill={isSelected ? '#dc2626' : '#0369a1'}
                      stroke="#ffffff"
                      strokeWidth={0.8}
                    />
                    <text
                      x={midX}
                      y={midY + 3}
                      textAnchor="middle"
                      fill="#ffffff"
                      fontSize="8.5"
                      fontFamily="JetBrains Mono, monospace"
                      fontWeight="700"
                    >
                      {`S-${st.num}`}
                    </text>
                  </g>
                );
              })}
            </g>
          )}

          {/* 4. NORTH-TO-SOUTH AVENUES LAYER (15 CLICKABLE AVENUES) */}
          {layers.avenues && (
            <g id="layerAvenues">
              {AVENUES.map((av) => {
                const isSelected =
                  currentSelection.category === 'AVENUE' && currentSelection.item.id === av.id;
                const isFlashing = flashId === av.id;
                const midX = Math.round((av.x1 + av.x2) / 2);
                const midY = Math.round((av.y1 + av.y2) / 2);

                return (
                  <g
                    key={av.id}
                    id={`svg-${av.id}`}
                    className={`road-segment ${isSelected ? 'selected' : ''} ${
                      isFlashing ? 'flash-highlight' : ''
                    }`}
                    onMouseEnter={() => onHoverTargetChange(`${av.id}: ${av.name}`)}
                    onClick={(e) => {
                      if (hasMovedRef.current) return;
                      e.stopPropagation();
                      const pt = getSvgCoordinates(e.clientX, e.clientY);
                      onSelectEntity('AVENUE', av, pt || { x: midX, y: midY });
                      if (interactionMode === 'pin') {
                        onTriggerPinDropModal();
                      }
                    }}
                  >
                    <line
                      x1={av.x1}
                      y1={av.y1}
                      x2={av.x2}
                      y2={av.y2}
                      stroke={isSelected ? '#dc2626' : '#f59e0b'}
                      strokeWidth={isSelected ? 13 : 9}
                      strokeLinecap="round"
                      strokeOpacity={isSelected ? 0.95 : 0.6}
                    />
                    <line
                      x1={av.x1}
                      y1={av.y1}
                      x2={av.x2}
                      y2={av.y2}
                      stroke="#78350f"
                      strokeWidth={1.8}
                      strokeDasharray="6,4"
                    />
                    {/* North header badge */}
                    <rect
                      x={av.x1 - 18}
                      y={av.y1 - 10}
                      width={36}
                      height={16}
                      rx={4}
                      fill={isSelected ? '#dc2626' : '#d97706'}
                      stroke="#ffffff"
                      strokeWidth={1}
                    />
                    <text
                      x={av.x1}
                      y={av.y1 + 1.5}
                      textAnchor="middle"
                      fill="#ffffff"
                      fontSize="9.5"
                      fontFamily="JetBrains Mono, monospace"
                      fontWeight="800"
                    >
                      {`AV-${av.num}`}
                    </text>
                  </g>
                );
              })}
            </g>
          )}

          {/* 5. DISTRICT LABELS & RED CIRCULAR NUMBER BADGES (01 - 26) */}
          {layers.districts && (
            <g id="layerDistrictBadges" pointerEvents="none">
              {SAFETY_DISTRICTS.map((sd) => {
                const isSelected =
                  currentSelection.category === 'DISTRICT' && currentSelection.item.id === sd.id;
                const labelWidth = Math.max(95, sd.shortLabel.length * 6.5);

                return (
                  <g key={`badge-${sd.id}`} transform={`translate(${sd.center.x}, ${sd.center.y})`}>
                    {/* White label pill behind text */}
                    <rect
                      x={-labelWidth / 2}
                      y={14}
                      width={labelWidth}
                      height={18}
                      rx={4}
                      fill={isSelected ? '#fef08a' : '#ffffff'}
                      fillOpacity={0.92}
                      stroke={isSelected ? '#dc2626' : '#334155'}
                      strokeWidth={1}
                    />
                    <text
                      x={0}
                      y={26.5}
                      textAnchor="middle"
                      fill="#0f172a"
                      fontSize="10"
                      fontWeight="700"
                    >
                      {sd.shortLabel}
                    </text>

                    {/* Red Circular Badge matching blueprint */}
                    <circle
                      cx={0}
                      cy={-2}
                      r={isSelected ? 15 : 13}
                      fill={isSelected ? '#f59e0b' : '#dc2626'}
                      stroke="#ffffff"
                      strokeWidth={2.2}
                      filter="url(#badgeShadow)"
                    />
                    <text
                      x={0}
                      y={3}
                      textAnchor="middle"
                      fill={isSelected ? '#0f172a' : '#ffffff'}
                      fontSize="12"
                      fontFamily="JetBrains Mono, monospace"
                      fontWeight="800"
                    >
                      {sd.code}
                    </text>
                  </g>
                );
              })}
            </g>
          )}

          {/* 6. ACTIVE PERMIT PINS */}
          {layers.pins && (
            <g id="layerPermitPins">
              {activePermits.map((p, idx) => {
                const pinColor = PIN_COLOR_MAP[p.type] || '#ef4444';

                return (
                  <g
                    key={`${p.ptwNo}-${idx}`}
                    transform={`translate(${p.x}, ${p.y})`}
                    style={{ cursor: 'pointer' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectPermit(p);
                    }}
                  >
                    {/* Pulsing ring */}
                    <circle cx={0} cy={0} r={12} fill={pinColor} className="pin-pulse" />

                    {/* Marker pin */}
                    <path
                      d="M0,0 C-7,-10 -11,-16 -11,-22 A11,11 0 1,1 11,-22 C11,-16 7,-10 0,0 Z"
                      fill={pinColor}
                      stroke="#ffffff"
                      strokeWidth={2}
                      filter="url(#badgeShadow)"
                    />
                    <circle cx={0} cy={-22} r={4.5} fill="#ffffff" />

                    {/* Small PTW tag */}
                    <text
                      x={14}
                      y={-18}
                      fill="#0f172a"
                      fontSize="9.5"
                      fontFamily="JetBrains Mono, monospace"
                      fontWeight="800"
                      stroke="#ffffff"
                      strokeWidth="2.5"
                      paintOrder="stroke"
                    >
                      {p.ptwNo}
                    </text>
                  </g>
                );
              })}
            </g>
          )}

          {/* 7. ACTIVE TARGET CROSSHAIR LAYER */}
          <g id="layerActiveCrosshair" pointerEvents="none">
            {currentSelection?.pinCoords && (
              <g transform={`translate(${currentSelection.pinCoords.x}, ${currentSelection.pinCoords.y})`}>
                <circle
                  r={16}
                  fill="none"
                  stroke="#dc2626"
                  strokeWidth={2.5}
                  strokeDasharray="4,3"
                />
                <line x1={-24} y1={0} x2={24} y2={0} stroke="#dc2626" strokeWidth={2} />
                <line x1={0} y1={-24} x2={0} y2={24} stroke="#dc2626" strokeWidth={2} />
                <circle r={4} fill="#f59e0b" stroke="#dc2626" strokeWidth={2} />
              </g>
            )}
          </g>
        </g>
      </svg>
    </div>
  );
};
