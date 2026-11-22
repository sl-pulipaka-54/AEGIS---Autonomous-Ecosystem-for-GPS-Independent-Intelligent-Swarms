import { desc, eq } from 'drizzle-orm';
import { db } from './index.ts';
import {
  batteryReports,
  customerProfiles,
  deliveryStatuses,
  drones,
  missionLogs,
  missions,
  notifications,
  parcels,
  users,
  weatherReports,
} from './schema.ts';
import {
  buildMissionWaypoints,
  calculateMissionAssessment,
  haversineKm,
  MOTHER_BASE,
} from '../lib/logistics.ts';

export const DELIVERY_STAGES = [
  'Parcel Received',
  'Drone Assigned',
  'Mission Prepared',
  'Loaded on Drone',
  'In Transit',
  'Near Destination',
  'Delivered',
] as const;

export async function getOrCreateUserRecord(params: {
  uid: string;
  email: string;
  name?: string;
  phone?: string;
  role?: 'customer' | 'operator';
}) {
  try {
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.uid, params.uid));

    const [userRow] = await db
      .insert(users)
      .values({
        uid: params.uid,
        email: params.email,
        name: params.name || params.email.split('@')[0] || 'AEGIS User',
        phone: params.phone || '',
        role: params.role || existing[0]?.role || 'customer',
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email: params.email,
          ...(params.name ? { name: params.name } : {}),
          ...(params.phone ? { phone: params.phone } : {}),
          ...(params.role ? { role: params.role } : {}),
        },
      })
      .returning();

    await db
      .insert(customerProfiles)
      .values({
        userId: userRow.id,
      })
      .onConflictDoNothing({ target: customerProfiles.userId });

    const [profile] = await db
      .select()
      .from(customerProfiles)
      .where(eq(customerProfiles.userId, userRow.id));

    return { user: userRow, profile };
  } catch (error) {
    console.error('Database error in getOrCreateUserRecord:', error);
    throw new Error('Unable to synchronize user profile.', { cause: error });
  }
}

