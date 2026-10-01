// Domain-specific entity extraction: orders & tracking, travel, careers, security events.

export interface OrderEntities {
  orderNumber: string | null;
  carrier: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  items: string[];
}

const TRACKING: { carrier: string; re: RegExp; url: (n: string) => string }[] = [
  { carrier: "UPS", re: /\b(1Z[0-9A-Z]{16})\b/, url: (n) => `https://www.ups.com/track?tracknum=${n}` },
  { carrier: "Amazon", re: /\b(TBA\d{9,12})\b/, url: () => "https://www.amazon.com/gp/your-account/order-history" },
  { carrier: "USPS", re: /\b(9[2-5]\d{20}(?:\d{4})?|[A-Z]{2}\d{9}US)\b/, url: (n) => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${n}` },
  {
    carrier: "FedEx",
    re: /(?:fedex|tracking (?:number|#|no\.?|id))[^\n\d]{0,40}?\b(\d{12}|\d{15}|\d{20})\b/i,
    url: (n) => `https://www.fedex.com/fedextrack/?trknbr=${n}`,
  },
  { carrier: "DHL", re: /dhl[^\n\d]{0,60}?\b(\d{10})\b/i, url: (n) => `https://www.dhl.com/us-en/home/tracking/tracking-express.html?tracking-id=${n}` },
];

const CARRIER_NAMES = /\b(UPS|USPS|FedEx|DHL|OnTrac|LaserShip|Amazon Logistics|Royal Mail|Canada Post|India Post|Delhivery|Blue Dart|Ecom Express|Purolator|Australia Post)\b/;

export function extractOrder(text: string, subject: string): OrderEntities {
  const haystack = `${subject}\n${text}`;
  const orderMatch =
    /\border\s*(?:#|no\.?|number|num|id)\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{3,28})\b/i.exec(haystack) ??
    /\border\s+([0-9][0-9-]{5,28})\b/i.exec(haystack) ??
    /#\s?([0-9]{3}-[0-9]{7}-[0-9]{7})\b/.exec(haystack);
  const orderNumber = orderMatch && /\d/.test(orderMatch[1]!) ? orderMatch[1]! : null;
  let carrier: string | null = null;
  let trackingNumber: string | null = null;
  let trackingUrl: string | null = null;
  for (const def of TRACKING) {
    const match = def.re.exec(haystack);
    if (match) {
      carrier = def.carrier;
      trackingNumber = match[1]!;
      trackingUrl = def.url(match[1]!);
      break;
    }
  }
  if (!carrier) carrier = CARRIER_NAMES.exec(haystack)?.[1] ?? null;
  const items: string[] = [];
  const itemRe = /^\s*(?:\d+\s?[x×]\s+)?([A-Z][^\n$€£₹]{3,80}?)\s*(?:\n\s*)?(?:Qty|Quantity)\s*[:\s]\s*\d+/gim;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(text)) && items.length < 3) {
    const name = m[1]!.trim();
    if (!/^(item|items|product|description|qty|quantity|price|total|subtotal)$/i.test(name)) items.push(name);
  }
  return { orderNumber, carrier, trackingNumber, trackingUrl, items };
}

export interface TravelEntities {
  confirmation: string | null;
  flights: string[];
  route: { from: string; to: string } | null;
  hotel: string | null;
}

const AIRLINE_CODES = "AA|UA|DL|WN|B6|AS|NK|F9|HA|AC|WS|AI|6E|UK|SG|EK|QR|EY|LH|BA|AF|KL|SQ|CX|NH|JL|TK|VS|IB|AZ|LX|QF|NZ|AM|AV|CM|LA|G4|SY";

