export type BankTransactionType =
  | 'UPI'
  | 'RTGS'
  | 'NEFT'
  | 'IMPS'
  | 'EFT'
  | 'ATM'
  | 'POS'
  | 'CHQ'
  | 'OTHER';

export interface ParsedBankNarration {
  description: string;
  reference: string;
  transactionType: BankTransactionType;
}

const PRESERVED_ACRONYMS = new Set([
  'ATM',
  'POS',
  'UPI',
  'IMPS',
  'NEFT',
  'RTGS',
  'EFT',
  'FT',
  'INB',
  'FD',
  'RD',
  'EMI',
  'SI',
  'ACH',
  'NACH',
  'GST',
  'TDS',
  'BBPS',
  'HDFC',
  'ICICI',
  'SBI',
  'PNB',
  'BOB',
  'IDFC',
  'KOTAK',
  'AXIS',
  'NSE',
  'BSE',
  'CLI',
  'LLP',
  'PVT',
  'LTD',
  'P2P',
]);

/**
 * Converts a string to Title Case while preserving financial/banking acronyms.
 */
export function toTitleCase(str: string): string {
  if (!str) return '';
  if (str.trim().toUpperCase() === UNREADABLE_PAYEE_LABEL) {
    return UNREADABLE_PAYEE_LABEL;
  }
  return str
    .split(/\s+/)
    .map((word) => {
      if (!word) return '';
      const cleanWord = word.replace(/[^a-zA-Z0-9]/g, '');
      if (PRESERVED_ACRONYMS.has(cleanWord.toUpperCase())) {
        return word.toUpperCase();
      }
      if (/^[A-Z0-9]{4,}/.test(cleanWord) && !/[a-z]/.test(word)) {
        // Keep acronyms/all-caps codes intact if already uppercase
        return word;
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ')
    .trim();
}

function cleanRef(ref?: string | null): string {
  if (!ref) return '';
  const trimmed = ref.trim();
  // Strip leading zeros from numeric-only references; treat all-zero placeholders as empty
  if (/^\d+$/.test(trimmed)) {
    return trimmed.replace(/^0+/, '');
  }
  return trimmed;
}

const INVALID_STANDALONE_DESCRIPTIONS = new Set([
  'CR',
  'DR',
  'RTGS',
  'NEFT',
  'IMPS',
  'UPI',
  'EFT',
  'FT',
  'INB',
  'ATM',
  'POS',
  'CHQ',
  'NA',
  'N A',
]);

export const UNREADABLE_PAYEE_LABEL = 'UNREADABLE PAYEE - CHECK PDF';

/**
 * Returns true when a candidate payee description is empty, generic noise, numeric-only,
 * or a masked account placeholder (e.g. "XXXXX8212", "Xxxxx0921", "C-XXXXXXXX0921-NA").
 */
export function isUnreadableOrMaskedPayee(value: string | null | undefined): boolean {
  const trimmed = (value || '').trim();
  if (!trimmed) return true;
  const upper = trimmed.toUpperCase();
  if (upper === UNREADABLE_PAYEE_LABEL) return true;
  if (INVALID_STANDALONE_DESCRIPTIONS.has(upper)) return true;

  // Purely masked account/card/placeholder strings: XXXXX8212, Xxxxxxxx0921, ****1234, AHB-XXXXX8212-NA, X xxxx8212
  const normalizedMasked = trimmed
    .replace(/\b([X*])\s+([X*]{2,}\d*)\b/gi, '$1$2')
    .replace(/\b([X*]{3,})\s+(\d{2,6})\b/gi, '$1$2');

  if (/^(?:[A-Z]{1,4}[-\s]+)?[X*#]{3,}[-\s]*\d{0,6}(?:[-\s]+(?:NA|N\s*A))?$/i.test(normalizedMasked)) {
    return true;
  }

  // Explicitly catch Xxxxx/XXXXX masked account tokens like "Xxxxx8212", "Xxxxx8212 - Transfer", etc.
  if (/\b[X*]{4,}\d{2,6}\b/i.test(normalizedMasked) && !/^\d{4,6}[X*]{4,8}\d{4}/i.test(normalizedMasked)) {
    return true;
  }

  // Contains a masked X/asterisk run with no meaningful non-X alphabetic payee name
  if (/(?:^|[\s\-/])[X*]{3,}\d*(?:$|[\s\-/])/i.test(normalizedMasked)) {
    const remainingAlpha = normalizedMasked
      .replace(/\b[X*]{3,}\d*\b/gi, ' ')
      .replace(/\b(?:NA|CR|DR|UPI|IMPS|NEFT|RTGS|FT|EFT|INB|TO|FROM|BY|VIA|A\/C|ACC|ACCT|TRANSFER|PAYMENT|REF)\b/gi, ' ')
      .replace(/[^a-zA-Z]/g, '');
    if (remainingAlpha.length < 3) {
      return true;
    }
  }

  // Numeric-only or punctuation-only placeholder
  if (/^[\d\s.\-/]+$/.test(trimmed)) {
    return true;
  }

  return false;
}

export function sanitizePayeeDescription(candidate: string | null | undefined): string {
  const trimmed = (candidate || '').trim();
  if (isUnreadableOrMaskedPayee(trimmed)) {
    return UNREADABLE_PAYEE_LABEL;
  }
  return trimmed;
}

/**
 * Rejoins common PDF text-extraction word splits and wrapped fragments
 * (e.g. "CONG O" -> "CONGO", "Sent Usin G Paytm U" -> "Sent Using Paytm U",
 * "Pay Tm" -> "Paytm", "Up I Mandate" -> "UPI Mandate", "UpiIntent" -> "UPI Intent",
 * "Broadb And" -> "Broadband", "Conf Ectioners" -> "Confectioners").
 */
export function deSplitPdfWords(raw: string): string {
  if (!raw) return '';
  let text = raw
    .replace(/([a-zA-Z])-\s*\r?\n\s*([a-zA-Z])/g, '$1$2')
    .replace(/\r?\n|\r/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  text = text.replace(/@\s+([A-Za-z])/g, '@$1');

  // Fix split Xxxxx account masks (e.g. "X xxxx8212", "X x x x x 8212", or "XXXXX 8212")
  text = text.replace(/\b([X*](?:\s+[X*]){3,})\s*(\d{2,6})?\b/gi, (_, xs, d) => xs.replace(/\s+/g, '') + (d || ''));
  text = text.replace(/\b([X*])\s+([X*]{2,}\d{2,6})\b/gi, '$1$2');
  text = text.replace(/\b([X*]{4,})\s+(\d{3,6})\b/gi, '$1$2');

  // Specific multi-fragment channel & merchant words from PDF extractions
  text = text.replace(/\bCONG\s+O\b/gi, (m) => (m === m.toUpperCase() ? 'CONGO' : 'Congo'));
  text = text.replace(/\bBROADB\s+AND\b/gi, (m) => (m === m.toUpperCase() ? 'BROADBAND' : 'Broadband'));
  text = text.replace(/\bCONF\s+ECTIONER(S)?\b/gi, (_, s) =>
    s ? 'CONFECTIONERS' : 'CONFECTIONER'
  );
  text = text.replace(/\bCONFECTION\s+ER(S)?\b/gi, (_, s) =>
    s ? 'CONFECTIONERS' : 'CONFECTIONER'
  );

  // Channel splits: Sent Usi Ng / Sent U Sing / Sen T Using / Pay Tm / Up I / UpiIntent
  text = text.replace(/\bS\s*E\s*N\s+T\s+U\s*S\s*I\s*N\s*G\b/gi, 'SENT USING');
  text = text.replace(/\bSENT\s+U\s+S\s*I\s*N\s*G\b/gi, 'SENT USING');
  text = text.replace(/\bSENT\s+U\s*S\s*I\s+N\s*G\b/gi, 'SENT USING');
  text = text.replace(/\bSENT\s+U\s*S\s*I\s*N\s+G\b/gi, 'SENT USING');
  text = text.replace(/\bP\s*A\s*Y\s*M\s*E\s*N\s*T\s+F\s*R\s*O\s*M\s+P\s*H\s*O\s*N\s*E?\b/gi, (m) =>
    /E\s*$/i.test(m) ? 'PAYMENT FROM PHONE' : 'PAYMENT FROM PHON'
  );
  text = text.replace(/\bPAYMENT\s+F\s*R\s*O\s*M\s+P\s*H\s*O?\b/gi, 'PAYMENT FROM PHONE');
  text = text.replace(
    /\b(US|SAV|BANK|TRAD|SHOPP|WORK|BILL|BOOK|PARK|CATER|MARKET|DEVELOP|PURCHAS|PRINT|PACKAG|CLEAN|HOLD|FUND|BUILD|LIST|HOST|SHIPP|GAM|DIN|MIN)IN\s+G\b/gi,
    '$1ING'
  );
  text = text.replace(
    /\b(US|SAV|BANK|TRAD|SHOPP|WORK|BILL|BOOK|PARK|CATER|MARKET)I\s+NG\b/gi,
    '$1ING'
  );
  text = text.replace(/\bP\s+AYTM\b/gi, 'PAYTM');
  text = text.replace(/\bPA\s+YTM\b/gi, 'PAYTM');
  text = text.replace(/\bPAY\s+T\s*M\b/gi, 'PAYTM');
  text = text.replace(/\bPAYT\s+M\b/gi, 'PAYTM');
  text = text.replace(/\bUP\s+I(?=\s*(?:MANDATE|INTENT|PAYMENT|TRANSFER|TXN|ID|REF|CR|DR|-|\/|$))/gi, 'UPI');
  text = text.replace(/\bUPI\s*INTENT\b/gi, 'UPI INTENT');
  text = text.replace(/\bUPI\s*MANDAT\s*E\b|\bUPI\s*MANDA\s*TE\b|\bUPI\s*MAN\s*DATE\b/gi, 'UPI MANDATE');
  text = text.replace(/\bMANDAT\s+E\b|\bMANDA\s+TE\b|\bMAN\s+DATE\b/gi, 'MANDATE');

  // Common corporate & bank narration PDF splits
  text = text.replace(/\bLIM\s+ITED\b/gi, 'LIMITED');
  text = text.replace(/\bLIMIT\s+ED\b/gi, 'LIMITED');
  text = text.replace(/\bP\s+AYMENT\b/gi, 'PAYMENT');
  text = text.replace(/\bPA\s+YMENT\b/gi, 'PAYMENT');
  text = text.replace(/\bPAY\s+MENT\b/gi, 'PAYMENT');
  text = text.replace(/\bPAYM\s+ENT\b/gi, 'PAYMENT');
  text = text.replace(/\bPAYMEN\s+T\b/gi, 'PAYMENT');
  text = text.replace(/\bF\s+ROM\b/gi, 'FROM');
  text = text.replace(/\bFR\s+OM\b/gi, 'FROM');
  text = text.replace(/\bFRO\s+M\b/gi, 'FROM');
  text = text.replace(/\bP\s+HONE\b/gi, 'PHONE');
  text = text.replace(/\bPH\s+ONE\b/gi, 'PHONE');
  text = text.replace(/\bPHO\s+NE\b/gi, 'PHONE');
  text = text.replace(/\bPHON\s+E\b/gi, 'PHONE');
  text = text.replace(/\bSALIM\s*S\s+AYYED\b/gi, 'SALIM SAYYED');
  text = text.replace(/\bSER\s+VICES\b/gi, 'SERVICES');
  text = text.replace(/\bSERVI\s+CES\b/gi, 'SERVICES');
  text = text.replace(/\bPRIV\s+ATE\b/gi, 'PRIVATE');
  text = text.replace(/\bPRI\s+VATE\b/gi, 'PRIVATE');
  text = text.replace(/\bCONSUL\s+TANCY\b/gi, 'CONSULTANCY');
  text = text.replace(/\bFRE\s+ELANC(ING|E|I)?\b/gi, (_, tail) =>
    tail ? `FREELANC${tail.toUpperCase()}` : 'FREELANC'
  );
  text = text.replace(/\bD\s+ISTANT\b/gi, 'DISTANT');
  text = text.replace(/\bSECURIT\s+IES\b/gi, 'SECURITIES');
  text = text.replace(/\bDECORA\s+TORS\b/gi, 'DECORATORS');
  text = text.replace(/\bTECHNOLO\s+GIES\b/gi, 'TECHNOLOGIES');
  text = text.replace(/\bTECHNOLOG\s+IES\b/gi, 'TECHNOLOGIES');
  text = text.replace(/\bENTERPR\s+ISES\b/gi, 'ENTERPRISES');
  text = text.replace(/\bSOLUT\s+IONS\b/gi, 'SOLUTIONS');
  text = text.replace(/\bPETRO\s+LEUM\b|\bPETROL\s+EUM\b/gi, 'PETROLEUM');
  text = text.replace(/\bSENT\s+FR\s+OM\b/gi, 'SENT FROM');
  text = text.replace(/\bE\s+NJOY\b/gi, 'ENJOY');
  text = text.replace(/\bO\s+THER\b/gi, 'OTHER');
  text = text.replace(/\bMA\s+INTENAN(?:CE)?\b/gi, (m) =>
    m.toUpperCase().endsWith('CE') ? 'MAINTENANCE' : 'MAINTENAN'
  );
  text = text.replace(/([A-Z]{3,})T\s+RANSACTION\b/gi, '$1 TRANSACTION');
  text = text.replace(/@OKIC\s+ICI/gi, '@OKICICI');
  text = text.replace(/@HDF\s+CBANK/gi, '@HDFCBANK');
  text = text.replace(/@PA\s+YTM/gi, '@PAYTM');
  text = text.replace(/\bAddress\s*city(?:\s+[^]*?)?\s+State\b/gi, ' ');
  text = text.replace(/\bSECURITIES\s*LIM(?:\s+ITED)?\b/gi, 'SECURITIES LIMITED');
  text = text.replace(/([A-Z]{3,})([A-Z]{1,2})\s+([A-Z]{2,})(?=\s|$|-)/g, (m, a, b, c) => {
    if (b === 'S' && c === 'AYYED') return `${a} ${b}${c}`;
    if ((b === 'LIM' || b === 'L') && /^ITED$/i.test(c)) return `${a} ${b}${c}`;
    return m;
  });

  return text.replace(/\s{2,}/g, ' ').trim();
}

const CARD_TERMINAL_NOISE_REGEX = /^(?=[A-Za-z]*\d)(?=\d*[A-Za-z])[A-Za-z0-9]{5,12}$/;

function parseMaskedCardNarration(
  text: string,
  fallbackRef: string
): ParsedBankNarration | null {
  const m = text.match(
    /^(?:(ATM|ATW|POS|ECOM)[\/\-\s]+)?(\d{4,6}[X*]{4,8}\d{4})(?:[-/\s]+(.*))?$/i
  );
  if (!m) return null;

  const rail = (m[1] || 'POS').toUpperCase();
  const cardMask = m[2];
  const cardLast4 = cardMask.slice(-4);
  let tail = (m[3] || '').trim();

  let extractedRef = fallbackRef;
  const refMatch = tail.match(/[-/\s](\d{6,16})$/);
  if (refMatch) {
    extractedRef = extractedRef || cleanRef(refMatch[1]);
    tail = tail.slice(0, -refMatch[0].length).trim();
  }

  const rawParts = tail
    .split(tail.includes('-') ? '-' : /[\s/]+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const cleanParts = rawParts.filter((part) => {
    if (CARD_TERMINAL_NOISE_REGEX.test(part)) return false;
    if (/^\d{6,}$/.test(part)) {
      if (!extractedRef) extractedRef = cleanRef(part);
      return false;
    }
    if (/^(?:NA|N A|IN|IND)$/i.test(part)) return false;
    return true;
  });

  const explicitRail = m[1] ? m[1].toUpperCase() : '';
  const hasExplicitPosRail = explicitRail === 'POS' || explicitRail === 'ECOM';
  const joiner = tail.includes('-') ? ' - ' : ' ';
  const cleanLocation = cleanParts.join(joiner).trim();
  const labelPrefix = hasExplicitPosRail ? explicitRail : 'Card / ATM';
  const desc = cleanLocation
    ? `${labelPrefix} - ${toTitleCase(cleanLocation.toLowerCase())}`
    : `${labelPrefix} Transaction (${cardLast4})`;

  return {
    description: desc,
    reference: extractedRef || fallbackRef,
    transactionType: rail === 'ATM' || rail === 'ATW' ? 'ATM' : 'POS',
  };
}

/**
 * Single source of truth parser for Indian bank transaction narrations
 * (PDF statement lines and bank email alert texts).
 */
export function parseBankNarration(
  rawNarration: string,
  rawChqRefCol?: string
): ParsedBankNarration {
  let text = (rawNarration || '').trim();
  const fallbackRef = cleanRef(rawChqRefCol);

  if (!text) {
    return {
      description: 'Bank Transaction',
      reference: fallbackRef,
      transactionType: 'OTHER',
    };
  }

  // 1. Normalize line-breaks, leading dot/bullet noise, PDF word splits, and collapse whitespace
  text = text.replace(/^[.*•\s]+/, '').trim();
  text = deSplitPdfWords(text);
  text = text.replace(/^[.*•\s]+/, '').trim();

  // STEP 4A & 4B: Strip leading UTR prefix and/or date prepended to narration (Old bank statement format)
  // e.g. "0000234669620494 12/12/22 SAYYED-WASIMSSAYYED@ICICI-..." or "300255127239-BROADBAND"
  let leadingUtrRef = '';
  const leadingUtrMatch = text.match(/^(\d{10,20})(?:\s+|-(?=[A-Za-z]))/);
  if (leadingUtrMatch) {
    leadingUtrRef = cleanRef(leadingUtrMatch[1]);
    text = text.slice(leadingUtrMatch[0].length).trim();
  }

  const leadingDateMatch = text.match(/^(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})\s+/);
  if (leadingDateMatch) {
    text = text.slice(leadingDateMatch[0].length).trim();
  }

  // Strip duplicate/trailing UTR-dash prefix right before text remark (e.g. "300255127239-BROADBAND" or "4418653-REQUEST FROM AMAZO")
  const postDateUtrDash = text.match(/^(\d{10,20})-(?=[A-Za-z])/);
  if (postDateUtrDash) {
    if (!leadingUtrRef) leadingUtrRef = cleanRef(postDateUtrDash[1]);
    text = text.slice(postDateUtrDash[0].length).trim();
  } else if (leadingUtrRef || fallbackRef) {
    const refForTail = leadingUtrRef || fallbackRef;
    const partialUtrDash = text.match(/^(\d{5,9})-(?=[A-Za-z])/);
    if (partialUtrDash && refForTail.endsWith(partialUtrDash[1])) {
      text = text.slice(partialUtrDash[0].length).trim();
    }
  }

  // STEP 4D: Strip trailing -SAVING-UPI PAYMENT, -UPI PAYMENT, -UPI, and Paytm OID order-id suffixes
  text = text.replace(/[-/\s]+(?:SAVING-)?UPI\s+PAYMENT$/i, '');
  text = text.replace(/[-/\s]+SAVING-UPI$/i, '');
  text = text.replace(/-OID\d+(?:@PAY)?$/gi, '').trim();

  const effectiveFallbackRef = leadingUtrRef || fallbackRef;

  // ==========================================
  // 2. RTGS
  // Format: RTGS CR-<BANK_CODE>-<NAME>-<NAME>-<UTR> or RTGS DR-...
  // ==========================================
  if (/^RTGS[\/\-\s]/i.test(text)) {
    // Strip RTGS prefix and direction if present
    let working = text.replace(/^RTGS[\/\-\s]+(?:CR|DR)?[\/\-\s]*/i, '').trim();

    // Look for bank code / IFSC pattern at start: [A-Z]{4}[0-9]{7} or [A-Z]{4}0[A-Z0-9]{6}
    const bankCodeMatch = working.match(/^([A-Z]{4}[0-9A-Z]{7})[\/\-\s]+/i);
    if (bankCodeMatch) {
      working = working.slice(bankCodeMatch[0].length).trim();
    }

    // Split remaining tokens by hyphen
    const segments = working.split('-').map((s) => s.trim()).filter(Boolean);

    let extractedRef = fallbackRef;
    let descParts = [...segments];

    // The UTR is the LAST hyphen-separated segment of the narration.
    // It must be taken verbatim with no modification.
    if (segments.length >= 2) {
      const lastSeg = segments[segments.length - 1];
      const cleanedLastSeg = lastSeg.trim();
      if (
        /^[A-Z0-9]{10,26}$/i.test(cleanedLastSeg) ||
        (fallbackRef && cleanedLastSeg === fallbackRef)
      ) {
        extractedRef = cleanedLastSeg;
        descParts = segments.slice(0, -1);
      }
    } else if (segments.length === 1) {
      // Check if reference is attached or if refCol has it
      const trailingRefMatch = working.match(/[-/\s]([A-Z0-9]{12,26})$/i);
      if (trailingRefMatch) {
        extractedRef = trailingRefMatch[1].trim();
        descParts = [working.slice(0, -trailingRefMatch[0].length).trim()];
      }
    }

    const description = descParts.join(' - ').trim();

    if (description && !INVALID_STANDALONE_DESCRIPTIONS.has(description.toUpperCase())) {
      return {
        description: isUnreadableOrMaskedPayee(description) ? UNREADABLE_PAYEE_LABEL : description,
        reference: extractedRef || fallbackRef,
        transactionType: 'RTGS',
      };
    }
  }

  // ==========================================
  // 3. NEFT
  // Format: NEFT CR-<BANK_CODE>-<MERCHANT>-<UTR> or NEFT-<UTR>-<MERCHANT>
  // ==========================================
  if (/^NEFT[\/\-\s]/i.test(text)) {
    let working = text.replace(/^NEFT[\/\-\s]+(?:CR|DR)?[\/\-\s]*/i, '').trim();

    const bankCodeMatch = working.match(/^([A-Z]{4}[0-9A-Z]{7})[\/\-\s]+/i);
    if (bankCodeMatch) {
      working = working.slice(bankCodeMatch[0].length).trim();
    }

    const segments = working.split('-').map((s) => s.trim()).filter(Boolean);
    let extractedRef = fallbackRef;
    let descParts = [...segments];

    if (segments.length >= 2) {
      const firstSeg = segments[0].replace(/\s+/g, '');
      const lastSeg = segments[segments.length - 1];
      const cleanedLastSeg = lastSeg.replace(/\s+/g, '');

      // Format: NEFT-<UTR>-<MERCHANT>
      if (/^(?:N\d{10,20}|\d{12}|[A-Z0-9]{12,22})$/i.test(firstSeg) && !/^[A-Z\s]+$/.test(firstSeg)) {
        extractedRef = firstSeg;
        descParts = segments.slice(1);
      } else if (
        /^(?:N\d{10,20}|\d{12}|[A-Z0-9]{12,22})$/i.test(cleanedLastSeg) ||
        (fallbackRef && cleanedLastSeg === fallbackRef)
      ) {
        extractedRef = cleanedLastSeg;
        descParts = segments.slice(0, -1);
      }
    }

    const description = descParts.join(' - ').trim();
    if (description && !INVALID_STANDALONE_DESCRIPTIONS.has(description.toUpperCase())) {
      return {
        description: isUnreadableOrMaskedPayee(description) ? UNREADABLE_PAYEE_LABEL : description,
        reference: extractedRef || fallbackRef,
        transactionType: 'NEFT',
      };
    }
  }

  // ==========================================
  // 4. IMPS
  // Format:
  // - BOM: IMPS/48/<12-digit-UTR>/<maskedAccount>/<PAYEE>/<Purpose>
  // - Other: IMPS-<12-digit UTR>-<MERCHANT>-<BANK> or IMPS CR-<MERCHANT>-<UTR>
  // ==========================================
  if (/^IMPS[\/\-\s]/i.test(text)) {
    // Check BOM slash format: IMPS/<code>/<12-14-digit-UTR>/<maskedAccount>/<PAYEE>/<Purpose>
    const bomSlash = text.match(/^IMPS\/\d+\/(\d{12,14})\/([^\/]*)\/(.+)$/i);
    if (bomSlash) {
      const ref12 = bomSlash[1];
      const rawTail = bomSlash[3].trim();
      const transferRecipientMatch = rawTail.match(
        /^([^\/]+)\/([^]*?)\s+TRANSFER TO \d+\s+TO\s+(.+)$/i
      );
      let cleanDesc = '';
      if (transferRecipientMatch) {
        const purpose = transferRecipientMatch[2].replace(/\b\d{12,14}\b/g, '').trim();
        const recipient = toTitleCase(transferRecipientMatch[3].trim());
        cleanDesc = purpose ? `${recipient} - ${purpose}` : recipient;
      } else {
        const tailParts = rawTail
          .split('/')
          .map((s) => s.replace(/\s*TRANSFER TO \d+(?:\s+TO)?\s*/gi, ' ').trim())
          .filter(Boolean);
        cleanDesc = tailParts.join(' - ') || 'IMPS Transfer';
      }
      return {
        description: isUnreadableOrMaskedPayee(cleanDesc) ? UNREADABLE_PAYEE_LABEL : cleanDesc,
        reference: ref12 || fallbackRef,
        transactionType: 'IMPS',
      };
    }

    let working = text.replace(/^IMPS[\/\-\s]+(?:CR|DR)?[\/\-\s]*/i, '').trim();

    // Handle HDFC ".IMPS P2P <12-digit-rrn>#<DD/MM/YYYY> [<DDMMYY>] [-<MIR_REF>|<PAYEE>]"
    const p2pMatch = working.match(
      /^P2P\s+(\d{10,16})(?:#(\d{1,2}\/\d{1,2}\/\d{2,4})(?:\s+\d{6})?)?(?:\s*[-/]\s*(.*))?$/i
    );
    if (p2pMatch) {
      const rrn = p2pMatch[1];
      const tail = (p2pMatch[3] || '').trim();
      const isTailRef = /^[A-Z0-9]{10,24}$/i.test(tail);
      const ref = (isTailRef ? tail : '') || fallbackRef || rrn;
      const cleanDesc =
        tail && !isTailRef && !INVALID_STANDALONE_DESCRIPTIONS.has(tail.toUpperCase())
          ? tail
          : `IMPS P2P Transfer (${rrn.slice(-4)})`;
      return {
        description: isUnreadableOrMaskedPayee(cleanDesc) ? UNREADABLE_PAYEE_LABEL : cleanDesc,
        reference: ref,
        transactionType: 'IMPS',
      };
    }

    const sep = working.includes('/') && !working.includes('-') ? '/' : '-';
    const segments = working.split(sep).map((s) => s.trim()).filter(Boolean);
    let extractedRef = fallbackRef;
    let desc = '';

    if (segments.length >= 2) {
      // Check if first segment is 12-14 digit UTR
      if (/^\d{12,14}$/.test(segments[0])) {
        extractedRef = segments[0];
        desc = segments[1];
      } else if (/^\d{1,3}$/.test(segments[0]) && /^\d{12,14}$/.test(segments[1])) {
        extractedRef = segments[1];
        desc = segments.slice(2).filter((s) => !/^\*+/.test(s)).join(' - ');
      } else {
        const lastSeg = segments[segments.length - 1];
        if (/^\d{12,14}$/.test(lastSeg) || /^[A-Z0-9]{10,22}$/i.test(lastSeg)) {
          extractedRef = lastSeg;
          desc = segments.slice(0, -1).join(' - ');
        } else {
          desc = segments.join(' - ');
        }
      }
    } else {
      desc = working;
    }

    if (desc && !isUnreadableOrMaskedPayee(desc)) {
      return {
        description: desc,
        reference: extractedRef || fallbackRef,
        transactionType: 'IMPS',
      };
    }
    if (isUnreadableOrMaskedPayee(desc)) {
      return {
        description: UNREADABLE_PAYEE_LABEL,
        reference: extractedRef || fallbackRef,
        transactionType: 'IMPS',
      };
    }
  }

  // ==========================================
  // 5. EFT / FT / INB
  // ==========================================
  if (/^(?:EFT|FT|INB)[\/\-\s]/i.test(text)) {
    let working = text.replace(/^(?:EFT|FT|INB)[\/\-\s]+/i, '').trim();
    const segments = working.split('-').map((s) => s.trim()).filter(Boolean);
    let extractedRef = fallbackRef;
    let desc = working;

    if (segments.length >= 2) {
      const lastSeg = segments[segments.length - 1];
      if (/^\d{6,22}$/.test(lastSeg) || /^[A-Z0-9]{8,22}$/i.test(lastSeg)) {
        extractedRef = lastSeg;
        desc = segments.slice(0, -1).join(' - ');
      }
    }

    return {
      description: isUnreadableOrMaskedPayee(desc) ? UNREADABLE_PAYEE_LABEL : desc,
      reference: extractedRef || fallbackRef,
      transactionType: 'EFT',
    };
  }

  // ==========================================
  // 6. MASKED CARD POS / ATM ROWS (e.g. "416021xxxxxx9358-s1anpu6f-pune" or "POS 416021XXXXXX9358 S1ANPU6F PUNE")
  // ==========================================
  const cardParsed = parseMaskedCardNarration(text, effectiveFallbackRef);
  if (cardParsed) {
    return cardParsed;
  }

  // ==========================================
  // 7. ATM / ATW
  // ==========================================
  if (/^(?:ATM|ATW)[\/\-\s]/i.test(text)) {
    let working = text.replace(/^(?:ATM|ATW)[\/\-\s]+/i, '').trim();
    const utrMatch = working.match(/[-/\s](\d{10,16})$/);
    let extractedRef = fallbackRef;
    if (utrMatch) {
      extractedRef = utrMatch[1];
      working = working.slice(0, -utrMatch[0].length).trim();
    }
    const desc = working || 'ATM Withdrawal';
    return {
      description: isUnreadableOrMaskedPayee(desc) ? UNREADABLE_PAYEE_LABEL : desc,
      reference: extractedRef || fallbackRef,
      transactionType: 'ATM',
    };
  }

  // ==========================================
  // 8. POS
  // ==========================================
  if (/^POS[\/\-\s]/i.test(text)) {
    let working = text.replace(/^POS[\/\-\s]+/i, '').trim();
    const segments = working.split('-').map((s) => s.trim()).filter(Boolean);
    let extractedRef = fallbackRef;
    let desc = working;

    if (segments.length >= 3) {
      const lastSeg = segments[segments.length - 1];
      if (/^\d{6,22}$/.test(lastSeg) || /^[A-Z0-9]{8,22}$/i.test(lastSeg)) {
        extractedRef = lastSeg;
        desc = segments[0];
      }
    } else if (segments.length === 2) {
      const lastSeg = segments[segments.length - 1];
      if (/^\d{6,22}$/.test(lastSeg) || /^[A-Z0-9]{8,22}$/i.test(lastSeg)) {
        extractedRef = lastSeg;
        desc = segments[0];
      }
    } else {
      const utrMatch = working.match(/[-/\s](\d{10,16})$/);
      if (utrMatch) {
        extractedRef = utrMatch[1];
        desc = working.slice(0, -utrMatch[0].length).trim();
      }
    }

    const finalPos = desc || 'POS Purchase';
    return {
      description: isUnreadableOrMaskedPayee(finalPos) ? UNREADABLE_PAYEE_LABEL : finalPos,
      reference: extractedRef || fallbackRef,
      transactionType: 'POS',
    };
  }

  // ==========================================
  // 9. CHQ
  // ==========================================
  if (/^CHQ[\/\-\s]/i.test(text)) {
    let working = text.replace(/^CHQ[\/\-\s]+/i, '').trim();
    const chqMatch = working.match(/^(\d+)[\/\-\s]+(.*)$/);
    let extractedRef = fallbackRef;
    let payee = working;
    if (chqMatch) {
      extractedRef = cleanRef(chqMatch[1]);
      payee = chqMatch[2].trim();
    }
    const finalChq = payee || 'Cheque Payment';
    return {
      description: isUnreadableOrMaskedPayee(finalChq) ? UNREADABLE_PAYEE_LABEL : finalChq,
      reference: extractedRef || fallbackRef,
      transactionType: 'CHQ',
    };
  }

  // ==========================================
  // 8b. UPI REVERSALS / RETURNS (REV-UPI-..., UPIRET-...)
  // Must run before standard @VPA UPI extraction so account/phone fragments don't fall into UNREADABLE PAYEE
  // ==========================================
  if (/^REV[-/\s]+UPI(?:[-/\s]|$)/i.test(text)) {
    const working = text.replace(/^REV[-/\s]+UPI[-/\s]*/i, '').trim();
    const afterAtMatch = working.match(/@[a-zA-Z][a-zA-Z0-9.-]*[-/\s]+(\d{12,14})(?=$|[-/\s])/);
    const ref12Match = text.match(/(?:^|[-/\s])(\d{12})(?=$|[-/\s])/);
    const extractedRef =
      (afterAtMatch ? afterAtMatch[1] : '') ||
      (effectiveFallbackRef && /^\d{12}$/.test(effectiveFallbackRef) ? effectiveFallbackRef : '') ||
      (ref12Match ? ref12Match[1] : '') ||
      effectiveFallbackRef;

    let payeeHint = '';
    const atIdx = working.search(/\s*@[a-zA-Z][a-zA-Z0-9.-]*/);
    if (atIdx !== -1) {
      const beforeAt = working.slice(0, atIdx).trim();
      const parts = beforeAt.split(/[-/]/).map((p) => p.trim()).filter(Boolean);
      const nonAcctParts = parts.filter((p) => !/^\d{11,}$/.test(p));
      const candidate = nonAcctParts[nonAcctParts.length - 1] || parts[parts.length - 1] || '';
      if (candidate && (!isUnreadableOrMaskedPayee(candidate) || /^\d{10}$/.test(candidate))) {
        payeeHint = candidate;
      }
    } else {
      const firstSeg = working.split(/[-/]/)[0]?.trim() || '';
      if (firstSeg && !isUnreadableOrMaskedPayee(firstSeg)) {
        payeeHint = firstSeg;
      }
    }

    return {
      description: payeeHint ? `UPI Reversal - ${payeeHint}` : 'UPI Reversal',
      reference: extractedRef || fallbackRef,
      transactionType: 'UPI',
    };
  }

  if (/^UPIRET(?:[-/\s]|$)/i.test(text)) {
    const working = text.replace(/^UPIRET[-/\s]*/i, '').trim();
    const utrMatch = working.match(/(?:^|[-/\s])(\d{12,14})(?=$|[-/\s])/);
    const extractedRef = (utrMatch ? utrMatch[1] : '') || effectiveFallbackRef;
    const nameParts = working
      .split(/[-/]/)
      .map((p) => p.trim())
      .filter((p) => p && !/^\d{6,16}$/.test(p));

    return {
      description:
        nameParts.length > 0 ? `UPI Return - ${nameParts.join(' ')}` : 'UPI Return / Reversal',
      reference: extractedRef || fallbackRef,
      transactionType: 'UPI',
    };
  }

  // ==========================================
  // 9. UPI (with UPI prefix OR containing VPA @bank-letters, NOT @81.85 forex rate)
  // Format: UPI-<NAME>-<MASKED>@BANK-<IFSC>-<UTR>-<SUFFIX>
  // BOM Format: UPI <12-digit-UTR><NA|Note>
  // Or Old Statement Format: [SENDER-]NAME@BANK-IFSC-UTR
  // ==========================================
  const hasUpiPrefix = /^UPI[\/\-\s]/i.test(text);
  const hasUpiVpa = /@[a-zA-Z][a-zA-Z0-9.-]*/.test(text);
  if (hasUpiPrefix || hasUpiVpa) {
    // Handle BOM compact UPI narration: "UPI 410031514728NA" or "UPI 459200856871Upwork"
    const bomUpiMatch = text.match(/^UPI\s+(\d{12})([A-Za-z0-9\s\-]*)$/i);
    if (bomUpiMatch) {
      const ref12 = bomUpiMatch[1];
      const suffix = bomUpiMatch[2].trim();
      const isNoiseSuffix = !suffix || /^NA$/i.test(suffix);
      return {
        description: isNoiseSuffix ? `UPI Transfer (${ref12.slice(-4)})` : `UPI - ${suffix}`,
        reference: ref12,
        transactionType: 'UPI',
      };
    }

    let working = text.replace(/^UPI[\/\-\s]+/i, '').trim();

    // 1. Extract 12-14 digit UTR
    let extractedRef = fallbackRef;
    const utrMatch = text.match(/(?:^|[-/\s])(\d{12,14})(?=$|[-/\s])/);
    if (utrMatch) {
      extractedRef = utrMatch[1];
    } else if (effectiveFallbackRef) {
      extractedRef = effectiveFallbackRef;
    }

    // 2. Strip channel/wallet noise phrases (keep payee title clean)
    working = working.replace(
      /[-/\s]*(SENT USING PAYTM U|SENT USING PAYTM|SENT USING PAYT M U|SENT USING GPAY|SENT USING PHONEPE|SENT USING BHIM|SENT FROM PAYTM|SENT FROM GPAY|SENT FROM PHONEPE|SENT FROM BHIM|VIA NETBANKING|INTERNET BANKING|MOBILE BANKING|UPI MANDATE|UPI INTENT|UPI PAYMENT|BANK TRANSFER|PAY TO BHARATPE ME|VERIFIED PAYTM MER|EXECUTION TEST)[-/\s]*/gi,
      ''
    );

    // 3. Extract Merchant / Payee
    if (hasUpiPrefix) {
      // Standard format: UPI-<NAME>-<VPA>@BANK-<IFSC>-<UTR> or UPI/<NAME>/<VPA>@BANK
      const atIdx = working.search(/\s*@[a-zA-Z][a-zA-Z0-9.-]*/);
      if (atIdx !== -1) {
        const beforeAt = working.slice(0, atIdx).trim();
        const sep = beforeAt.includes('/') && !beforeAt.includes('-') ? '/' : '-';
        const parts = beforeAt
          .split(sep)
          .map((p) => p.trim())
          .filter(Boolean);

        if (parts.length >= 2) {
          // Strip trailing numeric VPA discriminator (e.g. "-1", "-2")
          if (parts.length >= 3 && /^\d{1,2}$/.test(parts[parts.length - 1])) {
            parts.pop();
          }
          // Strip the VPA local-part segment right before @ (handles wrapped spaces like "ADIZAFFARSAYYED727 6", "BAJAJPAY.687972 9.05470945", "PAYTMQR2810050501011E TV0FS05SJ")
          const last = parts[parts.length - 1];
          const looksLikeVpaLocal =
            /^[*]{2,}/.test(last) ||
            /^[\d\s.]{5,}$/.test(last) ||
            /^[A-Za-z0-9*._%+-]+(?:\s+[A-Za-z0-9*._%+-]{1,24}){0,2}$/.test(last);
          if (parts.length >= 2 && looksLikeVpaLocal) {
            parts.pop();
          }
          // Strip preceding wallet qualifier tag if present (e.g. "... -GPAY-1125139179 9@OKBIZAXIS")
          if (
            parts.length >= 2 &&
            /^(?:GPAY|G-?PAY|BHARATPE|PAYTM|PHONEPE|BHIM|WHATSAPP)$/i.test(
              parts[parts.length - 1]
            )
          ) {
            parts.pop();
          }
        } else if (parts.length === 1) {
          // Strip dot-attached wallet/VPA handle tag on single-part VPAs (e.g. "AIRTEL PAYMENTS ENT.PAYTM@YBL")
          parts[0] = parts[0]
            .replace(/\.(?:PAYTM|GPAY|YBL|IBL|APL|AXL|BHARATPE|PHONEPE|OKAXIS|OKSBI|OKICICI|HDFCBANK|\d{4,})$/i, '')
            .trim();
        }

        const joined = parts.join(sep === '/' ? ' ' : '-').trim();
        if (joined.length > 0) {
          working = joined;
        }
      } else {
        const splitMatch = working.match(
          /^(.*?)(?:-[*]{3,}|-[A-Z]{4}0[A-Z0-9]{6}|-\d{12,14})/
        );
        if (splitMatch && splitMatch[1] && splitMatch[1].trim().length > 0) {
          working = splitMatch[1].trim();
        }
      }
    } else {
      // Old statement format without UPI prefix: [SENDER-]VPA_USER@BANK-IFSC-UTR
      const atIdx = working.search(/\s*@[a-zA-Z][a-zA-Z0-9.-]*/);
      if (atIdx !== -1) {
        const beforeAt = working.slice(0, atIdx).trim();
        const parts = beforeAt
          .split('-')
          .map((p) => p.trim())
          .filter(Boolean);

        // Strip trailing numeric discriminator (e.g. "-1", "-69772955")
        while (parts.length >= 2 && /^\d+$/.test(parts[parts.length - 1])) {
          parts.pop();
        }
        // Strip preceding wallet tag (e.g. "HANS-PAYTM-64179453@PAYTM" -> "HANS")
        if (
          parts.length >= 2 &&
          /^(?:PAYTM|GPAY|G-?PAY|PHONEPE|BHARATPE|BHIM|WHATSAPP)$/i.test(parts[parts.length - 1])
        ) {
          parts.pop();
        }
        // If final segment is an opaque PhonePe/QR ID (e.g. "SAHU-Q730408582@YBL") and a payee prefix exists, prefer the name
        if (parts.length >= 2 && /^Q\d{6,}$/i.test(parts[parts.length - 1])) {
          parts.pop();
        }

        let candidate = parts[parts.length - 1] || '';
        // Preserve multi-word wallet actions like "WALLET-ADD-MONEY"
        if (parts.length >= 2 && /^(?:MONEY|TRANSFER|PAYMENT)$/i.test(candidate)) {
          candidate = parts.join(' ');
        }
        // Strip terminal numeric merchant ID after dot (e.g. "DHONEMOTORS.99585249" -> "DHONEMOTORS")
        candidate = candidate.replace(/\.\d{5,}$/, '');
        candidate = candidate.replace(/[._]+/g, ' ').trim();
        if (candidate) {
          working = candidate;
        }
      }
    }

    // Clean trailing hyphens, slashes, spaces, "-NA", and compact mobile+wallet concatenation (e.g. "9579662397PAYTM")
    working = working.replace(/-(?:NA|N A)$/i, '');
    working = working.replace(/[-/\s]+$/, '').replace(/^[-/\s]+/, '').trim();
    working = working.replace(
      /^(\d{10})(PAYTM|GPAY|PHONEPE|BHIM|UPI)$/i,
      (_, phone, wallet) => `${phone} (${toTitleCase(wallet)})`
    );

    if (isUnreadableOrMaskedPayee(working)) {
      working = UNREADABLE_PAYEE_LABEL;
    }

    return {
      description: working,
      reference: extractedRef || fallbackRef,
      transactionType: 'UPI',
    };
  }

  // ==========================================
  // 10. NACH / ACH / SI / EMI / MANDATE
  // ==========================================
  if (/^(?:NACH|ACH|SI|EMI|MANDATE)[\/\-\s]/i.test(text)) {
    let working = text
      .replace(/^(?:NACH|ACH|SI|EMI|MANDATE)(?:[\/\-\s]+(?:CR|DR|C|D))?[\/\-\s]+/i, '')
      .trim();
    let extractedRef = effectiveFallbackRef;
    const splitMatch = working.match(/^(.*?)(?:-[*]{3,}|-(\d{10,}))/);
    if (splitMatch && splitMatch[1]) {
      if (splitMatch[2] && !extractedRef) {
        extractedRef = cleanRef(splitMatch[2]);
      }
      working = splitMatch[1].trim();
    }
    return {
      description: working || 'Mandate Payment',
      reference: extractedRef || fallbackRef,
      transactionType: 'OTHER',
    };
  }

  // ==========================================
  // 11. Old/Compact Bank IFSC-UTR-Remark (e.g. "ICIC0003182-300127212468-MONTHLY SAVING", "ZAXIS-UTIB0000000-339560365329-NA")
  //     and Account Mask Transfers (e.g. "C-XXXXXXXX0921-FAMILY", "AHB-XXXXXXXX8212-SAVING")
  // ==========================================
  const acctMaskMatch = text.match(/^[A-Z]{1,4}-([X*]+\d{4})-(?:NA-ID-[X*]+\d{4}-)?(.+)$/i);
  if (acctMaskMatch) {
    const acctMask = acctMaskMatch[1].toUpperCase();
    const purpose = acctMaskMatch[2].replace(/-(?:NA|N A)$/i, '').trim();
    const desc =
      purpose && !isUnreadableOrMaskedPayee(purpose)
        ? `${purpose} (A/c ${acctMask.slice(-4)})`
        : UNREADABLE_PAYEE_LABEL;
    return {
      description: desc,
      reference: effectiveFallbackRef,
      transactionType: 'OTHER',
    };
  }

  const ifscUtrMatch = text.match(
    /^(?:([A-Z0-9\s]{2,28})?-)?([A-Z]{4}0[A-Z0-9]{6}|(?:YESBOYBLUPI|ESBOYBLUPI|YESB0YESUPI|YBL|OKAXIS|OKICICI|OKSBI|PAYTM))-(\d{10,16})(?:-(.*))?$/i
  ) || text.match(/^(YESBOYBLUPI|ESBOYBLUPI)-(\d{10,16})(?:-(.*))?$/i);
  if (ifscUtrMatch) {
    const hasFourGroups = ifscUtrMatch.length === 5;
    const prefix = hasFourGroups ? (ifscUtrMatch[1] || '').trim() : '';
    const utr = hasFourGroups ? ifscUtrMatch[3] : ifscUtrMatch[2];
    const rawRemark = (hasFourGroups ? ifscUtrMatch[4] : ifscUtrMatch[3]) || '';
    const remark = rawRemark
      .replace(/\bOID\d+\b/gi, '')
      .replace(/^[-/\s]+|[-/\s]+$/g, '')
      .trim();
    const hasUsefulRemark =
      remark.length > 0 && !isUnreadableOrMaskedPayee(remark);
    const hasUsefulPrefix =
      prefix.length >= 3 &&
      !/^(?:YTM|UTIB|ICIC|HDFC|SBIN|PYTM)$/i.test(prefix) &&
      !isUnreadableOrMaskedPayee(prefix);

    let desc = '';
    if (hasUsefulRemark) {
      desc = remark;
    } else if (hasUsefulPrefix) {
      desc = `${prefix} UPI Transfer`;
    } else if (isUnreadableOrMaskedPayee(remark) && /[X*]{3,}/i.test(remark)) {
      desc = UNREADABLE_PAYEE_LABEL;
    } else {
      desc = `UPI Transfer (${utr.slice(-4)})`;
    }

    return {
      description: desc,
      reference: utr || effectiveFallbackRef,
      transactionType: 'UPI',
    };
  }

  // ==========================================
  // 12. Fallback (no recognized prefix)
  // ==========================================
  let extractedRef = effectiveFallbackRef;
  const utrMatch = text.match(/(?:^|[-/\s])(\d{12,14})(?=$|[-/\s])/);
  if (utrMatch) {
    extractedRef = utrMatch[1];
  }

  let desc = text
    .replace(
      /[-/\s]*(SENT USING PAYTM U|SENT USING PAYTM|SENT USING GPAY|SENT USING PHONEPE|SENT USING BHIM|SENT FROM PAYTM|SENT FROM GPAY|SENT FROM PHONEPE|SENT FROM BHIM|UPI MANDATE|UPI INTENT|UPI PAYMENT)[-/\s]*$/gi,
      ''
    )
    .replace(/\s+TRANSFER TO \d{6,}(?:\s+TO)?$/i, '')
    .slice(0, 120)
    .trim();
  if (isUnreadableOrMaskedPayee(desc)) {
    desc = UNREADABLE_PAYEE_LABEL;
  }

  return {
    description: desc,
    reference: extractedRef || fallbackRef,
    transactionType: 'OTHER',
  };
}

/**
 * Formats a clean, noise-free secondary line for UI tables (e.g. "UPI Payment · Ref: ..." or "UPI Mandate · Ref: ...")
 * without exposing raw VPA handles (@OKBIZAXIS, paytmqr...), IFSC codes, or split wallet boilerplate.
 * Normalizes channel suffixes to canonical labels: UPI Payment, Bank Transfer, UPI Mandate, UPI Intent.
 */
export function formatTransactionSubtitle(
  description: string,
  rawDescription?: string | null,
  referenceNumber?: string | null
): string | null {
  const raw = (rawDescription || '').trim();
  if (!raw || raw === description) return null;

  const cleanedRaw = deSplitPdfWords(raw.replace(/^[.*•\s]+/, '').trim());
  let mode = 'Bank Transfer';
  if (/^REV[-/\s]+UPI(?:[-/\s]|$)/i.test(cleanedRaw)) {
    mode = 'UPI Reversal';
  } else if (/^UPIRET(?:[-/\s]|$)/i.test(cleanedRaw)) {
    mode = 'UPI Return';
  } else if (/^UPI[\/\-\s]/i.test(cleanedRaw) || /@[A-Za-z]/i.test(cleanedRaw)) {
    mode = 'UPI Payment';
  } else if (/^NEFT[\/\-\s]/i.test(cleanedRaw)) {
    mode = 'NEFT Transfer';
  } else if (/^RTGS[\/\-\s]/i.test(cleanedRaw)) {
    mode = 'RTGS Transfer';
  } else if (/^IMPS[\/\-\s]/i.test(cleanedRaw)) {
    mode = 'IMPS Transfer';
  } else if (/^(?:EFT|FT|INB)[\/\-\s]/i.test(cleanedRaw)) {
    mode = 'Bank Transfer';
  } else if (/^(?:POS|ATM|ATW)[\/\-\s]/i.test(cleanedRaw) || /^\d{4,6}[X*]{4,8}\d{4}\b/i.test(cleanedRaw)) {
    mode = 'Card / ATM';
  } else if (/^CHQ[\/\-\s]/i.test(cleanedRaw)) {
    mode = 'Cheque';
  }

  // Detect normalized UPI sub-channels (UPI Mandate / UPI Intent)
  if (mode === 'UPI Payment') {
    if (/\bUPI\s+MANDATE\b/i.test(cleanedRaw)) {
      mode = 'UPI Mandate';
    } else if (/\bUPI\s+INTENT\b/i.test(cleanedRaw)) {
      mode = 'UPI Intent';
    }
  }

  // Extract optional human remark after the 12-14 digit UTR for UPI rows
  let note = '';
  if (mode === 'UPI Payment') {
    const tailMatch = cleanedRaw.match(/(?:^|[-/\s])\d{12,14}(?:\s+\d{1,2})?\s*-\s*(.+)$/);
    if (tailMatch && tailMatch[1]) {
      let candidate = tailMatch[1]
        .replace(
          /\b(?:SENT|PAY(?:MENT)?)\s+(?:USING|FROM|VIA|BY)\s+(?:PAYTM(?:\s+U(?:PI)?)?|PAY\s*TM(?:\s+U)?|GPAY|G-?PAY|PHONEPE|BHIM|WHATSAPP|PHONE(?:\s*PE)?|PHON|PHO|PH|P|UPI|[A-Z]{1,4})?(?:\s+U(?:PI)?)?\b/gi,
          ''
        )
        .replace(
          /\b(?:SENT\s+FROM\s+\w+|PAY\s+USING(?:\s+UPI)?|PAY\s+TO\s+BHARATPE\s+ME|VIA\s+NETBANKING|UPI\s+TRANSACTION|UPI\s+MANDATE|UPI\s+INTENT|UPI\s+PAYMENT|BANK\s+TRANSFER|UPI|NA|S-NA)\b/gi,
          ''
        )
        .replace(/\bOID\d+\b/gi, '')
        .replace(/\bO\s+THER\b/gi, 'OTHER')
        .replace(/\bMA\s+INTENAN\b/gi, 'MAINTENANCE')
        .replace(/^[-/\s]+|[-/\s]+$/g, '')
        .trim();

      // Drop leftover truncated boilerplate stubs (e.g. "Pay Using", "Payment From", "Sent Using")
      if (/^(?:PAY(?:MENT)?(?:\s+(?:USING|FROM|VIA|BY))?|SENT(?:\s+(?:USING|FROM))?|USING|FROM|PHONE?E?)$/i.test(candidate)) {
        candidate = '';
      }

      const descNorm = description.toLowerCase().replace(/[^a-z0-9]/g, '');
      const candNorm = candidate.toLowerCase().replace(/[^a-z0-9]/g, '');
      const isDuplicateOrTruncatedName =
        !candNorm ||
        candNorm.length < 3 ||
        /^\d+$/.test(candNorm) ||
        descNorm.includes(candNorm) ||
        candNorm.includes(descNorm);

      if (!isDuplicateOrTruncatedName) {
        note = toTitleCase(candidate.toLowerCase());
      }
    }
  } else if (mode === 'IMPS Transfer') {
    const p2pDate = cleanedRaw.match(/^IMPS\s+P2P\s+(\d{10,16})#(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
    if (p2pDate) {
      note = `${p2pDate[2]}`;
    }
  }

  const refPart = referenceNumber ? `Ref: ${referenceNumber}` : '';
  if (note) {
    return `${mode.split(' ')[0]} · ${note}`;
  }
  return refPart ? `${mode} · ${refPart}` : mode;
}

