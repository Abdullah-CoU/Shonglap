import { z } from 'zod';
import { callClaudeJson } from './llm.js';
import { env } from '../config/env.js';

/**
 * @typedef {Object} ExtractedComplaint
 * @property {string} category
 * @property {string} description
 * @property {string} descriptionBn
 * @property {string} area
 * @property {string} landmark
 * @property {number|null} ward
 * @property {'low'|'medium'|'high'|'critical'} urgency
 * @property {string} urgencyReason
 * @property {'bn'|'en'|'banglish'} languageDetected
 * @property {string[]} missingFields
 * @property {boolean} isSpam
 * @property {string} contactPhone
 * @property {string} contactEmail
 */

/** Category list for the LLM prompt. */
const CATEGORIES = [
  'road', 'garbage', 'mosquito', 'streetlight', 'water', 'sewerage',
  'waterlogging', 'electricity', 'gas', 'construction', 'crime', 'traffic',
  'fire', 'pollution', 'noise', 'spam',
];

export const extractedComplaintSchema = z.object({
  category: z.enum(CATEGORIES).catch('spam'),
  description: z.string().default(''),  descriptionBn: z.string().default(''),
  area: z.string().default(''),
  landmark: z.string().default(''),
  ward: z.number().int().nullable().default(null),
  urgency: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  urgencyReason: z.string().default(''),
  languageDetected: z.enum(['bn', 'en', 'banglish']).default('bn'),
  missingFields: z.array(z.string()).default([]),
  isSpam: z.boolean().default(false),
  contactPhone: z.string().default(''),
  contactEmail: z.string().email().or(z.literal('')).default(''),
});

const SYSTEM_PROMPT = `You are an expert civic complaint extraction engine for Dhaka, Bangladesh.

Given a citizen's complaint (text and/or image descriptions), extract structured data and return ONLY a valid JSON object. No markdown, no explanation, no extra text.

Categories (choose exactly one):
${CATEGORIES.join(', ')}

Urgency rubric:
- critical: open manhole, exposed/live wire, gas leak, fire, building collapse, explosion, electrocution risk, missing person emergency
- high: no water supply, power outage >4h, major road blockage, garbage overflow with health risk, dengue mosquito breeding, waterlogging knee-deep
- medium: pothole, broken streetlight, low water pressure, minor drainage issue, illegal parking
- low: cosmetic issues, minor noise, spam

Language detection:
- "bn" if the input is primarily in Bangla script (বাংলা)
- "en" if primarily English
- "banglish" if Bangla written in Latin script (e.g. "rasta kharap", "pani nei")

missingFields: list only important gaps. "area" is required (if missing, include "area"). "landmark" is optional (do NOT include even if missing). Include "contactPhone" only if the complaint seems to need follow-up and no phone was provided.

isSpam: true if the message is clearly spam, advertisement, or irrelevant.

Return JSON with these exact fields:
{
  "category": "<one of the categories>",
  "description": "<1-2 sentence English summary>",
  "descriptionBn": "<Bangla description if applicable, else empty string>",
  "area": "<Dhaka area name, e.g. Gulshan, Mirpur, Dhanmondi>",
  "landmark": "<nearby landmark or empty string>",
  "ward": <ward number or null>,
  "urgency": "<low|medium|high|critical>",
  "urgencyReason": "<brief reason for urgency level>",
  "languageDetected": "<bn|en|banglish>",
  "missingFields": ["<field names>"],
  "isSpam": <true|false>,
  "contactPhone": "<phone or empty string>",
  "contactEmail": "<email or empty string>"
}`;