export function extractTravel(text: string, subject: string): TravelEntities {
  const haystack = `${subject}\n${text}`;
  const conf =
    /\b(?:[Cc]onfirmation|CONFIRMATION|[Bb]ooking|BOOKING|[Rr]eservation|RESERVATION|[Rr]ecord [Ll]ocator|PNR|[Tt]rip|[Ii]tinerary)\s*(?:[Cc]ode|[Nn]umber|#|[Nn]o\.?|[Rr]eference|[Rr]ef|ID)?\s*(?:is|:|#)?\s*:?\s*([A-Z0-9]{5,10})\b/.exec(haystack);
  const confirmation = conf && /[A-Z]/.test(conf[1]!) && /\d|^[A-Z]{6}$/.test(conf[1]!) ? conf[1]! : null;
  const flights = new Set<string>();
  const codeRe = new RegExp(`\\b(${AIRLINE_CODES})\\s?(\\d{1,4})\\b`, "g");
  let match: RegExpExecArray | null;
  while ((match = codeRe.exec(haystack)) && flights.size < 4) {
    const context = haystack.slice(Math.max(0, match.index - 40), match.index + 20);
    if (/flight|depart|arriv|seat|gate|board/i.test(context)) flights.add(`${match[1]} ${match[2]}`);
  }
  const flightWord = /\b[Ff]light\s*(?:#|[Nn]umber|[Nn]o\.?)?\s*:?\s*([A-Z0-9]{2})\s?(\d{1,4})\b/.exec(haystack);
  if (flightWord && flights.size === 0) flights.add(`${flightWord[1]} ${flightWord[2]}`);
  const routeMatch =
    /\(([A-Z]{3})\)[^()\n]{0,80}?\(([A-Z]{3})\)/.exec(haystack) ?? /\b([A-Z]{3})\s*(?:→|->|–|—|to|-)\s*([A-Z]{3})\b/.exec(haystack);
  const route =
    routeMatch && routeMatch[1] !== routeMatch[2] && !/^(THE|AND|FOR|USD|EUR|GBP|INR|PDT|EST|PST|EDT|CDT|CST|UTC|GMT)$/.test(routeMatch[1]!)
      ? { from: routeMatch[1]!, to: routeMatch[2]! }
      : null;
  const hotelMatch =
    /\b(?:stay|reservation|booking|room)(?:[ \t]+is)?(?:[ \t]+confirmed)?[ \t]+at[ \t]+(?:the[ \t]+)?([A-Z][\w&'’.-]*(?:[ \t]+[A-Z0-9][\w&'’.-]*){0,6})/.exec(haystack) ??
    /\b(?:reservation|booking|confirmation)\b[^\n]{0,40}?\bfor[ \t]+(?:the[ \t]+)?([A-Z][\w&'’.-]*(?:[ \t]+[A-Z0-9][\w&'’.-]*){0,5})[ \t]*$/m.exec(subject) ??
    /\b([A-Z][\w&'’-]+(?:\s+[A-Z][\w&'’-]+){0,4}\s+(?:Hotel|Inn|Resort|Suites|Lodge|Hostel))\b/.exec(haystack);
  return { confirmation, flights: [...flights], route, hotel: hotelMatch?.[1]?.trim().replace(/[.,;:]+$/, "") ?? null };
}

export interface CareerEntities {
  company: string | null;
  role: string | null;
}

const NOT_COMPANY =
  /^(the|our|your|a|an|this|that|us|we|you|linkedin|indeed|greenhouse|lever|workday|ashby|glassdoor|ziprecruiter|hackerrank|codesignal|team|company|role|position|job|interview|hiring|recruiting|talent|careers?)$/i;

function cleanCompany(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const value = raw
    .replace(/\s+(team|recruiting|talent( acquisition)?|careers|hiring( team)?|people( team)?|hr)$/i, "")
    .replace(/[.,!:;]+$/, "")
    .trim();
  if (value.length < 2 || value.length > 48 || NOT_COMPANY.test(value)) return null;
  if (/^(Software|Senior|Staff|Principal|Lead|Junior|Product|Data|Machine|Frontend|Backend|Full)\b/.test(value)) return null;
  return value;
}

const COMPANY_PATTERNS: RegExp[] = [
  /\b(?:applying|applied|application|interest|candidacy)\s+(?:to|at|with|for (?:a |the )?(?:role|position|job) at)\s+([A-Z][\w&.'’-]*(?:[ \t]+[A-Z][\w&.'’-]*){0,3})/,
  /\b(?:interview|offer|opportunit(?:y|ies)|position|role|career|future)\s+(?:at|with)\s+([A-Z][\w&.'’-]*(?:[ \t]+[A-Z][\w&.'’-]*){0,3})/,
  /\bjoin(?:ing)?\s+(?:the\s+)?([A-Z][\w&.'’-]*(?:[ \t]+[A-Z][\w&.'’-]*){0,2})\s+team\b/,
  /\b(?:recruiter|talent partner|sourcer|hiring manager|engineering manager|founder|ceo|cto)\s+(?:at|with|for|of)\s+([A-Z][\w&.'’-]*(?:[ \t]+[A-Z][\w&.'’-]*){0,3})/i,
  /\b(?:here at|we at|from|the team at)\s+([A-Z][\w&.'’-]*(?:[ \t]+[A-Z][\w&.'’-]*){0,2})/,
];

const ROLE_KEYWORD = /\b(engineer|developer|designer|manager|scientist|analyst|lead|director|architect|researcher|intern|specialist|consultant|staff|product|head|founder)\b/i;

