import React, { useEffect, useState } from 'react';
import {
  APIProvider,
  Map as GoogleMap,
  AdvancedMarker,
  InfoWindow,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { Navigation, Radio, BatteryCharging, ShieldCheck, MapPin } from 'lucide-react';
import type { DroneRecord, MissionWithDetails } from '../types/aegis';

const MOTHER_BASE_POS = { lat: 17.5212, lng: 78.4119 };

interface FlightPolylineProps {
  path: Array<{ lat: number; lng: number }>;
  strokeColor?: string;
  dashed?: boolean;
}

const FlightPolyline: React.FC<FlightPolylineProps> = ({
  path,
  strokeColor = '#2563EB',
  dashed = false,
}) => {
  const map = useMap();
  const mapsLib = useMapsLibrary('maps');

  useEffect(() => {
    if (!map || !mapsLib || path.length < 2) return;
    const polyline = new mapsLib.Polyline({
      path,
      geodesic: true,
      strokeColor,
      strokeOpacity: dashed ? 0 : 0.85,
      strokeWeight: dashed ? 3 : 4,
      ...(dashed
        ? {
            icons: [
              {
                icon: {
                  path: 'M 0,-1 0,1',
                  strokeOpacity: 0.95,
                  strokeColor,
                  scale: 3,
                },
                offset: '0',
                repeat: '14px',
              },
            ],
          }
        : {}),
    });
    polyline.setMap(map);
    return () => {
      polyline.setMap(null);
    };
  }, [map, mapsLib, path, strokeColor, dashed]);

  return null;
};

interface AegisMapProps {
  apiKey: string;
  drones: DroneRecord[];
  missions: MissionWithDetails[];
  focusedDroneId?: number | null;
  showSwarmMesh?: boolean;
  showReturnPaths?: boolean;
  heightClass?: string;
  language?: string;
}

export const AegisMap: React.FC<AegisMapProps> = ({
  apiKey,
  drones,
  missions,
  focusedDroneId = null,
  showSwarmMesh = false,
  showReturnPaths = false,
  heightClass = 'h-[420px] md:h-[500px]',
  language = 'en',
}) => {
  const [selectedDroneId, setSelectedDroneId] = useState<number | null>(
    focusedDroneId
  );
  const [quotaError, setQuotaError] = useState(false);

  useEffect(() => {
    const handler = () => setQuotaError(true);
    window.addEventListener('gmp-quota-exceeded', handler);
    return () => window.removeEventListener('gmp-quota-exceeded', handler);
  }, []);

  const focusedDrone =
    drones.find((d) => d.id === (selectedDroneId || focusedDroneId)) || null;

  const center = focusedDrone
    ? { lat: focusedDrone.currentLat, lng: focusedDrone.currentLng }
    : MOTHER_BASE_POS;

  // Build route polylines for active missions
  const activeRoutes = missions
    .filter(
      (m) =>
        m.status === 'in_transit' ||
        m.status === 'near_destination' ||
        m.status === 'preparing'
    )
    .map((m) => {
      try {
        const pts = JSON.parse(m.waypointsJson || '[]') as Array<{
          lat: number;
          lng: number;
        }>;
        return { mission: m, pts };
      } catch {
        return { mission: m, pts: [] };
      }
    });

  // Build return flight paths ONLY for operator view and ONLY when delivery is completed
  const completedReturnRoutes = showReturnPaths
    ? missions
        .filter((m) => m.status === 'delivered')
        .map((m) => {
          try {
            const pts = JSON.parse(m.waypointsJson || '[]') as Array<{
              lat: number;
              lng: number;
            }>;
            if (pts.length < 2) return null;
            const dest = pts[pts.length - 1];
            const start = pts[0];
            const midLat = (dest.lat + start.lat) / 2;
            const midLng = (dest.lng + start.lng) / 2;
            const sepLat = (start.lng - dest.lng) * 0.1;
            const sepLng = (dest.lat - start.lat) * 0.1;
            const returnPts = [
              dest,
              {
                lat: Number((midLat + sepLat).toFixed(6)),
                lng: Number((midLng + sepLng).toFixed(6)),
              },
              start,
            ];
            return { mission: m, pts: returnPts, dest };
          } catch {
            return null;
          }
        })
        .filter((r): r is NonNullable<typeof r> => r !== null)
    : [];

  // Fallback interactive Hyderabad Corridor Radar Map when Maps key is absent or quota reached
  if (!apiKey || quotaError) {
    return (
      <RadarCorridorFallback
        drones={drones}
        activeRoutes={activeRoutes}
        completedReturnRoutes={completedReturnRoutes}
        selectedDroneId={selectedDroneId || focusedDroneId}
        onSelectDrone={setSelectedDroneId}
        showSwarmMesh={showSwarmMesh}
        heightClass={heightClass}
      />
    );
  }

  return (
    <div
      className={`relative w-full ${heightClass} rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm`}
    >
      <APIProvider
        apiKey={apiKey}
        libraries={['marker', 'maps']}
        language={language}
        region="IN"
      >
        <GoogleMap
          mapId="DEMO_MAP_ID"
          defaultCenter={center}
          defaultZoom={13}
          gestureHandling="greedy"
          disableDefaultUI={false}
          internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
          className="w-full h-full"
        >
          {/* Mother Base Marker */}
          <AdvancedMarker
            position={MOTHER_BASE_POS}
            title="AEGIS Mother Base Hub · Gajularamaram"
          >
            <div className="px-2.5 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold shadow-lg border border-cyan-400 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
              <span>Mother Base</span>
            </div>
          </AdvancedMarker>

          {/* Active Route Polylines & Destination Drop-Pad Markers */}
          {activeRoutes.map(({ mission, pts }) => {
            const dest = pts[pts.length - 1];
            return (
              <React.Fragment key={mission.id}>
                <FlightPolyline
                  path={pts}
                  strokeColor={
                    mission.status === 'near_destination' ? '#10B981' : '#2563EB'
                  }
                />
                {dest && (
                  <AdvancedMarker
                    position={{ lat: dest.lat, lng: dest.lng }}
                    title={`Drop Pad · ${mission.parcel?.parcelNumber || mission.missionCode}`}
                  >
                    <div className="px-2 py-1 rounded-lg bg-emerald-700 text-white text-[11px] font-mono font-semibold shadow-md border border-emerald-300 flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      <span>{mission.parcel?.parcelNumber || mission.missionCode}</span>
                    </div>
                  </AdvancedMarker>
                )}
              </React.Fragment>
            );
          })}

          {/* Completed Delivery Return Paths (Operator-Only) */}
          {completedReturnRoutes.map(({ mission, pts, dest }) => (
            <React.Fragment key={`return-${mission.id}`}>
              <FlightPolyline path={pts} strokeColor="#F59E0B" dashed={true} />
              <AdvancedMarker
                position={{ lat: dest.lat, lng: dest.lng }}
                title={`Completed Drop · Return Path (${mission.parcel?.parcelNumber || mission.missionCode})`}
              >
                <div className="px-2 py-1 rounded-lg bg-amber-600 text-white text-[11px] font-mono font-semibold shadow-md border border-amber-200 flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  <span>{mission.parcel?.parcelNumber || mission.missionCode} (RTB)</span>
                </div>
              </AdvancedMarker>
            </React.Fragment>
          ))}

          {/* Swarm Mesh Lines when showSwarmMesh is active */}
          {showSwarmMesh &&
            drones.length >= 2 &&
            drones.slice(0, 4).map((d, idx) => {
              const next = drones[(idx + 1) % Math.min(4, drones.length)];
              return (
                <FlightPolyline
                  key={`mesh-${d.id}-${next.id}`}
                  path={[
                    { lat: d.currentLat, lng: d.currentLng },
                    { lat: next.currentLat, lng: next.currentLng },
                  ]}
                  strokeColor="#06B6D4"
                />
              );
            })}

          {/* Drone Markers */}
          {drones.map((drone) => {
            const isSelected = (selectedDroneId || focusedDroneId) === drone.id;
            const bgClass =
              drone.status === 'available'
                ? 'bg-emerald-600 border-emerald-300'
                : drone.status === 'busy'
                  ? 'bg-blue-600 border-cyan-300'
                  : 'bg-rose-600 border-rose-300';

            return (
              <AdvancedMarker
                key={drone.id}
                position={{ lat: drone.currentLat, lng: drone.currentLng }}
                onClick={() => setSelectedDroneId(drone.id)}
                title={`${drone.code} · ${drone.batteryPct}%`}
              >
                <div
                  className={`px-2.5 py-1.5 rounded-xl text-white text-xs font-mono font-semibold shadow-lg border-2 flex items-center gap-1.5 transition-transform ${bgClass} ${
                    isSelected ? 'scale-110 ring-4 ring-blue-500/30' : ''
                  }`}
                >
                  <Navigation className="w-3.5 h-3.5" />
                  <span>{drone.code}</span>
                </div>
              </AdvancedMarker>
            );
          })}

          {/* Telemetry InfoWindow */}
          {focusedDrone && (
            <InfoWindow
              position={{
                lat: focusedDrone.currentLat,
                lng: focusedDrone.currentLng,
              }}
              onCloseClick={() => setSelectedDroneId(null)}
            >
              <div className="p-1 text-slate-900 min-w-[180px]">
                <p className="font-bold text-sm">{focusedDrone.code}</p>
                <p className="text-xs text-slate-600 mb-1.5">{focusedDrone.model}</p>
                <div className="grid grid-cols-2 gap-1 text-xs font-mono">
                  <span>Speed: {focusedDrone.speedKmh} km/h</span>
                  <span>Alt: {focusedDrone.altitudeM} m</span>
                  <span>Battery: {focusedDrone.batteryPct}%</span>
                  <span>Health: {focusedDrone.healthPct}%</span>
                </div>
              </div>
            </InfoWindow>
          )}
        </GoogleMap>
      </APIProvider>
      {showReturnPaths && completedReturnRoutes.length > 0 && (
        <div className="absolute bottom-3 left-3 z-20 px-3 py-1.5 rounded-xl bg-slate-950/85 backdrop-blur-md border border-amber-500/40 text-xs text-amber-200 flex items-center gap-2 pointer-events-none">
          <span className="inline-block w-4 border-t-2 border-dashed border-amber-400" />
          <span>Return Path (Delivered: {completedReturnRoutes.length})</span>
        </div>
      )}
    </div>
  );
};

// Interactive Coordinate-Mapped Hyderabad Airspace Radar Fallback
const RadarCorridorFallback: React.FC<{
  drones: DroneRecord[];
  activeRoutes: Array<{
    mission: MissionWithDetails;
    pts: Array<{ lat: number; lng: number }>;
  }>;
  completedReturnRoutes: Array<{
    mission: MissionWithDetails;
    pts: Array<{ lat: number; lng: number }>;
    dest: { lat: number; lng: number };
  }>;
  selectedDroneId: number | null;
  onSelectDrone: (id: number | null) => void;
  showSwarmMesh: boolean;
  heightClass: string;
}> = ({
  drones,
  activeRoutes,
  completedReturnRoutes,
  selectedDroneId,
  onSelectDrone,
  showSwarmMesh,
  heightClass,
}) => {
  // Bounding box around North-West Hyderabad (Bachupally <-> Secunderabad, HITEC <-> Kompally)
  const minLat = 17.445;
  const maxLat = 17.552;
  const minLng = 78.365;
  const maxLng = 78.495;

  const project = (lat: number, lng: number) => {
    const x = Math.min(94, Math.max(6, ((lng - minLng) / (maxLng - minLng)) * 100));
    const y = Math.min(92, Math.max(8, (1 - (lat - minLat) / (maxLat - minLat)) * 100));
    return { x, y };
  };

  const hubPos = project(MOTHER_BASE_POS.lat, MOTHER_BASE_POS.lng);
  const landmarks = [
    { name: 'Gajularamaram', lat: 17.5264, lng: 78.4189 },
    { name: 'Kukatpally KPHB', lat: 17.4948, lng: 78.3996 },
    { name: 'Bachupally', lat: 17.5158, lng: 78.3742 },
    { name: 'Kompally', lat: 17.5416, lng: 78.4638 },
    { name: 'HITEC City', lat: 17.454, lng: 78.382 },
    { name: 'Secunderabad', lat: 17.4842, lng: 78.484 },
  ];

  const selectedDrone = drones.find((d) => d.id === selectedDroneId) || null;

  return (
    <div
      className={`relative w-full ${heightClass} rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900 text-slate-100 select-none`}
    >
      {/* Clean Aerospace Topographic Grid */}
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full opacity-90"
      >
        <defs>
          <radialGradient id="corridorGlow" cx="42%" cy="32%" r="60%">
            <stop offset="0%" stopColor="#1e3a8a" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#0f172a" stopOpacity="1" />
          </radialGradient>
        </defs>
        <rect width="100" height="100" fill="url(#corridorGlow)" />

        {/* Latitude / Longitude Grid Lines */}
        {[20, 40, 60, 80].map((v) => (
          <React.Fragment key={v}>
            <line
              x1={v}
              y1={0}
              x2={v}
              y2={100}
              stroke="rgba(148,163,184,0.12)"
              strokeWidth="0.25"
            />
            <line
              x1={0}
              y1={v}
              x2={100}
              y2={v}
              stroke="rgba(148,163,184,0.12)"
              strokeWidth="0.25"
            />
          </React.Fragment>
        ))}

        {/* Airspace Range Rings from Mother Base */}
        {[14, 28, 42].map((r) => (
          <circle
            key={r}
            cx={hubPos.x}
            cy={hubPos.y}
            r={r}
            fill="none"
            stroke="rgba(6,182,212,0.18)"
            strokeDasharray="1.2 1.2"
            strokeWidth="0.3"
          />
        ))}

        {/* Active Flight Corridor Polylines */}
        {activeRoutes.map(({ mission, pts }) => {
          if (pts.length < 2) return null;
          const d = pts
            .map((p, i) => {
              const xy = project(p.lat, p.lng);
              return `${i === 0 ? 'M' : 'L'} ${xy.x} ${xy.y}`;
            })
            .join(' ');
          const dest = project(pts[pts.length - 1].lat, pts[pts.length - 1].lng);
          return (
            <g key={mission.id}>
              <path
                d={d}
                fill="none"
                stroke={
                  mission.status === 'near_destination' ? '#10B981' : '#3B82F6'
                }
                strokeWidth="0.7"
                strokeDasharray="1.5 1"
              />
              <circle
                cx={dest.x}
                cy={dest.y}
                r="1.4"
                fill="#10B981"
                stroke="#ffffff"
                strokeWidth="0.35"
              />
            </g>
          );
        })}

        {/* Completed Delivery Return Paths (Operator-Only) */}
        {completedReturnRoutes.map(({ mission, pts }) => {
          if (pts.length < 2) return null;
          const d = pts
            .map((p, i) => {
              const xy = project(p.lat, p.lng);
              return `${i === 0 ? 'M' : 'L'} ${xy.x} ${xy.y}`;
            })
            .join(' ');
          const dest = project(pts[0].lat, pts[0].lng);
          return (
            <g key={`return-${mission.id}`}>
              <path
                d={d}
                fill="none"
                stroke="#F59E0B"
                strokeWidth="0.7"
                strokeDasharray="1.8 1.2"
              />
              <circle
                cx={dest.x}
                cy={dest.y}
                r="1.3"
                fill="#F59E0B"
                stroke="#ffffff"
                strokeWidth="0.35"
              />
            </g>
          );
        })}

        {/* Swarm Mesh Links */}
        {showSwarmMesh &&
          drones.slice(0, 4).map((d, idx) => {
            const next = drones[(idx + 1) % Math.min(4, drones.length)];
            const p1 = project(d.currentLat, d.currentLng);
            const p2 = project(next.currentLat, next.currentLng);
            return (
              <line
                key={`mesh-${d.id}-${next.id}`}
                x1={p1.x}
                y1={p1.y}
                x2={p2.x}
                y2={p2.y}
                stroke="#06B6D4"
                strokeWidth="0.45"
                strokeOpacity="0.65"
              />
            );
          })}
      </svg>

      {/* Landmark Labels */}
      {landmarks.map((lm) => {
        const xy = project(lm.lat, lm.lng);
        return (
          <div
            key={lm.name}
            style={{ left: `${xy.x}%`, top: `${xy.y}%` }}
            className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none text-[11px] text-slate-400 font-medium tracking-tight"
          >
            {lm.name}
          </div>
        );
      })}

      {/* Mother Base Hub Pin */}
      <div
        style={{ left: `${hubPos.x}%`, top: `${hubPos.y}%` }}
        className="absolute -translate-x-1/2 -translate-y-1/2 z-10 px-2.5 py-1 rounded-lg bg-slate-950/90 border border-cyan-400/60 text-xs font-semibold text-cyan-300 shadow-lg flex items-center gap-1.5"
      >
        <ShieldCheck className="w-3.5 h-3.5" />
        <span>AEGIS Hub</span>
      </div>

      {/* Live Drone Pins */}
      {drones.map((drone) => {
        const xy = project(drone.currentLat, drone.currentLng);
        const isSelected = selectedDroneId === drone.id;
        const badgeColor =
          drone.status === 'available'
            ? 'bg-emerald-600/95 border-emerald-300'
            : drone.status === 'busy'
              ? 'bg-blue-600/95 border-cyan-300'
              : 'bg-rose-600/95 border-rose-300';

        return (
          <button
            key={drone.id}
            type="button"
            onClick={() => onSelectDrone(isSelected ? null : drone.id)}
            style={{ left: `${xy.x}%`, top: `${xy.y}%` }}
            className={`absolute -translate-x-1/2 -translate-y-1/2 z-20 px-2.5 py-1.5 rounded-xl border text-xs font-mono font-semibold text-white shadow-lg flex items-center gap-1.5 transition-all duration-700 cursor-pointer ${badgeColor} ${
              isSelected ? 'scale-110 ring-4 ring-cyan-400/40' : 'hover:scale-105'
            }`}
          >
            <Navigation className="w-3.5 h-3.5" />
            <span>{drone.code}</span>
          </button>
        );
      })}

      {/* Bottom Left Airspace Legend */}
      <div className="absolute bottom-3 left-3 z-20 px-3 py-2 rounded-xl bg-slate-950/85 backdrop-blur-md border border-slate-700/80 text-xs text-slate-300 flex flex-wrap items-center gap-3">
        <span className="font-semibold text-white">Hyderabad Corridor</span>
        <span aria-hidden="true">·</span>
        <span className="font-mono text-cyan-300">
          {drones.filter((d) => d.status === 'busy').length} Airborne
        </span>
        {completedReturnRoutes.length > 0 && (
          <>
            <span aria-hidden="true">·</span>
            <span className="font-mono text-amber-300 flex items-center gap-1.5">
              <span className="inline-block w-3.5 border-t-2 border-dashed border-amber-400" />
              Return Path ({completedReturnRoutes.length})
            </span>
          </>
        )}
      </div>

      {/* Selected Drone Telemetry Overlay */}
      {selectedDrone && (
        <div className="absolute top-3 right-3 z-30 w-64 p-3.5 rounded-xl bg-slate-950/90 backdrop-blur-md border border-slate-700 shadow-xl text-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono font-bold text-sm text-white">
              {selectedDrone.code}
            </span>
            <span className="text-cyan-300 capitalize">{selectedDrone.status}</span>
          </div>
          <p className="text-slate-400 mb-2">{selectedDrone.model}</p>
          <div className="grid grid-cols-2 gap-2 font-mono text-slate-200">
            <div className="flex items-center gap-1">
              <Navigation className="w-3.5 h-3.5 text-blue-400" />
              <span>{selectedDrone.speedKmh} km/h</span>
            </div>
            <div className="flex items-center gap-1">
              <BatteryCharging className="w-3.5 h-3.5 text-emerald-400" />
              <span>{selectedDrone.batteryPct}%</span>
            </div>
            <div className="flex items-center gap-1">
              <Radio className="w-3.5 h-3.5 text-cyan-400" />
              <span>{selectedDrone.meshStatus}</span>
            </div>
            <div>Alt: {selectedDrone.altitudeM} m</div>
          </div>
        </div>
      )}
    </div>
  );
};
