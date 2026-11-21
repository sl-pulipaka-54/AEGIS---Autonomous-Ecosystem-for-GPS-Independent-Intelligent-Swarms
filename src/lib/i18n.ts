import type { LanguageCode } from '../types/aegis';

export const TRANSLATIONS: Record<
  LanguageCode,
  {
    welcome: string;
    subtitle: string;
    trackParcel: string;
    myDeliveries: string;
    liveTracking: string;
    deliveryHistory: string;
    support: string;
    enterParcelPrompt: string;
    searchPlaceholder: string;
    trackNow: string;
    voiceSearch: string;
    emergencyRtb: string;
    operatorPortal: string;
    customerPortal: string;
    signIn: string;
    signOut: string;
    largeTextLabel: string;
    stages: Record<string, string>;
  }
> = {
  en: {
    welcome: 'Welcome to AEGIS Air Delivery',
    subtitle: 'Safe, quiet autonomous drone deliveries across Gajularamaram & Hyderabad.',
    trackParcel: 'Track Parcel',
    myDeliveries: 'My Deliveries',
    liveTracking: 'Drone Live Tracking',
    deliveryHistory: 'Delivery History',
    support: 'Help & AI Support',
    enterParcelPrompt: 'Enter your parcel number (e.g. AEG-1042 or #203)',
    searchPlaceholder: 'Search parcel #, recipient, or address...',
    trackNow: 'Track Parcel',
    voiceSearch: 'Speak Parcel #',
    emergencyRtb: 'Emergency Return To Base',
    operatorPortal: 'Operator Panel',
    customerPortal: 'Customer Portal',
    signIn: 'Sign In',
    signOut: 'Sign Out',
    largeTextLabel: 'Easy Read Text',
    stages: {
      'Parcel Received': 'Parcel Received',
      'Drone Assigned': 'Drone Assigned',
      'Mission Prepared': 'Mission Prepared',
      'Loaded on Drone': 'Loaded on Drone',
      'In Transit': 'In Transit',
      'Near Destination': 'Near Destination',
      Delivered: 'Delivered',
    },
  },
  te: {
    welcome: 'AEGIS డ్రోన్ డెలివరీకి స్వాగతం',
    subtitle: 'గాజులరామారం & హైదరాబాద్ అంతటా సురక్షితమైన డ్రోన్ పార్శిల్ డెలివరీ.',
    trackParcel: 'పార్శిల్ ట్రాక్ చేయండి',
    myDeliveries: 'నా డెలివరీలు',
    liveTracking: 'లైవ్ డ్రోన్ మ్యాప్',
    deliveryHistory: 'డెలివరీ చరిత్ర',
    support: 'సహాయం & AI చాట్',
    enterParcelPrompt: 'మీ పార్శిల్ నంబర్ నమోదు చేయండి (ఉదా. AEG-1042)',
    searchPlaceholder: 'పార్శిల్ నంబర్ లేదా చిరునామా వెతకండి...',
    trackNow: 'ఇప్పుడే ట్రాక్ చేయండి',
    voiceSearch: 'మాట్లాడి వెతకండి',
    emergencyRtb: 'బేస్‌కు అత్యవసర వాపసు',
    operatorPortal: 'ఆపరేటర్ ప్యానెల్',
    customerPortal: 'కస్టమర్ పోర్టల్',
    signIn: 'సైన్ ఇన్',
    signOut: 'సైన్ అవుట్',
    largeTextLabel: 'పెద్ద అక్షరాలు',
    stages: {
      'Parcel Received': 'పార్శిల్ అందింది',
      'Drone Assigned': 'డ్రోన్ కేటాయించబడింది',
      'Mission Prepared': 'మిషన్ సిద్ధమైంది',
      'Loaded on Drone': 'డ్రోన్‌పై లోడ్ అయింది',
      'In Transit': 'ప్రయాణంలో ఉంది',
      'Near Destination': 'గమ్యానికి సమీపంలో',
      Delivered: 'డెలివరీ పూర్తయింది',
    },
  },
  hi: {
    welcome: 'AEGIS ड्रोन डिलीवरी में आपका स्वागत है',
    subtitle: 'गजुलारामारम और हैदराबाद में सुरक्षित स्वायत्त ड्रोन पार्सल सेवा।',
    trackParcel: 'पार्सल ट्रैक करें',
    myDeliveries: 'मेरी डिलीवरी',
    liveTracking: 'लाइव ड्रोन मैप',
    deliveryHistory: 'डिलीवरी इतिहास',
    support: 'सहायता और AI चैट',
    enterParcelPrompt: 'अपना पार्सल नंबर दर्ज करें (जैसे AEG-1042)',
    searchPlaceholder: 'पार्सल नंबर, नाम या पता खोजें...',
    trackNow: 'अभी ट्रैक करें',
    voiceSearch: 'बोलकर खोजें',
    emergencyRtb: 'आपातकालीन बेस वापसी',
    operatorPortal: 'ऑपरेटर पैनल',
    customerPortal: 'ग्राहक पोर्टल',
    signIn: 'साइन इन',
    signOut: 'साइन आउट',
    largeTextLabel: 'बड़ा टेक्स्ट',
    stages: {
      'Parcel Received': 'पार्सल प्राप्त हुआ',
      'Drone Assigned': 'ड्रोन असाइन किया गया',
      'Mission Prepared': 'मिशन तैयार है',
      'Loaded on Drone': 'ड्रोन पर लोड हुआ',
      'In Transit': 'रास्ते में है',
      'Near Destination': 'मंज़िल के करीब',
      Delivered: 'डिलीवरी पूरी हुई',
    },
  },
};
