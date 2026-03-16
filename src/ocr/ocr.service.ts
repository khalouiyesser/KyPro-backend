// import { Injectable, BadRequestException, Logger } from '@nestjs/common';
// import { InjectModel } from '@nestjs/mongoose';
// import { Model } from 'mongoose';
// import { ConfigService } from '@nestjs/config';
// import { Company, CompanyDocument } from '../company/company.schema';
//
// @Injectable()
// export class OcrService {
//   private readonly logger = new Logger(OcrService.name);
//
//   constructor(
//       @InjectModel(Company.name) private companyModel: Model<CompanyDocument>,
//       private configService: ConfigService,
//   ) {}
//
//   // ══════════════════════════════════════════════════════════════════════════
//   //  QUOTA
//   // ══════════════════════════════════════════════════════════════════════════
//
//   private async checkAndDecrementOcr(companyId: string): Promise<void> {
//     const company = await this.companyModel.findById(companyId);
//     if (!company) throw new BadRequestException('Company introuvable');
//
//     const now = new Date();
//     if (!company.ocrResetAt || this.isNewMonth(company.ocrResetAt, now)) {
//       company.ocrAttemptsLeft = company.ocrLimitPerMonth || 400;
//       company.ocrResetAt = now;
//       await company.save();
//     }
//
//     if (company.ocrAttemptsLeft <= 0) {
//       throw new BadRequestException(
//           `Quota OCR mensuel épuisé (${company.ocrLimitPerMonth}/mois). Se réinitialise le 1er du mois.`,
//       );
//     }
//
//     company.ocrAttemptsLeft -= 1;
//     await company.save();
//   }
//
//   private isNewMonth(lastReset: Date, now: Date): boolean {
//     return (
//         lastReset.getMonth() !== now.getMonth() ||
//         lastReset.getFullYear() !== now.getFullYear()
//     );
//   }
//
//   async getOcrStatus(companyId: string) {
//     const company = await this.companyModel.findById(companyId).lean();
//     if (!company) throw new BadRequestException('Company introuvable');
//     const now = new Date();
//     const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
//     const daysLeft = Math.ceil((nextMonth.getTime() - now.getTime()) / 86400000);
//     return {
//       ocrAttemptsLeft: company.ocrAttemptsLeft,
//       ocrLimitPerMonth: company.ocrLimitPerMonth,
//       ocrResetAt: company.ocrResetAt,
//       nextResetInDays: daysLeft,
//     };
//   }
//
//   // ══════════════════════════════════════════════════════════════════════════
//   //  OCR SPACE
//   // ══════════════════════════════════════════════════════════════════════════
//
//   private async callOcrSpace(formPayload: Record<string, string>): Promise<string> {
//     const apiKey = this.configService.get<string>('OCR_SPACE_API_KEY');
//     const params = new URLSearchParams();
//     for (const [k, v] of Object.entries(formPayload)) params.append(k, v);
//     params.append('apikey', apiKey);
//     params.append('language', 'fre');
//     params.append('isOverlayRequired', 'false');
//     params.append('detectOrientation', 'true');
//     params.append('scale', 'true');
//     params.append('OCREngine', '2');
//
//     // Timeout 30s — OCR Space peut être lent sur les gros fichiers
//     const controller = new AbortController();
//     const timeoutId = setTimeout(() => controller.abort(), 30_000);
//
//     let response: Response;
//     try {
//       response = await fetch('https://api.ocr.space/parse/image', {
//         method: 'POST',
//         body: params,
//         signal: controller.signal,
//       });
//     } catch (fetchErr: any) {
//       if (fetchErr.name === 'AbortError')
//         throw new BadRequestException('OCR Space timeout (>30s) — essayez une image plus légère');
//       throw new BadRequestException(`OCR Space injoignable : ${fetchErr.message}`);
//     } finally {
//       clearTimeout(timeoutId);
//     }
//
//     if (!response.ok) {
//       const body = await response.text().catch(() => '');
//       // 500 PDF base64 → body vide ou "Invalid filetype"
//       // 408/503 → timeout/service indisponible
//       const hint =
//           response.status === 500 ? ' (PDF non supporté en base64 sur ce plan ?)' :
//               response.status === 408 ? ' (timeout — fichier trop lourd ?)' :
//                   response.status === 503 ? ' (service OCR Space indisponible)' :
//                       response.status === 429 ? ' (quota OCR Space dépassé)' : '';
//       throw new BadRequestException(
//           `OCR API HTTP error: ${response.status}${hint} — ${body.substring(0, 200)}`,
//       );
//     }
//
//     let data: any;
//     try {
//       data = await response.json();
//     } catch {
//       throw new BadRequestException('OCR API : réponse non-JSON (service peut-être indisponible)');
//     }
//
//     if (data.IsErroredOnProcessing) {
//       const msg = (data.ErrorMessage || []).join(', ') || data.ErrorDetails || 'Erreur inconnue';
//       throw new BadRequestException(`OCR error: ${msg}`);
//     }
//
//     // Réponse vide mais pas d'erreur = fichier illisible
//     const parsed = data.ParsedResults?.[0]?.ParsedText || '';
//     if (!parsed.trim() && !data.IsErroredOnProcessing) {
//       this.logger.warn('OCR Space returned empty text — fichier illisible ou page blanche');
//     }
//     return parsed;
//   }
//
//   // ══════════════════════════════════════════════════════════════════════════
//   //  GEMINI 1.5 FLASH — post-processing du texte OCR brut (gratuit)
//   // ══════════════════════════════════════════════════════════════════════════
//
//   // ── Gemini Vision — lit directement l'image ou le PDF en base64 ───────────
//   // Utilisé en PREMIER quand OCR Space est lent/indisponible
//   private async callGeminiVision(base64: string, mimeType: string): Promise<any> {
//     const apiKey = this.configService.get<string>('GEMINI_API_KEY');
//     if (!apiKey) throw new Error('GEMINI_API_KEY non configurée');
//
//     const prompt = `Tu es un expert comptable. Analyse ce document (facture ou devis) et retourne UNIQUEMENT un JSON valide, sans markdown ni backticks.
//
// {
//   "description": "Nom du fournisseur/émetteur, max 100 chars",
//   "amount": <montant TTC total en number, ex: 279.0 ou 5580, null si absent>,
//   "amountHT": <montant HT en number, null si absent>,
//   "date": "YYYY-MM-DD ou null",
//   "source": "numéro facture/devis ou null",
//   "tva": <taux TVA dominant ex: 19 ou 20, number ou null>,
//   "type": "<rent|salary|utilities|equipment|marketing|insurance|tax|accounting|fuel|other>",
//   "currency": "<TND|EUR|USD|other>",
//   "isDevis": <true si devis, false si facture>,
//   "items": [{"label": "désignation ligne", "total": <montant number>}]
// }
//
// Règles: montants = numbers purs (pas strings), date ISO YYYY-MM-DD, items = lignes de facturation avec leur total TTC individuel.`;
//
//     const body = {
//       contents: [{
//         parts: [
//           { inline_data: { mime_type: mimeType, data: base64 } },
//           { text: prompt },
//         ],
//       }],
//       generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
//     };
//
//     const controller = new AbortController();
//     const timeoutId = setTimeout(() => controller.abort(), 30_000);
//
//     let response: Response;
//     try {
//       response = await fetch(
//           `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
//           { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal },
//       );
//     } catch (err: any) {
//       if (err.name === 'AbortError') throw new Error('Gemini Vision timeout');
//       throw new Error(`Gemini Vision injoignable: ${err.message}`);
//     } finally {
//       clearTimeout(timeoutId);
//     }
//
//     if (!response.ok) {
//       const errBody: any = await response.json().catch(() => ({}));
//       if (response.status === 429) {
//         const retryInfo = errBody?.error?.details?.find((d: any) => d['@type']?.includes('RetryInfo'));
//         const delayMs = (parseInt(retryInfo?.retryDelay ?? '20') || 20) * 1000;
//         this.logger.warn(`Gemini Vision 429 — retry dans ${delayMs}ms`);
//         await new Promise(r => setTimeout(r, delayMs));
//         response = await fetch(
//             `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
//             { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
//         );
//         if (!response.ok) throw new Error(`Gemini Vision HTTP ${response.status} après retry`);
//       } else {
//         throw new Error(`Gemini Vision HTTP ${response.status}: ${JSON.stringify(errBody?.error?.message ?? '')}`);
//       }
//     }
//
//     const data: any = await response.json();
//     const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
//     const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
//     try { return JSON.parse(cleaned); }
//     catch { throw new Error(`Gemini Vision JSON invalide: ${cleaned.substring(0, 200)}`); }
//   }
//
//   private async callGeminiPostProcess(rawText: string): Promise<any> {
//     const apiKey = this.configService.get<string>('GEMINI_API_KEY');
//     if (!apiKey) throw new Error('GEMINI_API_KEY non configurée');
//
//     const prompt = `
// Tu es un expert comptable spécialisé dans les factures tunisiennes (TND, FODEC, timbre fiscal)
// et françaises/européennes (EUR, TVA).
//
// Voici le texte brut extrait par OCR d'une facture ou d'un devis :
//
// ---
// ${rawText}
// ---
//
// Extrais les champs suivants. Retourne UNIQUEMENT un objet JSON valide, sans markdown, sans backticks, sans commentaires.
//
// {
//   "description": "Nom du fournisseur / émetteur (société ou personne), max 100 caractères. Si absent, prends la désignation principale du produit/service.",
//   "amount": <Montant total TTC à payer, number pur ex: 279.000, ou null>,
//   "amountHT": <Montant HT total, number pur ex: 273.682, ou null>,
//   "date": "Date de facture au format YYYY-MM-DD, ou null",
//   "source": "Numéro de facture ou devis (ex: 68, FA20BJ001, A3EB0A), ou null",
//   "tva": <Taux TVA dominant en number entier ex: 19, 20, 7, 13, ou null>,
//   "type": "<rent|salary|utilities|equipment|marketing|insurance|tax|accounting|fuel|other>",
//   "currency": "<TND|EUR|USD|other>",
//   "isDevis": <true si c'est un devis, false si facture>
// }
//
// Règles :
// - amount et amountHT sont des numbers PURS (jamais des strings)
// - Pour les montants TND : "279,000" → 279.000 / "14 280.000 TND" → 14280.000
// - Pour les montants EUR : "1 620,00 €" → 1620.00 / "5 580 €" → 5580.00
// - date au format ISO YYYY-MM-DD strict
// - type : loyer→rent, salaire→salary, élec/eau/tel/internet→utilities,
//           matériel informatique/souris/PC/USB→equipment,
//           publicité/marketing/flyer/logo/bannière→marketing,
//           assurance→insurance, taxe/impôt/FODEC/timbre→tax,
//           comptable/audit→accounting, carburant→fuel, sinon→other
// - currency : détecte TND (Tunisie), EUR (€), USD ($)
// - isDevis : true si le document est un devis (Devis, Offre, Proforma), false sinon
// - Si un champ est introuvable, mets null
// `;
//
//     // Retry automatique : 429 (quota) → attendre retryDelay puis réessayer 1 fois
//     const doFetch = async (): Promise<Response> =>
//         fetch(
//             `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
//             {
//               method: 'POST',
//               headers: { 'Content-Type': 'application/json' },
//               body: JSON.stringify({
//                 contents: [{ parts: [{ text: prompt }] }],
//                 generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
//               }),
//             },
//         );
//
//     let response = await doFetch();
//
//     // Gestion 429 : lire le retryDelay dans la réponse et réessayer une fois
//     if (response.status === 429) {
//       const errBody: any = await response.json().catch(() => ({}));
//       const retryInfo = errBody?.error?.details?.find(
//           (d: any) => d['@type']?.includes('RetryInfo'),
//       );
//       const delayStr: string = retryInfo?.retryDelay ?? '20s';
//       const delayMs = (parseInt(delayStr) || 20) * 1000;
//       this.logger.warn(`Gemini 429 — retry dans ${delayStr}`);
//       await new Promise(r => setTimeout(r, delayMs));
//       response = await doFetch();
//     }
//
//     if (!response.ok) {
//       const err = await response.text();
//       throw new Error(`Gemini API HTTP ${response.status}: ${err}`);
//     }
//
//     const data: any = await response.json();
//     const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
//
//     const cleaned = raw
//         .replace(/^```json\s*/i, '')
//         .replace(/^```\s*/i, '')
//         .replace(/```\s*$/i, '')
//         .trim();
//
//     try {
//       return JSON.parse(cleaned);
//     } catch {
//       throw new Error(`Gemini JSON invalide: ${cleaned.substring(0, 300)}`);
//     }
//   }
//
//   // ══════════════════════════════════════════════════════════════════════════
//   //  SCORING — plus de champs valides = meilleur score
//   // ══════════════════════════════════════════════════════════════════════════
//
//   private scoreResult(s: any): number {
//     if (!s) return 0;
//     let score = 0;
//     if (s.amount   != null && s.amount > 0)                        score += 3;
//     if (s.amountHT != null && s.amountHT > 0)                      score += 2;
//     if (s.date     && /^\d{4}-\d{2}-\d{2}$/.test(s.date))         score += 2;
//     if (s.source   && String(s.source).length >= 1)                score += 2;
//     if (s.tva      != null && s.tva > 0)                           score += 1;
//     if (s.description && s.description !== 'Charge (OCR)')         score += 1;
//     if (s.type     && s.type !== 'other')                          score += 1;
//     return score;
//   }
//
//   // ══════════════════════════════════════════════════════════════════════════
//   //  FUSION — prend chaque champ du meilleur des deux résultats
//   // ══════════════════════════════════════════════════════════════════════════
//
//   private mergeResults(
//       ocrSuggestion: any,
//       geminiSuggestion: any,
//   ): { suggestion: any; winner: 'ocr' | 'gemini' | 'merged' } {
//     const ocrScore    = this.scoreResult(ocrSuggestion);
//     const geminiScore = this.scoreResult(geminiSuggestion);
//
//     this.logger.debug(`Score OCR=${ocrScore} | Score Gemini=${geminiScore}`);
//
//     // Si l'un est nettement supérieur (écart ≥ 3), on le prend tel quel
//     if (ocrScore >= geminiScore + 3)
//       return { suggestion: ocrSuggestion,    winner: 'ocr' };
//     if (geminiScore >= ocrScore + 3)
//       return { suggestion: geminiSuggestion, winner: 'gemini' };
//
//     // Sinon fusion champ par champ : on préfère Gemini pour la sémantique,
//     // OCR pour les montants si Gemini les a ratés
//     const merged = {
//       description:
//           geminiSuggestion?.description &&
//           geminiSuggestion.description !== 'Charge (OCR)'
//               ? geminiSuggestion.description
//               : ocrSuggestion?.description ?? 'Charge (OCR)',
//
//       amount:
//           geminiSuggestion?.amount    != null ? geminiSuggestion.amount
//               : ocrSuggestion?.amount     != null ? ocrSuggestion.amount
//                   : null,
//
//       amountHT:
//           geminiSuggestion?.amountHT  != null ? geminiSuggestion.amountHT
//               : ocrSuggestion?.amountHT   != null ? ocrSuggestion.amountHT
//                   : null,
//
//       date:
//           geminiSuggestion?.date ?? ocrSuggestion?.date ?? null,
//
//       source:
//           geminiSuggestion?.source ?? ocrSuggestion?.source ?? null,
//
//       tva:
//           geminiSuggestion?.tva    != null ? geminiSuggestion.tva
//               : ocrSuggestion?.tva     != null ? ocrSuggestion.tva
//                   : null,
//
//       type:
//           geminiSuggestion?.type && geminiSuggestion.type !== 'other'
//               ? geminiSuggestion.type
//               : ocrSuggestion?.type ?? 'other',
//
//       // Champs enrichis fournis uniquement par Gemini
//       currency: geminiSuggestion?.currency ?? 'TND',
//       isDevis:  geminiSuggestion?.isDevis  ?? false,
//     };
//
//     // Sanity check : amountHT ne peut pas dépasser amount (TTC)
//     if (
//         merged.amountHT != null &&
//         merged.amount   != null &&
//         merged.amountHT > merged.amount
//     ) {
//       merged.amountHT = ocrSuggestion?.amountHT ?? null;
//     }
//
//     return { suggestion: merged, winner: 'merged' };
//   }
//
//   // ══════════════════════════════════════════════════════════════════════════
//   //  POINTS D'ENTRÉE PUBLICS
//   // ══════════════════════════════════════════════════════════════════════════
//
//   // ── Analyse depuis URL ────────────────────────────────────────────────────
//   async analyzeFromUrl(imageUrl: string, companyId: string): Promise<any> {
//     await this.checkAndDecrementOcr(companyId);
//     try {
//       const rawText = await this.callOcrSpace({ url: imageUrl });
//       this.logger.debug('OCR raw text (URL):\n' + rawText);
//
//       const [ocrResult, geminiResult] = await Promise.allSettled([
//         Promise.resolve(this.extractChargeFields(rawText)),
//         this.callGeminiPostProcess(rawText),
//       ]);
//
//       const ocrSuggestion =
//           ocrResult.status === 'fulfilled' ? ocrResult.value?.suggestion : null;
//       const geminiSuggestion =
//           geminiResult.status === 'fulfilled' ? geminiResult.value : null;
//
//       if (geminiResult.status === 'rejected')
//         this.logger.warn(`Gemini failed (URL): ${geminiResult.reason}`);
//
//       const { suggestion, winner } = this.mergeResults(ocrSuggestion, geminiSuggestion);
//       return { rawText, winner, suggestion };
//     } catch (err) {
//       if (err instanceof BadRequestException) throw err;
//       this.logger.error(`analyzeFromUrl failed: ${err.message}`);
//       throw new BadRequestException("Impossible d'analyser le document. Vérifiez l'URL.");
//     }
//   }
//
//   // ── Analyse depuis base64 ─────────────────────────────────────────────────
//   //  Stratégie :
//   //  1. Gemini Vision EN PREMIER (lit l'image/PDF directement, rapide)
//   //  2. Si Gemini échoue → OCR Space + extractChargeFields (fallback)
//   //  3. Si les deux réussissent → fusion (meilleur résultat)
//   async analyzeFromBase64(
//       base64: string,
//       mimeType: string,
//       companyId: string,
//   ): Promise<any> {
//     await this.checkAndDecrementOcr(companyId);
//     try {
//       // ── Étape 1 : Gemini Vision (direct sur l'image/PDF) ──────────────────
//       let geminiVisionResult: any = null;
//       let geminiVisionError: string | null = null;
//       try {
//         geminiVisionResult = await this.callGeminiVision(base64, mimeType);
//         this.logger.log('Gemini Vision: succès');
//       } catch (gErr: any) {
//         geminiVisionError = gErr.message;
//         this.logger.warn(`Gemini Vision failed: ${gErr.message} — fallback OCR Space`);
//       }
//
//       // Si Gemini Vision a donné un bon résultat, on le retourne directement
//       if (geminiVisionResult && this.scoreResult(geminiVisionResult) >= 5) {
//         return {
//           rawText: '',
//           winner: 'gemini-vision',
//           suggestion: {
//             description:  geminiVisionResult.description  ?? 'Charge (OCR)',
//             amount:       geminiVisionResult.amount       ?? null,
//             amountHT:     geminiVisionResult.amountHT     ?? null,
//             date:         geminiVisionResult.date         ?? null,
//             source:       geminiVisionResult.source       ?? null,
//             type:         geminiVisionResult.type         ?? 'other',
//             tva:          geminiVisionResult.tva          ?? null,
//             currency:     geminiVisionResult.currency     ?? 'TND',
//             isDevis:      geminiVisionResult.isDevis      ?? false,
//             items:        geminiVisionResult.items        ?? [],
//           },
//         };
//       }
//
//       // ── Étape 2 : Fallback OCR Space ──────────────────────────────────────
//       this.logger.log('Fallback → OCR Space');
//       const ocrPayload: Record<string, string> = {
//         base64Image: `data:${mimeType};base64,${base64}`,
//       };
//       if (mimeType === 'application/pdf') ocrPayload['filetype'] = 'PDF';
//
//       const rawText = await this.callOcrSpace(ocrPayload);
//       this.logger.debug('OCR raw text (base64):\n' + rawText);
//
//       // ── Étape 3 : OCR regex + Gemini post-process en parallèle ───────────
//       const [ocrResult, geminiPostResult] = await Promise.allSettled([
//         Promise.resolve(this.extractChargeFields(rawText)),
//         this.callGeminiPostProcess(rawText),
//       ]);
//
//       const ocrSuggestion =
//           ocrResult.status === 'fulfilled' ? ocrResult.value?.suggestion : null;
//       const geminiSuggestion =
//           geminiPostResult.status === 'fulfilled' ? geminiPostResult.value
//               : geminiVisionResult; // réutilise le résultat Vision si post-process échoue aussi
//
//       if (geminiPostResult.status === 'rejected')
//         this.logger.warn(`Gemini post-process failed: ${geminiPostResult.reason}`);
//
//       const { suggestion, winner } = this.mergeResults(ocrSuggestion, geminiSuggestion);
//       this.logger.log(`OCR winner: ${winner}`);
//
//       return { rawText, winner, suggestion };
//     } catch (err) {
//       if (err instanceof BadRequestException) throw err;
//       this.logger.error(`analyzeFromBase64 failed: ${err.message}`);
//       throw new BadRequestException("Impossible d'analyser l'image.");
//     }
//   }
//
//   // ══════════════════════════════════════════════════════════════════════════
//   //  EXTRACTION REGEX (fallback OCR)
//   //  Couvre :
//   //    • Factures tunisiennes  (TND, 3 décimales, FODEC, timbre, TVA 7/19%)
//   //    • Factures françaises   (EUR, TVA 20%)
//   //    • Devis tunisiens       (même structure)
//   // ══════════════════════════════════════════════════════════════════════════
//   private extractChargeFields(text: string) {
//
//     // ── Utilitaires ──────────────────────────────────────────────────────────
//
//     const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
//
//     /**
//      * Normalise n'importe quel montant textuel en number JS :
//      *   "1 620,00 €"   → 1620.00
//      *   "14 280.000"   → 14280.00   (TND espace milliers + point)
//      *   "273,682"      → 273.682    (TND virgule + 3 déc.)
//      *   "1,280.00"     → 1280.00    (anglais)
//      *   "60.00 €"      → 60.00
//      *   "279 000"      → 279.00     (espace décimal rare)
//      */
//     const toNum = (s: string): number => {
//       const n = s.replace(/[€$£\sTND]/g, '').trim();
//       if (/^\d{1,3}([. ]\d{3})*,\d{2,3}$/.test(n))   // 1 234,56 ou 1.234,56
//         return parseFloat(n.replace(/[. ]/g, '').replace(',', '.'));
//       if (/^\d{1,3}(,\d{3})*\.\d{2,3}$/.test(n))      // 1,234.56
//         return parseFloat(n.replace(/,/g, ''));
//       if (/^\d+,\d{3}$/.test(n))                       // 273,682 (TND 3 déc.)
//         return parseFloat(n.replace(',', '.'));
//       if (/^\d{1,3}([. ]\d{3})+$/.test(n))             // 14 280 ou 14.280 (entier avec séparateur milliers)
//         return parseFloat(n.replace(/[. ]/g, ''));
//       // Entier pur (après suppression €/$) ex: "5580" "4650" "1500"
//       if (/^\d[\d\s]*$/.test(n))
//         return parseInt(n.replace(/\s/g, ''), 10);
//       return parseFloat(n.replace(',', '.'));
//     };
//
//     /** Ligne qui contient UNIQUEMENT un montant
//      *  Couvre : 273,682 / 1 620,00 € / 5 580 € / 5580€ / 4 650 € (entier avec €)
//      */
//     const LINE_AMT_RE =
//         /^(\d[\d\s.]*(?:[.,]\d{2,3})?)\s*[€$£]\s*$|^(\d{1,3}(?:[\s.]\d{3})*[.,]\d{2,3}|\d+[.,]\d{2,3})\s*(?:TND)?\s*$/;
//
//     /** Extrait le groupe capturant de LINE_AMT_RE (groupe 1 ou 2) */
//     const getAmtGroup = (m: RegExpMatchArray): string => m[1] ?? m[2];
//     const isAmountLine = (l: string) => LINE_AMT_RE.test(l);
//     const matchAmt = (l: string) => { const m = l.match(LINE_AMT_RE); return m ? getAmtGroup(m) : null; };
//
//     /** Ligne qui est un label de total connu (FR + TN) */
//     const isLabelLine = (l: string) =>
//         /^(total\s*(ht|tva|ttc|remise|g[eé]n[eé]ral)|net\s*[àa]\s*payer|timbre|fodec|base(\s*ht)?|mode\s*r[eè]glement|montant\s*(ht|tva|ttc)|sous[\s\-]total|solde|paiement\s*d[uû]|total\s*ttc|total\s*ht)/i.test(l);
//
//     // ── Stratégie 1 : bloc labels groupés puis valeurs ───────────────────────
//     const extractOrdinal = (labelRe: RegExp, searchRange = 15): number | null => {
//       const idx = lines.findIndex(l => labelRe.test(l));
//       if (idx === -1) return null;
//
//       // Inline : "Total TTC  1 620,00 €"
//       const inlineRe = new RegExp(
//           labelRe.source + '[^\\n\\d€$£TND]{0,40}(\\d[\\d.,\\s]*[.,]\\d{2,3})',
//           labelRe.flags,
//       );
//       const inlineM = lines[idx].match(inlineRe);
//       if (inlineM) {
//         const v = toNum(inlineM[1]);
//         if (!isNaN(v) && v > 0) return v;
//       }
//
//       let blockStart = idx;
//       while (blockStart > 0 && isLabelLine(lines[blockStart - 1])) blockStart--;
//
//       const blockLabels: { label: string; i: number }[] = [];
//       let i = blockStart;
//       while (i < lines.length && (isLabelLine(lines[i]) || lines[i] === '')) {
//         if (isLabelLine(lines[i])) blockLabels.push({ label: lines[i], i });
//         i++;
//       }
//
//       const blockAmounts: number[] = [];
//       let j = i;
//       while (j < Math.min(i + searchRange, lines.length) && !isLabelLine(lines[j])) {
//         const raw5 = matchAmt(lines[j]);
//         if (raw5) blockAmounts.push(toNum(raw5));
//         j++;
//       }
//
//       const pos = blockLabels.findIndex(b => labelRe.test(b.label));
//       if (pos !== -1 && pos < blockAmounts.length) return blockAmounts[pos];
//       return blockAmounts.length ? Math.max(...blockAmounts) : null;
//     };
//
//     // ── Stratégie 2 : fenêtre bornée entre deux ancres ──────────────────────
//     const extractWindow = (
//         startRe: RegExp,
//         stopRe:  RegExp,
//         pick:    'max' | 'min' | 'first' | 'last' = 'max',
//         min = 0,
//         max = 9_999_999,
//     ): number | null => {
//       const start = lines.findIndex(l => startRe.test(l));
//       if (start === -1) return null;
//
//       const inlineRe = new RegExp(
//           startRe.source + '[^\\n\\d€$£TND]{0,40}(\\d[\\d.,\\s]*[.,]\\d{2,3})',
//           startRe.flags,
//       );
//       const inlineM = lines[start].match(inlineRe);
//       if (inlineM) {
//         const v = toNum(inlineM[1]);
//         if (!isNaN(v) && v >= min && v <= max) return v;
//       }
//
//       let end = Math.min(start + 25, lines.length);
//       for (let i = start + 1; i < end; i++) {
//         if (stopRe.test(lines[i]) && !startRe.test(lines[i])) { end = i; break; }
//       }
//
//       const nums: number[] = [];
//       for (let i = start + 1; i < end; i++) {
//         const rawSolo = matchAmt(lines[i]);
//         if (rawSolo) {
//           const v = toNum(rawSolo);
//           if (!isNaN(v) && v >= min && v <= max) nums.push(v);
//           continue;
//         }
//         const re = /(?:^|[\s:])(\d{1,3}(?:[\s.]\d{3})*[.,]\d{2,3}|\d+[.,]\d{2,3})\s*(?:[€$£]|TND)?(?:\s|$)/g;
//         for (const m of lines[i].matchAll(re)) {
//           const v = toNum(m[1]);
//           if (!isNaN(v) && v >= min && v <= max) nums.push(v);
//         }
//       }
//       if (!nums.length) return null;
//       switch (pick) {
//         case 'max':   return Math.max(...nums);
//         case 'min':   return Math.min(...nums);
//         case 'first': return nums[0];
//         case 'last':  return nums[nums.length - 1];
//       }
//     };
//
//     // ── 1. MONTANT TTC ───────────────────────────────────────────────────────
//     let amount: number | null = null;
//
//     // ── STRATÉGIE 0 (PRIORITAIRE) — Factures tunisiennes multi-colonnes ──────
//     // L'OCR mélange les colonnes : la valeur réelle du "Net à payer" (ex: 279,000)
//     // se retrouve dans le bloc "Total TTC" de droite, APRÈS "Page 1/1".
//     // On remonte depuis "Page X/X" et on prend le premier montant ≥ 10
//     // (seuil élimine timbre=1,000 / quantités isolées / TVA=4,318).
//     {
//       const pageLineIdx = lines.findIndex(l => /^page\s*\d+\/\d+$/i.test(l));
//       if (pageLineIdx !== -1) {
//         for (let i = pageLineIdx - 1; i >= 0; i--) {
//           if (/^(désignation|description|client)$/i.test(lines[i])) break;
//           const raw4 = matchAmt(lines[i]);
//           if (raw4) {
//             const v = toNum(raw4);
//             if (!isNaN(v) && v >= 10) { amount = v; break; }
//           }
//         }
//       }
//     }
//
//     // ── STRATÉGIE 1-2 — Labels explicites (FR/EU et devis) ───────────────────
//     if (!amount) {
//       const AMOUNT_PAIRS: [RegExp, RegExp][] = [
//         [/net\s*[àa]\s*payer/i,       /^page\s*\d/i],
//         [/total\s*ttc\b/i,            /net\s*[àa]\s*payer|^page\s*\d/i],
//         [/total\s*g[eé]n[eé]ral/i,    /^page\s*\d/i],
//         [/montant\s*ttc\b/i,          /^page\s*\d/i],
//         [/amount\s*due/i,             /^page\s*\d/i],
//         [/solde\s*[àa]\s*payer/i,     /^page\s*\d/i],
//         [/^total\s*ttc\s*:/i,         /^page\s*\d/i],
//       ];
//
//       for (const [labelRe, stopRe] of AMOUNT_PAIRS) {
//         amount = extractOrdinal(labelRe);
//         if (amount && amount >= 10) break;
//         amount = extractWindow(labelRe, stopRe, 'max', 10);
//         if (amount) break;
//       }
//     }
//
//     // ── FALLBACK ABSOLU — plus grand montant du document ─────────────────────
//     if (!amount) {
//       const all = lines
//           .map(l => { const r = matchAmt(l); return r ? toNum(r) : null; })
//           .filter((n): n is number => n !== null && n >= 10);
//       if (all.length) amount = Math.max(...all);
//     }
//
//     // ── 2. MONTANT HT ────────────────────────────────────────────────────────
//     let amountHT: number | null = null;
//
//     // Stratégie A : ordinal
//     amountHT =
//         extractOrdinal(/^total\s*ht\b/i) ??
//         extractOrdinal(/^montant\s*ht\b/i) ??
//         extractOrdinal(/^sous[\s\-]total\b/i) ??
//         // Devis tunisiens : "Total HT: 12 000.000 TND"
//         extractWindow(/total\s*ht\b/i, /total\s*ttc|total\s*tva|fodec|timbre/i, 'first', 1) ??
//         null;
//
//     // Stratégie B : bloc "Mode règlement → Arrêtée"
//     if (!amountHT || amountHT < 1) {
//       const modeIdx    = lines.findIndex(l => /mode\s*r[eè]glement/i.test(l));
//       const arreteeIdx = lines.findIndex(l => /arrêt/i.test(l));
//       const htEnd = arreteeIdx !== -1 ? arreteeIdx : Math.min(modeIdx + 8, lines.length);
//       if (modeIdx !== -1) {
//         const candidates = lines
//             .slice(modeIdx + 1, htEnd)
//             .map(l => matchAmt(l))
//             .filter((r): r is string => r !== null)
//             .map(r => toNum(r))
//             .filter(n => n >= 1);
//         if (candidates.length) amountHT = candidates[0];
//       }
//     }
//
//     // Stratégie C : fenêtre classique
//     if (!amountHT) {
//       amountHT =
//           extractWindow(/total\s*ht\b/i, /total\s*tva|total\s*ttc|net\s*[àa]\s*payer|timbre|fodec/i, 'max', 1) ??
//           extractWindow(/montant\s*ht\b/i, /total\s*tva|total\s*ttc|net/i, 'max', 1) ??
//           null;
//     }
//
//     // Stratégie D : factures FR sans "Total HT" explicite (Sous total séparé des valeurs)
//     // Ex: Célia Naudin — 4 650 € = 2ème plus grand montant unique < TTC
//     if (!amountHT && amount) {
//       const allDocAmts = lines
//           .map(l => { const r = matchAmt(l); return r ? toNum(r) : null; })
//           .filter((n): n is number => n !== null && n >= 10 && n < amount);
//       if (allDocAmts.length) {
//         const uniqueSorted = [...new Set(allDocAmts)].sort((a, b) => b - a);
//         if (uniqueSorted[0] && uniqueSorted[0] < amount * 0.99)
//           amountHT = uniqueSorted[0];
//       }
//     }
//
//     if (amountHT && amount && amountHT > amount) amountHT = null;
//
//     // ── 3. TAUX TVA ──────────────────────────────────────────────────────────
//     let tva: number | null = null;
//
//     const tvaExplicit =
//         text.match(/taux\s*tva[:\s]*(\d+)/i) ??
//         text.match(/tva\s*(?:à|au|de)?\s*(\d+)\s*%/i) ??
//         text.match(/vat\s*(?:rate)?\s*[:\s]*(\d+)\s*%/i);
//
//     if (tvaExplicit) {
//       tva = parseInt(tvaExplicit[1]);
//     } else {
//       // Taux courants TN (7, 13, 19%) + FR/EU (10, 20%)
//       const RATES = [5, 7, 10, 13, 14, 19, 20, 21];
//       const freq: Record<number, number> = {};
//       for (const r of RATES) {
//         const withPct    = (text.match(new RegExp(`\\b${r}\\s*%`, 'g')) || []).length;
//         const withoutPct = (text.match(new RegExp(`\\b${r}\\b`, 'g')) || []).length;
//         freq[r] = withPct * 2 + withoutPct * 0.5;
//       }
//       const best = RATES.filter(r => freq[r] > 0).sort((a, b) => freq[b] - freq[a])[0];
//       if (best !== undefined) tva = best;
//     }
//
//     // ── 4. DATE ──────────────────────────────────────────────────────────────
//     let date: string | null = null;
//
//     const dateLabelIdx = lines.findIndex(l =>
//         /^(date\s*(?:de\s*)?(?:facturation|facture|[eé]mission)?|invoice\s*date|date)$/i.test(l),
//     );
//     const dateSearchArea =
//         dateLabelIdx !== -1
//             ? lines.slice(dateLabelIdx, dateLabelIdx + 4).join(' ')
//             : text;
//
//     const DATE_PATTERNS: [RegExp, (m: RegExpMatchArray) => string][] = [
//       [/\b(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{4})\b/, m => `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`],
//       [/\b(\d{4})-(\d{2})-(\d{2})\b/,                    m => `${m[1]}-${m[2]}-${m[3]}`],
//       [/\b(\d{2})[\/\-](\d{4})\b/,                        m => `${m[2]}-${m[1].padStart(2,'0')}-01`],
//       // Année à 2 chiffres : 06/01/25 → 2025-01-06
//       [/\b(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{2})\b/, m => `20${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`],
//     ];
//
//     for (const [re, fmt] of DATE_PATTERNS) {
//       const m = dateSearchArea.match(re);
//       if (m) { date = fmt(m); break; }
//     }
//     if (!date) {
//       for (const [re, fmt] of DATE_PATTERNS) {
//         const m = text.match(re);
//         if (m) { date = fmt(m); break; }
//       }
//     }
//
//     // ── 5. NUMÉRO DE FACTURE / DEVIS ─────────────────────────────────────────
//     let source: string | null = null;
//
//     // Split-ligne : label seul → valeur sur la ligne suivante
//     const SPLIT_LABEL_RE = [
//       /^num[eé]ro\s*(?:de\s*)?(?:facture|devis)$/i,
//       /^invoice\s*(?:number|no\.?|#)$/i,
//       /^n[°o](?:\s*(?:facture|devis))?$/i,
//       /^r[eé]f(?:[eé]rence)?$/i,
//       /^devis\s*n[°o]?$/i,
//     ];
//     // Mots à ne PAS capturer comme numéro de facture (OCR met "N°\nDate\n68")
//     const SOURCE_BLACKLIST = /^(date|client|prix|total|base|tva|vat|mf|page|tel|adresse|email|qte|objet|désignation|description|montant|timbre|fodec|mode|règlement|arrêt)$/i;
//
//     for (const re of SPLIT_LABEL_RE) {
//       const idx = lines.findIndex(l => re.test(l));
//       if (idx !== -1) {
//         for (let i = idx + 1; i < Math.min(idx + 6, lines.length); i++) {
//           if (
//               /^[A-Z0-9\-\/]{1,20}$/i.test(lines[i]) &&
//               !/^\d{8,}$/.test(lines[i]) &&
//               !SOURCE_BLACKLIST.test(lines[i])
//           ) { source = lines[i]; break; }
//         }
//       }
//       if (source) break;
//     }
//
//     // Inline patterns (couvre aussi "Devis N°: A3EB0A" et "Facture N° 68 pour Mohamed")
//     if (!source) {
//       const INLINE_RE = [
//         /(?:facture|devis)\s*n[°o]?\s*[:\s]*(\d{1,10})\s+pour\b/i, // "Facture N° 68 pour Mohamed"
//         /(?:facture|devis)\s*n[°o]?\s*[:\s]*([A-Z0-9\-\/]{1,20})/i,
//         /invoice\s*(?:no\.?|n°|#)?\s*[:\s]*([A-Z0-9\-\/]{1,20})/i,
//         /n[°o]\s*[:\s]*(\d{1,10})/i,
//         /bon\s*(?:de\s*commande\s*)?n[°o]?\s*[:\s]*([A-Z0-9\-\/]{1,20})/i,
//         /r[eé]f(?:[eé]rence)?\s*[:\s]*([A-Z0-9\-\/]{1,20})/i,
//       ];
//       for (const p of INLINE_RE) {
//         const m = text.match(p);
//         if (m) {
//           const c = m[1].trim();
//           if (
//               c.length <= 20 &&
//               !SOURCE_BLACKLIST.test(c) &&
//               !/^(siren|siret)$/i.test(c) &&
//               !/^\d{8,}$/.test(c)
//           ) { source = c; break; }
//         }
//       }
//     }
//
//     // ── DEVIS (déclaré ici car utilisé dans la description) ─────────────────
//     const isDevis = /\bdevis\b/i.test(text);
//
//     // ── 6. DESCRIPTION ───────────────────────────────────────────────────────
//     let description = '';
//
//     const SKIP_DESC =
//         /^(facture|devis|invoice|date|total|net|tva|vat|client|adresse|address|tel|email|mf|page|n°|mode|timbre|fodec|base|arrêt|désignation|description|quantit|unit[eé]|prix|price|montant|amount|taux|rate|règlement|payment|iban|bic|swift|siren|siret|logo|vendeur|seller|ref|ech[eé]ance|paiement|coordonn[eé]es|banque|d[eé]tails|informations|service|garantie)/i;
//
//     // "Vendeur" / "Fournisseur" → ligne suivante = société
//     const vendeurIdx = lines.findIndex(l =>
//         /^(vendeur|seller|fournisseur|[eé]metteur)$/i.test(l),
//     );
//     const companyLine =
//         vendeurIdx !== -1
//             ? lines[vendeurIdx + 1]
//             : lines.find(
//                 l =>
//                     l.length >= 2 &&
//                     l.length <= 60 &&
//                     /[A-Za-z]{2,}/.test(l) &&
//                     !SKIP_DESC.test(l) &&
//                     !/^\d[\d\s,./€$TND]*$/.test(l) &&
//                     !/^[+\d\s().\-]{7,}$/.test(l),
//             );
//
//     if (companyLine && source)
//       description = `${isDevis ? 'Devis' : 'Facture'} ${companyLine} N°${source}`;
//     else if (companyLine)
//       description = companyLine.substring(0, 100);
//
//     if (!description) {
//       for (const label of [/^désignation$/i, /^description$/i, /^libellé$/i, /^objet$/i]) {
//         const idx = lines.findIndex(l => label.test(l));
//         if (idx !== -1 && lines[idx + 1]) {
//           description = lines[idx + 1].substring(0, 100);
//           break;
//         }
//       }
//     }
//
//     if (!description) description = 'Charge (OCR)';
//
//     // ── 7. TYPE DE CHARGE ────────────────────────────────────────────────────
//     const lower = text.toLowerCase();
//     const TYPE_RULES: [RegExp, string][] = [
//       [/loyer|location\s+local|bail\b/,                                                                     'rent'],
//       [/salaire|paie\b|r[eé]mun[eé]ration|fiche\s+de\s+paie|main[\s\-]d.œuvre/,                           'salary'],
//       [/electricit[eé]|steg\b|eau\b|sonede\b|gaz\b|t[eé]l[eé]phone\b|internet\b|fibre\b|edf\b|engie/,    'utilities'],
//       [/souris|clavier|[eé]cran|pc\b|ordinateur|informatique|mat[eé]riel|[eé]quipement|boitier|chargeur|c[aâ]ble|disque|m[eé]moire|cartouche|imprimante|toner|usb\b|sata\b|smartphone|tablette/, 'equipment'],
//       [/publicit[eé]|marketing|impression\b|communication|affiche|flyer|banner|branding|logo|conception/,  'marketing'],
//       [/assurance\b/,                                                                                        'insurance'],
//       [/taxe\b|imp[oô]t|patente\b|fodec\b|contribution|timbre\s+fiscal/,                                   'tax'],
//       [/comptab|expert[\s\-]comptable|commissaire|audit/,                                                   'accounting'],
//       [/carburant|essence\b|gasoil\b|diesel\b/,                                                             'fuel'],
//     ];
//
//     let type = 'other';
//     for (const [re, t] of TYPE_RULES) {
//       if (re.test(lower)) { type = t; break; }
//     }
//
//     // ── DEVISE ───────────────────────────────────────────────────────────────
//     const currency = /TND|DT\b|dinar/i.test(text)
//         ? 'TND'
//         : /€|EUR/i.test(text)
//             ? 'EUR'
//             : /\$|USD/i.test(text)
//                 ? 'USD'
//                 : 'TND'; // défaut Tunisie
//
//     // ── 8. ITEMS (lignes de facturation) ────────────────────────────────────
//     // Stratégie : trouver le bloc "DESCRIPTION / DÉSIGNATION" → collecter
//     // les paires (label texte, montant) jusqu'à "Sous total" / "Total HT" / "Net"
//     const items: { label: string; total: number }[] = [];
//
//     const descBlockIdx = lines.findIndex(l =>
//         /^(d[eé]signation|description|d[eé]tail|libell[eé]|produit|service|article)$/i.test(l),
//     );
//
//     if (descBlockIdx !== -1) {
//       // Collecter toutes les lignes texte (labels) et tous les montants du bloc
//       const stopRe = /sous[\s\-]total|total\s*(ht|ttc|g[eé]n)|net\s*[àa]\s*payer|arrêt|page\s*\d/i;
//       const blockLines: string[] = [];
//       for (let i = descBlockIdx + 1; i < lines.length; i++) {
//         if (stopRe.test(lines[i])) break;
//         blockLines.push(lines[i]);
//       }
//
//       // Séparer labels et montants dans le bloc
//       const blockLabels: string[] = [];
//       const blockTotals: number[] = [];
//
//       for (const bl of blockLines) {
//         const amtRaw = matchAmt(bl);
//         if (amtRaw) {
//           const v = toNum(amtRaw);
//           if (!isNaN(v) && v > 0) blockTotals.push(v);
//         } else if (
//             bl.length >= 3 &&
//             !/^(prix|price|qte|quantit[eé]?|unit[eé]|total|tva|vat|p\.u|ht|ttc|description|d[eé]signation)$/i.test(bl) &&
//             !/^\d{1,3}$/.test(bl) // ignorer les quantités seules ex: "01", "03"
//         ) {
//           blockLabels.push(bl);
//         }
//       }
//
//       // Associer chaque label avec le montant correspondant (même nombre ou moins)
//       // On prend les N derniers montants si plus de montants que de labels
//       // (les colonnes Prix unitaire apparaissent avant Total dans l'OCR)
//       const offset = blockTotals.length - blockLabels.length;
//       blockLabels.forEach((label, i) => {
//         const totalIdx2 = offset + i;
//         if (totalIdx2 >= 0 && totalIdx2 < blockTotals.length) {
//           items.push({ label: label.substring(0, 80), total: blockTotals[totalIdx2] });
//         }
//       });
//     }
//
//     return {
//       rawText: text,
//       suggestion: {
//         description,
//         amount,
//         amountHT,
//         date,
//         source,
//         type,
//         tva,
//         currency,
//         isDevis,
//         items,
//       },
//     };
//   }
// }
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

  // ══════════════════════════════════════════════════════════════════════════
  //  QUOTA
  // ══════════════════════════════════════════════════════════════════════════

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

  private isNewMonth(lastReset: Date, now: Date): boolean {
    return (
        lastReset.getMonth() !== now.getMonth() ||
        lastReset.getFullYear() !== now.getFullYear()
    );
  }

  async getOcrStatus(companyId: string) {
    const company = await this.companyModel.findById(companyId).lean();
    if (!company) throw new BadRequestException('Company introuvable');
    const now      = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const daysLeft  = Math.ceil((nextMonth.getTime() - now.getTime()) / 86_400_000);
    return {
      ocrAttemptsLeft:  company.ocrAttemptsLeft,
      ocrLimitPerMonth: company.ocrLimitPerMonth,
      ocrResetAt:       company.ocrResetAt,
      nextResetInDays:  daysLeft,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  OCR SPACE
  // ══════════════════════════════════════════════════════════════════════════

  private async callOcrSpace(formPayload: Record<string, string>): Promise<string> {
    const apiKey = this.configService.get<string>('OCR_SPACE_API_KEY');
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(formPayload)) params.append(k, v);
    params.append('apikey',             apiKey);
    params.append('language',           'fre');
    params.append('isOverlayRequired',  'false');
    params.append('detectOrientation',  'true');
    params.append('scale',              'true');
    params.append('OCREngine',          '2');

    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 30_000);

    let response: Response;
    try {
      response = await fetch('https://api.ocr.space/parse/image', {
        method: 'POST',
        body:   params,
        signal: controller.signal,
      });
    } catch (fetchErr: any) {
      if (fetchErr.name === 'AbortError')
        throw new BadRequestException('OCR Space timeout (>30s) — essayez une image plus légère');
      throw new BadRequestException(`OCR Space injoignable : ${fetchErr.message}`);
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      const hint =
          response.status === 500 ? ' (PDF non supporté en base64 sur ce plan ?)' :
              response.status === 408 ? ' (timeout — fichier trop lourd ?)'            :
                  response.status === 503 ? ' (service OCR Space indisponible)'            :
                      response.status === 429 ? ' (quota OCR Space dépassé)'                   : '';
      throw new BadRequestException(
          `OCR API HTTP error: ${response.status}${hint} — ${body.substring(0, 200)}`,
      );
    }

    let data: any;
    try { data = await response.json(); }
    catch { throw new BadRequestException('OCR API : réponse non-JSON (service peut-être indisponible)'); }

    if (data.IsErroredOnProcessing) {
      const msg = (data.ErrorMessage || []).join(', ') || data.ErrorDetails || 'Erreur inconnue';
      throw new BadRequestException(`OCR error: ${msg}`);
    }

    const parsed = data.ParsedResults?.[0]?.ParsedText || '';
    if (!parsed.trim()) this.logger.warn('OCR Space returned empty text — fichier illisible ou page blanche');
    return parsed;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  GEMINI VISION — lit directement l'image/PDF en base64
  // ══════════════════════════════════════════════════════════════════════════

  private async callGeminiVision(base64: string, mimeType: string): Promise<any> {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) throw new Error('GEMINI_API_KEY non configurée');

    const prompt = `Tu es un expert comptable. Analyse ce document (facture ou devis) et retourne UNIQUEMENT un JSON valide, sans markdown ni backticks.

{
  "description": "Nom du fournisseur/émetteur, max 100 chars",
  "amount": <montant TTC total en number, ex: 279.0 ou 5580, null si absent>,
  "amountHT": <montant HT en number, null si absent>,
  "date": "YYYY-MM-DD ou null",
  "source": "numéro facture/devis ou null",
  "tva": <taux TVA dominant ex: 19 ou 20, number ou null>,
  "type": "<rent|salary|utilities|equipment|marketing|insurance|tax|accounting|fuel|other>",
  "currency": "<TND|EUR|USD|other>",
  "isDevis": <true si devis, false si facture>,
  "items": [{"label": "désignation ligne", "total": <montant number>}]
}

Règles: montants = numbers purs (pas strings), date ISO YYYY-MM-DD, items = lignes de facturation avec leur total TTC individuel.`;

    const body = {
      contents: [{
        parts: [
          { inline_data: { mime_type: mimeType, data: base64 } },
          { text: prompt },
        ],
      }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
    };

    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 30_000);

    let response: Response;
    try {
      response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal },
      );
    } catch (err: any) {
      if (err.name === 'AbortError') throw new Error('Gemini Vision timeout');
      throw new Error(`Gemini Vision injoignable: ${err.message}`);
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const errBody: any = await response.json().catch(() => ({}));
      if (response.status === 429) {
        const retryInfo = errBody?.error?.details?.find((d: any) => d['@type']?.includes('RetryInfo'));
        const delayMs   = (parseInt(retryInfo?.retryDelay ?? '20') || 20) * 1000;
        this.logger.warn(`Gemini Vision 429 — retry dans ${delayMs}ms`);
        await new Promise(r => setTimeout(r, delayMs));
        response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
        );
        if (!response.ok) throw new Error(`Gemini Vision HTTP ${response.status} après retry`);
      } else {
        throw new Error(`Gemini Vision HTTP ${response.status}: ${JSON.stringify(errBody?.error?.message ?? '')}`);
      }
    }

    const data: any = await response.json();
    const raw     = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    try { return JSON.parse(cleaned); }
    catch { throw new Error(`Gemini Vision JSON invalide: ${cleaned.substring(0, 200)}`); }
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  GEMINI POST-PROCESS — raffine le texte OCR brut
  // ══════════════════════════════════════════════════════════════════════════

  private async callGeminiPostProcess(rawText: string): Promise<any> {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) throw new Error('GEMINI_API_KEY non configurée');

    const prompt = `
Tu es un expert comptable spécialisé dans les factures tunisiennes (TND, FODEC, timbre fiscal)
et françaises/européennes (EUR, TVA).

Voici le texte brut extrait par OCR d'une facture ou d'un devis :

---
${rawText}
---

Extrais les champs suivants. Retourne UNIQUEMENT un objet JSON valide, sans markdown, sans backticks, sans commentaires.

{
  "description": "Nom du fournisseur / émetteur (société ou personne), max 100 caractères. Si absent, prends la désignation principale du produit/service.",
  "amount": <Montant total TTC à payer, number pur ex: 279.000, ou null>,
  "amountHT": <Montant HT total, number pur ex: 273.682, ou null>,
  "date": "Date de facture au format YYYY-MM-DD, ou null",
  "source": "Numéro de facture ou devis (ex: 68, FA20BJ001, A3EB0A), ou null",
  "tva": <Taux TVA dominant en number entier ex: 19, 20, 7, 13, ou null>,
  "type": "<rent|salary|utilities|equipment|marketing|insurance|tax|accounting|fuel|other>",
  "currency": "<TND|EUR|USD|other>",
  "isDevis": <true si c'est un devis, false si facture>
}

Règles :
- amount et amountHT sont des numbers PURS (jamais des strings)
- Pour les montants TND : "279,000" → 279.000 / "14 280.000 TND" → 14280.000
- Pour les montants EUR : "1 620,00 €" → 1620.00 / "5 580 €" → 5580.00
- date au format ISO YYYY-MM-DD strict
- type : loyer→rent, salaire→salary, élec/eau/tel/internet→utilities,
          matériel informatique/souris/PC/USB→equipment,
          publicité/marketing/flyer/logo/bannière→marketing,
          assurance→insurance, taxe/impôt/FODEC/timbre→tax,
          comptable/audit→accounting, carburant→fuel, sinon→other
- currency : détecte TND (Tunisie), EUR (€), USD ($)
- isDevis : true si le document est un devis (Devis, Offre, Proforma), false sinon
- Si un champ est introuvable, mets null
`;

    const doFetch = async (): Promise<Response> =>
        fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
            {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body:    JSON.stringify({
                contents:         [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
              }),
            },
        );

    let response = await doFetch();

    if (response.status === 429) {
      const errBody: any   = await response.json().catch(() => ({}));
      const retryInfo      = errBody?.error?.details?.find((d: any) => d['@type']?.includes('RetryInfo'));
      const delayStr: string = retryInfo?.retryDelay ?? '20s';
      const delayMs        = (parseInt(delayStr) || 20) * 1000;
      this.logger.warn(`Gemini 429 — retry dans ${delayStr}`);
      await new Promise(r => setTimeout(r, delayMs));
      response = await doFetch();
    }

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Gemini API HTTP ${response.status}: ${err}`);
    }

    const data: any  = await response.json();
    const raw        = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
    const cleaned    = raw
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();

    try { return JSON.parse(cleaned); }
    catch { throw new Error(`Gemini JSON invalide: ${cleaned.substring(0, 300)}`); }
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  SCORING
  // ══════════════════════════════════════════════════════════════════════════

  private scoreResult(s: any): number {
    if (!s) return 0;
    let score = 0;
    if (s.amount    != null && s.amount > 0)                  score += 3;
    if (s.amountHT  != null && s.amountHT > 0)                score += 2;
    if (s.date      && /^\d{4}-\d{2}-\d{2}$/.test(s.date))   score += 2;
    if (s.source    && String(s.source).length >= 1)          score += 2;
    if (s.tva       != null && s.tva > 0)                     score += 1;
    if (s.description && s.description !== 'Charge (OCR)')    score += 1;
    if (s.type      && s.type !== 'other')                    score += 1;
    return score;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  FUSION
  // ══════════════════════════════════════════════════════════════════════════

  private mergeResults(
      ocrSuggestion:    any,
      geminiSuggestion: any,
  ): { suggestion: any; winner: 'ocr' | 'gemini' | 'merged' } {
    const ocrScore    = this.scoreResult(ocrSuggestion);
    const geminiScore = this.scoreResult(geminiSuggestion);
    this.logger.debug(`Score OCR=${ocrScore} | Score Gemini=${geminiScore}`);

    if (ocrScore >= geminiScore + 3)   return { suggestion: ocrSuggestion,    winner: 'ocr' };
    if (geminiScore >= ocrScore + 3)   return { suggestion: geminiSuggestion, winner: 'gemini' };

    const merged = {
      description:
          geminiSuggestion?.description && geminiSuggestion.description !== 'Charge (OCR)'
              ? geminiSuggestion.description
              : ocrSuggestion?.description ?? 'Charge (OCR)',

      amount:
          geminiSuggestion?.amount   != null ? geminiSuggestion.amount
              : ocrSuggestion?.amount    != null ? ocrSuggestion.amount
                  : null,

      amountHT:
          geminiSuggestion?.amountHT != null ? geminiSuggestion.amountHT
              : ocrSuggestion?.amountHT  != null ? ocrSuggestion.amountHT
                  : null,

      date:   geminiSuggestion?.date   ?? ocrSuggestion?.date   ?? null,
      source: geminiSuggestion?.source ?? ocrSuggestion?.source ?? null,

      tva:
          geminiSuggestion?.tva != null ? geminiSuggestion.tva
              : ocrSuggestion?.tva  != null ? ocrSuggestion.tva
                  : null,

      type:
          geminiSuggestion?.type && geminiSuggestion.type !== 'other'
              ? geminiSuggestion.type
              : ocrSuggestion?.type ?? 'other',

      currency: geminiSuggestion?.currency ?? 'TND',
      isDevis:  geminiSuggestion?.isDevis  ?? false,

      // Les items viennent toujours de l'OCR regex (Gemini post-process ne les extrait pas)
      items: ocrSuggestion?.items ?? [],
    };

    // Sanity check : amountHT ne peut pas dépasser amount (TTC)
    if (merged.amountHT != null && merged.amount != null && merged.amountHT > merged.amount) {
      merged.amountHT = ocrSuggestion?.amountHT ?? null;
    }

    return { suggestion: merged, winner: 'merged' };
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  POINTS D'ENTRÉE PUBLICS
  // ══════════════════════════════════════════════════════════════════════════

  async analyzeFromUrl(imageUrl: string, companyId: string): Promise<any> {
    await this.checkAndDecrementOcr(companyId);
    try {
      const rawText = await this.callOcrSpace({ url: imageUrl });
      this.logger.debug('OCR raw text (URL):\n' + rawText);

      const [ocrResult, geminiResult] = await Promise.allSettled([
        Promise.resolve(this.extractChargeFields(rawText)),
        this.callGeminiPostProcess(rawText),
      ]);

      const ocrSuggestion    = ocrResult.status    === 'fulfilled' ? ocrResult.value?.suggestion : null;
      const geminiSuggestion = geminiResult.status === 'fulfilled' ? geminiResult.value          : null;

      if (geminiResult.status === 'rejected')
        this.logger.warn(`Gemini failed (URL): ${geminiResult.reason}`);

      const { suggestion, winner } = this.mergeResults(ocrSuggestion, geminiSuggestion);
      return { rawText, winner, suggestion };
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      this.logger.error(`analyzeFromUrl failed: ${err.message}`);
      throw new BadRequestException("Impossible d'analyser le document. Vérifiez l'URL.");
    }
  }

  async analyzeFromBase64(base64: string, mimeType: string, companyId: string): Promise<any> {
    await this.checkAndDecrementOcr(companyId);
    try {
      // ── Étape 1 : Gemini Vision ───────────────────────────────────────────
      let geminiVisionResult: any   = null;
      let geminiVisionError: string | null = null;
      try {
        geminiVisionResult = await this.callGeminiVision(base64, mimeType);
        this.logger.log('Gemini Vision: succès');
      } catch (gErr: any) {
        geminiVisionError = gErr.message;
        this.logger.warn(`Gemini Vision failed: ${gErr.message} — fallback OCR Space`);
      }

      // Bon résultat Gemini Vision → retour direct (avec items vides car Vision ne les extrait pas)
      if (geminiVisionResult && this.scoreResult(geminiVisionResult) >= 5) {
        return {
          rawText:    '',
          winner:     'gemini-vision',
          suggestion: {
            description: geminiVisionResult.description ?? 'Charge (OCR)',
            amount:      geminiVisionResult.amount      ?? null,
            amountHT:    geminiVisionResult.amountHT    ?? null,
            date:        geminiVisionResult.date        ?? null,
            source:      geminiVisionResult.source      ?? null,
            type:        geminiVisionResult.type        ?? 'other',
            tva:         geminiVisionResult.tva         ?? null,
            currency:    geminiVisionResult.currency    ?? 'TND',
            isDevis:     geminiVisionResult.isDevis     ?? false,
            items:       geminiVisionResult.items       ?? [],
          },
        };
      }

      // ── Étape 2 : Fallback OCR Space ──────────────────────────────────────
      this.logger.log('Fallback → OCR Space');
      const ocrPayload: Record<string, string> = {
        base64Image: `data:${mimeType};base64,${base64}`,
      };
      if (mimeType === 'application/pdf') ocrPayload['filetype'] = 'PDF';

      const rawText = await this.callOcrSpace(ocrPayload);
      this.logger.debug('OCR raw text (base64):\n' + rawText);

      // ── Étape 3 : regex + Gemini post-process en parallèle ───────────────
      const [ocrResult, geminiPostResult] = await Promise.allSettled([
        Promise.resolve(this.extractChargeFields(rawText)),
        this.callGeminiPostProcess(rawText),
      ]);

      const ocrSuggestion =
          ocrResult.status === 'fulfilled' ? ocrResult.value?.suggestion : null;
      const geminiSuggestion =
          geminiPostResult.status === 'fulfilled'
              ? geminiPostResult.value
              : geminiVisionResult; // réutilise Vision si post-process échoue aussi

      if (geminiPostResult.status === 'rejected')
        this.logger.warn(`Gemini post-process failed: ${geminiPostResult.reason}`);

      const { suggestion, winner } = this.mergeResults(ocrSuggestion, geminiSuggestion);
      this.logger.log(`OCR winner: ${winner}`);

      return { rawText, winner, suggestion };
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      this.logger.error(`analyzeFromBase64 failed: ${err.message}`);
      throw new BadRequestException("Impossible d'analyser l'image.");
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  EXTRACTION REGEX
  // ══════════════════════════════════════════════════════════════════════════

  private extractChargeFields(text: string) {

    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    const toNum = (s: string): number => {
      const n = s.replace(/[€$£\sTND]/g, '').trim();
      if (/^\d{1,3}([. ]\d{3})*,\d{2,3}$/.test(n))
        return parseFloat(n.replace(/[. ]/g, '').replace(',', '.'));
      if (/^\d{1,3}(,\d{3})*\.\d{2,3}$/.test(n))
        return parseFloat(n.replace(/,/g, ''));
      if (/^\d+,\d{3}$/.test(n))
        return parseFloat(n.replace(',', '.'));
      if (/^\d{1,3}([. ]\d{3})+$/.test(n))
        return parseFloat(n.replace(/[. ]/g, ''));
      if (/^\d[\d\s]*$/.test(n))
        return parseInt(n.replace(/\s/g, ''), 10);
      return parseFloat(n.replace(',', '.'));
    };

    const LINE_AMT_RE =
        /^(\d[\d\s.]*(?:[.,]\d{2,3})?)\s*[€$£]\s*$|^(\d{1,3}(?:[\s.]\d{3})*[.,]\d{2,3}|\d+[.,]\d{2,3})\s*(?:TND)?\s*$/;

    const getAmtGroup  = (m: RegExpMatchArray): string => m[1] ?? m[2];
    const isAmountLine = (l: string) => LINE_AMT_RE.test(l);
    const matchAmt     = (l: string) => { const m = l.match(LINE_AMT_RE); return m ? getAmtGroup(m) : null; };

    const isLabelLine = (l: string) =>
        /^(total\s*(ht|tva|ttc|remise|g[eé]n[eé]ral)|net\s*[àa]\s*payer|timbre|fodec|base(\s*ht)?|mode\s*r[eè]glement|montant\s*(ht|tva|ttc)|sous[\s\-]total|solde|paiement\s*d[uû]|total\s*ttc|total\s*ht)/i.test(l);

    // ── Stratégie 1 : bloc labels groupés ────────────────────────────────────
    const extractOrdinal = (labelRe: RegExp, searchRange = 15): number | null => {
      const idx = lines.findIndex(l => labelRe.test(l));
      if (idx === -1) return null;

      const inlineRe = new RegExp(
          labelRe.source + '[^\\n\\d€$£TND]{0,40}(\\d[\\d.,\\s]*[.,]\\d{2,3})',
          labelRe.flags,
      );
      const inlineM = lines[idx].match(inlineRe);
      if (inlineM) { const v = toNum(inlineM[1]); if (!isNaN(v) && v > 0) return v; }

      let blockStart = idx;
      while (blockStart > 0 && isLabelLine(lines[blockStart - 1])) blockStart--;

      const blockLabels: { label: string; i: number }[] = [];
      let i = blockStart;
      while (i < lines.length && (isLabelLine(lines[i]) || lines[i] === '')) {
        if (isLabelLine(lines[i])) blockLabels.push({ label: lines[i], i });
        i++;
      }

      const blockAmounts: number[] = [];
      let j = i;
      while (j < Math.min(i + searchRange, lines.length) && !isLabelLine(lines[j])) {
        const raw5 = matchAmt(lines[j]);
        if (raw5) blockAmounts.push(toNum(raw5));
        j++;
      }

      const pos = blockLabels.findIndex(b => labelRe.test(b.label));
      if (pos !== -1 && pos < blockAmounts.length) return blockAmounts[pos];
      return blockAmounts.length ? Math.max(...blockAmounts) : null;
    };

    // ── Stratégie 2 : fenêtre bornée ─────────────────────────────────────────
    const extractWindow = (
        startRe: RegExp,
        stopRe:  RegExp,
        pick:    'max' | 'min' | 'first' | 'last' = 'max',
        min = 0,
        max = 9_999_999,
    ): number | null => {
      const start = lines.findIndex(l => startRe.test(l));
      if (start === -1) return null;

      const inlineRe = new RegExp(
          startRe.source + '[^\\n\\d€$£TND]{0,40}(\\d[\\d.,\\s]*[.,]\\d{2,3})',
          startRe.flags,
      );
      const inlineM = lines[start].match(inlineRe);
      if (inlineM) { const v = toNum(inlineM[1]); if (!isNaN(v) && v >= min && v <= max) return v; }

      let end = Math.min(start + 25, lines.length);
      for (let i = start + 1; i < end; i++) {
        if (stopRe.test(lines[i]) && !startRe.test(lines[i])) { end = i; break; }
      }

      const nums: number[] = [];
      for (let i = start + 1; i < end; i++) {
        const rawSolo = matchAmt(lines[i]);
        if (rawSolo) {
          const v = toNum(rawSolo);
          if (!isNaN(v) && v >= min && v <= max) { nums.push(v); continue; }
        }
        const re = /(?:^|[\s:])(\d{1,3}(?:[\s.]\d{3})*[.,]\d{2,3}|\d+[.,]\d{2,3})\s*(?:[€$£]|TND)?(?:\s|$)/g;
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

    // ── 1. MONTANT TTC ───────────────────────────────────────────────────────
    let amount: number | null = null;

    // Stratégie 0 : factures tunisiennes multi-colonnes — remonte depuis "Page X/X"
    {
      const pageLineIdx = lines.findIndex(l => /^page\s*\d+\/\d+$/i.test(l));
      if (pageLineIdx !== -1) {
        for (let i = pageLineIdx - 1; i >= 0; i--) {
          if (/^(désignation|description|client)$/i.test(lines[i])) break;
          const raw4 = matchAmt(lines[i]);
          if (raw4) { const v = toNum(raw4); if (!isNaN(v) && v >= 10) { amount = v; break; } }
        }
      }
    }

    // Stratégie 1-2 : labels explicites
    if (!amount) {
      const AMOUNT_PAIRS: [RegExp, RegExp][] = [
        [/net\s*[àa]\s*payer/i,       /^page\s*\d/i],
        [/total\s*ttc\b/i,            /net\s*[àa]\s*payer|^page\s*\d/i],
        [/total\s*g[eé]n[eé]ral/i,    /^page\s*\d/i],
        [/montant\s*ttc\b/i,          /^page\s*\d/i],
        [/amount\s*due/i,             /^page\s*\d/i],
        [/solde\s*[àa]\s*payer/i,     /^page\s*\d/i],
        [/^total\s*ttc\s*:/i,         /^page\s*\d/i],
      ];
      for (const [labelRe, stopRe] of AMOUNT_PAIRS) {
        amount = extractOrdinal(labelRe);
        if (amount && amount >= 10) break;
        amount = extractWindow(labelRe, stopRe, 'max', 10);
        if (amount) break;
      }
    }

    // Fallback absolu
    if (!amount) {
      const all = lines
          .map(l => { const r = matchAmt(l); return r ? toNum(r) : null; })
          .filter((n): n is number => n !== null && n >= 10);
      if (all.length) amount = Math.max(...all);
    }

    // ── 2. MONTANT HT ────────────────────────────────────────────────────────
    let amountHT: number | null = null;

    // Stratégie A : ordinal
    amountHT =
        extractOrdinal(/^total\s*ht\b/i) ??
        extractOrdinal(/^montant\s*ht\b/i) ??
        extractOrdinal(/^sous[\s\-]total\b/i) ??
        extractWindow(/total\s*ht\b/i, /total\s*ttc|total\s*tva|fodec|timbre/i, 'first', 1) ??
        null;

    // ── Stratégie B : bloc "Mode règlement → Arrêtée" ─────────────────────
    // FIX : filtre >= 10 (ignore timbre=1,000) + Math.max pour avoir le HT réel
    if (!amountHT || amountHT < 1) {
      const modeIdx    = lines.findIndex(l => /mode\s*r[eè]glement/i.test(l));
      const arreteeIdx = lines.findIndex(l => /arrêt/i.test(l));
      const htEnd = arreteeIdx !== -1 ? arreteeIdx : Math.min(modeIdx + 8, lines.length);
      if (modeIdx !== -1) {
        const candidates = lines
            .slice(modeIdx + 1, htEnd)
            .map(l => matchAmt(l))
            .filter((r): r is string => r !== null)
            .map(r => toNum(r))
            .filter(n => n >= 10); // ← FIX : était >= 1, ignorait timbre/FODEC
        if (candidates.length) amountHT = Math.max(...candidates); // ← FIX : était candidates[0]
      }
    }

    // Stratégie C : fenêtre classique
    if (!amountHT) {
      amountHT =
          extractWindow(/total\s*ht\b/i, /total\s*tva|total\s*ttc|net\s*[àa]\s*payer|timbre|fodec/i, 'max', 1) ??
          extractWindow(/montant\s*ht\b/i, /total\s*tva|total\s*ttc|net/i, 'max', 1) ??
          null;
    }

    // Stratégie D : 2ème plus grand montant < TTC
    // FIX : garde >= 50% du TTC pour éviter les sous-totaux de lignes articles
    if (!amountHT && amount) {
      const all = lines
          .map(l => { const r = matchAmt(l); return r ? toNum(r) : null; })
          .filter((n): n is number => n !== null && n >= 10 && n < amount);
      if (all.length) {
        const uniqueSorted = [...new Set(all)].sort((a, b) => b - a);
        const plausible    = uniqueSorted.filter(v => v >= amount * 0.5); // ← FIX
        if (plausible[0] && plausible[0] < amount * 0.99)
          amountHT = plausible[0];
      }
    }

    if (amountHT && amount && amountHT > amount) amountHT = null;

    // ── 3. TAUX TVA ──────────────────────────────────────────────────────────
    let tva: number | null = null;

    const tvaExplicit =
        text.match(/taux\s*tva[:\s]*(\d+)/i) ??
        text.match(/tva\s*(?:à|au|de)?\s*(\d+)\s*%/i) ??
        text.match(/vat\s*(?:rate)?\s*[:\s]*(\d+)\s*%/i);

    if (tvaExplicit) {
      tva = parseInt(tvaExplicit[1]);
    } else {
      const RATES = [5, 7, 10, 13, 14, 19, 20, 21];
      const freq: Record<number, number> = {};
      for (const r of RATES) {
        const withPct    = (text.match(new RegExp(`\\b${r}\\s*%`, 'g')) || []).length;
        const withoutPct = (text.match(new RegExp(`\\b${r}\\b`,   'g')) || []).length;
        freq[r] = withPct * 2 + withoutPct * 0.5;
      }
      const best = RATES.filter(r => freq[r] > 0).sort((a, b) => freq[b] - freq[a])[0];
      if (best !== undefined) tva = best;
    }

    // ── 4. DATE ──────────────────────────────────────────────────────────────
    let date: string | null = null;

    const dateLabelIdx = lines.findIndex(l =>
        /^(date\s*(?:de\s*)?(?:facturation|facture|[eé]mission)?|invoice\s*date|date)$/i.test(l),
    );
    const dateSearchArea =
        dateLabelIdx !== -1
            ? lines.slice(dateLabelIdx, dateLabelIdx + 4).join(' ')
            : text;

    const DATE_PATTERNS: [RegExp, (m: RegExpMatchArray) => string][] = [
      [/\b(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{4})\b/, m => `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`],
      [/\b(\d{4})-(\d{2})-(\d{2})\b/,                    m => `${m[1]}-${m[2]}-${m[3]}`],
      [/\b(\d{2})[\/\-](\d{4})\b/,                        m => `${m[2]}-${m[1].padStart(2,'0')}-01`],
      [/\b(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{2})\b/, m => `20${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`],
    ];

    for (const [re, fmt] of DATE_PATTERNS) {
      const m = dateSearchArea.match(re);
      if (m) { date = fmt(m); break; }
    }
    if (!date) {
      for (const [re, fmt] of DATE_PATTERNS) {
        const m = text.match(re);
        if (m) { date = fmt(m); break; }
      }
    }

    // ── 5. NUMÉRO FACTURE / DEVIS ─────────────────────────────────────────
    let source: string | null = null;

    const SPLIT_LABEL_RE = [
      /^num[eé]ro\s*(?:de\s*)?(?:facture|devis)$/i,
      /^invoice\s*(?:number|no\.?|#)$/i,
      /^n[°o](?:\s*(?:facture|devis))?$/i,
      /^r[eé]f(?:[eé]rence)?$/i,
      /^devis\s*n[°o]?$/i,
    ];
    const SOURCE_BLACKLIST = /^(date|client|prix|total|base|tva|vat|mf|page|tel|adresse|email|qte|objet|désignation|description|montant|timbre|fodec|mode|règlement|arrêt)$/i;

    for (const re of SPLIT_LABEL_RE) {
      const idx = lines.findIndex(l => re.test(l));
      if (idx !== -1) {
        for (let i = idx + 1; i < Math.min(idx + 6, lines.length); i++) {
          if (
              /^[A-Z0-9\-\/]{1,20}$/i.test(lines[i]) &&
              !/^\d{8,}$/.test(lines[i]) &&
              !SOURCE_BLACKLIST.test(lines[i])
          ) { source = lines[i]; break; }
        }
      }
      if (source) break;
    }

    if (!source) {
      const INLINE_RE = [
        /(?:facture|devis)\s*n[°o]?\s*[:\s]*(\d{1,10})\s+pour\b/i,
        /(?:facture|devis)\s*n[°o]?\s*[:\s]*([A-Z0-9\-\/]{1,20})/i,
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
              !SOURCE_BLACKLIST.test(c) &&
              !/^(siren|siret)$/i.test(c) &&
              !/^\d{8,}$/.test(c)
          ) { source = c; break; }
        }
      }
    }

    // ── Devis ─────────────────────────────────────────────────────────────
    const isDevis = /\bdevis\b/i.test(text);

    // ── 6. DESCRIPTION ───────────────────────────────────────────────────
    let description = '';

    const SKIP_DESC =
        /^(facture|devis|invoice|date|total|net|tva|vat|client|adresse|address|tel|email|mf|page|n°|mode|timbre|fodec|base|arrêt|désignation|description|quantit|unit[eé]|prix|price|montant|amount|taux|rate|règlement|payment|iban|bic|swift|siren|siret|logo|vendeur|seller|ref|ech[eé]ance|paiement|coordonn[eé]es|banque|d[eé]tails|informations|service|garantie)/i;

    const vendeurIdx = lines.findIndex(l => /^(vendeur|seller|fournisseur|[eé]metteur)$/i.test(l));
    const companyLine =
        vendeurIdx !== -1
            ? lines[vendeurIdx + 1]
            : lines.find(l =>
                l.length >= 2 && l.length <= 60 &&
                /[A-Za-z]{2,}/.test(l) &&
                !SKIP_DESC.test(l) &&
                !/^\d[\d\s,./€$TND]*$/.test(l) &&
                !/^[+\d\s().\-]{7,}$/.test(l),
            );

    if (companyLine && source)
      description = `${isDevis ? 'Devis' : 'Facture'} ${companyLine} N°${source}`;
    else if (companyLine)
      description = companyLine.substring(0, 100);

    if (!description) {
      for (const label of [/^désignation$/i, /^description$/i, /^libellé$/i, /^objet$/i]) {
        const idx = lines.findIndex(l => label.test(l));
        if (idx !== -1 && lines[idx + 1]) { description = lines[idx + 1].substring(0, 100); break; }
      }
    }
    if (!description) description = 'Charge (OCR)';

    // ── 7. TYPE ───────────────────────────────────────────────────────────
    const lower = text.toLowerCase();
    const TYPE_RULES: [RegExp, string][] = [
      [/loyer|location\s+local|bail\b/,                                                                              'rent'],
      [/salaire|paie\b|r[eé]mun[eé]ration|fiche\s+de\s+paie|main[\s\-]d.œuvre/,                                    'salary'],
      [/electricit[eé]|steg\b|eau\b|sonede\b|gaz\b|t[eé]l[eé]phone\b|internet\b|fibre\b|edf\b|engie/,             'utilities'],
      [/souris|clavier|[eé]cran|pc\b|ordinateur|informatique|mat[eé]riel|[eé]quipement|boitier|chargeur|c[aâ]ble|disque|m[eé]moire|cartouche|imprimante|toner|usb\b|sata\b|smartphone|tablette/, 'equipment'],
      [/publicit[eé]|marketing|impression\b|communication|affiche|flyer|banner|branding|logo|conception/,           'marketing'],
      [/assurance\b/,                                                                                                 'insurance'],
      [/taxe\b|imp[oô]t|patente\b|fodec\b|contribution|timbre\s+fiscal/,                                            'tax'],
      [/comptab|expert[\s\-]comptable|commissaire|audit/,                                                            'accounting'],
      [/carburant|essence\b|gasoil\b|diesel\b/,                                                                      'fuel'],
    ];
    let type = 'other';
    for (const [re, t] of TYPE_RULES) { if (re.test(lower)) { type = t; break; } }

    // ── DEVISE ────────────────────────────────────────────────────────────
    const currency =
        /TND|DT\b|dinar/i.test(text) ? 'TND' :
            /€|EUR/i.test(text)          ? 'EUR' :
                /\$|USD/i.test(text)         ? 'USD' : 'TND';

    // ── 8. ITEMS ──────────────────────────────────────────────────────────
    const items: { label: string; total: number }[] = [];

    const descBlockIdx = lines.findIndex(l =>
        /^(d[eé]signation|description|d[eé]tail|libell[eé]|produit|service|article)$/i.test(l),
    );

    if (descBlockIdx !== -1) {
      const stopRe = /sous[\s\-]total|total\s*(ht|ttc|g[eé]n)|net\s*[àa]\s*payer|arrêt|page\s*\d/i;
      const blockLines: string[] = [];
      for (let i = descBlockIdx + 1; i < lines.length; i++) {
        if (stopRe.test(lines[i])) break;
        blockLines.push(lines[i]);
      }

      const blockLabels: string[] = [];
      const blockTotals: number[] = [];

      for (const bl of blockLines) {
        const amtRaw = matchAmt(bl);
        if (amtRaw) {
          const v = toNum(amtRaw);
          if (!isNaN(v) && v > 0) blockTotals.push(v);
        } else if (
            bl.length >= 3 &&
            !/^(prix|price|qte|quantit[eé]?|unit[eé]|total|tva|vat|p\.u|ht|ttc|description|d[eé]signation)$/i.test(bl) &&
            !/^\d{1,3}$/.test(bl)
        ) {
          blockLabels.push(bl);
        }
      }

      const offset = blockTotals.length - blockLabels.length;
      blockLabels.forEach((label, i) => {
        const totalIdx2 = offset + i;
        if (totalIdx2 >= 0 && totalIdx2 < blockTotals.length)
          items.push({ label: label.substring(0, 80), total: blockTotals[totalIdx2] });
      });
    }

    return {
      rawText: text,
      suggestion: {
        description, amount, amountHT, date, source,
        type, tva, currency, isDevis, items,
      },
    };
  }
}