export interface TimezoneInfo {
  iana: string;
  label: string;
  offset: string;
  flag: string;
  region: string;
}

export const timezones: TimezoneInfo[] = [
  { iana: "Pacific/Midway", label: "Midway Island", offset: "UTC-11:00", flag: "🇺🇸", region: "Pacific" },
  { iana: "Pacific/Honolulu", label: "Hawaii", offset: "UTC-10:00", flag: "🇺🇸", region: "Pacific" },
  { iana: "America/Anchorage", label: "Alaska", offset: "UTC-09:00", flag: "🇺🇸", region: "Americas" },
  { iana: "America/Los_Angeles", label: "Pacific Time (US)", offset: "UTC-08:00", flag: "🇺🇸", region: "Americas" },
  { iana: "America/Tijuana", label: "Tijuana", offset: "UTC-08:00", flag: "🇲🇽", region: "Americas" },
  { iana: "America/Denver", label: "Mountain Time (US)", offset: "UTC-07:00", flag: "🇺🇸", region: "Americas" },
  { iana: "America/Phoenix", label: "Arizona", offset: "UTC-07:00", flag: "🇺🇸", region: "Americas" },
  { iana: "America/Chicago", label: "Central Time (US)", offset: "UTC-06:00", flag: "🇺🇸", region: "Americas" },
  { iana: "America/Mexico_City", label: "Mexico City", offset: "UTC-06:00", flag: "🇲🇽", region: "Americas" },
  { iana: "America/New_York", label: "Eastern Time (US)", offset: "UTC-05:00", flag: "🇺🇸", region: "Americas" },
  { iana: "America/Bogota", label: "Bogota", offset: "UTC-05:00", flag: "🇨🇴", region: "Americas" },
  { iana: "America/Lima", label: "Lima", offset: "UTC-05:00", flag: "🇵🇪", region: "Americas" },
  { iana: "America/Caracas", label: "Caracas", offset: "UTC-04:30", flag: "🇻🇪", region: "Americas" },
  { iana: "America/Halifax", label: "Atlantic Time (Canada)", offset: "UTC-04:00", flag: "🇨🇦", region: "Americas" },
  { iana: "America/Santiago", label: "Santiago", offset: "UTC-04:00", flag: "🇨🇱", region: "Americas" },
  { iana: "America/Sao_Paulo", label: "Sao Paulo", offset: "UTC-03:00", flag: "🇧🇷", region: "Americas" },
  { iana: "America/Argentina/Buenos_Aires", label: "Buenos Aires", offset: "UTC-03:00", flag: "🇦🇷", region: "Americas" },
  { iana: "Atlantic/South_Georgia", label: "South Georgia", offset: "UTC-02:00", flag: "🇬🇸", region: "Atlantic" },
  { iana: "Atlantic/Azores", label: "Azores", offset: "UTC-01:00", flag: "🇵🇹", region: "Atlantic" },
  { iana: "UTC", label: "UTC", offset: "UTC+00:00", flag: "🌐", region: "UTC" },
  { iana: "Europe/London", label: "London", offset: "UTC+00:00", flag: "🇬🇧", region: "Europe" },
  { iana: "Europe/Lisbon", label: "Lisbon", offset: "UTC+00:00", flag: "🇵🇹", region: "Europe" },
  { iana: "Africa/Casablanca", label: "Casablanca", offset: "UTC+01:00", flag: "🇲🇦", region: "Africa" },
  { iana: "Africa/Lagos", label: "Lagos", offset: "UTC+01:00", flag: "🇳🇬", region: "Africa" },
  { iana: "Europe/Paris", label: "Paris", offset: "UTC+01:00", flag: "🇫🇷", region: "Europe" },
  { iana: "Europe/Berlin", label: "Berlin", offset: "UTC+01:00", flag: "🇩🇪", region: "Europe" },
  { iana: "Europe/Madrid", label: "Madrid", offset: "UTC+01:00", flag: "🇪🇸", region: "Europe" },
  { iana: "Europe/Rome", label: "Rome", offset: "UTC+01:00", flag: "🇮🇹", region: "Europe" },
  { iana: "Europe/Amsterdam", label: "Amsterdam", offset: "UTC+01:00", flag: "🇳🇱", region: "Europe" },
  { iana: "Europe/Zurich", label: "Zurich", offset: "UTC+01:00", flag: "🇨🇭", region: "Europe" },
  { iana: "Europe/Athens", label: "Athens", offset: "UTC+02:00", flag: "🇬🇷", region: "Europe" },
  { iana: "Europe/Bucharest", label: "Bucharest", offset: "UTC+02:00", flag: "🇷🇴", region: "Europe" },
  { iana: "Europe/Helsinki", label: "Helsinki", offset: "UTC+02:00", flag: "🇫🇮", region: "Europe" },
  { iana: "Europe/Istanbul", label: "Istanbul", offset: "UTC+03:00", flag: "🇹🇷", region: "Europe" },
  { iana: "Africa/Cairo", label: "Cairo", offset: "UTC+02:00", flag: "🇪🇬", region: "Africa" },
  { iana: "Africa/Johannesburg", label: "Johannesburg", offset: "UTC+02:00", flag: "🇿🇦", region: "Africa" },
  { iana: "Africa/Nairobi", label: "Nairobi", offset: "UTC+03:00", flag: "🇰🇪", region: "Africa" },
  { iana: "Europe/Moscow", label: "Moscow", offset: "UTC+03:00", flag: "🇷🇺", region: "Europe" },
  { iana: "Asia/Baghdad", label: "Baghdad", offset: "UTC+03:00", flag: "🇮🇶", region: "Middle East" },
  { iana: "Asia/Riyadh", label: "Riyadh", offset: "UTC+03:00", flag: "🇸🇦", region: "Middle East" },
  { iana: "Asia/Kuwait", label: "Kuwait", offset: "UTC+03:00", flag: "🇰🇼", region: "Middle East" },
  { iana: "Asia/Tehran", label: "Tehran", offset: "UTC+03:30", flag: "🇮🇷", region: "Middle East" },
  { iana: "Asia/Dubai", label: "Dubai", offset: "UTC+04:00", flag: "🇦🇪", region: "Middle East" },
  { iana: "Asia/Muscat", label: "Muscat", offset: "UTC+04:00", flag: "🇴🇲", region: "Middle East" },
  { iana: "Asia/Baku", label: "Baku", offset: "UTC+04:00", flag: "🇦🇿", region: "Asia" },
  { iana: "Asia/Kabul", label: "Kabul", offset: "UTC+04:30", flag: "🇦🇫", region: "Asia" },
  { iana: "Asia/Karachi", label: "Karachi", offset: "UTC+05:00", flag: "🇵🇰", region: "Asia" },
  { iana: "Asia/Tashkent", label: "Tashkent", offset: "UTC+05:00", flag: "🇺🇿", region: "Asia" },
  { iana: "Asia/Kolkata", label: "Kolkata / Mumbai", offset: "UTC+05:30", flag: "🇮🇳", region: "Asia" },
  { iana: "Asia/Colombo", label: "Colombo", offset: "UTC+05:30", flag: "🇱🇰", region: "Asia" },
  { iana: "Asia/Kathmandu", label: "Kathmandu", offset: "UTC+05:45", flag: "🇳🇵", region: "Asia" },
  { iana: "Asia/Dhaka", label: "Dhaka", offset: "UTC+06:00", flag: "🇧🇩", region: "Asia" },
  { iana: "Asia/Almaty", label: "Almaty", offset: "UTC+06:00", flag: "🇰🇿", region: "Asia" },
  { iana: "Asia/Yangon", label: "Yangon", offset: "UTC+06:30", flag: "🇲🇲", region: "Asia" },
  { iana: "Asia/Bangkok", label: "Bangkok", offset: "UTC+07:00", flag: "🇹🇭", region: "Asia" },
  { iana: "Asia/Jakarta", label: "Jakarta", offset: "UTC+07:00", flag: "🇮🇩", region: "Asia" },
  { iana: "Asia/Ho_Chi_Minh", label: "Ho Chi Minh", offset: "UTC+07:00", flag: "🇻🇳", region: "Asia" },
  { iana: "Asia/Shanghai", label: "Shanghai / Beijing", offset: "UTC+08:00", flag: "🇨🇳", region: "Asia" },
  { iana: "Asia/Hong_Kong", label: "Hong Kong", offset: "UTC+08:00", flag: "🇭🇰", region: "Asia" },
  { iana: "Asia/Singapore", label: "Singapore", offset: "UTC+08:00", flag: "🇸🇬", region: "Asia" },
  { iana: "Asia/Kuala_Lumpur", label: "Kuala Lumpur", offset: "UTC+08:00", flag: "🇲🇾", region: "Asia" },
  { iana: "Asia/Taipei", label: "Taipei", offset: "UTC+08:00", flag: "🇹🇼", region: "Asia" },
  { iana: "Asia/Manila", label: "Manila", offset: "UTC+08:00", flag: "🇵🇭", region: "Asia" },
  { iana: "Australia/Perth", label: "Perth", offset: "UTC+08:00", flag: "🇦🇺", region: "Oceania" },
  { iana: "Asia/Seoul", label: "Seoul", offset: "UTC+09:00", flag: "🇰🇷", region: "Asia" },
  { iana: "Asia/Tokyo", label: "Tokyo", offset: "UTC+09:00", flag: "🇯🇵", region: "Asia" },
  { iana: "Australia/Darwin", label: "Darwin", offset: "UTC+09:30", flag: "🇦🇺", region: "Oceania" },
  { iana: "Australia/Adelaide", label: "Adelaide", offset: "UTC+09:30", flag: "🇦🇺", region: "Oceania" },
  { iana: "Australia/Sydney", label: "Sydney", offset: "UTC+10:00", flag: "🇦🇺", region: "Oceania" },
  { iana: "Australia/Melbourne", label: "Melbourne", offset: "UTC+10:00", flag: "🇦🇺", region: "Oceania" },
  { iana: "Australia/Brisbane", label: "Brisbane", offset: "UTC+10:00", flag: "🇦🇺", region: "Oceania" },
  { iana: "Pacific/Guam", label: "Guam", offset: "UTC+10:00", flag: "🇬🇺", region: "Pacific" },
  { iana: "Pacific/Noumea", label: "Noumea", offset: "UTC+11:00", flag: "🇳🇨", region: "Pacific" },
  { iana: "Pacific/Auckland", label: "Auckland", offset: "UTC+12:00", flag: "🇳🇿", region: "Oceania" },
  { iana: "Pacific/Fiji", label: "Fiji", offset: "UTC+12:00", flag: "🇫🇯", region: "Pacific" },
  { iana: "Pacific/Tongatapu", label: "Tonga", offset: "UTC+13:00", flag: "🇹🇴", region: "Pacific" },
];

export function getTimezoneByIana(iana: string): TimezoneInfo | undefined {
  return timezones.find((tz) => tz.iana === iana);
}

export function getTimezoneLabel(iana: string): string {
  const tz = getTimezoneByIana(iana);
  return tz ? `${tz.flag} ${tz.label} (${tz.offset})` : iana;
}

export function formatTimeInZone(iana: string, format: "12hr" | "24hr" = "12hr"): string {
  try {
    const now = new Date();
    return now.toLocaleTimeString("en-US", {
      timeZone: iana,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: format === "12hr",
    });
  } catch {
    return new Date().toLocaleTimeString();
  }
}

export function formatDateInZone(iana: string): string {
  try {
    const now = new Date();
    return now.toLocaleDateString("en-US", {
      timeZone: iana,
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return new Date().toLocaleDateString();
  }
}

export const timezoneRegions = Array.from(new Set(timezones.map((tz) => tz.region)));
