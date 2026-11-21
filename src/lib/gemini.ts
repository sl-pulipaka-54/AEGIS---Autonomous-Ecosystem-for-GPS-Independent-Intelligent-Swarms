import {
  GoogleGenAI,
  ThinkingLevel,
  Type,
  type GenerateContentResponse,
} from '@google/genai';
import type { ChatMode, GroundingSource } from '../types/aegis.ts';

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in the server environment.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function extractGroundingSources(response: GenerateContentResponse): GroundingSource[] {
  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (!Array.isArray(chunks)) return [];

  const seenUris = new Set<string>();
  const sources: GroundingSource[] = [];

  for (const rawChunk of chunks) {
    const chunk = rawChunk as {
      web?: { uri?: string; title?: string };
      maps?: {
        uri?: string;
        title?: string;
        placeAnswerSources?: {
          reviewSnippets?: Array<
            string | { reviewSnippet?: string; text?: string; snippet?: string }
          >;
        };
      };
    };

    if (chunk.maps?.uri && !seenUris.has(chunk.maps.uri)) {
      seenUris.add(chunk.maps.uri);
      const rawSnippets = chunk.maps.placeAnswerSources?.reviewSnippets || [];
      const reviewSnippets = rawSnippets
        .map((item) => {
          if (typeof item === 'string') return item.trim();
          return (item.reviewSnippet || item.text || item.snippet || '').trim();
        })
        .filter((s) => s.length > 0);

      sources.push({
        kind: 'maps',
        title: chunk.maps.title?.trim() || 'View Location on Google Maps',
        uri: chunk.maps.uri,
        ...(reviewSnippets.length > 0 ? { reviewSnippets } : {}),
      });
    } else if (chunk.web?.uri && !seenUris.has(chunk.web.uri)) {
      seenUris.add(chunk.web.uri);
      sources.push({
        kind: 'web',
        title: chunk.web.title?.trim() || chunk.web.uri,
        uri: chunk.web.uri,
      });
    }
  }

  return sources;
}

export interface PlannedMissionAIResult {
  parcelNumber: string;
  recipientName: string;
  address: string;
  deadlineText: string;
  priority: 'low' | 'medium' | 'high' | 'emergency';
  estimatedWeightKg: number;
  missionReport: string;
  routeNotes: string;
  weatherAdvisory: string;
}