const ROLE_PATTERNS: RegExp[] = [
  /\b(?:position|role|job|opening)(?:[ \t]+title)?[ \t]*[:\-–][ \t]*([A-Z][^\n,.;|]{2,60})/,
  /\b(?:for|as)[ \t]+(?:the|a|an|our)?[ \t]*["“]?((?:Senior|Staff|Principal|Lead|Junior|Founding|Sr\.?|Jr\.?)?[ \t]*[A-Z][\w/&+#.,()' -]{2,60}?)["”]?[ \t]+(?:position|role|opening|opportunity)\b/,
  /\b(?:application|applying|applied|interview(?:ing)?|candidacy)[ \t]+for[ \t]+(?:the[ \t]+)?(?:position of[ \t]+|role of[ \t]+)?["“]?([A-Z][\w/&+#.()' -]{2,55}?)["”]?(?:[ \t]+(?:position|role)|[ \t]+at[ \t]|[ \t]+with[ \t]|[ \t]+[-|–][ \t]|[ \t]*\(|[.,!]|$)/m,
];
const SUBJECT_ROLE = /[—–|-][ \t]+((?:Senior|Staff|Principal|Lead|Junior|Founding|Sr\.?)?[ \t]*[A-Z][\w/&+#.()' ]{2,50}?)[ \t]*$/;

export function extractCareer(text: string, subject: string, fromName: string | null, vendorName: string | null, vendorIsJobPlatform: boolean): CareerEntities {
  const haystack = `${subject}\n${text.slice(0, 5000)}`;
  let company: string | null = null;
  // "Stripe | Senior Engineer", "Senior Engineer at Stripe" style subjects.
  const subjectAt = /\b(?:at|with)\s+([A-Z][\w&.'’-]*(?:[ \t]+[A-Z][\w&.'’-]*){0,2})\s*(?:[!.|–-]|$)/.exec(subject);
  for (const pattern of COMPANY_PATTERNS) {
    company = cleanCompany(pattern.exec(haystack)?.[1]);
    if (company) break;
  }
  if (!company) company = cleanCompany(subjectAt?.[1]);
  if (!company && fromName) {
    const fromCompany = /^(.*?)\s+(?:recruiting|talent|careers|hiring|people|hr)\b/i.exec(fromName)?.[1] ?? /\bat\s+(.+)$/i.exec(fromName)?.[1];
    company = cleanCompany(fromCompany);
    // Job platforms (Greenhouse, CodeSignal, Ashby…) usually send as "<Company> <no-reply@platform>".
    if (!company && vendorIsJobPlatform && !/^[A-Z][a-z]+ [A-Z][a-z]+$/.test(fromName.trim()) && (!vendorName || fromName.trim().toLowerCase() !== vendorName.toLowerCase())) {
      company = cleanCompany(fromName.replace(/["']/g, "").trim());
    }
  }
  if (!company && vendorName && !vendorIsJobPlatform) company = cleanCompany(vendorName);
  let role: string | null = null;
  const subjectRole = SUBJECT_ROLE.exec(subject)?.[1]?.trim();
  if (subjectRole && /\b(engineer|developer|designer|manager|scientist|analyst|lead|director|architect|researcher|intern|specialist|consultant|staff|product|head)\b/i.test(subjectRole)) role = subjectRole;
  for (const pattern of role ? [] : ROLE_PATTERNS) {
    const value = pattern.exec(haystack)?.[1]?.trim();
    if (value && !/^(the|a|an|our|your|this|interview|application)$/i.test(value) && value.length <= 60) {
      role = value.replace(/\s+/g, " ").replace(/\s+(at|with)\s+.*$/i, "");
      break;
    }
  }
  if (!role) {
    const as = /\bas (?:a|an|our|the) ((?:Senior|Staff|Principal|Lead|Founding|Junior|Sr\.?)?[ \t]*[A-Z][\w/&+#() -]{2,50}?)(?=[.,!;]|[ \t]+(?:at|on|with|in|for)\b|$)/m.exec(haystack);
    if (as?.[1] && ROLE_KEYWORD.test(as[1])) role = as[1].trim();
  }
  if (company && role && role.toLowerCase() === company.toLowerCase()) role = null;
  return { company, role };
}

export interface SecurityEntities {
  device: string | null;
  browser: string | null;
  location: string | null;
  ip: string | null;
}

export function extractSecurity(text: string): SecurityEntities {
  const device = /\b(Windows(?: \d{1,2})?|Mac(?:intosh)?|macOS|Mac OS X|iPhone|iPad|Android|Linux|Chrome ?OS|Pixel \d+\w*|Samsung Galaxy[\w ]{0,15}?)\b/.exec(text)?.[1] ?? null;
  const browser = /\b(Chrome|Safari|Firefox|Edge|Opera|Brave|Arc|Vivaldi)\b/.exec(text)?.[1] ?? null;
  const location =
    /\b(?:near|location:?|approximate location:?|in|from)\s+([A-Z][a-zA-Z'-]+(?: [A-Z][a-zA-Z'-]+){0,3},\s*(?:[A-Z]{2}\b|[A-Z][a-zA-Z'-]+(?: [A-Z][a-zA-Z'-]+){0,2})(?:,\s*[A-Z][a-zA-Z'-]+(?: [A-Z][a-zA-Z'-]+){0,2})?)/.exec(text)?.[1]?.trim() ??
    null;
  const ipMatch = /\b((?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3})\b/.exec(text);
  return { device, browser, location, ip: ipMatch?.[1] ?? null };
}
