export interface SupportResource {
  id: string;
  name: string;
  kind: 'emergency' | 'listening' | 'health-service';
  description: string;
  scope: string;
  sourceName: string;
  sourceUrl: string;
  checkedOn: string;
  callNumber?: string;
  textNumber?: string;
}

export interface SupportCountry {
  code: string;
  name: string;
  resources: readonly SupportResource[];
}

// Checked against the named government or service-provider sources, not a live availability feed.
const checkedOn = '2026-11-04';
export const supportCountries: readonly SupportCountry[] = [
  {
    code: 'DE', name: 'Germany', resources: [
      { id: 'de-emergency', name: 'Emergency services', kind: 'emergency', description: 'Call for immediate danger to life or a serious medical emergency.', scope: 'Germany', callNumber: '112', sourceName: 'Federal health portal: gesund.bund.de', sourceUrl: 'https://gesund.bund.de/notfallnummern', checkedOn },
      { id: 'de-listening', name: 'TelefonSeelsorge', kind: 'listening', description: 'Telephone support for distress, loneliness and personal crises. The listed telephone service is in German.', scope: 'Germany · German-language telephone support', callNumber: '116123', sourceName: 'Federal health portal: gesund.bund.de', sourceUrl: 'https://gesund.bund.de/notfallnummern', checkedOn },
    ],
  },
  {
    code: 'NG', name: 'Nigeria', resources: [
      { id: 'ng-emergency', name: 'Emergency response', kind: 'emergency', description: 'The Nigerian Communications Commission lists 112 for calls to emergency response agencies. This listing does not confirm local response availability.', scope: 'Nigeria · emergency communications', callNumber: '112', sourceName: 'Nigerian Communications Commission', sourceUrl: 'https://www.ncc.gov.ng/node/3132', checkedOn },
      { id: 'ng-yaba', name: 'Federal Neuro-Psychiatric Hospital, Yaba', kind: 'health-service', description: 'Read the hospital’s assessment and registration guidance for its Yaba and Oshodi services. This is a hospital resource in Lagos, not a national crisis telephone line.', scope: 'Lagos · Yaba and Oshodi', sourceName: 'Federal Neuro-Psychiatric Hospital, Yaba', sourceUrl: 'https://fnphyaba.gov.ng/health-information/', checkedOn },
    ],
  },
  {
    code: 'GB', name: 'United Kingdom', resources: [
      { id: 'gb-emergency', name: 'Emergency services', kind: 'emergency', description: 'Call for immediate danger or a medical emergency and ask for the service you need.', scope: 'United Kingdom', callNumber: '999', sourceName: 'GOV.UK: national emergency numbers', sourceUrl: 'https://www.gov.uk/guidance/999-and-112-the-uks-national-emergency-numbers', checkedOn },
      { id: 'gb-listening', name: 'Samaritans', kind: 'listening', description: 'Speak with a volunteer about what is troubling you. The provider explains how its listening service works and its confidentiality limits.', scope: 'United Kingdom', callNumber: '116123', sourceName: 'Samaritans: telephone support', sourceUrl: 'https://www.samaritans.org/how-we-can-help/contact-samaritan/talk-us-phone/', checkedOn },
      { id: 'gb-england-urgent', name: 'NHS urgent mental health help', kind: 'health-service', description: 'In England, call 111 and select the mental health option for urgent help. The NHS page also explains when to use emergency care.', scope: 'England · NHS guidance', callNumber: '111', sourceName: 'NHS: urgent mental health help', sourceUrl: 'https://www.nhs.uk/nhs-services/mental-health-services/where-to-get-urgent-help-for-mental-health/', checkedOn },
    ],
  },
  {
    code: 'US', name: 'United States', resources: [
      { id: 'us-emergency', name: 'Emergency services', kind: 'emergency', description: 'Call when someone is in immediate danger or has a medical emergency.', scope: 'United States', callNumber: '911', sourceName: 'National 911 Program: calling 911', sourceUrl: 'https://www.911.gov/calling-911/', checkedOn },
      { id: 'us-lifeline', name: '988 Suicide & Crisis Lifeline', kind: 'listening', description: 'Call or text 988 for crisis support. The provider’s site offers chat and explains language and accessibility options.', scope: 'United States', callNumber: '988', textNumber: '988', sourceName: '988 Lifeline: get help', sourceUrl: 'https://988lifeline.org/get-help/', checkedOn },
    ],
  },
];

const officialHosts = new Set(['gesund.bund.de', 'www.ncc.gov.ng', 'fnphyaba.gov.ng', 'www.gov.uk', 'www.samaritans.org', 'www.nhs.uk', 'www.911.gov', '988lifeline.org']);

/** Never substitute a country inferred from the device, language, address or profile. */
export function getSupportCountry(code: unknown): SupportCountry | null {
  return typeof code === 'string' ? supportCountries.find(country => country.code === code) ?? null : null;
}

/** Keep service links on the reviewed primary hosts, with no embedded credentials or scripts. */
export function officialSupportUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value !== value.trim()) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !officialHosts.has(url.hostname)) return null;
    return url.href;
  } catch { return null; }
}

export function supportContactUrl(channel: 'call' | 'text', number: unknown): string | null {
  if ((channel !== 'call' && channel !== 'text') || typeof number !== 'string' || !/^\+?[0-9]{3,15}$/.test(number)) return null;
  return `${channel === 'call' ? 'tel' : 'sms'}:${number}`;
}
