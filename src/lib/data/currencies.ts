import { COUNTRIES } from './countries';

export interface Currency {
  code: string;
  name: string;
  decimals: number;
  symbol: string;
}

export const CURRENCIES: Currency[] = [
  // Middle East & North Africa
  { code: 'KWD', name: 'Kuwaiti Dinar', decimals: 3, symbol: 'KD' },
  { code: 'BHD', name: 'Bahraini Dinar', decimals: 3, symbol: 'BD' },
  { code: 'OMR', name: 'Omani Rial', decimals: 3, symbol: 'RO' },
  { code: 'JOD', name: 'Jordanian Dinar', decimals: 3, symbol: 'JD' },
  { code: 'QAR', name: 'Qatari Riyal', decimals: 2, symbol: 'QR' },
  { code: 'AED', name: 'UAE Dirham', decimals: 2, symbol: 'AED' },
  { code: 'SAR', name: 'Saudi Riyal', decimals: 2, symbol: 'SAR' },
  { code: 'LBP', name: 'Lebanese Pound', decimals: 0, symbol: 'LBP' },
  { code: 'IQD', name: 'Iraqi Dinar', decimals: 3, symbol: 'IQD' },
  { code: 'YER', name: 'Yemeni Rial', decimals: 2, symbol: 'YER' },
  { code: 'EGP', name: 'Egyptian Pound', decimals: 2, symbol: 'EGP' },
  { code: 'IRR', name: 'Iranian Rial', decimals: 2, symbol: 'IRR' },
  { code: 'TND', name: 'Tunisian Dinar', decimals: 3, symbol: 'DT' },
  { code: 'MAD', name: 'Moroccan Dirham', decimals: 2, symbol: 'MAD' },
  { code: 'LYD', name: 'Libyan Dinar', decimals: 3, symbol: 'LD' },

  // Primary & Global Major Currencies
  { code: 'INR', name: 'Indian Rupee', decimals: 2, symbol: '₹' },
  { code: 'USD', name: 'US Dollar', decimals: 2, symbol: '$' },
  { code: 'EUR', name: 'Euro', decimals: 2, symbol: '€' },
  { code: 'GBP', name: 'British Pound Sterling', decimals: 2, symbol: '£' },
  { code: 'CAD', name: 'Canadian Dollar', decimals: 2, symbol: 'CA$' },
  { code: 'AUD', name: 'Australian Dollar', decimals: 2, symbol: 'A$' },
  { code: 'SGD', name: 'Singapore Dollar', decimals: 2, symbol: 'S$' },
  { code: 'JPY', name: 'Japanese Yen', decimals: 0, symbol: '¥' },
  { code: 'CNY', name: 'Chinese Yuan', decimals: 2, symbol: '¥' },
  { code: 'CHF', name: 'Swiss Franc', decimals: 2, symbol: 'CHF' },
  { code: 'SEK', name: 'Swedish Krona', decimals: 2, symbol: 'kr' },
  { code: 'NOK', name: 'Norwegian Krone', decimals: 2, symbol: 'kr' },
  { code: 'DKK', name: 'Danish Krone', decimals: 2, symbol: 'kr' },

  // Asia-Pacific & Other Major Currencies
  { code: 'HKD', name: 'Hong Kong Dollar', decimals: 2, symbol: 'HK$' },
  { code: 'NZD', name: 'New Zealand Dollar', decimals: 2, symbol: 'NZ$' },
  { code: 'KRW', name: 'South Korean Won', decimals: 0, symbol: '₩' },
  { code: 'TWD', name: 'New Taiwan Dollar', decimals: 2, symbol: 'NT$' },
  { code: 'MYR', name: 'Malaysian Ringgit', decimals: 2, symbol: 'RM' },
  { code: 'THB', name: 'Thai Baht', decimals: 2, symbol: '฿' },
  { code: 'IDR', name: 'Indonesian Rupiah', decimals: 2, symbol: 'Rp' },
  { code: 'PHP', name: 'Philippine Peso', decimals: 2, symbol: '₱' },
  { code: 'VND', name: 'Vietnamese Dong', decimals: 0, symbol: '₫' },
  { code: 'BDT', name: 'Bangladeshi Taka', decimals: 2, symbol: '৳' },
  { code: 'PKR', name: 'Pakistani Rupee', decimals: 2, symbol: 'Rs' },
  { code: 'LKR', name: 'Sri Lankan Rupee', decimals: 2, symbol: 'Rs' },
  { code: 'NPR', name: 'Nepalese Rupee', decimals: 2, symbol: 'Rs' },

  // Europe, Americas & Africa
  { code: 'PLN', name: 'Polish Zloty', decimals: 2, symbol: 'zł' },
  { code: 'CZK', name: 'Czech Koruna', decimals: 2, symbol: 'Kč' },
  { code: 'HUF', name: 'Hungarian Forint', decimals: 2, symbol: 'Ft' },
  { code: 'RON', name: 'Romanian Leu', decimals: 2, symbol: 'lei' },
  { code: 'TRY', name: 'Turkish Lira', decimals: 2, symbol: '₺' },
  { code: 'ILS', name: 'Israeli New Shekel', decimals: 2, symbol: '₪' },
  { code: 'RUB', name: 'Russian Ruble', decimals: 2, symbol: '₽' },
  { code: 'BRL', name: 'Brazilian Real', decimals: 2, symbol: 'R$' },
  { code: 'MXN', name: 'Mexican Peso', decimals: 2, symbol: 'MX$' },
  { code: 'ZAR', name: 'South African Rand', decimals: 2, symbol: 'R' },
  { code: 'NGN', name: 'Nigerian Naira', decimals: 2, symbol: '₦' },
  { code: 'KES', name: 'Kenyan Shilling', decimals: 2, symbol: 'KSh' },
];

