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
    simple: {
      modeBtn: string;
      standardBtn: string;
      listen: string;
      stopAudio: string;
      tapParcelPrompt: string;
      selectedParcel: string;
      whereIsParcel: string;
      whereIsParcelSub: string;
      seeOnMap: string;
      seeOnMapSub: string;
      askHelp: string;
      askHelpSub: string;
      backHome: string;
      speakParcel: string;
      listeningNow: string;
      step1: string;
      step2: string;
      step3: string;
      statusPacked: string;
      statusFlying: string;
      statusDelivered: string;
      arrivingAround: string;
      deliveredSafely: string;
      droneName: string;
      mapBannerSub: string;
      helpTitle: string;
      helpSpeakBtn: string;
      helpSpeakingReply: string;
      helpQ1: string;
      helpQ2: string;
      helpQ3: string;
      noParcels: string;
    };
    otpGate: {
      title: string;
      subtitle: string;
      parcelPlaceholder: string;
      sendOtpBtn: string;
      sendingOtp: string;
      otpSentTo: string;
      otpPlaceholder: string;
      verifyBtn: string;
      verifying: string;
      resendOtp: string;
      changeParcel: string;
      checkAnother: string;
      invalidParcel: string;
      connectGmailHint: string;
      gmailConnected: string;
      confirmEmailTitle: string;
      confirmEmailBody: string;
      confirmSendBtn: string;
      cancelBtn: string;
      checkInboxBtn: string;
    };
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
    simple: {
      modeBtn: 'Simple Mode',
      standardBtn: 'Full View',
      listen: 'Listen',
      stopAudio: 'Stop Voice',
      tapParcelPrompt: 'Tap your parcel box below to check it',
      selectedParcel: 'Selected Parcel',
      whereIsParcel: 'Where is my parcel?',
      whereIsParcelSub: 'See 3 easy steps',
      seeOnMap: 'See Drone on Map',
      seeOnMapSub: 'Watch it fly to you',
      askHelp: 'Ask for Help',
      askHelpSub: 'Tap a question or speak',
      backHome: 'Back to Home',
      speakParcel: 'Speak Parcel Number',
      listeningNow: 'Listening... Please speak now',
      step1: '1. Packed',
      step2: '2. Flying to You',
      step3: '3. Delivered',
      statusPacked: 'Your parcel is packed and getting ready.',
      statusFlying: 'The drone is flying to your home now.',
      statusDelivered: 'Your parcel has arrived safely at your door.',
      arrivingAround: 'Arriving around',
      deliveredSafely: 'Delivered safely',
      droneName: 'Drone',
      mapBannerSub: 'Blue line shows the drone coming to your home.',
      helpTitle: 'Tap a button below for easy help',
      helpSpeakBtn: 'Tap & Speak Your Question',
      helpSpeakingReply: 'Answer',
      helpQ1: 'Where is my parcel right now?',
      helpQ2: 'How do I take my parcel when the drone lands?',
      helpQ3: 'Is my parcel on time today?',
      noParcels: 'No parcels are scheduled right now.',
    },
    otpGate: {
      title: 'Check Your Parcel via Gmail',
      subtitle: 'Enter your parcel number first. We will send a 6-digit OTP to the Gmail address linked with your parcel.',
      parcelPlaceholder: 'Parcel Number (e.g. AEG-1045 or AEG-1020)',
      sendOtpBtn: 'Send OTP via Gmail',
      sendingOtp: 'Sending Email OTP...',
      otpSentTo: '6-digit OTP sent to registered Gmail',
      otpPlaceholder: 'Enter 6-digit OTP from Gmail',
      verifyBtn: 'Verify & View My Parcel',
      verifying: 'Verifying OTP...',
      resendOtp: 'Resend Gmail OTP',
      changeParcel: 'Change Parcel Number',
      checkAnother: 'Check Another Parcel',
      invalidParcel: 'Invalid Parcel Number',
      connectGmailHint: 'Sign in with Google to send the verification OTP directly via Gmail',
      gmailConnected: 'Gmail ready to send OTP',
      confirmEmailTitle: 'Send Verification Email via Gmail?',
      confirmEmailBody: 'This will send a 6-digit AEGIS verification code from your Gmail account to the email address linked with parcel',
      confirmSendBtn: 'Confirm & Send Email',
      cancelBtn: 'Cancel',
      checkInboxBtn: 'Check My Gmail Inbox for OTP',
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
    simple: {
      modeBtn: 'సులభ మోడ్',
      standardBtn: 'పూర్తి వీక్షణ',
      listen: 'వినండి',
      stopAudio: 'ఆపండి',
      tapParcelPrompt: 'తెలుసుకోవడానికి మీ పార్శిల్‌పై నొక్కండి',
      selectedParcel: 'ఎంచుకున్న పార్శిల్',
      whereIsParcel: 'నా పార్శిల్ ఎక్కడ ఉంది?',
      whereIsParcelSub: '3 సులభ దశలు చూడండి',
      seeOnMap: 'మ్యాప్‌లో డ్రోన్ చూడండి',
      seeOnMapSub: 'డ్రోన్ వస్తున్న దారి',
      askHelp: 'సహాయం అడగండి',
      askHelpSub: 'ప్రశ్న నొక్కండి లేదా మాట్లాడండి',
      backHome: 'మొదటి పేజీకి వెళ్ళండి',
      speakParcel: 'పార్శిల్ నంబర్ చెప్పండి',
      listeningNow: 'వింటున్నాము... ఇప్పుడు మాట్లాడండి',
      step1: '1. ప్యాక్ అయింది',
      step2: '2. వస్తోంది',
      step3: '3. అందింది',
      statusPacked: 'మీ పార్శిల్ సిద్ధంగా ఉంది, త్వరలో బయలుదేరుతుంది.',
      statusFlying: 'డ్రోన్ మీ ఇంటికి వస్తోంది.',
      statusDelivered: 'మీ పార్శిల్ సురక్షితంగా చేరింది.',
      arrivingAround: 'చేరే సమయం',
      deliveredSafely: 'సురక్షితంగా అందింది',
      droneName: 'డ్రోన్',
      mapBannerSub: 'నీలం గీత మీ ఇంటికి వచ్చే డ్రోన్ దారిని చూపుతుంది.',
      helpTitle: 'సహాయం కోసం కింది బటన్ నొక్కండి',
      helpSpeakBtn: 'నొక్కి మీ ప్రశ్న అడగండి',
      helpSpeakingReply: 'సమాధానం',
      helpQ1: 'నా పార్శిల్ ఇప్పుడు ఎక్కడ ఉంది?',
      helpQ2: 'డ్రోన్ వచ్చినప్పుడు పార్శిల్ ఎలా తీసుకోవాలి?',
      helpQ3: 'ఈ రోజు నా పార్శిల్ సమయానికి వస్తుందా?',
      noParcels: 'ప్రస్తుతం పార్శిళ్లు ఏవీ లేవు.',
    },
    otpGate: {
      title: 'Gmail ద్వారా మీ పార్శిల్ చూడండి',
      subtitle: 'ముందుగా మీ పార్శిల్ నంబర్ నమోదు చేయండి. దానికి లింక్ అయిన Gmail కు 6 అంకెల OTP పంపబడుతుంది.',
      parcelPlaceholder: 'పార్శిల్ నంబర్ (ఉదా. AEG-1045)',
      sendOtpBtn: 'Gmail ద్వారా OTP పంపండి',
      sendingOtp: 'ఇమెయిల్ పంపిస్తోంది...',
      otpSentTo: 'నమోదు చేసిన Gmail కు OTP పంపబడింది',
      otpPlaceholder: 'Gmail లో వచ్చిన 6 అంకెల OTP',
      verifyBtn: 'నిర్ధారించి పార్శిల్ చూడండి',
      verifying: 'నిర్ధారిస్తోంది...',
      resendOtp: 'మళ్లీ Gmail OTP పంపండి',
      changeParcel: 'మరో పార్శిల్ నంబర్',
      checkAnother: 'మరో పార్శిల్ చూడండి',
      invalidParcel: 'Invalid Parcel Number',
      connectGmailHint: 'నేరుగా Gmail ద్వారా OTP పంపడానికి Google తో సైన్ ఇన్ చేయండి',
      gmailConnected: 'Gmail OTP పంపడానికి సిద్ధంగా ఉంది',
      confirmEmailTitle: 'Gmail ద్వారా OTP ఇమెయిల్ పంపాలా?',
      confirmEmailBody: 'మీ Gmail ఖాతా నుండి ఈ పార్శిల్‌కు లింక్ అయిన ఇమెయిల్‌కు 6 అంకెల OTP పంపబడుతుంది:',
      confirmSendBtn: 'నిర్ధారించి ఇమెయిల్ పంపండి',
      cancelBtn: 'రద్దు చేయండి',
      checkInboxBtn: 'నా Gmail ఇన్‌బాక్స్‌లో OTP చూడండి',
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
    simple: {
      modeBtn: 'आसान मोड',
      standardBtn: 'पूरा व्यू',
      listen: 'सुनें',
      stopAudio: 'रोकें',
      tapParcelPrompt: 'जानकारी देखने के लिए नीचे अपने पार्सल पर दबाएं',
      selectedParcel: 'चुना हुआ पार्सल',
      whereIsParcel: 'मेरा पार्सल कहाँ है?',
      whereIsParcelSub: '3 आसान चरण देखें',
      seeOnMap: 'मैप पर ड्रोन देखें',
      seeOnMapSub: 'ड्रोन को आते हुए देखें',
      askHelp: 'मदद मांगें',
      askHelpSub: 'सवाल दबाएं या बोलें',
      backHome: 'होम पर वापस जाएं',
      speakParcel: 'पार्सल नंबर बोलें',
      listeningNow: 'सुन रहे हैं... कृपया अभी बोलें',
      step1: '1. पैक हुआ',
      step2: '2. रास्ते में',
      step3: '3. पहुँच गया',
      statusPacked: 'आपका पार्सल तैयार है और जल्द निकलेगा।',
      statusFlying: 'ड्रोन आपके घर की ओर उड़ रहा है।',
      statusDelivered: 'आपका पार्सल सुरक्षित रूप से पहुँच गया है।',
      arrivingAround: 'आने का समय',
      deliveredSafely: 'सुरक्षित पहुँचा',
      droneName: 'ड्रोन',
      mapBannerSub: 'नीली लाइन दिखाती है कि ड्रोन आपके घर आ रहा है।',
      helpTitle: 'आसान मदद के लिए नीचे बटन दबाएं',
      helpSpeakBtn: 'दबाएं और अपना सवाल बोलें',
      helpSpeakingReply: 'जवाब',
      helpQ1: 'मेरा पार्सल अभी कहाँ है?',
      helpQ2: 'ड्रोन आने पर मुझे पार्सल कैसे लेना है?',
      helpQ3: 'क्या आज मेरा पार्सल समय पर आएगा?',
      noParcels: 'अभी कोई पार्सल सक्रिय नहीं है।',
    },
    otpGate: {
      title: 'Gmail द्वारा अपना पार्सल देखें',
      subtitle: 'पहले अपना पार्सल नंबर दर्ज करें। आपके पार्सल से जुड़े Gmail पर 6-अंकीय OTP भेजा जाएगा।',
      parcelPlaceholder: 'पार्सल नंबर (जैसे AEG-1045)',
      sendOtpBtn: 'Gmail द्वारा OTP भेजें',
      sendingOtp: 'ईमेल भेजा जा रहा है...',
      otpSentTo: 'पंजीकृत Gmail पर 6-अंकीय OTP भेजा गया',
      otpPlaceholder: 'Gmail से 6-अंकीय OTP दर्ज करें',
      verifyBtn: 'सत्यापित करें और पार्सल देखें',
      verifying: 'जाँच हो रही है...',
      resendOtp: 'फिर से Gmail OTP भेजें',
      changeParcel: 'पार्सल नंबर बदलें',
      checkAnother: 'दूसरा पार्सल देखें',
      invalidParcel: 'Invalid Parcel Number',
      connectGmailHint: 'सीधे Gmail से OTP ईमेल भेजने के लिए Google से साइन इन करें',
      gmailConnected: 'Gmail OTP भेजने के लिए तैयार है',
      confirmEmailTitle: 'Gmail से OTP ईमेल भेजें?',
      confirmEmailBody: 'आपके Gmail खाते से इस पार्सल से जुड़े ईमेल पर 6-अंकीय कोड भेजा जाएगा:',
      confirmSendBtn: 'पुष्टि करें और ईमेल भेजें',
      cancelBtn: 'रद्द करें',
      checkInboxBtn: 'मेरे Gmail इनबॉक्स से OTP जाँचें',
    },
  },
};
