import { relations } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

// 1. Users (Firebase Auth UID + role-verified accounts)
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  phone: text('phone').default(''),
  name: text('name').notNull().default('AEGIS User'),
  role: text('role').notNull().default('customer'), // 'customer' | 'operator'
  languagePref: text('language_pref').notNull().default('en'), // 'en' | 'te' | 'hi'
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 2. Customer Profiles
export const customerProfiles = pgTable('customer_profiles', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  defaultAddress: text('default_address')
    .notNull()
    .default('Plot No 68, Flat 201, Gajularamaram, Hyderabad 500055'),
  lat: doublePrecision('lat').notNull().default(17.5238),
  lng: doublePrecision('lng').notNull().default(78.4148),
  pushEnabled: boolean('push_enabled').notNull().default(true),
  smsEnabled: boolean('sms_enabled').notNull().default(true),
  emailEnabled: boolean('email_enabled').notNull().default(true),
  highContrast: boolean('high_contrast').notNull().default(false),
  largeText: boolean('large_text').notNull().default(false),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 3. Drones
export const drones = pgTable('drones', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(), // e.g., PHANTOM-01
  model: text('model').notNull().default('AEGIS MK-IV Quadrotor'),
  status: text('status').notNull().default('available'), // 'available' | 'busy' | 'maintenance'
  batteryPct: integer('battery_pct').notNull().default(100),
  healthPct: integer('health_pct').notNull().default(98),
  maxPayloadKg: doublePrecision('max_payload_kg').notNull().default(5.0),
  currentLat: doublePrecision('current_lat').notNull().default(17.5212),
  currentLng: doublePrecision('current_lng').notNull().default(78.4119),
  altitudeM: doublePrecision('altitude_m').notNull().default(0),
  speedKmh: doublePrecision('speed_kmh').notNull().default(0),
  formationGroup: text('formation_group').notNull().default('ALPHA-CORRIDOR'),
  meshStatus: text('mesh_status').notNull().default('connected'), // 'connected' | 'relay' | 'standby'
  lastMissionAt: timestamp('last_mission_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 4. Parcels
export const parcels = pgTable('parcels', {
  id: serial('id').primaryKey(),
  parcelNumber: text('parcel_number').notNull().unique(),
  customerId: integer('customer_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  recipientName: text('recipient_name').notNull(),
  recipientPhone: text('recipient_phone').notNull(),
  recipientEmail: text('recipient_email').notNull().default(''),
  pickupAddress: text('pickup_address')
    .notNull()
    .default('AEGIS Mother Base Hub, Gajularamaram, Hyderabad'),
  pickupLat: doublePrecision('pickup_lat').notNull().default(17.5212),
  pickupLng: doublePrecision('pickup_lng').notNull().default(78.4119),
  destinationAddress: text('destination_address').notNull(),
  destLat: doublePrecision('dest_lat').notNull(),
  destLng: doublePrecision('dest_lng').notNull(),
  weightKg: doublePrecision('weight_kg').notNull().default(1.2),
  priority: text('priority').notNull().default('medium'), // 'low' | 'medium' | 'high' | 'emergency'
  currentStage: text('current_stage').notNull().default('Parcel Received'),
  qrCode: text('qr_code').notNull(),
  deliveryProofUrl: text('delivery_proof_url').default(''),
  deliveryProofNote: text('delivery_proof_note').default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 5. Missions
export const missions = pgTable('missions', {
  id: serial('id').primaryKey(),
  missionCode: text('mission_code').notNull().unique(),
  parcelId: integer('parcel_id')
    .references(() => parcels.id, { onDelete: 'cascade' })
    .notNull(),
  droneId: integer('drone_id')
    .references(() => drones.id, { onDelete: 'restrict' })
    .notNull(),
  status: text('status').notNull().default('scheduled'), // 'scheduled' | 'preparing' | 'in_transit' | 'near_destination' | 'delivered' | 'delayed' | 'aborted' | 'rtb'
  distanceKm: doublePrecision('distance_km').notNull().default(4.2),
  estimatedBatteryPct: integer('estimated_battery_pct').notNull().default(18),
  riskScore: text('risk_score').notNull().default('Low'), // 'Low' | 'Moderate' | 'Elevated'
  successProbability: integer('success_probability').notNull().default(94),
  waypointsJson: text('waypoints_json').notNull().default('[]'),
  progressPct: doublePrecision('progress_pct').notNull().default(0),
  departureTime: timestamp('departure_time').defaultNow(),
  eta: timestamp('eta'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 6. Delivery Status History (7-stage progression)
export const deliveryStatuses = pgTable('delivery_statuses', {
  id: serial('id').primaryKey(),
  parcelId: integer('parcel_id')
    .references(() => parcels.id, { onDelete: 'cascade' })
    .notNull(),
  stage: text('stage').notNull(),
  note: text('note').notNull().default(''),
  recordedAt: timestamp('recorded_at').defaultNow().notNull(),
});

// 7. Mission Logs
export const missionLogs = pgTable('mission_logs', {
  id: serial('id').primaryKey(),
  missionId: integer('mission_id')
    .references(() => missions.id, { onDelete: 'cascade' })
    .notNull(),
  droneCode: text('drone_code').notNull(),
  eventType: text('event_type').notNull(),
  message: text('message').notNull(),
  actor: text('actor').notNull().default('ORACLE_SYSTEM'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 8. Notifications (Push, SMS, Email)
export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  parcelNumber: text('parcel_number').notNull(),
  eventType: text('event_type').notNull(), // 'Parcel Confirmed' | 'Drone Dispatched' | 'Drone Nearing Destination' | 'Parcel Delivered' | 'Mission Alert'
  channel: text('channel').notNull().default('push'), // 'push' | 'sms' | 'email'
  title: text('title').notNull(),
  message: text('message').notNull(),
  recipientTarget: text('recipient_target').notNull().default(''),
  isRead: boolean('is_read').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 9. Battery Reports
export const batteryReports = pgTable('battery_reports', {
  id: serial('id').primaryKey(),
  droneId: integer('drone_id')
    .references(() => drones.id, { onDelete: 'cascade' })
    .notNull(),
  cycleCount: integer('cycle_count').notNull().default(42),
  voltageMv: integer('voltage_mv').notNull().default(24200),
  temperatureC: doublePrecision('temperature_c').notNull().default(32.5),
  healthPct: integer('health_pct').notNull().default(98),
  chargePct: integer('charge_pct').notNull().default(95),
  recordedAt: timestamp('recorded_at').defaultNow().notNull(),
});

// 10. Weather Reports
export const weatherReports = pgTable('weather_reports', {
  id: serial('id').primaryKey(),
  hubName: text('hub_name').notNull().default('Gajularamaram Mother Base'),
  condition: text('condition').notNull().default('Clear Sky'),
  windSpeedKmh: doublePrecision('wind_speed_kmh').notNull().default(11.4),
  windGustKmh: doublePrecision('wind_gust_kmh').notNull().default(16.2),
  visibilityKm: doublePrecision('visibility_km').notNull().default(10.0),
  precipitationMm: doublePrecision('precipitation_mm').notNull().default(0.0),
  temperatureC: doublePrecision('temperature_c').notNull().default(27.5),
  flightReadiness: text('flight_readiness').notNull().default('Optimal'), // 'Optimal' | 'Caution' | 'Grounded'
  recordedAt: timestamp('recorded_at').defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(users, ({ one, many }) => ({
  profile: one(customerProfiles, {
    fields: [users.id],
    references: [customerProfiles.userId],
  }),
  parcels: many(parcels),
  notifications: many(notifications),
}));

export const dronesRelations = relations(drones, ({ many }) => ({
  missions: many(missions),
  batteryReports: many(batteryReports),
}));

export const parcelsRelations = relations(parcels, ({ one, many }) => ({
  customer: one(users, {
    fields: [parcels.customerId],
    references: [users.id],
  }),
  missions: many(missions),
  statusHistory: many(deliveryStatuses),
}));

export const missionsRelations = relations(missions, ({ one, many }) => ({
  parcel: one(parcels, {
    fields: [missions.parcelId],
    references: [parcels.id],
  }),
  drone: one(drones, {
    fields: [missions.droneId],
    references: [drones.id],
  }),
  logs: many(missionLogs),
}));