const mockExtract = ({ text, imageDescriptions = [] }) => {
  const combined = [text, ...imageDescriptions].join(' ').toLowerCase();

  // Language detection
  let languageDetected = 'en';
  if (/[\u0980-\u09FF]/.test(combined)) {
    languageDetected = 'bn';
  } else if (/\b(rasta|goli|pani|gor|mosha|moyla|bijli|bidyut|gas|gondho|bati|chula|jomi|dokhol)\b/.test(combined)) {
    languageDetected = 'banglish';
  }

  // Spam detection
  const spamKeywords = ['buy', 'cheap', 'lottery', 'win', 'followers', 'click here', 'free', 'offer', 'subscribe'];
  const isSpam = spamKeywords.filter((k) => combined.includes(k)).length >= 2;

  // Category detection (specific before general)
  let category = 'spam';
  if (isSpam) {
    category = 'spam';
  } else if (combined.includes('gas') || combined.includes('গ্যাস')) {
    category = 'gas';
  } else if (combined.includes('transformer') || combined.includes('bijli') || combined.includes('bidyut') || combined.includes('electricity') || combined.includes('power') || combined.includes('বিদ্যুৎ') || combined.includes('outage') || combined.includes('loadshedding') || combined.includes('লোডশেডিং') || combined.includes('লোড শেডিং') || combined.includes('live wire') || combined.includes('hanging') || combined.includes('wire') || combined.includes('তার') || combined.includes('voltage')) {
    category = 'electricity';
  } else if (combined.includes('waterlogging') || combined.includes('waterlog') || combined.includes('জলাবদ্ধতা') || combined.includes('waterlogged')) {
    category = 'waterlogging';
  } else if (combined.includes('pollution') || combined.includes('factory') || combined.includes('industrial') || combined.includes('পরিবেশ') || combined.includes('দূষণ')) {
    category = 'pollution';
  } else if (combined.includes('noise') || combined.includes('sound') || combined.includes('loud') || combined.includes('শব্দ') || combined.includes('disturbing')) {
    category = 'noise';
  } else if (combined.includes('garbage') || combined.includes('waste') || combined.includes('trash') || combined.includes('moyla') || combined.includes('ময়লা') || combined.includes('আবর্জনা') || combined.includes('dustbin')) {
    category = 'garbage';
  } else if (combined.includes('mosquito') || combined.includes('dengue') || combined.includes('মশা') || combined.includes('ডেঙ্গু') || combined.includes('mosha')) {
    category = 'mosquito';
  } else if (combined.includes('fire') || combined.includes('আগুন') || combined.includes('blaze') || combined.includes('burn')) {
    category = 'fire';
  } else if (combined.includes('streetlight') || combined.includes('street light') || combined.includes('lamp') || combined.includes('বাতি') || combined.includes('bati')) {
    category = 'streetlight';
  } else if (combined.includes('pothole') || combined.includes('gor') || combined.includes('গর্ত') || combined.includes('footpath') || combined.includes('ফুটপাথ') || combined.includes('highway') || combined.includes('bridge') || combined.includes('flyover') || combined.includes('overpass') || combined.includes('রোড') || combined.includes('রাস্তা')) {
    category = 'road';
  } else if (combined.includes('signal') || combined.includes('parking') || combined.includes('congestion') || combined.includes('tow') || combined.includes('zebra')) {
    category = 'traffic';
  } else if (combined.includes('building') || combined.includes('construction') || (combined.includes('illegal') && !combined.includes('parking')) || combined.includes('unauthorized') || combined.includes('ভবন') || combined.includes('নির্মাণ') || combined.includes('অবৈধ') || combined.includes('rajuk') || combined.includes('রাজউক') || combined.includes('extension')) {
    category = 'construction';
  } else if (combined.includes('traffic') || combined.includes('jam') || combined.includes('ট্রাফিক') || combined.includes('জ্যাম')) {
    category = 'traffic';
  } else if (combined.includes('road') || combined.includes('রাস্তা') || combined.includes('rasta') || combined.includes('lane') || combined.includes('গলি') || combined.includes('রোড')) {
    category = 'road';
  } else if (combined.includes('police') || combined.includes('crime') || combined.includes('theft') || combined.includes('robbery') || combined.includes('পুলিশ') || combined.includes('অপরাধ') || combined.includes('চুরি')) {
    category = 'crime';
  } else if (combined.includes('sewerage') || combined.includes('sewage') || combined.includes('overflow') || combined.includes('সুয়ারেজ')) {
    category = 'sewerage';
  } else if (combined.includes('water') || combined.includes('পানি') || combined.includes('pani') || combined.includes('wasa') || combined.includes('ওয়াসা') || combined.includes('tap') || combined.includes('pipe')) {
    category = 'water';
  } else if (combined.includes('smoke') || combined.includes('ধোঁয়া')) {
    category = 'fire';
  }

  // Urgency detection
  let urgency = 'medium';
  let urgencyReason = 'Standard priority';

  if (isSpam) {
    urgency = 'low';
    urgencyReason = 'Spam message';
  } else if (combined.includes('gas leak') || combined.includes('গ্যাস লিক') || combined.includes('live wire') || combined.includes('hanging') || combined.includes('open manhole') || combined.includes('fire') || combined.includes('আগুন') || combined.includes('explosion') || combined.includes('বিস্ফোরণ') || combined.includes('collapse') || combined.includes('ধস') || combined.includes('transformer exploded')) {
    urgency = 'critical';
    urgencyReason = 'Immediate safety hazard (gas leak / live wire / fire / collapse)';
  } else if (combined.includes('no water') || combined.includes('পানি নেই') || combined.includes('pani nei') || combined.includes('outage') || combined.includes('বিদ্যুৎ নেই') || combined.includes('bidyut nei') || combined.includes('overflow') || combined.includes('waterlogging') || combined.includes('waterlogged') || combined.includes('dengue') || combined.includes('ডেঙ্গু') || combined.includes('bad smell') || combined.includes('garbage pile') || combined.includes('mosha') || combined.includes('traffic jam') || combined.includes('huge pothole')) {
    urgency = 'high';
    urgencyReason = 'Service disruption or health risk';
  } else if (combined.includes('pothole') || combined.includes('গর্ত') || combined.includes('broken') || combined.includes('ভাঙা')) {
    urgency = 'medium';
    urgencyReason = 'Infrastructure damage';
  }

  // Area detection
  const areas = ['Gulshan', 'Banani', 'Dhanmondi', 'Uttara', 'Mirpur', 'Motijheel', 'Old Dhaka', 'Jatrabari', 'Mohammadpur', 'Tejgaon', 'Badda', 'Rampura', 'Baridhara', 'Mohakhali', 'Kafrul', 'Cantonment', 'Wari', 'Lalbagh', 'Sutrapur', 'Gendaria', 'Shyampur', 'Demra', 'Kadamtali', 'Adabar', 'Hazaribagh', 'Savar'];
  let area = '';
  for (const a of areas) {
    if (combined.toLowerCase().includes(a.toLowerCase())) {
      area = a;
      break;
    }
  }
  if (!area) {
    const bnAreas = {
      'গুলশান': 'Gulshan', 'বনানী': 'Banani', 'ধানমন্ডি': 'Dhanmondi', 'উত্তরা': 'Uttara',
      'মিরপুর': 'Mirpur', 'মতিঝিল': 'Motijheel', 'পুরান ঢাকা': 'Old Dhaka', 'যাত্রাবাড়ী': 'Jatrabari',
      'মোহাম্মদপুর': 'Mohammadpur', 'তেজগাঁও': 'Tejgaon', 'বড্ডা': 'Badda', 'রামপুরা': 'Rampura',
      'বারিধারা': 'Baridhara', 'মোহাখালি': 'Mohakhali', 'কাফরুল': 'Kafrul', 'ক্যান্টনমেন্ট': 'Cantonment',
      'ওয়ারী': 'Wari', 'লালবাগ': 'Lalbagh', 'সুত্রাপুর': 'Sutrapur', 'গেন্ডারিয়া': 'Gendaria',
      'শ্যামপুর': 'Shyampur', 'দেমড়া': 'Demra', 'কদমতলী': 'Kadamtali', 'আদাবর': 'Adabar',
      'হাজারীবাগ': 'Hazaribagh', 'সাভার': 'Savar',
    };
    for (const [bn, en] of Object.entries(bnAreas)) {
      if (combined.includes(bn)) {
        area = en;
        break;
      }
    }
  }

  // Ward detection
  let ward = null;
  const wardMatch = combined.match(/ward\s*(\d+)/i) || combined.match(/(\d+)\s*(?:no|number)\s*ward/i);
  if (wardMatch) {
    ward = parseInt(wardMatch[1], 10);
  }

  // Landmark detection
  let landmark = '';
  const landmarkMatch = combined.match(/near\s+([^.]+)/i) || combined.match(/beside\s+([^.]+)/i);
  if (landmarkMatch) {
    landmark = landmarkMatch[1].trim().substring(0, 100);
  }

  // Contact phone
  let contactPhone = '';
  const phoneMatch = combined.match(/(\+?880\d{10}|\b01\d{9}\b)/);
  if (phoneMatch) {
    contactPhone = phoneMatch[1];
  }

  // Contact email
  let contactEmail = '';
  const emailMatch = combined.match(/[\w.-]+@[\w.-]+\.\w+/);
  if (emailMatch) {
    contactEmail = emailMatch[0];
  }

  const description = text.length > 0 ? text.substring(0, 200) : 'Complaint submitted.';
  const descriptionBn = languageDetected === 'bn' ? text : '';

  const missingFields = [];
  if (!area) missingFields.push('area');

  return {
    category,
    description,
    descriptionBn,
    area,
    landmark,
    ward,
    urgency,
    urgencyReason,
    languageDetected,
    missingFields,
    isSpam,
    contactPhone,
    contactEmail,
  };
};

export async function extractComplaint({ text = '', imageDescriptions = [] }) {
  const userMessage = [
    `Complaint text: ${text}`,
    imageDescriptions.length > 0
      ? `Image descriptions: ${imageDescriptions.join('; ')}`
      : '',
  ].filter(Boolean).join('\n');

  const messages = [{ role: 'user', content: userMessage }];

  const mockFn = () => mockExtract({ text, imageDescriptions });

  const result = await callClaudeJson({
    system: SYSTEM_PROMPT,
    messages,
    schema: extractedComplaintSchema,
    mockFn,
  });

  if (!result.area && !result.missingFields.includes('area')) {
    result.missingFields.push('area');
  }

  return result;
}