export async function seedInitialFleetAndMissions() {
  try {
    const existingDrones = await db.select().from(drones);
    if (existingDrones.length > 0) {
      await ensureCustomerShowcaseParcels(existingDrones);
      return;
    }

    // Seed Mother Base Weather Report
    await db.insert(weatherReports).values({
      hubName: MOTHER_BASE.name,
      condition: 'Clear Corridor · Light Breeze',
      windSpeedKmh: 11.4,
      windGustKmh: 16.2,
      visibilityKm: 10.0,
      precipitationMm: 0.0,
      temperatureC: 27.5,
      flightReadiness: 'Optimal',
    });

    // Seed 5 Drones in Hyderabad Airspace
    const seededDrones = await db
      .insert(drones)
      .values([
        {
          code: 'PHANTOM-01',
          model: 'AEGIS MK-IV Quadrotor',
          status: 'busy',
          batteryPct: 86,
          healthPct: 98,
          maxPayloadKg: 5.0,
          currentLat: 17.5082,
          currentLng: 78.4071,
          altitudeM: 95,
          speedKmh: 58,
          formationGroup: 'ALPHA-CORRIDOR',
          meshStatus: 'connected',
        },
        {
          code: 'PHANTOM-02',
          model: 'AEGIS MK-IV Quadrotor',
          status: 'busy',
          batteryPct: 79,
          healthPct: 96,
          maxPayloadKg: 5.0,
          currentLat: 17.5295,
          currentLng: 78.4384,
          altitudeM: 105,
          speedKmh: 54,
          formationGroup: 'ALPHA-CORRIDOR',
          meshStatus: 'connected',
        },
        {
          code: 'PHANTOM-03',
          model: 'AEGIS MK-IV Heavy',
          status: 'available',
          batteryPct: 98,
          healthPct: 99,
          maxPayloadKg: 7.5,
          currentLat: MOTHER_BASE.lat,
          currentLng: MOTHER_BASE.lng,
          altitudeM: 0,
          speedKmh: 0,
          formationGroup: 'BASE-RESERVE',
          meshStatus: 'connected',
        },
        {
          code: 'PHANTOM-04',
          model: 'AEGIS Swift-X2',
          status: 'available',
          batteryPct: 94,
          healthPct: 95,
          maxPayloadKg: 3.5,
          currentLat: MOTHER_BASE.lat + 0.0012,
          currentLng: MOTHER_BASE.lng - 0.0011,
          altitudeM: 0,
          speedKmh: 0,
          formationGroup: 'BASE-RESERVE',
          meshStatus: 'relay',
        },
        {
          code: 'PHANTOM-05',
          model: 'AEGIS Long-Range VTOL',
          status: 'maintenance',
          batteryPct: 41,
          healthPct: 74,
          maxPayloadKg: 6.0,
          currentLat: MOTHER_BASE.lat - 0.0008,
          currentLng: MOTHER_BASE.lng + 0.0009,
          altitudeM: 0,
          speedKmh: 0,
          formationGroup: 'HANGAR-BAY-2',
          meshStatus: 'standby',
        },
      ])
      .returning();

    // Seed Battery Reports for each drone
    await db.insert(batteryReports).values(
      seededDrones.map((d, idx) => ({
        droneId: d.id,
        cycleCount: 38 + idx * 14,
        voltageMv: d.status === 'maintenance' ? 22100 : 24450 - idx * 120,
        temperatureC: d.status === 'busy' ? 36.2 : 28.4,
        healthPct: d.healthPct,
        chargePct: d.batteryPct,
      }))
    );

    // Seed Demo Customer & Operator accounts
    const [demoCustomer] = await db
      .insert(users)
      .values({
        uid: 'demo-customer-lakshmi',
        email: 'lakshmi.devi@hyderabad.in',
        phone: '+91 98490 24511',
        name: 'Lakshmi Narayana',
        role: 'customer',
        languagePref: 'en',
      })
      .returning();

    await db.insert(customerProfiles).values({
      userId: demoCustomer.id,
      defaultAddress: 'Plot No 68, Flat 201, Gajularamaram, Hyderabad 500055',
      lat: 17.5264,
      lng: 78.4189,
    });

    // Seed Parcels (Active In-Transit, Near Destination, Delivered)
    const parcelSpecs = [
      {
        parcelNumber: 'AEG-1042',
        customerId: demoCustomer.id,
        recipientName: 'Lakshmi Narayana',
        recipientPhone: '+91 98490 24511',
        recipientEmail: 'lakshmi.devi@hyderabad.in',
        destinationAddress: 'KPHB Phase 3, Road No 4, Kukatpally, Hyderabad',
        destLat: 17.4948,
        destLng: 78.3996,
        weightKg: 1.4,
        priority: 'high',
        currentStage: 'In Transit',
        qrCode: 'AEGIS-VER-1042-HYD',
        deliveryProofUrl: '',
        deliveryProofNote: '',
        drone: seededDrones[0],
        missionCode: 'MSN-8801',
        missionStatus: 'in_transit',
        progressPct: 48,
      },
      {
        parcelNumber: '#203',
        customerId: demoCustomer.id,
        recipientName: 'Ananya Sharma',
        recipientPhone: '+91 91008 77341',
        recipientEmail: 'ananya.sharma@hyderabad.in',
        destinationAddress: 'Plot No 68, Flat 201, Gajularamaram, Hyderabad',
        destLat: 17.5264,
        destLng: 78.4189,
        weightKg: 0.9,
        priority: 'emergency',
        currentStage: 'Near Destination',
        qrCode: 'AEGIS-VER-203-HYD',
        deliveryProofUrl: '',
        deliveryProofNote: '',
        drone: seededDrones[1],
        missionCode: 'MSN-8802',
        missionStatus: 'near_destination',
        progressPct: 82,
      },
      {
        parcelNumber: 'AEG-1039',
        customerId: demoCustomer.id,
        recipientName: 'Lakshmi Narayana',
        recipientPhone: '+91 98490 24511',
        recipientEmail: 'lakshmi.devi@hyderabad.in',
        destinationAddress: 'Plot No 68, Flat 201, Gajularamaram, Hyderabad',
        destLat: 17.5264,
        destLng: 78.4189,
        weightKg: 1.8,
        priority: 'medium',
        currentStage: 'Delivered',
        qrCode: 'AEGIS-VER-1039-HYD',
        deliveryProofUrl: '/src/assets/images/delivery_proof_porch_1795193986831.jpg',
        deliveryProofNote:
          'Smart pod released at Apartment Lobby Pad B · Signed via QR OTP',
        drone: seededDrones[2],
        missionCode: 'MSN-8795',
        missionStatus: 'delivered',
        progressPct: 100,
      },
      {
        parcelNumber: 'AEG-1031',
        customerId: demoCustomer.id,
        recipientName: 'Ramesh Rao',
        recipientPhone: '+91 99850 11204',
        recipientEmail: 'ramesh.rao@hyderabad.in',
        destinationAddress: 'Pragathi Nagar Lake View, Bachupally, Hyderabad',
        destLat: 17.5158,
        destLng: 78.3742,
        weightKg: 2.1,
        priority: 'low',
        currentStage: 'Delivered',
        qrCode: 'AEGIS-VER-1031-HYD',
        deliveryProofUrl: '/src/assets/images/delivery_proof_porch_1795193986831.jpg',
        deliveryProofNote: 'Safe rooftop drop confirmed · Telemetry clear',
        drone: seededDrones[3],
        missionCode: 'MSN-8788',
        missionStatus: 'delivered',
        progressPct: 100,
      },
    ];

    for (const spec of parcelSpecs) {
      const [insertedParcel] = await db
        .insert(parcels)
        .values({
          parcelNumber: spec.parcelNumber,
          customerId: spec.customerId,
          recipientName: spec.recipientName,
          recipientPhone: spec.recipientPhone,
          recipientEmail: spec.recipientEmail,
          pickupAddress: MOTHER_BASE.address,
          pickupLat: MOTHER_BASE.lat,
          pickupLng: MOTHER_BASE.lng,
          destinationAddress: spec.destinationAddress,
          destLat: spec.destLat,
          destLng: spec.destLng,
          weightKg: spec.weightKg,
          priority: spec.priority,
          currentStage: spec.currentStage,
          qrCode: spec.qrCode,
          deliveryProofUrl: spec.deliveryProofUrl,
          deliveryProofNote: spec.deliveryProofNote,
        })
        .returning();

      const stageIndex = DELIVERY_STAGES.indexOf(
        spec.currentStage as (typeof DELIVERY_STAGES)[number]
      );
      for (let i = 0; i <= stageIndex; i++) {
        await db.insert(deliveryStatuses).values({
          parcelId: insertedParcel.id,
          stage: DELIVERY_STAGES[i],
          note:
            i === 0
              ? 'Parcel logged & scanned at Gajularamaram Hub'
              : `Automated checkpoint verified (${DELIVERY_STAGES[i]})`,
        });
      }

      const distKm = haversineKm(
        MOTHER_BASE.lat,
        MOTHER_BASE.lng,
        spec.destLat,
        spec.destLng
      );
      const assessment = calculateMissionAssessment({
        distanceKm: distKm,
        weightKg: spec.weightKg,
        windSpeedKmh: 11.4,
        visibilityKm: 10,
        precipitationMm: 0,
        droneBatteryPct: spec.drone.batteryPct,
        droneHealthPct: spec.drone.healthPct,
      });

      const waypoints = buildMissionWaypoints(
        MOTHER_BASE.lat,
        MOTHER_BASE.lng,
        spec.destLat,
        spec.destLng
      );

      const etaDate = new Date(Date.now() + assessment.etaMinutes * 60000);

      const [insertedMission] = await db
        .insert(missions)
        .values({
          missionCode: spec.missionCode,
          parcelId: insertedParcel.id,
          droneId: spec.drone.id,
          status: spec.missionStatus,
          distanceKm: distKm,
          estimatedBatteryPct: assessment.estimatedBatteryPct,
          riskScore: assessment.riskScore,
          successProbability: assessment.successProbability,
          waypointsJson: JSON.stringify(waypoints),
          progressPct: spec.progressPct,
          departureTime: new Date(Date.now() - 8 * 60000),
          eta: etaDate,
          completedAt: spec.missionStatus === 'delivered' ? new Date() : null,
        })
        .returning();

      await db.insert(missionLogs).values({
        missionId: insertedMission.id,
        droneCode: spec.drone.code,
        eventType: 'MISSION_INITIALIZED',
        message: `Assigned ${spec.drone.code} · Corridor ${distKm} km · Success ${assessment.successProbability}%`,
        actor: 'ORACLE_SYSTEM',
      });
    }

    // Seed Notifications across Push, SMS, Email
    await db.insert(notifications).values([
      {
        userId: demoCustomer.id,
        parcelNumber: 'AEG-1042',
        eventType: 'Drone Dispatched',
        channel: 'push',
        title: 'PHANTOM-01 airborne with AEG-1042',
        message: 'Your parcel departed Gajularamaram Hub toward KPHB Phase 3. ETA 6 mins.',
        recipientTarget: 'Browser Push Token',
        isRead: false,
      },
      {
        userId: demoCustomer.id,
        parcelNumber: '#203',
        eventType: 'Drone Nearing Destination',
        channel: 'sms',
        title: 'Drone approaching Gajularamaram drop zone',
        message: 'SMS sent to +91 91008 77341: PHANTOM-02 is 450m from Plot No 68.',
        recipientTarget: '+91 91008 77341',
        isRead: false,
      },
      {
        userId: demoCustomer.id,
        parcelNumber: 'AEG-1039',
        eventType: 'Parcel Delivered',
        channel: 'email',
        title: 'Delivery Proof Ready for AEG-1039',
        message: 'Email dispatched to lakshmi.devi@hyderabad.in with QR signature receipt.',
        recipientTarget: 'lakshmi.devi@hyderabad.in',
        isRead: true,
      },
    ]);
    await ensureCustomerShowcaseParcels(seededDrones);
  } catch (error) {
    console.error('Failed to seed fleet & missions:', error);
    throw new Error('Failed to initialize operational seed data.', { cause: error });
  }
}

