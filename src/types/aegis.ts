export type UserRole = 'customer' | 'operator';
export type LanguageCode = 'en' | 'te' | 'hi';

export type CustomerTab =
  | 'home'
  | 'track'
  | 'deliveries'
  | 'live-map'
  | 'history'
  | 'details'
  | 'support'
  | 'profile';

export type OperatorTab =
  | 'overview'
  | 'create-delivery'
  | 'missions'
  | 'fleet'
  | 'oracle'
  | 'swarm'
  | 'analytics';

export interface UserRecord {
  id: number;
  uid: string;
  email: string;
  phone: string | null;
  name: string;
  role: UserRole;
  languagePref: LanguageCode;
}

export interface CustomerProfile {
  id: number;
  userId: number;
  defaultAddress: string;
  lat: number;
  lng: number;
  pushEnabled: boolean;
  smsEnabled: boolean;
  emailEnabled: boolean;
  highContrast: boolean;
  largeText: boolean;
}

export interface DroneRecord {
  id: number;
  code: string;
  model: string;
  status: 'available' | 'busy' | 'maintenance';
  batteryPct: number;
  healthPct: number;
  maxPayloadKg: number;
  currentLat: number;
  currentLng: number;
  altitudeM: number;
  speedKmh: number;
  formationGroup: string;
  meshStatus: string;
  lastMissionAt: string | null;
}

export interface ParcelRecord {
  id: number;
  parcelNumber: string;
  customerId: number | null;
  recipientName: string;
  recipientPhone: string;
  pickupAddress: string;
  pickupLat: number;
  pickupLng: number;
  destinationAddress: string;
  destLat: number;
  destLng: number;
  weightKg: number;
  priority: 'low' | 'medium' | 'high' | 'emergency';
  currentStage: string;
  qrCode: string;
  deliveryProofUrl: string | null;
  deliveryProofNote: string | null;
  createdAt: string;
}

export interface DeliveryStatusItem {
  id: number;
  parcelId: number;
  stage: string;
  note: string;
  recordedAt: string;
}

export interface MissionWithDetails {
  id: number;
  missionCode: string;
  parcelId: number;
  droneId: number;
  status:
    | 'scheduled'
    | 'preparing'
    | 'in_transit'
    | 'near_destination'
    | 'delivered'
    | 'delayed'
    | 'aborted'
    | 'rtb';
  distanceKm: number;
  estimatedBatteryPct: number;
  riskScore: string;
  successProbability: number;
  waypointsJson: string;
  progressPct: number;
  departureTime: string | null;
  eta: string | null;
  completedAt: string | null;
  createdAt: string;
  parcel: ParcelRecord | null;
  drone: DroneRecord | null;
  statusHistory: DeliveryStatusItem[];
}

export interface NotificationRecord {
  id: number;
  parcelNumber: string;
  eventType: string;
  channel: 'push' | 'sms' | 'email';
  title: string;
  message: string;
  recipientTarget: string;
  isRead: boolean;
  createdAt: string;
}

export interface BatteryReport {
  id: number;
  droneId: number;
  cycleCount: number;
  voltageMv: number;
  temperatureC: number;
  healthPct: number;
  chargePct: number;
  recordedAt: string;
}

export interface WeatherReport {
  id: number;
  hubName: string;
  condition: string;
  windSpeedKmh: number;
  windGustKmh: number;
  visibilityKm: number;
  precipitationMm: number;
  temperatureC: number;
  flightReadiness: 'Optimal' | 'Caution' | 'Grounded';
  recordedAt: string;
}

export interface MissionLogRecord {
  id: number;
  missionId: number;
  droneCode: string;
  eventType: string;
  message: string;
  actor: string;
  createdAt: string;
}

export interface AIPlanResponse {
  extracted: {
    parcelNumber: string;
    recipientName: string;
    address: string;
    coordinates: { lat: number; lng: number };
    deadline: string;
    priority: 'low' | 'medium' | 'high' | 'emergency';
    estimatedWeightKg: number;
  };
  report: {
    missionReport: string;
    routeNotes: string;
    weatherAdvisory: string;
    distanceKm: number;
    etaMinutes: number;
    estimatedBatteryPct: number;
    riskScore: string;
    successProbability: number;
  };
  suggestedDrone: DroneRecord | null;
}

export type ChatMode = 'care' | 'fast' | 'maps' | 'search' | 'strategist';

export interface MapsGroundingSource {
  kind: 'maps';
  title: string;
  uri: string;
  reviewSnippets?: string[];
}

export interface WebGroundingSource {
  kind: 'web';
  title: string;
  uri: string;
}

export type GroundingSource = MapsGroundingSource | WebGroundingSource;

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  mode?: ChatMode;
  modelUsed?: string;
  sources?: GroundingSource[];
  createdAt: string;
}

export interface GroundingLookupResponse {
  text: string;
  modelUsed: string;
  sources: GroundingSource[];
}

