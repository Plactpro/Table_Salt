export interface JurisdictionConfig {
  currency: string;
  country: string;
  region: string;

  taxLabel: string;
  taxRegLabel: string;
  taxRegFormat: string;
  taxRegPlaceholder: string;
  taxRegValidation?: RegExp;
  defaultTaxRate: number;
  taxInvoiceLabel: string;
  splitTaxLabels?: {
    part1: string;
    part2: string;
  };

  tradeLicenseRequired: boolean;
  tradeLicenseAuthorities?: string[];
  tradeLicenseLabel?: string;

  companyRegLabel?: string;
  companyRegRequired?: boolean;

  breachAuthority: string;
  breachAuthorityUrl: string;
  breachDeadlineHours: number;
  dataResidencyRegion: string;

  requireTaxRegOnInvoice: boolean;
  requireTradeLicenseOnInvoice?: boolean;
  roundingRule: 'NONE' | 'ROUND_1' | 'ROUND_0.25' | 'ROUND_0.05';

  ccpaApplicable: boolean;
  grievanceOfficerRequired?: boolean;

  applicableRegulations: string[];
}

export const CURRENCY_JURISDICTION_MAP: Record<string, JurisdictionConfig> = {
  AED: {
    currency: 'AED',
    country: 'UAE',
    region: 'MIDDLE_EAST',
    taxLabel: 'VAT',
    taxRegLabel: 'TRN',
    taxRegFormat: '15 digits',
    taxRegPlaceholder: '100234567890123',
    defaultTaxRate: 5,
    taxInvoiceLabel: 'Tax Invoice',
    tradeLicenseRequired: true,
    tradeLicenseAuthorities: ['DED', 'DMCC', 'DIFC', 'ADGM', 'JAFZA', 'DAFZA', 'ADDC', 'Other'],
    tradeLicenseLabel: 'Trade License No.',
    companyRegLabel: 'Company No.',
    breachAuthority: 'UAE Data Office',
    breachAuthorityUrl: 'https://dpo.gov.ae',
    breachDeadlineHours: 72,
    dataResidencyRegion: 'UAE/GCC',
    requireTaxRegOnInvoice: true,
    requireTradeLicenseOnInvoice: false,
    roundingRule: 'ROUND_0.25',
    ccpaApplicable: false,
    applicableRegulations: ['UAE_PDPL', 'UAE_ECOMMERCE_LAW', 'UAE_VAT_LAW', 'UAE_TDRA'],
  },
  INR: {
    currency: 'INR',
    country: 'India',
    region: 'SOUTH_ASIA',
    taxLabel: 'GST',
    taxRegLabel: 'GSTIN',
    taxRegFormat: '15 alphanumeric',
    taxRegPlaceholder: '29ABCDE1234F1Z5',
    defaultTaxRate: 18,
    taxInvoiceLabel: 'GST Invoice',
    splitTaxLabels: { part1: 'CGST', part2: 'SGST' },
    tradeLicenseRequired: false,
    tradeLicenseLabel: 'Shop License No.',
    companyRegLabel: 'CIN',
    companyRegRequired: false,
    breachAuthority: 'CERT-In',
    breachAuthorityUrl: 'https://www.cert-in.org.in',
    breachDeadlineHours: 6,
    dataResidencyRegion: 'India',
    requireTaxRegOnInvoice: true,
    requireTradeLicenseOnInvoice: false,
    roundingRule: 'ROUND_1',
    ccpaApplicable: false,
    grievanceOfficerRequired: true,
    applicableRegulations: ['DPDP_ACT', 'IT_ACT_2000', 'CERT_IN_RULES', 'GST_ACT', 'CONSUMER_PROTECTION_ACT'],
  },
  USD: {
    currency: 'USD',
    country: 'United States',
    region: 'NORTH_AMERICA',
    taxLabel: 'Tax',
    taxRegLabel: 'EIN',
    taxRegFormat: 'XX-XXXXXXX',
    taxRegPlaceholder: '12-3456789',
    defaultTaxRate: 0,
    taxInvoiceLabel: 'Sales Receipt',
    tradeLicenseRequired: false,
    breachAuthority: 'FTC / State AG',
    breachAuthorityUrl: 'https://reportfraud.ftc.gov',
    breachDeadlineHours: 72,
    dataResidencyRegion: 'United States',
    requireTaxRegOnInvoice: false,
    roundingRule: 'NONE',
    ccpaApplicable: true,
    applicableRegulations: ['CCPA', 'COPPA', 'CAN_SPAM'],
  },
  GBP: {
    currency: 'GBP',
    country: 'United Kingdom',
    region: 'EUROPE',
    taxLabel: 'VAT',
    taxRegLabel: 'VAT No.',
    taxRegFormat: 'GB + 9 digits',
    taxRegPlaceholder: 'GB123456789',
    defaultTaxRate: 20,
    taxInvoiceLabel: 'Tax Invoice',
    tradeLicenseRequired: false,
    companyRegLabel: 'Company No.',
    breachAuthority: 'ICO (UK)',
    breachAuthorityUrl: 'https://ico.org.uk',
    breachDeadlineHours: 72,
    dataResidencyRegion: 'United Kingdom',
    requireTaxRegOnInvoice: true,
    roundingRule: 'NONE',
    ccpaApplicable: false,
    applicableRegulations: ['UK_GDPR', 'UK_DPA_2018', 'PECR', 'UK_VAT'],
  },
  EUR: {
    currency: 'EUR',
    country: 'European Union',
    region: 'EUROPE',
    taxLabel: 'VAT',
    taxRegLabel: 'VAT No.',
    taxRegFormat: 'Country code + digits',
    taxRegPlaceholder: 'DE123456789',
    defaultTaxRate: 20,
    taxInvoiceLabel: 'Tax Invoice',
    tradeLicenseRequired: false,
    breachAuthority: 'Local DPA',
    breachAuthorityUrl: 'https://edpb.europa.eu/about-edpb/about-edpb/members_en',
    breachDeadlineHours: 72,
    dataResidencyRegion: 'European Union',
    requireTaxRegOnInvoice: true,
    roundingRule: 'NONE',
    ccpaApplicable: false,
    applicableRegulations: ['GDPR', 'EU_VAT_DIRECTIVE', 'EPRIVACY_DIRECTIVE'],
  },
  SGD: {
    currency: 'SGD',
    country: 'Singapore',
    region: 'SOUTHEAST_ASIA',
    taxLabel: 'GST',
    taxRegLabel: 'GST Reg. No.',
    taxRegFormat: 'MXXXXXXXX-X',
    taxRegPlaceholder: 'M12345678-X',
    defaultTaxRate: 9,
    taxInvoiceLabel: 'Tax Invoice',
    tradeLicenseRequired: false,
    breachAuthority: 'PDPC Singapore',
    breachAuthorityUrl: 'https://www.pdpc.gov.sg',
    breachDeadlineHours: 72,
    dataResidencyRegion: 'Singapore',
    requireTaxRegOnInvoice: true,
    roundingRule: 'ROUND_0.05',
    ccpaApplicable: false,
    applicableRegulations: ['PDPA_SINGAPORE', 'GST_ACT_SG'],
  },
};

export const DEFAULT_JURISDICTION = CURRENCY_JURISDICTION_MAP['USD'];

export function getJurisdictionByCurrency(currencyCode: string): JurisdictionConfig {
  return CURRENCY_JURISDICTION_MAP[currencyCode?.toUpperCase()] ?? DEFAULT_JURISDICTION;
}

export function applyJurisdictionRounding(amount: number, rule: JurisdictionConfig['roundingRule']): number {
  if (rule === 'NONE') return amount;
  if (rule === 'ROUND_1') return Math.round(amount);
  if (rule === 'ROUND_0.25') return Math.round(amount * 4) / 4;
  if (rule === 'ROUND_0.05') return Math.round(amount * 20) / 20;
  return amount;
}