export async function ensureCustomerShowcaseParcels(
  availableDrones?: Array<typeof drones.$inferSelect>
) {
  const fleet = availableDrones?.length
    ? availableDrones
    : await db.select().from(drones).orderBy(drones.id);
  if (fleet.length === 0) return;

  const showcaseSpecs = [
    {
      parcelNumber: 'AEG-1020',
      recipientName: 'Sundhangsu',
      recipientPhone: '+91 63020 83394',
      recipientEmail: 'sudhagsu.2006@gmail.com',
      destinationAddress: 'KPHB Phase 3, Road No 4, Kukatpally, Hyderabad',
      destLat: 17.4948,
      destLng: 78.3996,
      weightKg: 1.3,
      priority: 'high',
      currentStage: 'In Transit',
      qrCode: 'AEGIS-VER-1020-HYD',
      deliveryProofUrl: '',
      deliveryProofNote: '',
      drone: fleet[0],
      missionCode: 'MSN-8820',
      missionStatus: 'in_transit',
      progressPct: 52,
    },
    {
      parcelNumber: 'AEG-1045',
      recipientName: 'Sai Likhit',
      recipientPhone: '+91 93470 46606',
      recipientEmail: 'sl.pulipaka@gmail.com',
      destinationAddress: 'Plot No 68, Flat 201, Gajularamaram, Hyderabad',
      destLat: 17.5264,
      destLng: 78.4189,
      weightKg: 1.1,
      priority: 'emergency',
      currentStage: 'Near Destination',
      qrCode: 'AEGIS-VER-1045-HYD',
      deliveryProofUrl: '',
      deliveryProofNote: '',
      drone: fleet[1] || fleet[0],
      missionCode: 'MSN-8845',
      missionStatus: 'near_destination',
      progressPct: 82,
    },
    {
      parcelNumber: 'AEG-1023',
      recipientName: 'Abhinav',
      recipientPhone: '+91 95055 22701',
      recipientEmail: 'abhinav.aegis@gmail.com',
      destinationAddress: 'Pragathi Nagar Lake View, Bachupally, Hyderabad',
      destLat: 17.5158,
      destLng: 78.3742,
      weightKg: 1.6,
      priority: 'medium',
      currentStage: 'Delivered',
      qrCode: 'AEGIS-VER-1023-HYD',
      deliveryProofUrl: '/src/assets/images/delivery_proof_porch_1795193986831.jpg',
      deliveryProofNote: 'Smart pod released safely at doorstep pad · Signed via OTP',
      drone: fleet[2] || fleet[0],
      missionCode: 'MSN-8823',
      missionStatus: 'delivered',
      progressPct: 100,
    },
  ];

  for (const spec of showcaseSpecs) {
    const existing = await db
      .select()
      .from(parcels)
      .where(eq(parcels.parcelNumber, spec.parcelNumber));
    if (existing.length > 0) {
      // Keep registered recipient name, phone, and Gmail address synced
      if (
        existing[0].recipientName !== spec.recipientName ||
        existing[0].recipientPhone !== spec.recipientPhone ||
        existing[0].recipientEmail !== spec.recipientEmail
      ) {
        await db
          .update(parcels)
          .set({
            recipientName: spec.recipientName,
            recipientPhone: spec.recipientPhone,
            recipientEmail: spec.recipientEmail,
          })
          .where(eq(parcels.id, existing[0].id));
      }
      continue;
    }

    const [insertedParcel] = await db
      .insert(parcels)
      .values({
        parcelNumber: spec.parcelNumber,
        recipientName: spec.recipientName,
        recipientPhone: spec.recipientPhone,
        recipientEmail: spec.recipientEmail,
        pickupAddress: MOTHER_BASE.address,
        pickupLat: MOTHER_BASE.lat,
        pickupLng: MOTHER_BASE.lng,
        destinationAddress: spec.destinationAddress,
        destLat: spec.destLat,
        destLng: spec.destLng,
        weightKg: spec.weightKg,
        priority: spec.priority,
        currentStage: spec.currentStage,
        qrCode: spec.qrCode,
        deliveryProofUrl: spec.deliveryProofUrl,
        deliveryProofNote: spec.deliveryProofNote,
      })
      .returning();

    const stageIndex = DELIVERY_STAGES.indexOf(
      spec.currentStage as (typeof DELIVERY_STAGES)[number]
    );
    for (let i = 0; i <= stageIndex; i++) {
      await db.insert(deliveryStatuses).values({
        parcelId: insertedParcel.id,
        stage: DELIVERY_STAGES[i],
        note:
          i === 0
            ? 'Parcel logged & scanned at Gajularamaram Hub'
            : `Automated checkpoint verified (${DELIVERY_STAGES[i]})`,
      });
    }

    const distKm = haversineKm(
      MOTHER_BASE.lat,
      MOTHER_BASE.lng,
      spec.destLat,
      spec.destLng
    );
    const assessment = calculateMissionAssessment({
      distanceKm: distKm,
      weightKg: spec.weightKg,
      windSpeedKmh: 11.4,
      visibilityKm: 10,
      precipitationMm: 0,
      droneBatteryPct: spec.drone.batteryPct,
      droneHealthPct: spec.drone.healthPct,
    });
    const waypoints = buildMissionWaypoints(
      MOTHER_BASE.lat,
      MOTHER_BASE.lng,
      spec.destLat,
      spec.destLng
    );
    const etaDate = new Date(Date.now() + assessment.etaMinutes * 60000);

    const [insertedMission] = await db
      .insert(missions)
      .values({
        missionCode: spec.missionCode,
        parcelId: insertedParcel.id,
        droneId: spec.drone.id,
        status: spec.missionStatus,
        distanceKm: distKm,
        estimatedBatteryPct: assessment.estimatedBatteryPct,
        riskScore: assessment.riskScore,
        successProbability: assessment.successProbability,
        waypointsJson: JSON.stringify(waypoints),
        progressPct: spec.progressPct,
        departureTime: new Date(Date.now() - 8 * 60000),
        eta: etaDate,
        completedAt: spec.missionStatus === 'delivered' ? new Date() : null,
      })
      .returning();

    await db.insert(missionLogs).values({
      missionId: insertedMission.id,
      droneCode: spec.drone.code,
      eventType: 'MISSION_INITIALIZED',
      message: `Assigned ${spec.drone.code} · Corridor ${distKm} km · Success ${assessment.successProbability}%`,
      actor: 'ORACLE_SYSTEM',
    });

    await db.insert(notifications).values({
      parcelNumber: spec.parcelNumber,
      eventType:
        spec.missionStatus === 'delivered' ? 'Parcel Delivered' : 'Drone Dispatched',
      channel: 'sms',
      title: `${spec.parcelNumber} Update for ${spec.recipientName}`,
      message:
        spec.missionStatus === 'delivered'
          ? `Delivered safely at ${spec.destinationAddress}.`
          : `${spec.drone.code} en route to ${spec.destinationAddress}.`,
      recipientTarget: spec.recipientPhone,
      isRead: spec.missionStatus === 'delivered',
    });
  }
}