export async function parseMissionCommandWithAI(
  instruction: string
): Promise<PlannedMissionAIResult> {
  const ai = getGeminiClient();

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Extract structured drone delivery mission parameters from this operator instruction for our Hyderabad (Gajularamaram hub) autonomous drone corridor:\n\n"${instruction}"`,
    config: {
      systemInstruction:
        'You are the AEGIS Oracle AI Mission Planner operating in Hyderabad, India (Gajularamaram hub). Extract exact parcel number, recipient name if given (else "Valued Recipient"), full street/locality address, deadline time, priority level, estimated weight in kg (default 1.5 if unspecified), a concise 2-sentence operational mission report, route notes, and weather advisory.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          parcelNumber: {
            type: Type.STRING,
            description: 'Extracted parcel ID, e.g. #203 or AEG-1055',
          },
          recipientName: {
            type: Type.STRING,
            description: 'Recipient name or Valued Recipient if omitted',
          },
          address: {
            type: Type.STRING,
            description: 'Delivery street address and locality in Hyderabad',
          },
          deadlineText: {
            type: Type.STRING,
            description: 'Requested delivery deadline, e.g. 5:00 PM Today',
          },
          priority: {
            type: Type.STRING,
            description: 'One of: low, medium, high, emergency',
          },
          estimatedWeightKg: {
            type: Type.NUMBER,
            description: 'Estimated package weight in kilograms (0.2 to 7.0)',
          },
          missionReport: {
            type: Type.STRING,
            description: 'Concise 2-sentence aerospace dispatch briefing',
          },
          routeNotes: {
            type: Type.STRING,
            description: 'Corridor flight path notes across Hyderabad sectors',
          },
          weatherAdvisory: {
            type: Type.STRING,
            description: 'Flight wind & visibility readiness summary',
          },
        },
        required: [
          'parcelNumber',
          'recipientName',
          'address',
          'deadlineText',
          'priority',
          'estimatedWeightKg',
          'missionReport',
          'routeNotes',
          'weatherAdvisory',
        ],
      },
    },
  });

  const raw = (response.text ?? '{}').trim();
  const parsed = JSON.parse(raw) as PlannedMissionAIResult;
  const normalizedPriority = ['low', 'medium', 'high', 'emergency'].includes(
    (parsed.priority || '').toLowerCase()
  )
    ? (parsed.priority.toLowerCase() as PlannedMissionAIResult['priority'])
    : 'high';

  return {
    ...parsed,
    priority: normalizedPriority,
    estimatedWeightKg:
      typeof parsed.estimatedWeightKg === 'number' && parsed.estimatedWeightKg > 0
        ? Math.min(7, Math.max(0.2, parsed.estimatedWeightKg))
        : 1.5,
  };
}

export interface ChatTurnInput {
  role: 'user' | 'model';
  text: string;
}

export async function runMultiTurnChatWithAI(params: {
  message: string;
  history?: ChatTurnInput[];
  mode?: ChatMode;
  language?: string;
  parcelContext?: string;
  fleetContext?: string;
  userLocation?: { latitude: number; longitude: number };
}): Promise<{
  reply: string;
  modelUsed: string;
  sources: GroundingSource[];
}> {
  const ai = getGeminiClient();
  const mode: ChatMode = params.mode || 'care';

  const langLabel =
    params.language === 'te'
      ? 'Telugu (or clear simple Telugu + English parcel codes)'
      : params.language === 'hi'
        ? 'Hindi (simple conversational Hindi + English parcel codes)'
        : 'clear, warm, easy-to-read English suitable for both seniors and younger users';

  let model = 'gemini-4-hydrogen';
  let systemInstruction = `You are AEGIS Care, the friendly multi-turn support concierge for the AEGIS Drone Delivery Platform operating from Gajularamaram Hub in Hyderabad. Reply in ${langLabel}. Keep answers concise, warm, practical, and free of unnecessary jargon.`;

  const config: Record<string, unknown> = {};

  if (mode === 'fast') {
    model = 'gemini-3.1-flash-lite';
    systemInstruction = `You are AEGIS Express, a rapid-response drone delivery assistant operating in Hyderabad. Reply in ${langLabel}. Give ultra-concise, scannable bulleted answers (under 65 words) focused on immediate parcel status, QR verification steps, or payload rules.`;
  } else if (mode === 'maps') {
    model = 'gemini-4-hydrogen';
    systemInstruction = `You are AEGIS Corridor Scout, a Hyderabad location and drone drop-zone advisor. Use the Google Maps tool to identify real nearby landmarks, open spaces, clinics, pharmacies, community parks, and address context in Hyderabad (centered around Gajularamaram, Kukatpally, Bachupally, Kompally, HITEC City, and Secunderabad). Reply in ${langLabel}.`;
    config.tools = [{ googleMaps: {} }];
    config.toolConfig = {
      retrievalConfig: {
        latLng: params.userLocation || {
          latitude: 17.5212,
          longitude: 78.4119,
        },
      },
    };
  } else if (mode === 'search') {
    model = 'gemini-4-hydrogen';
    systemInstruction = `You are AEGIS Airspace & Weather Analyst. Use Google Search to retrieve up-to-date real-world weather conditions in Hyderabad, India DGCA UAS/drone delivery regulations, and current local advisories. Reply in ${langLabel} with clear, verified facts.`;
    config.tools = [{ googleSearch: {} }];
  } else if (mode === 'strategist') {
    model = 'gemini-4-hydrogen';
    systemInstruction = `You are AEGIS Fleet Operations Strategist for the Hyderabad Gajularamaram Drone Command Center. Analyze fleet battery margins, corridor weather, multi-mission scheduling, and emergency RTB contingencies with structured engineering precision.`;
    config.thinkingConfig = { thinkingLevel: ThinkingLevel.HIGH };
  }

  config.systemInstruction = systemInstruction;

  const formattedHistory = (params.history || [])
    .filter((h) => h.text && h.text.trim().length > 0)
    .slice(-16)
    .map((h) => ({
      role: h.role,
      parts: [{ text: h.text }],
    }));

  const chat = ai.chats.create({
    model,
    config,
    history: formattedHistory,
  });

  const contextBlocks: string[] = [];
  if (params.parcelContext) {
    contextBlocks.push(`Active Parcel Context:\n${params.parcelContext}`);
  }
  if (params.fleetContext) {
    contextBlocks.push(`Live Fleet & Weather Context:\n${params.fleetContext}`);
  }

  const promptText =
    contextBlocks.length > 0
      ? `${contextBlocks.join('\n\n')}\n\nUser message: ${params.message}`
      : params.message;

  const response = await chat.sendMessage({
    message: promptText,
  });

  const sources = extractGroundingSources(response);

  return {
    reply:
      response.text?.trim() ||
      'I am here to help with your AEGIS drone delivery. Please share your parcel number or question.',
    modelUsed: model,
    sources,
  };
}

export async function queryMapsGroundingWithAI(params: {
  query: string;
  lat?: number;
  lng?: number;
  addressLabel?: string;
}): Promise<{
  text: string;
  modelUsed: string;
  sources: GroundingSource[];
}> {
  const ai = getGeminiClient();
  const latitude = typeof params.lat === 'number' ? params.lat : 17.5212;
  const longitude = typeof params.lng === 'number' ? params.lng : 78.4119;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `${params.addressLabel ? `Target area: ${params.addressLabel} (${latitude}, ${longitude}).\n\n` : ''}${params.query}`,
    config: {
      systemInstruction:
        'You are AEGIS Location Intelligence. Use Google Maps grounding to provide accurate, real-world Hyderabad place context, nearby landmarks, safe open drop zones, or pharmacy/clinic hubs. Format cleanly in Markdown with concise bullet points.',
      tools: [{ googleMaps: {} }],
      toolConfig: {
        retrievalConfig: {
          latLng: { latitude, longitude },
        },
      },
    },
  });

  return {
    text:
      response.text?.trim() ||
      'No grounded Google Maps details were returned for this query.',
    modelUsed: 'gemini-4-hydrogen',
    sources: extractGroundingSources(response),
  };
}

export async function querySearchGroundingWithAI(params: {
  query: string;
  focus?: 'weather' | 'dgca' | 'corridor';
}): Promise<{
  text: string;
  modelUsed: string;
  sources: GroundingSource[];
}> {
  const ai = getGeminiClient();
  const focusHint =
    params.focus === 'weather'
      ? 'Focus on current Hyderabad Telangana weather, wind speeds, visibility, and rain alerts relevant to drone flights.'
      : params.focus === 'dgca'
        ? 'Focus on current India DGCA Drone Rules, DigitalSky airspace zones, and BVLOS/delivery updates.'
        : 'Focus on up-to-date Hyderabad Telangana local infrastructure, traffic/event advisories, and drone logistics updates.';

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: params.query,
    config: {
      systemInstruction: `You are AEGIS Airspace Web Intelligence. Use Google Search to gather up-to-date, accurate facts and summarize them clearly in concise Markdown bullet points. ${focusHint}`,
      tools: [{ googleSearch: {} }],
    },
  });

  return {
    text:
      response.text?.trim() ||
      'No grounded web search results were returned for this query.',
    modelUsed: 'gemini-4-hydrogen',
    sources: extractGroundingSources(response),
  };
}
