import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { Company, CompanyDocument } from '../company/company.schema';

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);

  constructor(
    @InjectModel(Company.name) private companyModel: Model<CompanyDocument>,
    private configService: ConfigService,
  ) {}

  // ── Vérification et décrémentation du quota OCR (400/mois par company) ──
  private async checkAndDecrementOcr(companyId: string): Promise<void> {
    const company = await this.companyModel.findById(companyId);
    if (!company) throw new BadRequestException('Company introuvable');

    const now = new Date();
    if (!company.ocrResetAt || this.isNewMonth(company.ocrResetAt, now)) {
      company.ocrAttemptsLeft = company.ocrLimitPerMonth || 400;
      company.ocrResetAt = now;
      await company.save();
    }

    if (company.ocrAttemptsLeft <= 0) {
      throw new BadRequestException(
        `Quota OCR mensuel épuisé (${company.ocrLimitPerMonth}/mois). Se réinitialise le 1er du mois.`,
      );
    }

    company.ocrAttemptsLeft -= 1;
    await company.save();
  }


  // ── Appel OCR Space API (commun) ─────────────────────────────────────────
  private async callOcrSpace(formPayload: Record<string, string>): Promise<string> {
    const apiKey = this.configService.get<string>('OCR_SPACE_API_KEY');

    // Utilisation de fetch natif (Node 18+) ou fallback XMLHttpRequest-style via URLSearchParams
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(formPayload)) params.append(k, v);
    params.append('apikey', apiKey);
    params.append('language', 'fre');
    params.append('isOverlayRequired', 'false');
    params.append('detectOrientation', 'true');
    params.append('scale', 'true');
    params.append('OCREngine', '2');

    const response = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      body: params,
    });

    if (!response.ok) throw new BadRequestException(`OCR API HTTP error: ${response.status}`);

    const data: any = await response.json();
    if (data.IsErroredOnProcessing) {
      throw new BadRequestException(`OCR error: ${(data.ErrorMessage || []).join(', ')}`);
    }

    return data.ParsedResults?.[0]?.ParsedText || '';
  }

  // ── Analyse depuis URL ────────────────────────────────────────────────────
  async analyzeFromUrl(imageUrl: string, companyId: string): Promise<any> {
    await this.checkAndDecrementOcr(companyId);
    try {
      const text = await this.callOcrSpace({ url: imageUrl });
      console.log('OCR raw text:', text);
      return this.extractChargeFields(text);
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      this.logger.error(`OCR URL failed: ${err.message}`);
      throw new BadRequestException("Impossible d'analyser le document. Vérifiez l'URL.");
    }
  }

  // ── Analyse depuis base64 ─────────────────────────────────────────────────
  async analyzeFromBase64(base64: string, mimeType: string, companyId: string): Promise<any> {
    await this.checkAndDecrementOcr(companyId);
    try {
      const text = await this.callOcrSpace({ base64Image: `data:${mimeType};base64,${base64}` });

      return this.extractChargeFields(text);
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      this.logger.error(`OCR base64 failed: ${err.message}`);
      throw new BadRequestException("Impossible d'analyser l'image.");
    }
  }




  // ── Extraction intelligente des champs d'une charge ──────────────────────
  private extractChargeFields(text: string) {

    // ═══════════════════════════════════════════════════════════════
    //  UTILITAIRES
    // ═══════════════════════════════════════════════════════════════
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    /**
     * Parse n'importe quel format de montant :
     *   "1 620,00 €"  → 1620.00
     *   "1,280.00"    → 1280.00
     *   "273,682"     → 273.682  (TND 3 décimales)
     *   "60.00 €"     → 60.00
     */
    const toNum = (s: string): number => {
      const n = s.replace(/[€$£\s]/g, '').trim();
      // 1.234,56 ou 1 234,56 (européen)
      if (/^\d{1,3}([. ]\d{3})*,\d{2,3}$/.test(n))
        return parseFloat(n.replace(/[. ]/g, '').replace(',', '.'));
      // 1,234.56 (anglais)
      if (/^\d{1,3}(,\d{3})*\.\d{2,3}$/.test(n))
        return parseFloat(n.replace(/,/g, ''));
      // 273,682 (TND 3 décimales)
      if (/^\d+,\d{3}$/.test(n))
        return parseFloat(n.replace(',', '.'));
      // 273.682
      if (/^\d+\.\d{3}$/.test(n))
        return parseFloat(n);
      // Fallback
      return parseFloat(n.replace(',', '.'));
    };

    /** Ligne qui contient UNIQUEMENT un montant (avec espace milliers optionnel) */
    const LINE_AMT_RE = /^(\d{1,3}(?:\s\d{3})*[.,]\d{2,3}|\d+[.,]\d{2,3})\s*[€$£TND]?\s*$/;
    const isAmountLine = (l: string) => LINE_AMT_RE.test(l);

    /** Ligne qui est un label de total connu */
    const isLabelLine = (l: string) =>
        /^(total\s*(ht|tva|ttc|remise|général)|net\s*[àa]\s*payer|timbre|fodec|base(\s*ht)?|mode\s*r[eè]glement|montant\s*(ht|tva|ttc)|sous[\s-]total|solde|paiement\s*d[uû])/i.test(l);

    /**
     * STRATÉGIE 1 — "Bloc labels + valeurs séparés"
     * Quand les labels (Total HT / Total TVA / Total TTC) sont groupés
     * et leurs valeurs apparaissent ensemble APRÈS (factures françaises/euros).
     *
     * Trouve la position ordinale du label dans son bloc,
     * puis retourne la valeur à la même position dans le groupe de montants.
     */
    const extractOrdinal = (labelRe: RegExp, searchRange = 15): number | null => {
      const idx = lines.findIndex(l => labelRe.test(l));
      if (idx === -1) return null;

      // Inline : "Total TTC  1 620,00 €"
      const inlineRe = new RegExp(
          labelRe.source + '[^\\n\\d€$£]{0,40}(\\d[\\d.,\\s]*[.,]\\d{2,3})',
          labelRe.flags,
      );
      const inlineM = lines[idx].match(inlineRe);
      if (inlineM) { const v = toNum(inlineM[1]); if (!isNaN(v) && v > 0) return v; }

      // Remonter au début du bloc de labels consécutifs
      let blockStart = idx;
      while (blockStart > 0 && isLabelLine(lines[blockStart - 1])) blockStart--;

      // Collecter les labels du bloc
      const blockLabels: { label: string; i: number }[] = [];
      let i = blockStart;
      while (i < lines.length && (isLabelLine(lines[i]) || lines[i] === '')) {
        if (isLabelLine(lines[i])) blockLabels.push({ label: lines[i], i });
        i++;
      }

      // Collecter les montants qui suivent le bloc
      const blockAmounts: number[] = [];
      let j = i;
      while (j < Math.min(i + searchRange, lines.length) && !isLabelLine(lines[j])) {
        if (isAmountLine(lines[j])) blockAmounts.push(toNum(lines[j]));
        j++;
      }

      // Retourner le montant à la position ordinale du label
      const pos = blockLabels.findIndex(b => labelRe.test(b.label));
      if (pos !== -1 && pos < blockAmounts.length) return blockAmounts[pos];

      // Fallback : max des montants du bloc
      return blockAmounts.length ? Math.max(...blockAmounts) : null;
    };

    /**
     * STRATÉGIE 2 — "Fenêtre bornée" (ligne par ligne)
     * Pour les factures où labels et valeurs alternent (OCR mélange de colonnes).
     * Collecte les montants ligne par ligne entre deux ancres, applique un sélecteur.
     */
    const extractWindow = (
        startRe:  RegExp,
        stopRe:   RegExp,
        pick:     'max' | 'min' | 'first' | 'last' = 'max',
        min = 0,
        max = 9_999_999,
    ): number | null => {
      const start = lines.findIndex(l => startRe.test(l));
      if (start === -1) return null;

      // Chercher inline d'abord
      const inlineRe = new RegExp(
          startRe.source + '[^\\n\\d€$£]{0,40}(\\d[\\d.,\\s]*[.,]\\d{2,3})',
          startRe.flags,
      );
      const inlineM = lines[start].match(inlineRe);
      if (inlineM) { const v = toNum(inlineM[1]); if (!isNaN(v) && v >= min && v <= max) return v; }

      // Fenêtre jusqu'au stop
      let end = Math.min(start + 25, lines.length);
      for (let i = start + 1; i < end; i++) {
        if (stopRe.test(lines[i]) && !startRe.test(lines[i])) { end = i; break; }
      }

      // Extraire ligne par ligne (pas de fusion inter-lignes)
      const nums: number[] = [];
      for (let i = start + 1; i < end; i++) {
        const solo = lines[i].match(LINE_AMT_RE);
        if (solo) {
          const v = toNum(solo[1]);
          if (!isNaN(v) && v >= min && v <= max) nums.push(v);
          continue;
        }
        // Montant inline dans une phrase
        const re = /(?:^|[\s:])(\d{1,3}(?:\s\d{3})*[.,]\d{2,3}|\d+[.,]\d{2,3})\s*[€$£]?(?:\s|$)/g;
        for (const m of lines[i].matchAll(re)) {
          const v = toNum(m[1]);
          if (!isNaN(v) && v >= min && v <= max) nums.push(v);
        }
      }
      if (!nums.length) return null;
      switch (pick) {
        case 'max':   return Math.max(...nums);
        case 'min':   return Math.min(...nums);
        case 'first': return nums[0];
        case 'last':  return nums[nums.length - 1];
      }
    };

    // ═══════════════════════════════════════════════════════════════
    //  1. MONTANT PRINCIPAL (Net à payer / Total TTC)
    //     → Stratégie 1 (ordinal) en premier, puis Stratégie 2 (fenêtre)
    //     → min=5 pour ignorer les petits montants parasites
    // ═══════════════════════════════════════════════════════════════
    let amount: number | null = null;

    const AMOUNT_LABEL_PAIRS: [RegExp, RegExp][] = [
      [/net\s*[àa]\s*payer/i,         /^page\s*\d|^$$/i],
      [/total\s*ttc\b/i,              /net\s*[àa]\s*payer|^page\s*\d/i],
      [/total\s*g[eé]n[eé]ral/i,      /^page\s*\d/i],
      [/montant\s*ttc\b/i,            /^page\s*\d/i],
      [/amount\s*due/i,               /^page\s*\d/i],
      [/solde\s*[àa]\s*payer/i,       /^page\s*\d/i],
    ];

    for (const [labelRe, stopRe] of AMOUNT_LABEL_PAIRS) {
      // Essai ordinal d'abord (blocs labels groupés)
      amount = extractOrdinal(labelRe);
      if (amount && amount >= 5) break;
      // Essai fenêtre (labels/valeurs mélangés)
      amount = extractWindow(labelRe, stopRe, 'max', 5);
      if (amount) break;
    }

    // Fallback : plus grand montant ligne-par-ligne dans tout le doc
    if (!amount) {
      const all = lines
          .map(l => { const m = l.match(LINE_AMT_RE); return m ? toNum(m[1]) : null; })
          .filter((n): n is number => n !== null && n >= 5);
      if (all.length) amount = Math.max(...all);
    }

    // ═══════════════════════════════════════════════════════════════
    //  2. TOTAL HT
    //     Stratégie A : ordinal dans le bloc (factures européennes)
    //     Stratégie B : premier montant ≥5 après "Mode règlement"
    //                   jusqu'à "Arrêtée" (factures tunisiennes OCR)
    // ═══════════════════════════════════════════════════════════════
    let amountHT: number | null = null;

    // Stratégie A
    amountHT =
        extractOrdinal(/^total\s*ht$/i) ??
        extractOrdinal(/^montant\s*ht$/i) ??
        extractOrdinal(/^sous[\s-]total$/i);

    // Stratégie B — "Mode règlement → premier montant ≥5 → Arrêtée"
    if (!amountHT || amountHT < 5) {
      const modeIdx = lines.findIndex(l => /mode\s*r[eè]glement/i.test(l));
      const arreteeIdx = lines.findIndex(l => /arrêt/i.test(l));
      const htEnd = arreteeIdx !== -1 ? arreteeIdx : Math.min(modeIdx + 8, lines.length);
      if (modeIdx !== -1) {
        const candidates = lines.slice(modeIdx + 1, htEnd)
            .filter(l => isAmountLine(l))
            .map(l => toNum(l))
            .filter(n => n >= 5);
        if (candidates.length) amountHT = candidates[0]; // premier = Total HT
      }
    }

    // Stratégie C : fallback fenêtre classique
    if (!amountHT) {
      amountHT =
          extractWindow(/total\s*ht\b/i, /total\s*tva|total\s*ttc|net\s*[àa]\s*payer|timbre|fodec/i, 'max', 5) ??
          extractWindow(/montant\s*ht\b/i, /total\s*tva|total\s*ttc|net/i, 'max', 5) ??
          null;
    }

    // Sanity check : HT ne peut pas être > TTC
    if (amountHT && amount && amountHT > amount) amountHT = null;

    // ═══════════════════════════════════════════════════════════════
    //  3. TAUX TVA DOMINANT
    // ═══════════════════════════════════════════════════════════════
    let tva: number | null = null;

    const tvaExplicit =
        text.match(/taux\s*tva[:\s]*(\d+)/i) ??
        text.match(/tva\s*(?:à|au|de)?\s*(\d+)\s*%/i) ??
        text.match(/vat\s*(?:rate)?\s*[:\s]*(\d+)\s*%/i);

    if (tvaExplicit) {
      tva = parseInt(tvaExplicit[1]);
    } else {
      // Taux courants Tunisie + France/EU — pondéré par présence avec "%"
      const RATES = [5, 7, 10, 13, 14, 19, 20, 21];
      const freq: Record<number, number> = {};
      for (const r of RATES) {
        const withPct  = (text.match(new RegExp(`\\b${r}\\s*%`, 'g')) || []).length;
        const withoutPct = (text.match(new RegExp(`\\b${r}\\b`, 'g')) || []).length;
        freq[r] = withPct * 2 + withoutPct * 0.5; // pondération: "20%" >> "20"
      }
      const best = RATES.filter(r => freq[r] > 0).sort((a, b) => freq[b] - freq[a])[0];
      if (best !== undefined) tva = best;
    }

    // ═══════════════════════════════════════════════════════════════
    //  4. DATE
    // ═══════════════════════════════════════════════════════════════
    let date: string | null = null;

    // Zone préférentielle : ligne(s) après un label "date"
    const dateLabelIdx = lines.findIndex(l =>
        /^(date\s*(?:de\s*)?(?:facturation|facture|émission)?|invoice\s*date|date)$/i.test(l),
    );
    const dateSearchArea = dateLabelIdx !== -1
        ? lines.slice(dateLabelIdx, dateLabelIdx + 4).join(' ')
        : text;

    const DATE_PATTERNS: [RegExp, (m: RegExpMatchArray) => string][] = [
      [/\b(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{4})\b/, m => `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`],
      [/\b(\d{4})-(\d{2})-(\d{2})\b/,                    m => `${m[1]}-${m[2]}-${m[3]}`],
      [/\b(\d{2})[\/\-](\d{4})\b/,                        m => `${m[2]}-${m[1].padStart(2,'0')}-01`],
    ];

    for (const [re, fmt] of DATE_PATTERNS) {
      const m = dateSearchArea.match(re);
      if (m) { date = fmt(m); break; }
    }
    // Fallback : chercher dans tout le texte
    if (!date) {
      for (const [re, fmt] of DATE_PATTERNS) {
        const m = text.match(re);
        if (m) { date = fmt(m); break; }
      }
    }

    // ═══════════════════════════════════════════════════════════════
    //  5. NUMÉRO DE FACTURE
    // ═══════════════════════════════════════════════════════════════
    let source: string | null = null;

    // Cas split-ligne : label seul sur une ligne, valeur sur la suivante
    const SPLIT_LABEL_RE = [
      /^num[eé]ro\s*(?:de\s*)?facture$/i,
      /^invoice\s*(?:number|no\.?|#)$/i,
      /^n[°o](?:\s*facture)?$/i,
      /^r[eé]f(?:[eé]rence)?$/i,
    ];
    for (const re of SPLIT_LABEL_RE) {
      const idx = lines.findIndex(l => re.test(l));
      if (idx !== -1) {
        for (let i = idx + 1; i < Math.min(idx + 4, lines.length); i++) {
          if (/^[A-Z0-9\-\/]{1,20}$/i.test(lines[i]) && !/^\d{8,}$/.test(lines[i])) {
            source = lines[i]; break;
          }
        }
      }
      if (source) break;
    }

    // Inline : "Facture N° 143", "N° : 68", "Invoice #143"
    if (!source) {
      const INLINE_RE = [
        /facture\s*n[°o]?\s*[:\s]*([A-Z0-9\-\/]{1,20})/i,
        /invoice\s*(?:no\.?|n°|#)?\s*[:\s]*([A-Z0-9\-\/]{1,20})/i,
        /n[°o]\s*[:\s]*(\d{1,10})/i,
        /bon\s*(?:de\s*commande\s*)?n[°o]?\s*[:\s]*([A-Z0-9\-\/]{1,20})/i,
        /r[eé]f(?:[eé]rence)?\s*[:\s]*([A-Z0-9\-\/]{1,20})/i,
      ];
      for (const p of INLINE_RE) {
        const m = text.match(p);
        if (m) {
          const c = m[1].trim();
          if (
              c.length <= 20 &&
              !/^(date|page|tel|mf|client|adresse|siren|siret|tva)$/i.test(c) &&
              !/^\d{8,}$/.test(c)
          ) { source = c; break; }
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════
    //  6. DESCRIPTION
    // ═══════════════════════════════════════════════════════════════
    let description = '';

    const SKIP_DESC = /^(facture|invoice|date|total|net|tva|vat|client|adresse|address|tel|email|mf|page|n°|mode|timbre|fodec|base|arrêt|désignation|description|quantit|unit[eé]|prix|price|montant|amount|taux|rate|règlement|payment|iban|bic|swift|siren|siret|logo|vendeur|seller|ref|echéance|paiement|coordonnées|banque|détails|informations|service|garantie)/i;

    // Chercher "Vendeur" ou "Seller" → ligne suivante = nom société
    const vendeurIdx = lines.findIndex(l => /^(vendeur|seller|fournisseur|[eé]metteur)$/i.test(l));
    const companyLine = vendeurIdx !== -1
        ? lines[vendeurIdx + 1]
        : lines.find(l =>
            l.length >= 2 && l.length <= 60 &&
            /[A-Za-z]{2,}/.test(l) &&
            !SKIP_DESC.test(l) &&
            !/^\d[\d\s,./€$]*$/.test(l) &&
            !/^[+\d\s().\-]{7,}$/.test(l),
        );

    if (companyLine && source) description = `Facture ${companyLine} N°${source}`;
    else if (companyLine)      description = companyLine.substring(0, 100);

    if (!description) {
      for (const label of [/^désignation$/i, /^description$/i, /^libellé$/i, /^objet$/i]) {
        const idx = lines.findIndex(l => label.test(l));
        if (idx !== -1 && lines[idx + 1]) { description = lines[idx + 1].substring(0, 100); break; }
      }
    }

    if (!description) description = 'Charge (OCR)';

    // ═══════════════════════════════════════════════════════════════
    //  7. TYPE DE CHARGE
    // ═══════════════════════════════════════════════════════════════
    const lower = text.toLowerCase();
    const TYPE_RULES: [RegExp, string][] = [
      [/loyer|location\s+local|bail\b/,                                                           'rent'],
      [/salaire|paie\b|rémunération|fiche\s+de\s+paie|main[\s\-]d.œuvre/,                        'salary'],
      [/electricité|steg\b|eau\b|sonede\b|gaz\b|téléphone\b|internet\b|fibre\b|edf\b|engie/,    'utilities'],
      [/souris|clavier|écran|pc\b|ordinateur|informatique|matériel|équipement|boitier|chargeur|câble|disque|mémoire|cartouche|imprimante|toner|usb\b|sata\b|smartphone|tablette/, 'equipment'],
      [/publicité|marketing|impression\b|communication|affiche|flyer|banner|branding/,            'marketing'],
      [/assurance\b/,                                                                              'insurance'],
      [/taxe\b|impôt|patente\b|fodec\b|contribution/,                                            'tax'],
      [/comptab|expert[\s\-]comptable|commissaire|audit/,                                         'accounting'],
      [/carburant|essence\b|gasoil\b|diesel\b/,                                                   'fuel'],
    ];

    let type = 'other';
    for (const [re, t] of TYPE_RULES) {
      if (re.test(lower)) { type = t; break; }
    }

    // ═══════════════════════════════════════════════════════════════
    //  RÉSULTAT
    // ═══════════════════════════════════════════════════════════════
    return {
      rawText: text,
      suggestion: { description, amount, amountHT, date, source, type, tva },
    };
  }
  /// =======================================================




  async getOcrStatus(companyId: string) {
    const company = await this.companyModel.findById(companyId).lean();
    if (!company) throw new BadRequestException('Company introuvable');
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const daysLeft = Math.ceil((nextMonth.getTime() - now.getTime()) / 86400000);
    return {
      ocrAttemptsLeft: company.ocrAttemptsLeft,
      ocrLimitPerMonth: company.ocrLimitPerMonth,
      ocrResetAt: company.ocrResetAt,
      nextResetInDays: daysLeft,
    };
  }

  private isNewMonth(lastReset: Date, now: Date): boolean {
    return lastReset.getMonth() !== now.getMonth() || lastReset.getFullYear() !== now.getFullYear();
  }
}