export async function getAllMissionsWithDetails() {
  try {
    const missionRows = await db
      .select()
      .from(missions)
      .orderBy(desc(missions.createdAt));
    const parcelRows = await db.select().from(parcels);
    const droneRows = await db.select().from(drones);
    const statusRows = await db
      .select()
      .from(deliveryStatuses)
      .orderBy(deliveryStatuses.recordedAt);

    const parcelById: Record<number, (typeof parcelRows)[number]> = {};
    for (const p of parcelRows) parcelById[p.id] = p;

    const droneById: Record<number, (typeof droneRows)[number]> = {};
    for (const d of droneRows) droneById[d.id] = d;

    const statusesByParcelId: Record<number, typeof statusRows> = {};
    for (const s of statusRows) {
      if (!statusesByParcelId[s.parcelId]) statusesByParcelId[s.parcelId] = [];
      statusesByParcelId[s.parcelId].push(s);
    }

    return missionRows.map((m) => ({
      ...m,
      parcel: parcelById[m.parcelId] || null,
      drone: droneById[m.droneId] || null,
      statusHistory: statusesByParcelId[m.parcelId] || [],
    }));
  } catch (error) {
    console.error('Database query failed in getAllMissionsWithDetails:', error);
    throw new Error('Failed to load mission telemetry.', { cause: error });
  }
}

