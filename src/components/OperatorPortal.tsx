import React, { useMemo, useState } from 'react';
import {
  LayoutDashboard,
  PlusCircle,
  ClipboardList,
  Cpu,
  Radar,
  Network,
  BarChart3,
  AlertOctagon,
  Play,
  Clock,
  XCircle,
  RefreshCw,
  BatteryCharging,
  CloudSun,
  CheckCircle2,
  Sparkles,
  ShieldAlert,
  Lock,
  Gauge,
  Compass,
  Globe,
  Plus,
  Trash2,
} from 'lucide-react';
import { useAegis } from '../context/AegisContext';
import { AegisMap } from './AegisMap';
import { GeminiChatPanel } from './GeminiChatPanel';
import { FormattedAiText, GroundingSourcesList } from './GroundingSourcesList';
import type {
  AIPlanResponse,
  ChatMessage,
  GroundingLookupResponse,
  OperatorTab,
} from '../types/aegis';

export const OperatorPortal: React.FC = () => {
  const {
    user,
    token,
    language,
    mapsApiKey,
    missions,
    drones,
    batteryReports,
    weather,
    openAuthModal,
    refreshAllData,
  } = useAegis();

  const [tab, setTab] = useState<OperatorTab>('overview');
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);

  // Create Delivery Form state
  const [parcelNumber, setParcelNumber] = useState('AEG-1088');
  const [recipientName, setRecipientName] = useState('Karthik Reddy');
  const [recipientPhone, setRecipientPhone] = useState('+91 98480 32145');
  const [address, setAddress] = useState(
    'Plot No 68, Flat 201, Gajularamaram, Hyderabad'
  );
  const [deliveryDate, setDeliveryDate] = useState('2026-11-20');
  const [deliveryTime, setDeliveryTime] = useState('17:00');
  const [weightKg, setWeightKg] = useState('1.4');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'emergency'>(
    'high'
  );
  const [autoAssign, setAutoAssign] = useState(true);
  const [selectedDroneId, setSelectedDroneId] = useState<string>('');
  const [dispatching, setDispatching] = useState(false);
  const [dispatchMode, setDispatchMode] = useState<'single' | 'batch'>('single');
  const [dispatchReceipt, setDispatchReceipt] = useState<{
    parcelNumber: string;
    droneCode: string;
    distanceKm: number;
    estimatedBatteryPct: number;
    riskScore: string;
    successProbability: number;
    coordinates: { lat: number; lng: number };
    weatherCondition: string;
  } | null>(null);

  interface BatchMissionDraft {
    id: string;
    parcelNumber: string;
    recipientName: string;
    recipientPhone: string;
    address: string;
    deliveryDate: string;
    deliveryTime: string;
    weightKg: string;
    priority: 'low' | 'medium' | 'high' | 'emergency';
    autoAssign: boolean;
    selectedDroneId: string;
  }

  interface DispatchReceiptItem {
    missionCode: string;
    parcelNumber: string;
    droneCode: string;
    distanceKm: number;
    estimatedBatteryPct: number;
    riskScore: string;
    successProbability: number;
    coordinates: { lat: number; lng: number };
    weatherCondition: string;
  }

  const [batchRows, setBatchRows] = useState<BatchMissionDraft[]>([
    {
      id: 'row-1',
      parcelNumber: 'AEG-2041',
      recipientName: 'Srinivas Rao',
      recipientPhone: '+91 98480 41201',
      address: 'Kukatpally Housing Board Phase 3, Hyderabad',
      deliveryDate: '2026-11-21',
      deliveryTime: '16:30',
      weightKg: '1.2',
      priority: 'high',
      autoAssign: true,
      selectedDroneId: '',
    },
    {
      id: 'row-2',
      parcelNumber: 'AEG-2042',
      recipientName: 'Meera Krishnan',
      recipientPhone: '+91 98490 55102',
      address: 'Miyapur Cross Roads, Hyderabad',
      deliveryDate: '2026-11-21',
      deliveryTime: '16:45',
      weightKg: '1.8',
      priority: 'medium',
      autoAssign: true,
      selectedDroneId: '',
    },
  ]);
  const [batchReceipts, setBatchReceipts] = useState<DispatchReceiptItem[]>([]);
  const [batchErrors, setBatchErrors] = useState<
    Array<{ index: number; parcelNumber: string; error: string }>
  >([]);

  // Mission Management multi-select & batch controls
  const [selectedMissionIds, setSelectedMissionIds] = useState<number[]>([]);
  const [batchActionLoading, setBatchActionLoading] = useState(false);

  // Operator-only Add New Drone state
  const [showAddDroneForm, setShowAddDroneForm] = useState(false);
  const [newDroneCode, setNewDroneCode] = useState('');
  const [newDroneModel, setNewDroneModel] = useState('AEGIS MK-IV Quadrotor');
  const [newDronePayload, setNewDronePayload] = useState('5.0');
  const [newDroneBattery, setNewDroneBattery] = useState('100');
  const [newDroneHealth, setNewDroneHealth] = useState('98');
  const [newDroneFormation, setNewDroneFormation] = useState('BASE-RESERVE');
  const [newDroneMesh, setNewDroneMesh] = useState<'connected' | 'relay' | 'standby'>(
    'connected'
  );
  const [newDroneStatus, setNewDroneStatus] = useState<
    'available' | 'busy' | 'maintenance'
  >('available');
  const [addingDrone, setAddingDrone] = useState(false);

  // Reassign dropdown per mission
  const [reassignSelection, setReassignSelection] = useState<Record<number, number>>(
    {}
  );

  // Oracle AI Mission Planner
  const [aiPrompt, setAiPrompt] = useState(
    'Deliver Parcel #203 to Plot No 68, Flat 201, Gajularamaram before 5 PM'
  );
  const [aiLoading, setAiLoading] = useState(false);
  const [aiPlan, setAiPlan] = useState<AIPlanResponse | null>(null);

  // Create Delivery: Google Maps Grounding Drop-Zone Verification
  const [verifyMapsLoading, setVerifyMapsLoading] = useState(false);
  const [verifyMapsResult, setVerifyMapsResult] =
    useState<GroundingLookupResponse | null>(null);
  const [verifyMapsErr, setVerifyMapsErr] = useState<string | null>(null);

  // Oracle Command: Google Search Grounding (Weather, DGCA & Corridor Intel)
  const [searchQuery, setSearchQuery] = useState(
    'Current weather, wind speed, and rain forecast in Hyderabad Telangana today'
  );
  const [searchFocus, setSearchFocus] = useState<'weather' | 'dgca' | 'corridor'>(
    'weather'
  );
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResult, setSearchResult] =
    useState<GroundingLookupResponse | null>(null);
  const [searchErr, setSearchErr] = useState<string | null>(null);

  // Oracle Multi-Turn Operations Copilot state
  const [operatorChatMessages, setOperatorChatMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'Oracle Operations Copilot ready. Ask for deep fleet battery/risk analysis, Google Maps drop-zone checks, or live Google Search weather & DGCA updates.',
      mode: 'strategist',
      modelUsed: 'gemini-4-hydrogen',
      createdAt: new Date().toISOString(),
    },
  ]);

  // Derived Analytics Metrics (hooks always run unconditionally before auth guard)
  const stats = useMemo(() => {
    const totalDrones = drones.length;
    const activeMissions = missions.filter(
      (m) =>
        m.status === 'in_transit' ||
        m.status === 'near_destination' ||
        m.status === 'preparing'
    ).length;
    const delivered = missions.filter((m) => m.status === 'delivered').length;
    const failed = missions.filter(
      (m) => m.status === 'aborted' || m.status === 'rtb'
    ).length;
    const avgBattery = drones.length
      ? Math.round(drones.reduce((s, d) => s + d.batteryPct, 0) / drones.length)
      : 0;
    const avgHealth = drones.length
      ? Math.round(drones.reduce((s, d) => s + d.healthPct, 0) / drones.length)
      : 0;
    const avgSuccess = missions.length
      ? Math.round(
          missions.reduce((s, m) => s + m.successProbability, 0) / missions.length
        )
      : 92;

    return {
      totalDrones,
      activeMissions,
      deliveriesToday: delivered + activeMissions,
      failedMissions: failed,
      activeCustomers: 128 + missions.length,
      avgBattery,
      avgHealth,
      avgSuccess,
    };
  }, [drones, missions]);

  const efficiency24h = useMemo(() => {
    const cutoffMs = Date.now() - 24 * 60 * 60 * 1000;
    const recentMissions = missions.filter((m) => {
      const refTime = m.departureTime || m.createdAt;
      const ms = refTime ? new Date(refTime).getTime() : Date.now();
      return ms >= cutoffMs && m.distanceKm > 0;
    });

    if (recentMissions.length === 0) {
      return {
        missionCount: 0,
        totalDistanceKm: 0,
        totalBatteryPct: 0,
        batteryPerKm: 0,
        kmPerBatteryPct: 0,
        score: 0,
        rating: 'No 24h Flights',
        breakdown: [] as Array<{
          id: number;
          missionCode: string;
          droneCode: string;
          distanceKm: number;
          batteryUsedPct: number;
          missionScore: number;
        }>,
      };
    }

    const breakdown = recentMissions.map((m) => {
      const progressFactor =
        m.status === 'delivered'
          ? 1
          : m.progressPct > 0
            ? Math.max(0.25, m.progressPct / 100)
            : 1;
      const batteryUsedPct = Number(
        (m.estimatedBatteryPct * progressFactor).toFixed(1)
      );
      const effectiveDistanceKm = Number(
        (m.distanceKm * progressFactor).toFixed(2)
      );
      const ratio =
        effectiveDistanceKm > 0 ? batteryUsedPct / effectiveDistanceKm : 5.0;
      const missionScore = Math.max(
        35,
        Math.min(99, Math.round(115 - ratio * 5.2))
      );

      return {
        id: m.id,
        missionCode: m.missionCode,
        droneCode: m.drone?.code || `DRN-${m.droneId}`,
        distanceKm: effectiveDistanceKm,
        batteryUsedPct,
        missionScore,
      };
    });

    const totalDistanceKm = Number(
      breakdown.reduce((sum, item) => sum + item.distanceKm, 0).toFixed(2)
    );
    const totalBatteryPct = Number(
      breakdown.reduce((sum, item) => sum + item.batteryUsedPct, 0).toFixed(1)
    );
    const batteryPerKm =
      totalDistanceKm > 0
        ? Number((totalBatteryPct / totalDistanceKm).toFixed(2))
        : 0;
    const kmPerBatteryPct =
      totalBatteryPct > 0
        ? Number((totalDistanceKm / totalBatteryPct).toFixed(2))
        : 0;
    const score =
      totalDistanceKm > 0
        ? Math.max(35, Math.min(99, Math.round(115 - batteryPerKm * 5.2)))
        : 0;
    const rating =
      score >= 88
        ? 'Optimal Efficiency'
        : score >= 75
          ? 'Nominal Efficiency'
          : 'High Energy Draw';

    return {
      missionCount: breakdown.length,
      totalDistanceKm,
      totalBatteryPct,
      batteryPerKm,
      kmPerBatteryPct,
      score,
      rating,
      breakdown,
    };
  }, [missions]);

  // Guard: Only authorized company staff can access Operator views
  if (!user || user.role !== 'operator' || !token) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16">
        <div className="glass-panel rounded-3xl p-8 text-center space-y-5 shadow-lg">
          <div className="w-16 h-16 rounded-2xl bg-slate-900 dark:bg-blue-600 text-white flex items-center justify-center mx-auto">
            <Lock className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold">
            Company Operator Clearance Required
          </h1>
          <p className="text-slate-600 dark:text-slate-300">
            Access to flight dispatch, Oracle Command Center, and drone swarm
            telemetry is restricted to authorized AEGIS company staff.
          </p>
          <button
            type="button"
            onClick={() => openAuthModal('operator')}
            className="min-h-[48px] px-6 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer"
          >
            Sign In as Company Operator
          </button>
        </div>
      </div>
    );
  }

  const handleDispatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionErr(null);
    setActionMsg(null);
    setDispatching(true);
    try {
      const res = await fetch('/api/missions/dispatch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          parcelNumber,
          recipientName,
          recipientPhone,
          address,
          deliveryDate,
          deliveryTime,
          weightKg: Number(weightKg) || 1.5,
          priority,
          autoAssign,
          selectedDroneId: autoAssign ? null : Number(selectedDroneId),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Dispatch failed');
      }
      setDispatchReceipt({
        parcelNumber: data.parcel.parcelNumber,
        droneCode: data.drone.code,
        distanceKm: data.assessment.distanceKm,
        estimatedBatteryPct: data.assessment.estimatedBatteryPct,
        riskScore: data.assessment.riskScore,
        successProbability: data.assessment.successProbability,
        coordinates: data.assessment.coordinates,
        weatherCondition: data.assessment.weatherCondition,
      });
      setActionMsg(
        `Mission ${data.mission.missionCode} created and assigned to ${data.drone.code}.`
      );
      await refreshAllData();
    } catch (err: unknown) {
      setActionErr(err instanceof Error ? err.message : 'Dispatch error');
    } finally {
      setDispatching(false);
    }
  };

  const handleMissionAction = async (
    missionId: number,
    action: 'start' | 'delay' | 'abort' | 'reassign' | 'rtb',
    newDroneId?: number
  ) => {
    setActionErr(null);
    setActionMsg(null);
    try {
      const res = await fetch(`/api/missions/${missionId}/action`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action, newDroneId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Action failed');
      setActionMsg(`Mission #${missionId} action "${action.toUpperCase()}" executed.`);
      await refreshAllData();
    } catch (err: unknown) {
      setActionErr(err instanceof Error ? err.message : 'Mission update failed');
    }
  };

  const handleAddBatchRow = () => {
    const nextNum = 2041 + batchRows.length + Math.floor(Math.random() * 50);
    setBatchRows((prev) => [
      ...prev,
      {
        id: `row-${Date.now()}-${prev.length}`,
        parcelNumber: `AEG-${nextNum}`,
        recipientName: '',
        recipientPhone: '+91 98480 00000',
        address: 'Gajularamaram Industrial Estate, Hyderabad',
        deliveryDate,
        deliveryTime,
        weightKg: '1.5',
        priority: 'medium',
        autoAssign: true,
        selectedDroneId: '',
      },
    ]);
  };

  const handleRemoveBatchRow = (id: string) => {
    setBatchRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));
  };

  const handleUpdateBatchRow = <K extends keyof BatchMissionDraft>(
    id: string,
    field: K,
    value: BatchMissionDraft[K]
  ) => {
    setBatchRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    );
  };

  const handleBatchDispatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionErr(null);
    setActionMsg(null);
    setBatchErrors([]);
    setDispatching(true);
    try {
      const payloadMissions = batchRows.map((row) => ({
        parcelNumber: row.parcelNumber,
        recipientName: row.recipientName,
        recipientPhone: row.recipientPhone,
        address: row.address,
        deliveryDate: row.deliveryDate,
        deliveryTime: row.deliveryTime,
        weightKg: Number(row.weightKg) || 1.5,
        priority: row.priority,
        autoAssign: row.autoAssign,
        selectedDroneId: row.autoAssign ? null : Number(row.selectedDroneId) || null,
      }));

      const res = await fetch('/api/missions/batch-dispatch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ missions: payloadMissions }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (Array.isArray(data.errors)) {
          setBatchErrors(data.errors);
        }
        throw new Error(data.error || 'Batch mission dispatch failed');
      }

      const receipts: DispatchReceiptItem[] = (data.created || []).map(
        (item: {
          mission: { missionCode: string };
          parcel: { parcelNumber: string };
          drone: { code: string };
          assessment: {
            distanceKm: number;
            estimatedBatteryPct: number;
            riskScore: string;
            successProbability: number;
            coordinates: { lat: number; lng: number };
            weatherCondition: string;
          };
        }) => ({
          missionCode: item.mission.missionCode,
          parcelNumber: item.parcel.parcelNumber,
          droneCode: item.drone.code,
          distanceKm: item.assessment.distanceKm,
          estimatedBatteryPct: item.assessment.estimatedBatteryPct,
          riskScore: item.assessment.riskScore,
          successProbability: item.assessment.successProbability,
          coordinates: item.assessment.coordinates,
          weatherCondition: item.assessment.weatherCondition,
        })
      );

      setBatchReceipts(receipts);
      if (Array.isArray(data.errors) && data.errors.length > 0) {
        setBatchErrors(data.errors);
      }

      setActionMsg(
        `Simultaneously dispatched ${data.count} mission${data.count === 1 ? '' : 's'} across the fleet.`
      );
      await refreshAllData();
    } catch (err: unknown) {
      setActionErr(err instanceof Error ? err.message : 'Batch dispatch error');
    } finally {
      setDispatching(false);
    }
  };

  const toggleMissionSelect = (id: number) => {
    setSelectedMissionIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAllMissions = () => {
    if (selectedMissionIds.length === missions.length) {
      setSelectedMissionIds([]);
    } else {
      setSelectedMissionIds(missions.map((m) => m.id));
    }
  };

  const handleBatchMissionAction = async (
    action: 'start' | 'delay' | 'abort' | 'rtb'
  ) => {
    if (selectedMissionIds.length === 0) return;
    setActionErr(null);
    setActionMsg(null);
    setBatchActionLoading(true);
    try {
      const res = await fetch('/api/missions/batch-action', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ missionIds: selectedMissionIds, action }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Batch mission action failed');
      }
      setActionMsg(
        `Batch "${action.toUpperCase()}" applied to ${data.count} mission${data.count === 1 ? '' : 's'}.`
      );
      setSelectedMissionIds([]);
      await refreshAllData();
    } catch (err: unknown) {
      setActionErr(err instanceof Error ? err.message : 'Batch update failed');
    } finally {
      setBatchActionLoading(false);
    }
  };

  const handleCreateDrone = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionErr(null);
    setActionMsg(null);
    setAddingDrone(true);
    try {
      const res = await fetch('/api/fleet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          code: newDroneCode,
          model: newDroneModel,
          maxPayloadKg: Number(newDronePayload) || 5.0,
          batteryPct: Number(newDroneBattery) || 100,
          healthPct: Number(newDroneHealth) || 98,
          formationGroup: newDroneFormation,
          meshStatus: newDroneMesh,
          status: newDroneStatus,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to add drone');
      }
      setActionMsg(`New aircraft ${data.code} registered to the AEGIS fleet.`);
      setNewDroneCode('');
      setShowAddDroneForm(false);
      await refreshAllData();
    } catch (err: unknown) {
      setActionErr(err instanceof Error ? err.message : 'Unable to register drone');
    } finally {
      setAddingDrone(false);
    }
  };

  const handleDroneStatusToggle = async (
    droneId: number,
    status: 'available' | 'busy' | 'maintenance'
  ) => {
    await fetch(`/api/fleet/${droneId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ status }),
    });
    await refreshAllData();
  };

  const handleAiPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setAiLoading(true);
    setActionErr(null);
    try {
      const res = await fetch('/api/ai/plan-mission', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ instruction: aiPrompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI Planner error');
      setAiPlan(data as AIPlanResponse);
    } catch (err: unknown) {
      setActionErr(
        err instanceof Error ? err.message : 'Unable to generate AI Mission Plan'
      );
    } finally {
      setAiLoading(false);
    }
  };

  const handleDeployAiPlan = async () => {
    if (!aiPlan) return;
    setActionErr(null);
    const uniqueNum = `${aiPlan.extracted.parcelNumber}-${Math.floor(10 + Math.random() * 89)}`;
    const res = await fetch('/api/missions/dispatch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        parcelNumber: uniqueNum,
        recipientName: aiPlan.extracted.recipientName,
        recipientPhone: '+91 98490 24511',
        address: aiPlan.extracted.address,
        weightKg: aiPlan.extracted.estimatedWeightKg,
        priority: aiPlan.extracted.priority,
        autoAssign: true,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setActionErr(data.error || 'Failed to deploy AI plan');
      return;
    }
    setActionMsg(
      `Oracle AI Mission ${data.mission.missionCode} deployed on ${data.drone.code}!`
    );
    await refreshAllData();
    setTab('missions');
  };

  const handleEmergencyRtbAll = async () => {
    const active = missions.filter(
      (m) => m.status === 'in_transit' || m.status === 'near_destination'
    );
    if (active.length === 0) {
      setActionMsg('No airborne missions active — fleet is at Mother Base.');
      return;
    }
    for (const m of active) {
      await handleMissionAction(m.id, 'rtb');
    }
    setActionMsg(
      `EMERGENCY RETURN TO BASE issued to ${active.length} active aircraft.`
    );
  };

  const handleVerifyDropZoneMaps = async () => {
    if (!address.trim()) return;
    setVerifyMapsLoading(true);
    setVerifyMapsErr(null);
    try {
      const res = await fetch('/api/ai/maps-grounding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: address.trim(),
          query: `Identify nearby landmarks, open drop zones, building density, and approach obstacles around ${address.trim()} for an autonomous parcel drone delivery.`,
        }),
      });
      const data = (await res.json()) as GroundingLookupResponse & {
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || 'Maps verification failed');
      setVerifyMapsResult(data);
    } catch (err: unknown) {
      setVerifyMapsErr(
        err instanceof Error ? err.message : 'Unable to verify drop zone'
      );
    } finally {
      setVerifyMapsLoading(false);
    }
  };

  const handleRunSearchBriefing = async (
    customQuery?: string,
    customFocus?: 'weather' | 'dgca' | 'corridor'
  ) => {
    const q = (customQuery ?? searchQuery).trim();
    const f = customFocus ?? searchFocus;
    if (!q) return;
    setSearchLoading(true);
    setSearchErr(null);
    try {
      const res = await fetch('/api/ai/search-grounding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, focus: f }),
      });
      const data = (await res.json()) as GroundingLookupResponse & {
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || 'Search grounding failed');
      setSearchResult(data);
    } catch (err: unknown) {
      setSearchErr(
        err instanceof Error ? err.message : 'Unable to fetch live web intel'
      );
    } finally {
      setSearchLoading(false);
    }
  };

  const dailySeries = [
    { day: 'Mon', count: 34 },
    { day: 'Tue', count: 41 },
    { day: 'Wed', count: 38 },
    { day: 'Thu', count: 52 },
    { day: 'Fri', count: 49 },
    { day: 'Sat', count: 61 },
    { day: 'Today', count: 56 + stats.deliveriesToday },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-20 space-y-6">
      {/* Operator Navigation + Emergency RTB Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {[
            { id: 'overview', label: 'Dashboard', icon: LayoutDashboard },
            { id: 'create-delivery', label: 'Create Delivery', icon: PlusCircle },
            { id: 'missions', label: 'Missions', icon: ClipboardList },
            { id: 'fleet', label: 'Drone Fleet', icon: Cpu },
            { id: 'oracle', label: 'Oracle Command', icon: Radar },
            { id: 'swarm', label: 'Drone Swarm', icon: Network },
            { id: 'analytics', label: 'Analytics', icon: BarChart3 },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id as OperatorTab)}
                className={`min-h-[44px] px-4 rounded-xl text-sm font-semibold flex items-center gap-2 whitespace-nowrap transition-colors cursor-pointer ${
                  tab === item.id
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-blue-400'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={handleEmergencyRtbAll}
          className="min-h-[44px] px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold flex items-center gap-2 shadow-sm cursor-pointer whitespace-nowrap"
        >
          <AlertOctagon className="w-4 h-4" />
          <span>Emergency Return To Base</span>
        </button>
      </div>

      {actionMsg && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-sm text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span>{actionMsg}</span>
        </div>
      )}

      {actionErr && (
        <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-sm text-rose-800 dark:text-rose-200 flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 shrink-0" />
          <span>{actionErr}</span>
        </div>
      )}

      {/* 1. ADMIN OVERVIEW DASHBOARD */}
      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {[
              { label: 'Total Drones', value: stats.totalDrones, tone: 'text-blue-600 dark:text-cyan-400' },
              { label: 'Active Missions', value: stats.activeMissions, tone: 'text-emerald-600 dark:text-emerald-400' },
              { label: 'Deliveries Today', value: stats.deliveriesToday, tone: 'text-slate-900 dark:text-white' },
              { label: 'Failed Missions', value: stats.failedMissions, tone: 'text-rose-600 dark:text-rose-400' },
              { label: 'Active Customers', value: stats.activeCustomers, tone: 'text-slate-900 dark:text-white' },
            ].map((kpi) => (
              <div key={kpi.label} className="glass-surface rounded-2xl p-5">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {kpi.label}
                </p>
                <p className={`text-3xl font-bold font-mono tabular-nums mt-2 ${kpi.tone}`}>
                  {kpi.value}
                </p>
              </div>
            ))}
          </div>

          {/* 3 Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Daily Deliveries Chart */}
            <div className="glass-surface rounded-3xl p-6">
              <h3 className="font-bold text-lg mb-4">Daily Deliveries</h3>
              <div className="flex items-end justify-between gap-2 h-44 pt-4">
                {dailySeries.map((d) => {
                  const pct = Math.round((d.count / 70) * 100);
                  return (
                    <div key={d.day} className="flex-1 flex flex-col items-center gap-2">
                      <span className="text-xs font-mono tabular-nums text-slate-500">
                        {d.count}
                      </span>
                      <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-t-lg h-28 flex items-end overflow-hidden">
                        <div
                          className="w-full bg-gradient-to-t from-blue-600 to-cyan-400 rounded-t-lg transition-all"
                          style={{ height: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                        {d.day}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Drone Usage */}
            <div className="glass-surface rounded-3xl p-6">
              <h3 className="font-bold text-lg mb-4">Drone Usage & Health</h3>
              <div className="space-y-3.5">
                {drones.map((drone) => (
                  <div key={drone.id} className="space-y-1">
                    <div className="flex justify-between text-xs font-mono">
                      <span className="font-semibold">{drone.code}</span>
                      <span>Health {drone.healthPct}%</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-blue-600 rounded-full"
                        style={{ width: `${drone.healthPct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Battery Analytics */}
            <div className="glass-surface rounded-3xl p-6">
              <h3 className="font-bold text-lg mb-4">Battery Analytics</h3>
              <div className="space-y-3.5">
                {drones.map((drone) => {
                  const barColor =
                    drone.batteryPct >= 70
                      ? 'bg-emerald-500'
                      : drone.batteryPct >= 45
                        ? 'bg-amber-500'
                        : 'bg-rose-500';
                  return (
                    <div key={drone.id} className="space-y-1">
                      <div className="flex justify-between text-xs font-mono">
                        <span className="font-semibold">{drone.code}</span>
                        <span>{drone.batteryPct}%</span>
                      </div>
                      <div className="h-2.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${barColor}`}
                          style={{ width: `${drone.batteryPct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <AegisMap
            apiKey={mapsApiKey}
            drones={drones}
            missions={missions}
            showReturnPaths={true}
            heightClass="h-[380px]"
          />
        </div>
      )}

      {/* 2. CREATE DELIVERY PAGE (Single or Simultaneous Multi-Mission Dispatch) */}
      {tab === 'create-delivery' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 glass-surface rounded-3xl p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold">Create Automated Drone Delivery</h2>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {dispatchMode === 'single'
                    ? 'Automatically geocodes address, calculates battery, verifies weather, and assigns optimal drone.'
                    : 'Queue and launch multiple independent drone missions simultaneously in one dispatch.'}
                </p>
              </div>
              <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setDispatchMode('single')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                    dispatchMode === 'single'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  Single Mission
                </button>
                <button
                  type="button"
                  onClick={() => setDispatchMode('batch')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                    dispatchMode === 'batch'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  Multiple Missions ({batchRows.length})
                </button>
              </div>
            </div>

            {dispatchMode === 'single' ? (
              <form onSubmit={handleDispatchSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Parcel Number</label>
                    <input
                      type="text"
                      required
                      value={parcelNumber}
                      onChange={(e) => setParcelNumber(e.target.value)}
                      className="w-full min-h-[46px] px-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Recipient Name</label>
                    <input
                      type="text"
                      required
                      value={recipientName}
                      onChange={(e) => setRecipientName(e.target.value)}
                      className="w-full min-h-[46px] px-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Recipient Mobile</label>
                    <input
                      type="tel"
                      required
                      value={recipientPhone}
                      onChange={(e) => setRecipientPhone(e.target.value)}
                      className="w-full min-h-[46px] px-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Package Weight (kg)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0.2"
                      max="7.0"
                      required
                      value={weightKg}
                      onChange={(e) => setWeightKg(e.target.value)}
                      className="w-full min-h-[46px] px-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Delivery Address (Hyderabad Corridor)
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      required
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="flex-1 min-h-[46px] px-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                    />
                    <button
                      type="button"
                      onClick={() => void handleVerifyDropZoneMaps()}
                      disabled={verifyMapsLoading}
                      className="min-h-[46px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                    >
                      <Compass className="w-4 h-4" />
                      <span>
                        {verifyMapsLoading
                          ? 'Checking Maps...'
                          : 'Verify Drop Zone (Maps)'}
                      </span>
                    </button>
                  </div>
                  {verifyMapsErr && (
                    <p className="text-xs text-rose-600 dark:text-rose-400 mt-1.5">
                      {verifyMapsErr}
                    </p>
                  )}
                  {verifyMapsResult && (
                    <div className="mt-3 p-3.5 rounded-2xl bg-slate-100/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 text-xs">
                      <FormattedAiText text={verifyMapsResult.text} />
                      <GroundingSourcesList sources={verifyMapsResult.sources} />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Delivery Date</label>
                    <input
                      type="date"
                      value={deliveryDate}
                      onChange={(e) => setDeliveryDate(e.target.value)}
                      className="w-full min-h-[46px] px-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Delivery Time</label>
                    <input
                      type="time"
                      value={deliveryTime}
                      onChange={(e) => setDeliveryTime(e.target.value)}
                      className="w-full min-h-[46px] px-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Priority</label>
                    <select
                      value={priority}
                      onChange={(e) =>
                        setPriority(
                          e.target.value as 'low' | 'medium' | 'high' | 'emergency'
                        )
                      }
                      className="w-full min-h-[46px] px-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="emergency">Emergency</option>
                    </select>
                  </div>
                </div>

                <div className="pt-2 space-y-3">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoAssign}
                      onChange={(e) => setAutoAssign(e.target.checked)}
                      className="w-5 h-5 accent-blue-600"
                    />
                    <span className="font-semibold text-sm">
                      Auto Assign Best Available Drone
                    </span>
                  </label>

                  {!autoAssign && (
                    <select
                      value={selectedDroneId}
                      onChange={(e) => setSelectedDroneId(e.target.value)}
                      className="w-full min-h-[46px] px-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                    >
                      <option value="">Select drone manually...</option>
                      {drones
                        .filter((d) => d.status !== 'maintenance')
                        .map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.code} · {d.batteryPct}% Battery · Max {d.maxPayloadKg} kg ({d.status})
                          </option>
                        ))}
                    </select>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={dispatching}
                  className="w-full min-h-[50px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer"
                >
                  {dispatching
                    ? 'Running Automated Dispatch Pipeline...'
                    : 'Generate Mission Package & Assign Drone'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleBatchDispatchSubmit} className="space-y-4">
                <div className="space-y-3 max-h-[540px] overflow-y-auto pr-1">
                  {batchRows.map((row, idx) => (
                    <div
                      key={row.id}
                      className="p-4 rounded-2xl bg-slate-50/80 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 space-y-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-mono font-bold text-blue-600 dark:text-cyan-400">
                          MISSION #{idx + 1}
                        </span>
                        {batchRows.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveBatchRow(row.id)}
                            className="text-xs text-rose-600 hover:text-rose-700 font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Remove</span>
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs font-medium mb-1">Parcel #</label>
                          <input
                            type="text"
                            required
                            value={row.parcelNumber}
                            onChange={(e) =>
                              handleUpdateBatchRow(row.id, 'parcelNumber', e.target.value)
                            }
                            className="w-full min-h-[42px] px-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1">Recipient Name</label>
                          <input
                            type="text"
                            required
                            placeholder="Recipient full name"
                            value={row.recipientName}
                            onChange={(e) =>
                              handleUpdateBatchRow(row.id, 'recipientName', e.target.value)
                            }
                            className="w-full min-h-[42px] px-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1">Mobile</label>
                          <input
                            type="tel"
                            required
                            value={row.recipientPhone}
                            onChange={(e) =>
                              handleUpdateBatchRow(row.id, 'recipientPhone', e.target.value)
                            }
                            className="w-full min-h-[42px] px-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm font-mono"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium mb-1">
                          Delivery Address
                        </label>
                        <input
                          type="text"
                          required
                          value={row.address}
                          onChange={(e) =>
                            handleUpdateBatchRow(row.id, 'address', e.target.value)
                          }
                          className="w-full min-h-[42px] px-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm"
                        />
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
                        <div>
                          <label className="block text-xs font-medium mb-1">Weight (kg)</label>
                          <input
                            type="number"
                            step="0.1"
                            min="0.2"
                            max="7.0"
                            required
                            value={row.weightKg}
                            onChange={(e) =>
                              handleUpdateBatchRow(row.id, 'weightKg', e.target.value)
                            }
                            className="w-full min-h-[42px] px-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1">Priority</label>
                          <select
                            value={row.priority}
                            onChange={(e) =>
                              handleUpdateBatchRow(
                                row.id,
                                'priority',
                                e.target.value as 'low' | 'medium' | 'high' | 'emergency'
                              )
                            }
                            className="w-full min-h-[42px] px-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm"
                          >
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                            <option value="emergency">Emergency</option>
                          </select>
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs font-medium mb-1">Drone Assignment</label>
                          <select
                            value={row.autoAssign ? 'auto' : row.selectedDroneId}
                            onChange={(e) => {
                              if (e.target.value === 'auto') {
                                handleUpdateBatchRow(row.id, 'autoAssign', true);
                                handleUpdateBatchRow(row.id, 'selectedDroneId', '');
                              } else {
                                handleUpdateBatchRow(row.id, 'autoAssign', false);
                                handleUpdateBatchRow(row.id, 'selectedDroneId', e.target.value);
                              }
                            }}
                            className="w-full min-h-[42px] px-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm"
                          >
                            <option value="auto">Auto-Assign Distinct Available Drone</option>
                            {drones
                              .filter((d) => d.status !== 'maintenance')
                              .map((d) => (
                                <option key={d.id} value={d.id}>
                                  {d.code} · {d.batteryPct}% ({d.status})
                                </option>
                              ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-1">
                  <button
                    type="button"
                    onClick={handleAddBatchRow}
                    disabled={batchRows.length >= 20}
                    className="min-h-[46px] px-4 rounded-xl border border-slate-300 dark:border-slate-700 hover:border-blue-500 text-sm font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Mission Row</span>
                  </button>
                  <button
                    type="submit"
                    disabled={dispatching}
                    className="flex-1 min-h-[46px] px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer"
                  >
                    {dispatching
                      ? `Dispatching ${batchRows.length} Missions...`
                      : `Dispatch ${batchRows.length} Missions Simultaneously`}
                  </button>
                </div>
              </form>
            )}
          </div>

          <div className="lg:col-span-5 glass-panel rounded-3xl p-6 space-y-4">
            <h3 className="text-xl font-bold">Automated Logistics Output</h3>
            {dispatchMode === 'batch' && batchReceipts.length > 0 ? (
              <div className="space-y-3 text-sm max-h-[560px] overflow-y-auto pr-1">
                <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800">
                  <p className="font-bold text-emerald-800 dark:text-emerald-200">
                    Batch Dispatch Ready · {batchReceipts.length} Missions Queued
                  </p>
                </div>
                {batchErrors.length > 0 && (
                  <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200 space-y-1">
                    {batchErrors.map((err) => (
                      <p key={err.index}>
                        {err.parcelNumber}: {err.error}
                      </p>
                    ))}
                  </div>
                )}
                {batchReceipts.map((item) => (
                  <div
                    key={item.missionCode}
                    className="p-3.5 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 space-y-1.5 font-mono text-xs"
                  >
                    <div className="flex items-center justify-between font-bold text-sm">
                      <span>
                        {item.missionCode} · {item.parcelNumber}
                      </span>
                      <span className="text-blue-600 dark:text-cyan-400">
                        {item.droneCode}
                      </span>
                    </div>
                    <p className="text-slate-600 dark:text-slate-400">
                      Dist {item.distanceKm} km · Est. Battery {item.estimatedBatteryPct}% ·{' '}
                      {item.successProbability}% ({item.riskScore})
                    </p>
                  </div>
                ))}
              </div>
            ) : dispatchMode === 'single' && dispatchReceipt ? (
              <div className="space-y-3 text-sm">
                <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800">
                  <p className="font-bold text-emerald-800 dark:text-emerald-200">
                    Digital Mission Package Ready · {dispatchReceipt.parcelNumber}
                  </p>
                  <p className="text-emerald-700 dark:text-emerald-300 mt-1">
                    Assigned Aircraft: {dispatchReceipt.droneCode}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 font-mono">
                  <div className="p-3 rounded-xl bg-white/80 dark:bg-slate-900/80">
                    <p className="text-xs text-slate-500">Coordinates</p>
                    <p className="font-semibold">
                      {dispatchReceipt.coordinates.lat}, {dispatchReceipt.coordinates.lng}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-white/80 dark:bg-slate-900/80">
                    <p className="text-xs text-slate-500">Mission Distance</p>
                    <p className="font-semibold">{dispatchReceipt.distanceKm} km</p>
                  </div>
                  <div className="p-3 rounded-xl bg-white/80 dark:bg-slate-900/80">
                    <p className="text-xs text-slate-500">Est. Battery Need</p>
                    <p className="font-semibold">{dispatchReceipt.estimatedBatteryPct}%</p>
                  </div>
                  <div className="p-3 rounded-xl bg-white/80 dark:bg-slate-900/80">
                    <p className="text-xs text-slate-500">Success / Risk</p>
                    <p className="font-semibold text-emerald-600">
                      {dispatchReceipt.successProbability}% · {dispatchReceipt.riskScore}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Weather Verified: {dispatchReceipt.weatherCondition}. Push, SMS, and Email notifications queued.
                </p>
              </div>
            ) : (
              <div className="text-sm text-slate-600 dark:text-slate-400 space-y-2.5">
                <p>When you submit a delivery, AEGIS automatically executes:</p>
                <ol className="list-decimal list-inside space-y-1.5">
                  <li>Convert street address to latitude & longitude</li>
                  <li>Calculate corridor mission distance from Mother Base</li>
                  <li>Estimate round-trip + reserve battery requirement</li>
                  <li>Verify live Gajularamaram weather readiness</li>
                  <li>Score fleet health & assign distinct available drones</li>
                  <li>Generate QR-verified digital mission packages</li>
                </ol>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. MISSION MANAGEMENT PAGE */}
      {tab === 'missions' && (
        <div className="glass-surface rounded-3xl p-6 space-y-4 overflow-x-auto">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold">Mission Management</h2>
              {selectedMissionIds.length > 0 && (
                <span className="text-xs font-mono font-semibold text-blue-600 dark:text-cyan-400">
                  {selectedMissionIds.length} selected
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={toggleSelectAllMissions}
                className="min-h-[38px] px-3 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer"
              >
                {selectedMissionIds.length === missions.length && missions.length > 0
                  ? 'Clear Selection'
                  : 'Select All'}
              </button>
              <button
                type="button"
                disabled={selectedMissionIds.length === 0 || batchActionLoading}
                onClick={() => void handleBatchMissionAction('start')}
                className="min-h-[38px] px-3 rounded-lg bg-emerald-600 disabled:opacity-40 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" /> Start Selected
              </button>
              <button
                type="button"
                disabled={selectedMissionIds.length === 0 || batchActionLoading}
                onClick={() => void handleBatchMissionAction('delay')}
                className="min-h-[38px] px-3 rounded-lg bg-amber-600 disabled:opacity-40 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Clock className="w-3.5 h-3.5" /> Delay Selected
              </button>
              <button
                type="button"
                disabled={selectedMissionIds.length === 0 || batchActionLoading}
                onClick={() => void handleBatchMissionAction('abort')}
                className="min-h-[38px] px-3 rounded-lg bg-slate-700 disabled:opacity-40 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
              >
                <XCircle className="w-3.5 h-3.5" /> Abort Selected
              </button>
              <button
                type="button"
                disabled={selectedMissionIds.length === 0 || batchActionLoading}
                onClick={() => void handleBatchMissionAction('rtb')}
                className="min-h-[38px] px-3 rounded-lg bg-rose-600 disabled:opacity-40 text-white text-xs font-semibold cursor-pointer"
              >
                RTB Selected
              </button>
            </div>
          </div>

          <table className="w-full text-left border-collapse min-w-[880px]">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-xs uppercase text-slate-500">
                <th className="py-3 pr-3 w-8">
                  <input
                    type="checkbox"
                    aria-label="Select all missions"
                    checked={
                      missions.length > 0 &&
                      selectedMissionIds.length === missions.length
                    }
                    onChange={toggleSelectAllMissions}
                    className="w-4 h-4 accent-blue-600 cursor-pointer"
                  />
                </th>
                <th className="py-3 pr-4">Mission ID</th>
                <th className="py-3 pr-4">Parcel #</th>
                <th className="py-3 pr-4">Assigned Drone</th>
                <th className="py-3 pr-4">Status</th>
                <th className="py-3 pr-4">Departure</th>
                <th className="py-3 pr-4">ETA</th>
                <th className="py-3">Operator Controls</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
              {missions.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-900/50">
                  <td className="py-3.5 pr-3">
                    <input
                      type="checkbox"
                      aria-label={`Select mission ${m.missionCode}`}
                      checked={selectedMissionIds.includes(m.id)}
                      onChange={() => toggleMissionSelect(m.id)}
                      className="w-4 h-4 accent-blue-600 cursor-pointer"
                    />
                  </td>
                  <td className="py-3.5 pr-4 font-mono font-semibold">{m.missionCode}</td>
                  <td className="py-3.5 pr-4 font-mono">{m.parcel?.parcelNumber}</td>
                  <td className="py-3.5 pr-4 font-mono">{m.drone?.code}</td>
                  <td className="py-3.5 pr-4 capitalize font-semibold">
                    {m.status.replace('_', ' ')} ({Math.round(m.progressPct)}%)
                  </td>
                  <td className="py-3.5 pr-4 font-mono text-xs">
                    {m.departureTime
                      ? new Date(m.departureTime).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '--'}
                  </td>
                  <td className="py-3.5 pr-4 font-mono text-xs">
                    {m.eta
                      ? new Date(m.eta).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '--'}
                  </td>
                  <td className="py-3.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => void handleMissionAction(m.id, 'start')}
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <Play className="w-3 h-3" /> Start
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleMissionAction(m.id, 'delay')}
                        className="px-2.5 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <Clock className="w-3 h-3" /> Delay
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleMissionAction(m.id, 'abort')}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-700 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <XCircle className="w-3 h-3" /> Abort
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleMissionAction(m.id, 'rtb')}
                        className="px-2.5 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-semibold cursor-pointer"
                      >
                        RTB
                      </button>
                      <select
                        value={reassignSelection[m.id] || m.droneId}
                        onChange={(e) => {
                          const nextId = Number(e.target.value);
                          setReassignSelection((prev) => ({
                            ...prev,
                            [m.id]: nextId,
                          }));
                          void handleMissionAction(m.id, 'reassign', nextId);
                        }}
                        className="px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono"
                      >
                        {drones.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.code}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 4. DRONE FLEET PAGE */}
      {tab === 'fleet' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold">
                Active Drone Fleet ({drones.length} Aircraft)
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Operator-only fleet registry, readiness controls, and cell telemetry.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddDroneForm((prev) => !prev)}
              className="min-h-[44px] px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold flex items-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{showAddDroneForm ? 'Close Registration' : 'Register New Drone'}</span>
            </button>
          </div>

          {showAddDroneForm && (
            <form
              onSubmit={handleCreateDrone}
              className="glass-panel rounded-3xl p-6 space-y-4 border border-blue-500/30"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold">Register New Fleet Aircraft</h3>
                <span className="text-xs font-mono text-blue-600 dark:text-cyan-400">
                  OPERATOR CLEARANCE ONLY
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium mb-1">Drone Code</label>
                  <input
                    type="text"
                    required
                    placeholder="PHANTOM-06"
                    value={newDroneCode}
                    onChange={(e) => setNewDroneCode(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Aircraft Model</label>
                  <input
                    type="text"
                    required
                    value={newDroneModel}
                    onChange={(e) => setNewDroneModel(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Max Payload (kg)</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    max="25"
                    required
                    value={newDronePayload}
                    onChange={(e) => setNewDronePayload(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Initial Battery (%)</label>
                  <input
                    type="number"
                    min="10"
                    max="100"
                    required
                    value={newDroneBattery}
                    onChange={(e) => setNewDroneBattery(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Airframe Health (%)</label>
                  <input
                    type="number"
                    min="10"
                    max="100"
                    required
                    value={newDroneHealth}
                    onChange={(e) => setNewDroneHealth(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Formation Group</label>
                  <input
                    type="text"
                    value={newDroneFormation}
                    onChange={(e) => setNewDroneFormation(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Swarm Mesh Role</label>
                  <select
                    value={newDroneMesh}
                    onChange={(e) =>
                      setNewDroneMesh(
                        e.target.value as 'connected' | 'relay' | 'standby'
                      )
                    }
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                  >
                    <option value="connected">Connected</option>
                    <option value="relay">Relay</option>
                    <option value="standby">Standby</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Initial Status</label>
                  <select
                    value={newDroneStatus}
                    onChange={(e) =>
                      setNewDroneStatus(
                        e.target.value as 'available' | 'busy' | 'maintenance'
                      )
                    }
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                  >
                    <option value="available">Available</option>
                    <option value="busy">Busy</option>
                    <option value="maintenance">Maintenance</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAddDroneForm(false)}
                  className="min-h-[44px] px-4 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingDrone}
                  className="min-h-[44px] px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold cursor-pointer"
                >
                  {addingDrone ? 'Registering Aircraft...' : 'Add Drone to Fleet'}
                </button>
              </div>
            </form>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {drones.map((drone, index) => {
              const fleetImages = [
                '/assets/aistudio/Screenshot_2026-11-21_144220_c11fe76e.png',
                '/assets/aistudio/Screenshot_2026-11-21_144252_2fb0ccd4.png',
                '/assets/aistudio/Screenshot_2026-11-21_144353_dc6ceadb.png',
                '/assets/aistudio/Screenshot_2026-11-21_144430_a505c4f9.png',
                '/assets/aistudio/Screenshot_2026-11-21_151708_c3d315c6.png',
              ];
              const cardImg = fleetImages[index];

              const statusMeta =
                drone.status === 'available'
                  ? {
                      label: 'Available',
                      textClass: 'text-emerald-700 dark:text-emerald-400',
                      ringClass: 'border-emerald-500/40',
                    }
                  : drone.status === 'busy'
                    ? {
                        label: 'Busy',
                        textClass: 'text-amber-700 dark:text-amber-400',
                        ringClass: 'border-amber-500/40',
                      }
                    : {
                        label: 'Maintenance',
                        textClass: 'text-rose-700 dark:text-rose-400',
                        ringClass: 'border-rose-500/40',
                      };

              return (
                <div
                  key={drone.id}
                  className={`glass-surface rounded-3xl overflow-hidden border ${statusMeta.ringClass}`}
                >
                  <img
                    src={
                      cardImg ||
                      '/src/assets/images/drone_phantom_studio_1795193985761.jpg'
                    }
                    alt={`${drone.code} aircraft`}
                    referrerPolicy="no-referrer"
                    className={
                      cardImg
                        ? 'w-full aspect-[4/3] object-contain bg-slate-950'
                        : 'w-full aspect-[4/3] object-cover'
                    }
                  />
                  <div className="p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-mono font-bold text-lg">{drone.code}</h3>
                        <p className="text-xs text-slate-500">{drone.model}</p>
                      </div>
                      <span className={`text-sm font-bold ${statusMeta.textClass}`}>
                        {statusMeta.label}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                      <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900">
                        Battery: {drone.batteryPct}%
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900">
                        Health: {drone.healthPct}%
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900">
                        Payload: {drone.maxPayloadKg} kg
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900">
                        Last: {drone.lastMissionAt ? 'Today' : 'Ready'}
                      </div>
                    </div>

                    <div className="flex gap-1.5 pt-1">
                      {(['available', 'busy', 'maintenance'] as const).map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => void handleDroneStatusToggle(drone.id, st)}
                          className={`flex-1 py-2 rounded-lg text-xs font-semibold capitalize cursor-pointer border ${
                            drone.status === st
                              ? 'bg-slate-900 dark:bg-blue-600 text-white border-transparent'
                              : 'border-slate-300 dark:border-slate-700'
                          }`}
                        >
                          {st}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Battery Reports Table */}
          <div className="glass-surface rounded-3xl p-6 overflow-x-auto">
            <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
              <BatteryCharging className="w-5 h-5 text-emerald-600" />
              <span>Fleet Battery Telemetry Reports</span>
            </h3>
            <table className="w-full text-left text-sm min-w-[600px]">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                  <th className="py-2">Drone</th>
                  <th className="py-2">Charge</th>
                  <th className="py-2">Cell Voltage</th>
                  <th className="py-2">Pack Temp</th>
                  <th className="py-2">Cycles</th>
                  <th className="py-2">Health</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono">
                {batteryReports.map((br) => {
                  const droneCode =
                    drones.find((d) => d.id === br.droneId)?.code || `#${br.droneId}`;
                  return (
                    <tr key={br.id}>
                      <td className="py-2.5 font-semibold">{droneCode}</td>
                      <td className="py-2.5">{br.chargePct}%</td>
                      <td className="py-2.5">{(br.voltageMv / 1000).toFixed(2)} V</td>
                      <td className="py-2.5">{br.temperatureC} °C</td>
                      <td className="py-2.5">{br.cycleCount}</td>
                      <td className="py-2.5 text-emerald-600 dark:text-emerald-400">
                        {br.healthPct}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. ORACLE COMMAND CENTER & AI MISSION PLANNER */}
      {tab === 'oracle' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="glass-panel rounded-2xl p-4">
              <p className="text-xs text-slate-500 flex items-center gap-1">
                <CloudSun className="w-3.5 h-3.5" /> Weather Status
              </p>
              <p className="font-bold mt-1">{weather?.condition || 'Clear Sky'}</p>
              <p className="text-xs font-mono text-slate-500 mt-0.5">
                Wind {weather?.windSpeedKmh ?? 11.4} km/h
              </p>
            </div>
            <div className="glass-panel rounded-2xl p-4">
              <p className="text-xs text-slate-500">Flight Readiness</p>
              <p className="font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                {weather?.flightReadiness || 'Optimal'}
              </p>
            </div>
            <div className="glass-panel rounded-2xl p-4">
              <p className="text-xs text-slate-500">Map Status</p>
              <p className="font-bold mt-1">Corridor Synced</p>
            </div>
            <div className="glass-panel rounded-2xl p-4">
              <p className="text-xs text-slate-500">Fleet Readiness</p>
              <p className="font-bold font-mono mt-1">
                {drones.filter((d) => d.status !== 'maintenance').length}/{drones.length} Ready
              </p>
            </div>
            <div className="glass-panel rounded-2xl p-4">
              <p className="text-xs text-slate-500">Mission Risk Score</p>
              <p className="font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                {aiPlan?.report.riskScore || 'Low'}
              </p>
            </div>
            <div className="glass-panel rounded-2xl p-4">
              <p className="text-xs text-slate-500">Mission Success</p>
              <p className="font-bold text-2xl font-mono text-blue-600 dark:text-cyan-400 mt-0.5">
                {aiPlan?.report.successProbability ?? stats.avgSuccess}%
              </p>
            </div>
          </div>

          {/* 24-Hour Mission Efficiency Score Card */}
          <div className="glass-panel rounded-3xl p-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
              <div className="lg:col-span-5 space-y-2">
                <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <Gauge className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
                  <span>Last 24 Hours · Battery Usage vs. Distance</span>
                </div>
                <div className="flex items-baseline gap-3">
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                    Mission Efficiency Score
                  </h2>
                  <span
                    className={`text-sm font-semibold ${
                      efficiency24h.score >= 88
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : efficiency24h.score >= 75
                          ? 'text-blue-600 dark:text-cyan-400'
                          : 'text-amber-600 dark:text-amber-400'
                    }`}
                  >
                    {efficiency24h.rating}
                  </span>
                </div>

                <div className="flex items-baseline gap-2 pt-1">
                  <span className="text-4xl font-bold font-mono tabular-nums text-blue-600 dark:text-cyan-400">
                    {efficiency24h.score}
                  </span>
                  <span className="text-sm font-mono text-slate-500 dark:text-slate-400">
                    / 100
                  </span>
                </div>

                <div className="h-2.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden mt-2">
                  <div
                    className="h-full bg-gradient-to-r from-blue-600 via-cyan-500 to-emerald-500 transition-all duration-500"
                    style={{ width: `${efficiency24h.score}%` }}
                  />
                </div>
              </div>

              <div className="lg:col-span-3 grid grid-cols-2 gap-3 font-mono">
                <div className="p-3.5 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800">
                  <p className="text-xs text-slate-500">24h Distance</p>
                  <p className="text-lg font-bold tabular-nums mt-0.5">
                    {efficiency24h.totalDistanceKm} km
                  </p>
                </div>
                <div className="p-3.5 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800">
                  <p className="text-xs text-slate-500">Battery Used</p>
                  <p className="text-lg font-bold tabular-nums mt-0.5">
                    {efficiency24h.totalBatteryPct}%
                  </p>
                </div>
                <div className="p-3.5 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800">
                  <p className="text-xs text-slate-500">Draw Rate</p>
                  <p className="text-lg font-bold tabular-nums mt-0.5">
                    {efficiency24h.batteryPerKm}%/km
                  </p>
                </div>
                <div className="p-3.5 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800">
                  <p className="text-xs text-slate-500">Range / 1%</p>
                  <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5">
                    {efficiency24h.kmPerBatteryPct} km
                  </p>
                </div>
              </div>

              <div className="lg:col-span-4 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>Per-Mission Breakdown ({efficiency24h.missionCount})</span>
                  <span className="font-mono">Dist · Draw · Score</span>
                </div>
                {efficiency24h.breakdown.length === 0 ? (
                  <p className="text-sm text-slate-500 py-4">
                    No flights recorded in the last 24 hours.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                    {efficiency24h.breakdown.slice(0, 5).map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-2 text-xs font-mono py-1.5 border-b border-slate-200/70 dark:border-slate-800/70 last:border-0"
                      >
                        <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {item.missionCode} · {item.droneCode}
                        </span>
                        <span className="text-slate-600 dark:text-slate-400 tabular-nums whitespace-nowrap">
                          {item.distanceKm} km · {item.batteryUsedPct}% ·{' '}
                          <strong className="text-blue-600 dark:text-cyan-400">
                            {item.missionScore}
                          </strong>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* AI Mission Planner */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-6 glass-surface rounded-3xl p-6 space-y-4">
              <div>
                <h2 className="text-2xl font-bold flex items-center gap-2">
                  <Sparkles className="w-6 h-6 text-blue-600 dark:text-cyan-400" />
                  <span>Oracle AI Mission Planner</span>
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                  Enter a natural-language delivery directive. Gemini extracts parcel, coordinates, deadline, and generates a flight assessment.
                </p>
              </div>

              <form onSubmit={handleAiPlan} className="space-y-3">
                <textarea
                  rows={3}
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  className="w-full p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-base focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                <button
                  type="submit"
                  disabled={aiLoading}
                  className="w-full min-h-[48px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <RefreshCw className={`w-4 h-4 ${aiLoading ? 'animate-spin' : ''}`} />
                  <span>
                    {aiLoading ? 'Analyzing Corridor & Fleet...' : 'Generate AI Mission Report'}
                  </span>
                </button>
              </form>
            </div>

            <div className="lg:col-span-6 glass-panel rounded-3xl p-6 space-y-4">
              <h3 className="text-xl font-bold">Extracted Mission Blueprint</h3>
              {aiPlan ? (
                <div className="space-y-4 text-sm">
                  <div className="grid grid-cols-2 gap-3 font-mono">
                    <div className="p-3 rounded-xl bg-white/80 dark:bg-slate-900/80">
                      <p className="text-xs text-slate-500">Parcel Number</p>
                      <p className="font-bold text-base">{aiPlan.extracted.parcelNumber}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-white/80 dark:bg-slate-900/80">
                      <p className="text-xs text-slate-500">Deadline</p>
                      <p className="font-bold text-base">{aiPlan.extracted.deadline}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-white/80 dark:bg-slate-900/80 col-span-2">
                      <p className="text-xs text-slate-500">Resolved Address & GPS</p>
                      <p className="font-semibold">
                        {aiPlan.extracted.address} ({aiPlan.extracted.coordinates.lat},{' '}
                        {aiPlan.extracted.coordinates.lng})
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-white/80 dark:bg-slate-900/80">
                      <p className="text-xs text-slate-500">Route & ETA</p>
                      <p className="font-semibold">
                        {aiPlan.report.distanceKm} km · {aiPlan.report.etaMinutes} mins
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-white/80 dark:bg-slate-900/80">
                      <p className="text-xs text-slate-500">Battery & Drone</p>
                      <p className="font-semibold">
                        {aiPlan.report.estimatedBatteryPct}% · {aiPlan.suggestedDrone?.code}
                      </p>
                    </div>
                  </div>
                  <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                    {aiPlan.report.missionReport}
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleDeployAiPlan()}
                    className="w-full min-h-[48px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer"
                  >
                    Confirm & Dispatch Mission
                  </button>
                </div>
              ) : (
                <p className="text-slate-500 text-sm">
                  Click "Generate AI Mission Report" to inspect extracted coordinates, battery budget, and risk scoring.
                </p>
              )}
            </div>
          </div>

          {/* Live Airspace & Weather Briefing (Google Search Grounding) */}
          <div className="glass-surface rounded-3xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Globe className="w-5 h-5 text-blue-600 dark:text-cyan-400" />
                  <span>Live Airspace &amp; Weather Intel (Google Search Grounding)</span>
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Real-time Hyderabad weather advisories, DGCA UAS regulations, and corridor alerts via gemini-4-hydrogen
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {[
                {
                  label: 'Hyderabad Weather & Wind Today',
                  focus: 'weather' as const,
                  query:
                    'Current weather, wind speed, visibility, and rain forecast in Hyderabad Telangana today',
                },
                {
                  label: 'India DGCA Drone Corridor Rules',
                  focus: 'dgca' as const,
                  query:
                    'Latest India DGCA Drone Rules DigitalSky green zone altitude and BVLOS delivery guidelines',
                },
                {
                  label: 'North Hyderabad Corridor Advisories',
                  focus: 'corridor' as const,
                  query:
                    'Hyderabad Gajularamaram Kukatpally Secunderabad local weather or traffic advisories today',
                },
              ].map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setSearchFocus(preset.focus);
                    setSearchQuery(preset.query);
                    void handleRunSearchBriefing(preset.query, preset.focus);
                  }}
                  disabled={searchLoading}
                  className="min-h-[38px] px-3.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950 text-xs font-semibold cursor-pointer"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleRunSearchBriefing();
              }}
              className="flex flex-col sm:flex-row gap-2"
            >
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Query live web intel for Hyderabad weather, DGCA rules, or corridor news..."
                className="flex-1 min-h-[46px] px-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-sm"
              />
              <button
                type="submit"
                disabled={searchLoading}
                className="min-h-[46px] px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer"
              >
                <Globe className="w-4 h-4" />
                <span>{searchLoading ? 'Searching Web...' : 'Run Search Briefing'}</span>
              </button>
            </form>

            {searchErr && (
              <p className="text-sm text-rose-600 dark:text-rose-400">{searchErr}</p>
            )}

            {searchResult && (
              <div className="p-4 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 text-sm">
                <FormattedAiText text={searchResult.text} />
                <GroundingSourcesList sources={searchResult.sources} />
              </div>
            )}
          </div>

          {/* Oracle Multi-Turn Operations Copilot */}
          <GeminiChatPanel
            title="Oracle Multi-Turn Operations Copilot"
            subtitle="Continuous multi-turn fleet strategist with Google Maps Grounding, Google Search Grounding, and Fast Express modes"
            availableModes={['strategist', 'maps', 'search', 'fast']}
            defaultMode="strategist"
            language={language}
            defaultLatLng={{ latitude: 17.5212, longitude: 78.4119 }}
            messages={operatorChatMessages}
            onMessagesChange={setOperatorChatMessages}
          />
        </div>
      )}

      {/* 6. DRONE SWARM PAGE */}
      {tab === 'swarm' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8">
            <AegisMap
              apiKey={mapsApiKey}
              drones={drones}
              missions={missions}
              showSwarmMesh={true}
              showReturnPaths={true}
              heightClass="h-[460px] md:h-[540px]"
            />
          </div>
          <div className="lg:col-span-4 glass-surface rounded-3xl p-6 space-y-4">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Network className="w-5 h-5 text-cyan-500" />
              <span>Swarm Mesh & Formation</span>
            </h2>
            <div className="space-y-3">
              {drones.map((d, idx) => (
                <div
                  key={d.id}
                  className="p-3.5 rounded-2xl bg-slate-100/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 text-sm"
                >
                  <div className="flex items-center justify-between font-mono font-bold">
                    <span>{d.code}</span>
                    <span className="text-cyan-600 dark:text-cyan-400 uppercase text-xs">
                      Mesh: {d.meshStatus}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                    Formation: {d.formationGroup} · Separation {120 + idx * 35} m
                  </p>
                  <p className="text-xs font-mono text-slate-500 mt-1">
                    {d.currentLat.toFixed(4)}, {d.currentLng.toFixed(4)} · Alt {d.altitudeM} m
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 7. ANALYTICS PAGE */}
      {tab === 'analytics' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            {
              title: 'Mission Success Rate',
              metric: `${stats.avgSuccess}%`,
              detail: 'Calculated across Hyderabad corridor flights',
            },
            {
              title: 'Average Battery Usage',
              metric: '19.4%',
              detail: 'Mean consumption per 4.5 km round trip',
            },
            {
              title: 'Average Mission Duration',
              metric: '8.2 min',
              detail: 'Mother Base launch to doorstep release',
            },
            {
              title: 'Fleet Utilization',
              metric: `${Math.round((drones.filter((d) => d.status !== 'maintenance').length / Math.max(1, drones.length)) * 100)}%`,
              detail: 'Active aircraft availability ratio',
            },
            {
              title: 'Customer Satisfaction',
              metric: '4.9 / 5.0',
              detail: 'Verified QR delivery feedback score',
            },
            {
              title: 'Daily Delivery Volume',
              metric: `${56 + stats.deliveriesToday}`,
              detail: 'Total parcels processed today',
            },
          ].map((card) => (
            <div key={card.title} className="glass-panel rounded-3xl p-6 space-y-2">
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                {card.title}
              </p>
              <p className="text-4xl font-bold font-mono tabular-nums text-blue-600 dark:text-cyan-400">
                {card.metric}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {card.detail}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
