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
]);

/**
 * Converts a string to Title Case while preserving financial/banking acronyms.
 */
export function toTitleCase(str: string): string {
  if (!str) return '';
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
  // Strip leading zeros from numeric-only references
  if (/^\d+$/.test(trimmed)) {
    return trimmed.replace(/^0+/, '') || '0';
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

  // 1. Normalize line-breaks, mid-word line-breaks, and collapse whitespace
  text = text.replace(/([a-zA-Z])-\s*\r?\n\s*([a-zA-Z])/g, '$1$2');
  text = text.replace(/\r?\n|\r/g, ' ').replace(/\s{2,}/g, ' ').trim();

  // Fix common PDF wrapped split words and redaction artifacts
  text = text.replace(/\bLIM\s+ITED\b/gi, 'LIMITED');
  text = text.replace(/\bLIMIT\s+ED\b/gi, 'LIMITED');
  text = text.replace(/\bPA\s+YMENT\b/gi, 'PAYMENT');
  text = text.replace(/\bPAYM\s+ENT\b/gi, 'PAYMENT');
  text = text.replace(/\bSALIM\s*S\s+AYYED\b/gi, 'SALIM SAYYED');
  text = text.replace(/\bSER\s+VICES\b/gi, 'SERVICES');
  text = text.replace(/\bSERVI\s+CES\b/gi, 'SERVICES');
  text = text.replace(/\bPRIV\s+ATE\b/gi, 'PRIVATE');
  text = text.replace(/\bSECURIT\s+IES\b/gi, 'SECURITIES');
  text = text.replace(/\bDECORA\s+TORS\b/gi, 'DECORATORS');
  text = text.replace(/\bTECHNOLO\s+GIES\b/gi, 'TECHNOLOGIES');
  text = text.replace(/\bSENT\s+FR\s+OM\b/gi, 'SENT FROM');
  text = text.replace(/\bPA\s+YTM\b/gi, 'PAYTM');
  text = text.replace(/\bAddresscity\s+State\b/gi, ' ');
  text = text.replace(/\bSECURITIES\s*LIM(?:\s+ITED)?\b/gi, 'SECURITIES LIMITED');
  text = text.replace(/([A-Z]{3,})([A-Z]{1,2})\s+([A-Z]{2,})(?=\s|$|-)/g, (m, a, b, c) => {
    // Only rejoin likely split words like "SECURITIESLIM ITED" -> keep normal two words intact unless prefix ends in LIM/CON/TECH
    if (b === 'S' && c === 'AYYED') return `${a} ${b}${c}`;
    if ((b === 'LIM' || b === 'L') && /^ITED$/i.test(c)) return `${a} ${b}${c}`;
    return m;
  });
  text = text.replace(/\s{2,}/g, ' ').trim();

  // STEP 4A & 4B: Strip leading UTR prefix and/or date prepended to narration (Old bank statement format)
  // e.g. "0000234669620494 12/12/22 SAYYED-WASIMSSAYYED@ICICI-ICIC0003182-234669620494-SAVING-UPI PAYMENT"
  let leadingUtrRef = '';
  const leadingUtrMatch = text.match(/^(\d{10,20})\s+/);
  if (leadingUtrMatch) {
    leadingUtrRef = cleanRef(leadingUtrMatch[1]);
    text = text.slice(leadingUtrMatch[0].length).trim();
  }

  const leadingDateMatch = text.match(/^(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})\s+/);
  if (leadingDateMatch) {
    text = text.slice(leadingDateMatch[0].length).trim();
  }

  // STEP 4D: Strip trailing -SAVING-UPI PAYMENT, -UPI PAYMENT, -UPI
  text = text.replace(/[-/\s]+(?:SAVING-)?UPI\s+PAYMENT$/i, '');
  text = text.replace(/[-/\s]+SAVING-UPI$/i, '');

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
        description: description,
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
        description: description,
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
    // Check BOM slash format: IMPS/<code>/<12-digit-ref>/<masked>/<payee>[/<purpose>...]
    const bomSlash = text.match(/^IMPS\/\d+\/(\d{12})\/([^\/]*)\/(.+)$/i);
    if (bomSlash) {
      const ref12 = bomSlash[1];
      const tailParts = bomSlash[3]
        .split('/')
        .map((s) => s.replace(/\s*TRANSFER TO \d+ TO\s*/i, ' - ').trim())
        .filter(Boolean);
      const cleanDesc = tailParts.join(' - ') || 'IMPS Transfer';
      return {
        description: cleanDesc,
        reference: ref12 || fallbackRef,
        transactionType: 'IMPS',
      };
    }

    let working = text.replace(/^IMPS[\/\-\s]+(?:CR|DR)?[\/\-\s]*/i, '').trim();

    const sep = working.includes('/') && !working.includes('-') ? '/' : '-';
    const segments = working.split(sep).map((s) => s.trim()).filter(Boolean);
    let extractedRef = fallbackRef;
    let desc = '';

    if (segments.length >= 2) {
      // Check if first segment is 12-digit UTR
      if (/^\d{12}$/.test(segments[0])) {
        extractedRef = segments[0];
        desc = segments[1];
      } else if (/^\d{1,3}$/.test(segments[0]) && /^\d{12}$/.test(segments[1])) {
        extractedRef = segments[1];
        desc = segments.slice(2).filter((s) => !/^\*+/.test(s)).join(' - ');
      } else {
        const lastSeg = segments[segments.length - 1];
        if (/^\d{12}$/.test(lastSeg) || /^[A-Z0-9]{10,22}$/i.test(lastSeg)) {
          extractedRef = lastSeg;
          desc = segments.slice(0, -1).join(' - ');
        } else {
          desc = segments.join(' - ');
        }
      }
    } else {
      desc = working;
    }

    if (desc && !INVALID_STANDALONE_DESCRIPTIONS.has(desc.toUpperCase())) {
      return {
        description: desc,
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
      description: desc || 'EFT Transfer',
      reference: extractedRef || fallbackRef,
      transactionType: 'EFT',
    };
  }

  // ==========================================
  // 6. ATM / ATW
  // ==========================================
  if (/^(?:ATM|ATW)[\/\-\s]/i.test(text)) {
    let working = text.replace(/^(?:ATM|ATW)[\/\-\s]+/i, '').trim();
    const utrMatch = working.match(/[-/\s](\d{10,16})$/);
    let extractedRef = fallbackRef;
    if (utrMatch) {
      extractedRef = utrMatch[1];
      working = working.slice(0, -utrMatch[0].length).trim();
    }
    return {
      description: working || 'ATM Withdrawal',
      reference: extractedRef || fallbackRef,
      transactionType: 'ATM',
    };
  }

  // ==========================================
  // 7. POS
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

    return {
      description: desc || 'POS Purchase',
      reference: extractedRef || fallbackRef,
      transactionType: 'POS',
    };
  }

  // ==========================================
  // 8. CHQ
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
    return {
      description: payee || 'Cheque Payment',
      reference: extractedRef || fallbackRef,
      transactionType: 'CHQ',
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

    // 1. Extract 12-digit UTR
    let extractedRef = fallbackRef;
    const utrMatch = text.match(/(?:^|[-/\s])(\d{12})(?=$|[-/\s])/);
    if (utrMatch) {
      extractedRef = utrMatch[1];
    } else if (effectiveFallbackRef) {
      extractedRef = effectiveFallbackRef;
    }

    // 2. Strip noise phrases
    working = working.replace(
      /[-/\s]*(SENT USING PAYTM U|SENT USING PAYTM|SENT USING PAYT M U|SENT USING GPAY|SENT USING PHONEPE|SENT USING BHIM|SENT FROM PAYTM|SENT FROM GPAY|SENT FROM PHONEPE|SENT FROM BHIM|VIA NETBANKING|INTERNET BANKING|MOBILE BANKING|UPI MANDATE|PAY TO BHARATPE ME|VERIFIED PAYTM MER|EXECUTION TEST)[-/\s]*/gi,
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
          // Strip the VPA local-part segment right before @ (handles wrapped spaces like "ADIZAFFARSAYYED727 6" or "BHARATPE.90070652 442")
          const last = parts[parts.length - 1];
          const looksLikeVpaLocal =
            /^[*]{2,}/.test(last) ||
            /^[\d\s.]{5,}$/.test(last) ||
            /^[A-Za-z0-9*._%+-]+(?:\s+[\dA-Za-z._%+-]{1,6})?$/.test(last);
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
        }

        const joined = parts.join(sep === '/' ? ' ' : '-').trim();
        if (joined.length > 0) {
          working = joined;
        }
      } else {
        const splitMatch = working.match(
          /^(.*?)(?:-[*]{3,}|-[A-Z]{4}0[A-Z0-9]{6}|-\d{12})/
        );
        if (splitMatch && splitMatch[1] && splitMatch[1].trim().length > 0) {
          working = splitMatch[1].trim();
        }
      }
    } else {
      // Old statement format without UPI prefix: [SENDER-]VPA_USER@BANK-IFSC-UTR
      const vpaMatch = working.match(/^(?:.*?-)?([a-zA-Z0-9._%+-]+)@[a-zA-Z][a-zA-Z0-9.-]*/);
      if (vpaMatch && vpaMatch[1]) {
        let vpaUser = vpaMatch[1].trim();
        vpaUser = vpaUser.replace(/[._]+/g, ' ').trim();
        working = vpaUser;
      }
    }

    // Clean trailing hyphens, slashes, spaces, and "-NA" or "NA"
    working = working.replace(/-(?:NA|N A)$/i, '');
    working = working.replace(/[-/\s]+$/, '').replace(/^[-/\s]+/, '').trim();

    if (!working || INVALID_STANDALONE_DESCRIPTIONS.has(working.toUpperCase())) {
      working = 'UPI Payment';
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
    let working = text.replace(/^(?:NACH|ACH|SI|EMI|MANDATE)[\/\-\s]+/i, '').trim();
    const splitMatch = working.match(/^(.*?)(?:-[*]{3,}|-\d{10,})/);
    if (splitMatch && splitMatch[1]) {
      working = splitMatch[1].trim();
    }
    return {
      description: working || 'Mandate Payment',
      reference: fallbackRef,
      transactionType: 'OTHER',
    };
  }

  // ==========================================
  // 11. Fallback (no recognized prefix)
  // ==========================================
  let extractedRef = fallbackRef;
  const utrMatch = text.match(/(?:^|[-/\s])(\d{12})(?=$|[-/\s])/);
  if (utrMatch) {
    extractedRef = utrMatch[1];
  }

  let desc = text.slice(0, 100).trim();
  if (!desc || INVALID_STANDALONE_DESCRIPTIONS.has(desc.toUpperCase())) {
    desc = 'Bank Transaction';
  }

  return {
    description: desc,
    reference: extractedRef || fallbackRef,
    transactionType: 'OTHER',
  };
}