export async function getSingleMissionWithDetailsByParcelId(parcelId: number) {
  try {
    const [parcel] = await db
      .select()
      .from(parcels)
      .where(eq(parcels.id, parcelId));
    if (!parcel) return null;

    const [mission] = await db
      .select()
      .from(missions)
      .where(eq(missions.parcelId, parcel.id))
      .orderBy(desc(missions.createdAt));
    if (!mission) return null;

    const [drone] = await db
      .select()
      .from(drones)
      .where(eq(drones.id, mission.droneId));

    const statusHistory = await db
      .select()
      .from(deliveryStatuses)
      .where(eq(deliveryStatuses.parcelId, parcel.id))
      .orderBy(deliveryStatuses.recordedAt);

    return {
      ...mission,
      parcel,
      drone: drone || null,
      statusHistory,
    };
  } catch (error) {
    console.error('Database query failed in getSingleMissionWithDetailsByParcelId:', error);
    throw new Error('Failed to fetch parcel mission details.', { cause: error });
  }
}

export async function getParcelTrackingBundle(parcelQuery: string) {
  try {
    const normalized = parcelQuery.trim().toLowerCase();
    const allParcels = await db.select().from(parcels);
    const found = allParcels.find(
      (p) =>
        p.parcelNumber.toLowerCase() === normalized ||
        p.parcelNumber.replace('#', '').toLowerCase() === normalized.replace('#', '')
    );
    if (!found) return null;

    const [mission] = await db
      .select()
      .from(missions)
      .where(eq(missions.parcelId, found.id))
      .orderBy(desc(missions.createdAt));

    const drone = mission
      ? (await db.select().from(drones).where(eq(drones.id, mission.droneId)))[0] || null
      : null;

    const statusHistory = await db
      .select()
      .from(deliveryStatuses)
      .where(eq(deliveryStatuses.parcelId, found.id))
      .orderBy(deliveryStatuses.recordedAt);

    return {
      parcel: found,
      mission: mission || null,
      drone,
      statusHistory,
    };
  } catch (error) {
    console.error('Database query failed in getParcelTrackingBundle:', error);
    throw new Error('Failed to fetch parcel tracking bundle.', { cause: error });
  }
}