export function getCurrencyByCode(code: string | null | undefined): Currency | undefined {
  if (!code) return undefined;
  const upper = code.trim().toUpperCase();
  return CURRENCIES.find((c) => c.code === upper);
}

export function getDecimalsForCurrency(code: string | null | undefined): number {
  const currency = getCurrencyByCode(code);
  return currency ? currency.decimals : 2;
}

export function getDefaultCurrencyForCountry(countryCode: string | null | undefined): string {
  if (!countryCode) return 'USD';
  const upper = countryCode.trim().toUpperCase();
  const match = COUNTRIES.find((c) => c.code === upper);
  return match?.currency || 'USD';
}

const SYMBOL_PREFIX_NO_SPACE = new Set([
  '₹',
  '$',
  '€',
  '£',
  '¥',
  '₩',
  '₺',
  '₪',
  '₽',
  '₱',
  '₫',
  '৳',
  '₦',
  'CA$',
  'A$',
  'S$',
  'HK$',
  'NZ$',
  'NT$',
  'MX$',
  'R$',
]);

export function formatCurrency(
  amount: number,
  currencyCode?: string | null,
  options?: {
    showSign?: boolean;
    includeCode?: boolean;
  }
): string {
  const code = (currencyCode || 'INR').trim().toUpperCase();
  const currency = getCurrencyByCode(code);
  const decimals = currency ? currency.decimals : 2;
  const symbol = currency?.symbol || code;
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const isNegative = safeAmount < 0;
  const absAmount = Math.abs(safeAmount);
  const sign = isNegative ? '− ' : options?.showSign && safeAmount > 0 ? '+ ' : '';

  const locale = code === 'INR' ? 'en-IN' : 'en-US';
  const formattedNumber = new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(absAmount);

  const joined = SYMBOL_PREFIX_NO_SPACE.has(symbol)
    ? `${symbol}${formattedNumber}`
    : `${symbol} ${formattedNumber}`;

  if (options?.includeCode && symbol !== code) {
    return `${sign}${joined} (${code})`;
  }

  return `${sign}${joined}`;
}
