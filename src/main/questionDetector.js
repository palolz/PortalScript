const { extractJargon } = require('./interviewAssist');
const STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'that',
  'this',
  'with',
  'you',
  'have',
  'are',
  'was',
  'were',
  'from',
  'what',
  'how',
  'why',
  'when',
  'where',
  'who',
  'which',
  'can',
  'could',
  'would',
  'should',
  'your',
  'about',
  'into',
  'like',
  'just',
  'some',
  'more',
  'very',
  'also',
  'well',
  'sure',
  'nowadays',
  'matter',
  'anyway',
  'experience',
  'tell',
  'explain',
  'walk',
  'through',
  'difference',
  'between',
  'used',
  'using',
  'work',
  'worked',
  'working',
  'does',
  'compared',
  'handle',
  'there',
  'they',
  'their',
  'them',
  'then',
  'than',
  'been',
  'being',
  'over',
  'under',
  'such',
  'terms',
  'choose',
  'sleeping',
  'back',
  'routine',
  'applied',
  'really',
  'show',
  'know',
  'something',
  'written',
  'software',
  'better',
  'say',
  'saying',
  'lets',
  "let's",
  'getting',
  'fast',
  'engine',
  'errors',
  'take',
  'look',
  'will',
  'copy',
  'paste',
  'speaker',
  'sticking',
  'maybe',
  'simple',
  'location',
  'application',
  'job'
]);

const TECH_PHRASE_REGEX = new RegExp(
  '\\b(' +
    [
      'global positioning(?: system)?',
      'geo\\s*telematics(?: application)?',
      'borrow checker',
      'memory safety',
      'garbage collection',
      'zero-cost abstractions',
      'smart pointers?',
      'move semantics',
      'thread safety',
      'race condition',
      'rate limiter',
      'load balancer',
      'event loop',
      'distributed systems?',
      'system design',
      'dependency injection',
      'cap theorem',
      'kalman filter',
      'sensor fusion',
      'state estimation',
      'control loop',
      'pid controller',
      'model predictive control',
      'finite element(?: analysis| method)?',
      'structural analysis',
      'can bus',
      'embedded systems?',
      'real-time operating system',
      'autonomous driving',
      'computer vision',
      'machine learning',
      'neural networks?',
      'signal processing',
      'power electronics',
      'brushless motor',
      'stepper motor',
      'servo motor',
      'inverse kinematics',
      'forward kinematics',
      'stress analysis',
      'fatigue analysis',
      'modal analysis',
      'heat transfer',
      'fluid dynamics',
      '[a-z]{3,}\\s+(?:positioning|telematics|geotelematics|kinematics|dynamics|mechatronics|architecture|protocol|controller|algorithm|concurrency|encryption|simulation|optimization|hydraulics|pneumatics|microcontroller|firmware|compiler|virtualization|containers?)'
    ].join('|') +
    ')\\b',
  'gi'
);

const SINGLE_TECH_REGEX =
  /(?:C\+\+|C#|\b(?:Rust|Python|JavaScript|TypeScript|Golang|SQL|Linux|RTOS|AUTOSAR|MISRA|CAN|LIN|FlexRay|ROS2?|SLAM|GNSS|GPS|LiDAR|IMU|PID|MPC|FEA|FEM|CFD|CAD|SolidWorks|ANSYS|MATLAB|Simulink|Docker|Kubernetes|gRPC|REST|GraphQL|WebSockets?|FPGA|VHDL|Verilog|ARM|STM32|ESP32|CUDA|OpenCV|PyTorch|TensorFlow|geotelematics|telematics|genetics|mechatronics|kinematics|thermodynamics|aerodynamics|concurrency|multithreading|deadlock|polymorphism|encapsulation|sharding|replication|caching|microservices)\b)/gi;

// Keyword/phrase matcher tuned for technical talk. A local NER model would be needed for other domains.
function extractSuggestions(segments = [], focusSegmentId = null) {
  if (!segments.length) return [];
  const targetSeg = focusSegmentId ? segments.find((s) => s.id === focusSegmentId) : null;
  const windowSegs = targetSeg ? [targetSeg] : segments.slice(-3);
  const text = windowSegs.map((s) => s.text).join(' ');

  const seen = new Set();
  const terms = [];
  const addTerm = (t) => {
    const clean = t
      .replace(/^[^a-zA-Z0-9+#]+|[^a-zA-Z0-9+#]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const lower = clean.toLowerCase();
    if (
      clean.length < 2 ||
      STOPWORDS.has(lower) ||
      seen.has(lower) ||
      terms.some((e) => e.toLowerCase().includes(lower) || lower.includes(e.toLowerCase()))
    ) {
      return;
    }
    seen.add(lower);
    terms.push(clean);
  };

  // 1. Multi-word technical phrases first so "global positioning" or "Geo telematics" stays clustered as one chip
  const phrases = text.match(TECH_PHRASE_REGEX) || [];
  for (const { term } of extractJargon(text)) addTerm(term);
  for (const p of phrases) addTerm(p);

  // 2. Single-word technical terms (only if not already part of a matched phrase)
  const singles = text.match(SINGLE_TECH_REGEX) || [];
  for (const s of singles) addTerm(s);

  return terms.slice(0, 8);
}

// Splits a single mic into me (close, loud) vs other (far, quieter) by relative loudness.
// Speakers at similar volume need real speaker embeddings to tell apart.
function classifyMicSpeaker({
  rawSpeaker,
  text,
  avgRms = 0,
  isFinal = true,
  micMode = 'direct',
  rmsHistory = [],
  lastSystemRmsAt = 0,
  lastOtherText = ''
}) {
  if (rawSpeaker === 'other') return { speaker: 'other', isBleed: false };

  // Drop mic bleed if system audio was active within 900ms and mic text is a substring of system text
  if (Date.now() - lastSystemRmsAt < 900 && lastOtherText) {
    const normMic = text.toLowerCase().trim();
    const normSys = lastOtherText.toLowerCase().trim();
    if (normMic.length > 3 && (normSys.includes(normMic) || normMic.includes(normSys))) {
      return { speaker: 'other', isBleed: true };
    }
  }

  if (micMode !== 'room') return { speaker: 'me', isBleed: false };

  // Only whole utterances feed the loudness baseline; streaming partials would flood it with near-duplicates
  if (isFinal && avgRms > 0.005) {
    rmsHistory.push(avgRms);
    if (rmsHistory.length > 30) rmsHistory.shift();
  }
  const sorted = [...rmsHistory].sort((a, b) => a - b);
  const medianRms = sorted.length >= 5 ? sorted[Math.floor(sorted.length / 2)] : 0;

  // Far-field voice (other person through speakers) must be clearly quieter than the user's typical level
  if (medianRms > 0 && avgRms > 0 && avgRms < medianRms * 0.55) {
    return { speaker: 'other', isBleed: false };
  }

  return { speaker: 'me', isBleed: false };
}

module.exports = { extractSuggestions, classifyMicSpeaker };
