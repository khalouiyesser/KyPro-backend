import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as PDFDocument from 'pdfkit';
import * as ExcelJS from 'exceljs';
import { Company } from '../company/company.schema';

@Injectable()
export class ExportService {
  constructor(@InjectModel(Company.name) private companyModel: Model<any>) {}

  // ══════════════════════════════════════════════════════════
  //  HELPERS
  // ══════════════════════════════════════════════════════════
  private async getCompany(companyId: string): Promise<any> {
    if (!companyId) return null;
    return this.companyModel.findById(companyId).lean();
  }

  private fmt(n: number): string {
    return (n || 0).toFixed(3).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' TND';
  }

  private fmtDate(d: Date | string): string {
    if (!d) return '';
    return new Date(d).toLocaleDateString('fr-TN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  private fmtDateTime(d: Date | string): string {
    if (!d) return '';
    return new Date(d).toLocaleString('fr-TN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  // ── PDF Header ────────────────────────────────────────────────────────────
  private async addPdfHeader(doc: typeof PDFDocument, company: any, title: string) {
    doc.rect(0, 0, doc.page.width, 100).fill('#1e3a5f');

    doc.fillColor('#ffffff').fontSize(18).font('Helvetica-Bold')
        .text(company?.name || 'ERP System', 40, 20);

    if (company?.address) doc.fontSize(9).font('Helvetica').text(company.address, 40, 42);
    if (company?.phone)   doc.text(`Tel: ${company.phone}`, 40, 54);
    if (company?.email)   doc.text(`Email: ${company.email}`, 40, 66);
    if (company?.matriculeFiscal) doc.text(`MF: ${company.matriculeFiscal}`, 40, 78);

    doc.fontSize(20).font('Helvetica-Bold').fillColor('#ffffff')
        .text(title, 0, 35, { align: 'right', width: doc.page.width - 40 });

    doc.moveDown(3);
    doc.fillColor('#000000');
  }

  // ── PDF Footer ────────────────────────────────────────────────────────────
  private addPdfFooter(doc: typeof PDFDocument, company: any) {
    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      const y = doc.page.height - 50;
      doc.rect(0, y - 10, doc.page.width, 50).fill('#f0f4f8');
      doc.fontSize(8).fillColor('#666')
          .text(`${company?.name || 'ERP'} -- Genere le ${new Date().toLocaleDateString('fr-TN')}`, 40, y, { align: 'left' })
          .text(`Page ${i + 1}/${pageCount}`, 0, y, { align: 'right', width: doc.page.width - 40 });
    }
  }

  // ══════════════════════════════════════════════════════════
  //  FACTURE VENTE PDF
  // ══════════════════════════════════════════════════════════
  async generateSaleInvoicePdf(sale: any, companyId: string): Promise<Buffer> {
    const company = await this.getCompany(companyId);
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, bufferPages: true, size: 'A4' });
      const buffers: Buffer[] = [];
      doc.on('data', d => buffers.push(d));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      this.addPdfHeader(doc, company, 'FACTURE').then(() => {
        const infoY = doc.y;
        doc.fontSize(10).font('Helvetica');
        doc.text(`N° Facture: ${sale._id?.toString().slice(-6).toUpperCase()}`, 40, infoY);
        doc.text(`Date: ${this.fmtDate(sale.createdAt)}`, 40);
        doc.text(`Vendeur: ${sale.createdByName || '—'}`, 40);
        doc.moveDown(0.5);

        doc.rect(350, infoY, 210, 65).fill('#f0f4f8');
        doc.fillColor('#000').font('Helvetica-Bold').text('FACTURER A', 360, infoY + 5);
        doc.font('Helvetica').text(sale.clientName || '—', 360, infoY + 20);

        doc.moveDown(2);
        const tableTop = doc.y;
        const cols = [40, 200, 310, 380, 450, 510];
        const headers = ['#', 'Designation', 'Qte', 'PU HT', 'TVA%', 'Total TTC'];
        doc.rect(40, tableTop, doc.page.width - 80, 22).fill('#1e3a5f');
        headers.forEach((h, i) => {
          doc.fillColor('#fff').font('Helvetica-Bold').fontSize(9)
              .text(h, cols[i], tableTop + 6, { width: (cols[i+1] || 560) - cols[i] });
        });
        doc.fillColor('#000').font('Helvetica').fontSize(9);

        (sale.items || []).forEach((item: any, idx: number) => {
          const rowY = tableTop + 22 + idx * 20;
          if (idx % 2 === 0) doc.rect(40, rowY, doc.page.width - 80, 20).fill('#f9fafb');
          doc.fillColor('#000')
              .text(`${idx + 1}`, cols[0], rowY + 5)
              .text(item.productName || '', cols[1], rowY + 5, { width: 100 })
              .text(`${item.quantity} ${item.unit || ''}`.trim(), cols[2], rowY + 5)
              .text(this.fmt(item.unitPrice), cols[3], rowY + 5)
              .text(`${item.tva || 0}%`, cols[4], rowY + 5)
              .text(this.fmt(item.totalTTC), cols[5], rowY + 5);
        });

        const totY = tableTop + 22 + (sale.items?.length || 0) * 20 + 15;
        doc.rect(350, totY, 210, 80).stroke('#1e3a5f');
        doc.fontSize(10).font('Helvetica')
            .text('Total HT:', 360, totY + 8).text(this.fmt(sale.totalHT), 480, totY + 8)
            .text('TVA:', 360, totY + 25).text(this.fmt(sale.totalTTC - sale.totalHT), 480, totY + 25);
        doc.font('Helvetica-Bold').fontSize(11)
            .text('Total TTC:', 360, totY + 45).text(this.fmt(sale.totalTTC), 480, totY + 45)
            .text('Paye:', 360, totY + 62).text(this.fmt(sale.amountPaid), 480, totY + 62);
        if (sale.amountRemaining > 0) {
          doc.fillColor('#cc0000')
              .text('Reste:', 360, totY + 78).text(this.fmt(sale.amountRemaining), 480, totY + 78);
          doc.fillColor('#000');
        }

        if (sale.notes) {
          doc.moveDown(6).fontSize(9).font('Helvetica-Bold').text('Notes:')
              .font('Helvetica').text(sale.notes);
        }

        this.addPdfFooter(doc, company);
        doc.end();
      });
    });
  }

  // ══════════════════════════════════════════════════════════
  //  FACTURE VENTE EXCEL
  // ══════════════════════════════════════════════════════════
  async generateSaleInvoiceExcel(sale: any, companyId: string): Promise<Buffer> {
    const company = await this.getCompany(companyId);
    const wb = new ExcelJS.Workbook();
    wb.creator = company?.name || 'ERP';
    wb.created = new Date();
    const ws = wb.addWorksheet('Facture');

    ws.mergeCells('A1:G1');
    const headerCell = ws.getCell('A1');
    headerCell.value = company?.name || 'ERP System';
    headerCell.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
    headerCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1e3a5f' } };
    headerCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 30;

    ws.mergeCells('A2:G2');
    ws.getCell('A2').value = `${company?.address || ''} | Tel: ${company?.phone || ''} | ${company?.email || ''}`;
    ws.getCell('A2').alignment = { horizontal: 'center' };

    if (company?.matriculeFiscal) {
      ws.mergeCells('A3:G3');
      ws.getCell('A3').value = `MF: ${company.matriculeFiscal}`;
      ws.getCell('A3').alignment = { horizontal: 'center' };
    }

    ws.addRow([]);
    ws.mergeCells('A5:G5');
    ws.getCell('A5').value = `FACTURE N° ${sale._id?.toString().slice(-6).toUpperCase()}`;
    ws.getCell('A5').font = { bold: true, size: 14 };
    ws.getCell('A5').alignment = { horizontal: 'center' };

    ws.addRow(['Client:', sale.clientName, '', 'Date:', this.fmtDate(sale.createdAt)]);
    ws.addRow(['Vendeur:', sale.createdByName || '—']);
    ws.addRow([]);

    const tableRow = ws.addRow(['#', 'Designation', 'Quantite', 'PU HT', 'TVA%', 'HT', 'TTC']);
    tableRow.eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1e3a5f' } };
      cell.alignment = { horizontal: 'center' };
    });

    (sale.items || []).forEach((item: any, idx: number) => {
      const r = ws.addRow([idx+1, item.productName, item.quantity, item.unitPrice, `${item.tva}%`, item.totalHT, item.totalTTC]);
      if (idx % 2 === 0) r.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F4F8' } }; });
    });

    ws.addRow([]);
    ws.addRow(['', '', '', '', '', 'Total HT:', sale.totalHT]);
    ws.addRow(['', '', '', '', '', 'TVA:', sale.totalTTC - sale.totalHT]);
    const totRow = ws.addRow(['', '', '', '', '', 'Total TTC:', sale.totalTTC]);
    totRow.getCell(7).font = { bold: true };
    ws.addRow(['', '', '', '', '', 'Paye:', sale.amountPaid]);
    if (sale.amountRemaining > 0) {
      const remRow = ws.addRow(['', '', '', '', '', 'Reste:', sale.amountRemaining]);
      remRow.getCell(7).font = { bold: true, color: { argb: 'FFCC0000' } };
    }

    ws.columns = [{ width: 5 }, { width: 30 }, { width: 12 }, { width: 15 }, { width: 10 }, { width: 20 }, { width: 20 }];
    return (wb.xlsx.writeBuffer() as unknown) as Promise<Buffer>;
  }

  // ══════════════════════════════════════════════════════════
  //  DEVIS PDF
  // ══════════════════════════════════════════════════════════
  // ══════════════════════════════════════════════════════════════════════════════
//  generateQuotePdf — Version redessinée
//  • Design moderne avec bande colorée latérale
//  • TVA affichée par ligne ET dans le bloc récap
//  • Numéro de devis, validité, adresse client
//  • Tableau TVA par taux (récap comptable)
// ══════════════════════════════════════════════════════════════════════════════

  async generateQuotePdf(quote: any, companyId: string): Promise<Buffer> {
    const company = await this.getCompany(companyId);

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 0, bufferPages: true, size: 'A4' });
      const buffers: Buffer[] = [];
      doc.on('data',  (d) => buffers.push(d));
      doc.on('end',   () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const W = doc.page.width;   // 595
      const H = doc.page.height;  // 842
      const MARGIN = 40;

      // ── Palette ──────────────────────────────────────────────────────────────
      const PRIMARY   = '#1B3F72'; // Bleu marine
      const ACCENT    = '#2E7CF6'; // Bleu vif
      const LIGHT_BG  = '#F4F7FB'; // Gris très clair
      const TEXT_DARK = '#1A1A2E';
      const TEXT_GRAY = '#6B7280';
      const RED       = '#DC2626';
      const GREEN     = '#16A34A';

      // ════════════════════════════════════════════════════════════════════════
      //  HEADER
      // ════════════════════════════════════════════════════════════════════════
      // Bande de fond pleine largeur
      doc.rect(0, 0, W, 120).fill(PRIMARY);

      // Barre d'accent fine en bas du header
      doc.rect(0, 118, W, 4).fill(ACCENT);

      // Nom de la société
      doc.fillColor('#FFFFFF')
          .fontSize(22).font('Helvetica-Bold')
          .text(company?.name || 'ERP System', MARGIN, 22, { width: W / 2 - MARGIN });

      // Infos société (adresse, tel, email, MF) — colonne gauche
      doc.fontSize(8).font('Helvetica').fillColor('#CBD5E1');
      let infoY = 50;
      if (company?.address) { doc.text(company.address, MARGIN, infoY); infoY += 11; }
      if (company?.phone)   { doc.text(`Tél : ${company.phone}`, MARGIN, infoY); infoY += 11; }
      if (company?.email)   { doc.text(company.email, MARGIN, infoY); infoY += 11; }
      if (company?.matriculeFiscal) doc.text(`MF : ${company.matriculeFiscal}`, MARGIN, infoY);

      // Titre DEVIS — colonne droite
      doc.fontSize(36).font('Helvetica-Bold').fillColor('#FFFFFF')
          .text('DEVIS', 0, 30, { align: 'right', width: W - MARGIN });

      // Numéro et date — colonne droite
      const quoteNum = quote.quoteNumber || quote._id?.toString().slice(-8).toUpperCase();
      doc.fontSize(9).font('Helvetica').fillColor('#93C5FD')
          .text(`N° ${quoteNum}`, 0, 72, { align: 'right', width: W - MARGIN })
          .text(`Date : ${this.fmtDate(quote.createdAt)}`, 0, 84, { align: 'right', width: W - MARGIN });
      if (quote.validUntil) {
        doc.text(`Valable jusqu'au : ${this.fmtDate(quote.validUntil)}`, 0, 96, { align: 'right', width: W - MARGIN });
      }

      // ════════════════════════════════════════════════════════════════════════
      //  BLOC CLIENT + INFOS DEVIS
      // ════════════════════════════════════════════════════════════════════════
      const blockY = 136;

      // Bloc client (gauche)
      doc.rect(MARGIN, blockY, (W / 2) - MARGIN - 8, 90).fill(LIGHT_BG);
      doc.fillColor(PRIMARY).fontSize(8).font('Helvetica-Bold')
          .text('FACTURER À', MARGIN + 10, blockY + 10);

      doc.fillColor(TEXT_DARK).fontSize(11).font('Helvetica-Bold')
          .text(quote.clientName || '—', MARGIN + 10, blockY + 24, { width: (W / 2) - MARGIN - 28 });

      doc.fontSize(8.5).font('Helvetica').fillColor(TEXT_GRAY);
      let clientInfoY = blockY + 40;
      if (quote.clientAddress) {
        doc.text(quote.clientAddress, MARGIN + 10, clientInfoY, { width: (W / 2) - MARGIN - 28 });
        clientInfoY += 11;
      }
      if (quote.clientPhone) {
        doc.text(`Tél : ${quote.clientPhone}`, MARGIN + 10, clientInfoY); clientInfoY += 11;
      }
      if (quote.clientEmail) {
        doc.text(quote.clientEmail, MARGIN + 10, clientInfoY);
      }

      // Bloc infos devis (droite)
      const rightBlockX = W / 2 + 8;
      const rightBlockW = W - MARGIN - rightBlockX;
      doc.rect(rightBlockX, blockY, rightBlockW, 90).fill(LIGHT_BG);

      doc.fillColor(PRIMARY).fontSize(8).font('Helvetica-Bold')
          .text('INFORMATIONS DU DEVIS', rightBlockX + 10, blockY + 10);

      const infoRows = [
        ['Créé par',   quote.createdByName || '—'],
        ['Statut',     (quote.status || 'draft').toUpperCase()],
        ['Ref.',       quoteNum],
      ];
      if (quote.validUntil) infoRows.push(['Expiration', this.fmtDate(quote.validUntil)]);

      let infoRowY = blockY + 26;
      doc.fontSize(8.5);
      infoRows.forEach(([label, value]) => {
        doc.font('Helvetica').fillColor(TEXT_GRAY).text(label, rightBlockX + 10, infoRowY);
        doc.font('Helvetica-Bold').fillColor(TEXT_DARK).text(value, rightBlockX + 80, infoRowY);
        infoRowY += 14;
      });

      // ════════════════════════════════════════════════════════════════════════
      //  TABLEAU DES LIGNES
      // ════════════════════════════════════════════════════════════════════════
      const tableTop = blockY + 106;

      // En-têtes colonnes
      const cols = {
        num:   { x: MARGIN,       w: 22  },
        name:  { x: MARGIN + 22,  w: 175 },
        qty:   { x: MARGIN + 197, w: 45  },
        price: { x: MARGIN + 242, w: 75  },
        tva:   { x: MARGIN + 317, w: 45  },
        ht:    { x: MARGIN + 362, w: 75  },
        ttc:   { x: MARGIN + 437, w: W - MARGIN - MARGIN - 437 },
      };

      // Fond header tableau
      doc.rect(MARGIN, tableTop, W - 2 * MARGIN, 22).fill(PRIMARY);

      const headers: [keyof typeof cols, string, string][] = [
        ['num',   '#',          'center'],
        ['name',  'Désignation','left'],
        ['qty',   'Qté',        'center'],
        ['price', 'P.U. HT',    'right'],
        ['tva',   'TVA %',      'center'],
        ['ht',    'Total HT',   'right'],
        ['ttc',   'Total TTC',  'right'],
      ];

      headers.forEach(([col, label, align]) => {
        doc.fillColor('#FFFFFF').fontSize(8).font('Helvetica-Bold')
            .text(label, cols[col].x + 3, tableTop + 7, {
              width: cols[col].w - 6,
              align: align as any,
            });
      });

      // Lignes
      const items: any[] = quote.items || [];
      let curY = tableTop + 22;

      items.forEach((item: any, idx: number) => {
        const rowH = 22;
        // Zébrage
        if (idx % 2 === 0) {
          doc.rect(MARGIN, curY, W - 2 * MARGIN, rowH).fill(LIGHT_BG);
        }

        // Séparateur bas de ligne
        doc.rect(MARGIN, curY + rowH - 0.5, W - 2 * MARGIN, 0.5).fill('#E5E7EB');

        doc.fillColor(TEXT_DARK).fontSize(8).font('Helvetica');

        const totalTVA = item.totalTVA ?? (item.totalHT * (item.tva || 0) / 100);

        doc.text(`${idx + 1}`, cols.num.x + 3, curY + 7,   { width: cols.num.w - 6,   align: 'center' });
        doc.font('Helvetica-Bold')
            .text(item.productName || '—', cols.name.x + 3, curY + 7, { width: cols.name.w - 6, align: 'left' });
        doc.font('Helvetica')
            .text(`${item.quantity}`, cols.qty.x + 3, curY + 7, { width: cols.qty.w - 6, align: 'center' })
            .text(this.fmt(item.unitPrice), cols.price.x + 3, curY + 7, { width: cols.price.w - 6, align: 'right' })
            .text(`${item.tva ?? 19} %`, cols.tva.x + 3, curY + 7,  { width: cols.tva.w - 6, align: 'center' })
            .text(this.fmt(item.totalHT),  cols.ht.x + 3, curY + 7,  { width: cols.ht.w - 6,  align: 'right' })
            .text(this.fmt(item.totalTTC), cols.ttc.x + 3, curY + 7, { width: cols.ttc.w - 6, align: 'right' });

        curY += rowH;
      });

      // Ligne de clôture tableau
      doc.rect(MARGIN, curY, W - 2 * MARGIN, 1.5).fill(PRIMARY);
      curY += 10;

      // ════════════════════════════════════════════════════════════════════════
      //  BLOC TOTAUX (droite) + TABLEAU TVA PAR TAUX (gauche)
      // ════════════════════════════════════════════════════════════════════════
      const totalBlockW = 200;
      const totalBlockX = W - MARGIN - totalBlockW;
      let totalRowY = curY + 6;

      // Fond bloc totaux
      doc.rect(totalBlockX - 5, totalRowY - 6, totalBlockW + 5, 95).fill(LIGHT_BG);

      const totalTVA   = quote.totalTVA ?? (quote.totalTTC - quote.totalHT);
      const totalsRows = [
        { label: 'Total HT',  value: this.fmt(quote.totalHT),  bold: false, color: TEXT_DARK },
        { label: 'Total TVA', value: this.fmt(totalTVA),        bold: false, color: TEXT_DARK },
        { label: 'Total TTC', value: this.fmt(quote.totalTTC),  bold: true,  color: PRIMARY   },
      ];

      totalsRows.forEach(({ label, value, bold, color }) => {
        doc.fontSize(bold ? 11 : 9)
            .font(bold ? 'Helvetica-Bold' : 'Helvetica')
            .fillColor(TEXT_GRAY)
            .text(label, totalBlockX, totalRowY, { width: 90 });
        doc.fillColor(color)
            .text(value, totalBlockX + 95, totalRowY, { width: totalBlockW - 95, align: 'right' });
        totalRowY += bold ? 22 : 16;
        if (bold) {
          // Séparateur au-dessus du Total TTC
          doc.rect(totalBlockX, totalRowY - 22, totalBlockW, 0.7).fill(ACCENT);
        }
      });

      // Récap TVA par taux (gauche, si plusieurs taux)
      const tvaByRate: Record<number, { base: number; montant: number }> = {};
      items.forEach((item: any) => {
        const rate   = item.tva ?? 19;
        const tvaAmt = item.totalTVA ?? (item.totalHT * rate / 100);
        if (!tvaByRate[rate]) tvaByRate[rate] = { base: 0, montant: 0 };
        tvaByRate[rate].base    += item.totalHT;
        tvaByRate[rate].montant += tvaAmt;
      });

      const rates = Object.keys(tvaByRate);
      if (rates.length > 0) {
        const tvaSummaryX = MARGIN;
        let tvaSummaryY   = curY + 6;

        doc.rect(tvaSummaryX, tvaSummaryY, 230, 20 + rates.length * 16).fill(LIGHT_BG);
        doc.fillColor(PRIMARY).fontSize(8).font('Helvetica-Bold')
            .text('RÉCAPITULATIF TVA', tvaSummaryX + 8, tvaSummaryY + 6);
        tvaSummaryY += 20;

        // Entête mini-tableau TVA
        doc.fillColor(TEXT_GRAY).fontSize(7.5).font('Helvetica-Bold')
            .text('Taux', tvaSummaryX + 8, tvaSummaryY)
            .text('Base HT',  tvaSummaryX + 55, tvaSummaryY)
            .text('Montant TVA', tvaSummaryX + 130, tvaSummaryY);
        tvaSummaryY += 12;

        rates.forEach((rate) => {
          const { base, montant } = tvaByRate[+rate];
          doc.fillColor(TEXT_DARK).fontSize(8).font('Helvetica')
              .text(`${rate} %`,          tvaSummaryX + 8,   tvaSummaryY)
              .text(this.fmt(base),        tvaSummaryX + 55,  tvaSummaryY)
              .text(this.fmt(montant),     tvaSummaryX + 130, tvaSummaryY);
          tvaSummaryY += 14;
        });
      }

      // ════════════════════════════════════════════════════════════════════════
      //  NOTES
      // ════════════════════════════════════════════════════════════════════════
      if (quote.notes) {
        const notesY = Math.max(totalRowY, curY + 110) + 16;
        doc.rect(MARGIN, notesY, W - 2 * MARGIN, 1).fill('#E5E7EB');
        doc.fillColor(PRIMARY).fontSize(8).font('Helvetica-Bold')
            .text('NOTES & CONDITIONS', MARGIN, notesY + 8);
        doc.fillColor(TEXT_GRAY).fontSize(8.5).font('Helvetica')
            .text(quote.notes, MARGIN, notesY + 22, { width: W - 2 * MARGIN });
      }

      // ════════════════════════════════════════════════════════════════════════
      //  FOOTER multi-page
      // ════════════════════════════════════════════════════════════════════════
      const pageCount = doc.bufferedPageRange().count;
      for (let i = 0; i < pageCount; i++) {
        doc.switchToPage(i);
        const fy = H - 36;

        doc.rect(0, fy - 4, W, 40).fill(PRIMARY);

        doc.fillColor('#93C5FD').fontSize(7.5).font('Helvetica')
            .text(
                `${company?.name || 'ERP'} — Généré le ${new Date().toLocaleDateString('fr-TN')}`,
                MARGIN, fy + 4,
                { align: 'left', width: W / 2 },
            )
            .text(
                `Page ${i + 1} / ${pageCount}`,
                0, fy + 4,
                { align: 'right', width: W - MARGIN },
            );

        if (company?.matriculeFiscal) {
          doc.text(`MF : ${company.matriculeFiscal}`, 0, fy + 16, { align: 'center', width: W });
        }
      }

      doc.end();
    });
  }

  // ══════════════════════════════════════════════════════════
  //  ACHAT PDF
  // ══════════════════════════════════════════════════════════
  async generatePurchasePdf(purchase: any, companyId: string): Promise<Buffer> {
    const company = await this.getCompany(companyId);
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, bufferPages: true });
      const buffers: Buffer[] = [];
      doc.on('data', d => buffers.push(d));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);
      this.addPdfHeader(doc, company, 'BON DE COMMANDE').then(() => {
        doc.fontSize(10).font('Helvetica');
        doc.text(`N°: ${purchase._id?.toString().slice(-6).toUpperCase()}`, 40);
        doc.text(`Fournisseur: ${purchase.FournisseurName || '—'}`, 40);
        doc.text(`Cree par: ${purchase.createdByName || '—'}`, 40);
        doc.text(`Date: ${this.fmtDate(purchase.createdAt)}`, 40);
        doc.text(`Statut: ${purchase.status?.toUpperCase() || '—'}`, 40);
        doc.moveDown(1);
        const tableTop = doc.y;
        const cols = [40, 200, 310, 380, 450, 510];
        const headers = ['#', 'Produit', 'Qte', 'PU HT', 'TVA%', 'Total TTC'];
        doc.rect(40, tableTop, doc.page.width - 80, 22).fill('#1e3a5f');
        headers.forEach((h, i) => doc.fillColor('#fff').font('Helvetica-Bold').fontSize(9).text(h, cols[i], tableTop+6, { width: (cols[i+1]||560)-cols[i] }));
        doc.fillColor('#000').font('Helvetica').fontSize(9);
        (purchase.items||[]).forEach((item: any, idx: number) => {
          const rowY = tableTop + 22 + idx * 20;
          if (idx%2===0) doc.rect(40, rowY, doc.page.width-80, 20).fill('#f9fafb');
          doc.fillColor('#000').text(`${idx+1}`, cols[0], rowY+5).text(item.productName||'', cols[1], rowY+5, {width:100}).text(`${item.quantity}`, cols[2], rowY+5).text(this.fmt(item.unitPrice), cols[3], rowY+5).text(`${item.tva||0}%`, cols[4], rowY+5).text(this.fmt(item.totalTTC), cols[5], rowY+5);
        });
        const totY = tableTop + 22 + (purchase.items?.length||0)*20+15;
        doc.rect(350, totY, 210, 80).stroke('#1e3a5f');
        doc.fontSize(10).font('Helvetica').text('Total HT:', 360, totY+8).text(this.fmt(purchase.totalHT), 480, totY+8).text('Total TTC:', 360, totY+25).text(this.fmt(purchase.totalTTC), 480, totY+25).text('Paye:', 360, totY+45).text(this.fmt(purchase.amountPaid), 480, totY+45);
        if (purchase.amountRemaining>0) doc.fillColor('#cc0000').text('Reste:', 360, totY+62).text(this.fmt(purchase.amountRemaining), 480, totY+62);
        this.addPdfFooter(doc, company);
        doc.end();
      });
    });
  }

  // ══════════════════════════════════════════════════════════
  //  BILAN CLIENT PDF
  // ══════════════════════════════════════════════════════════
  async generateClientBilanPdf(client: any, sales: any[], startDate: string, endDate: string, companyId: string): Promise<Buffer> {
    const company = await this.getCompany(companyId);
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, bufferPages: true });
      const buffers: Buffer[] = [];
      doc.on('data', d => buffers.push(d));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);
      this.addPdfHeader(doc, company, 'RELEVE CLIENT').then(() => {
        doc.fontSize(12).font('Helvetica-Bold').text(`Client: ${client.name}`);
        doc.fontSize(10).font('Helvetica').text(`Tel: ${client.phone || '—'}  |  Email: ${client.email || '—'}`);
        if (startDate || endDate) doc.text(`Periode: ${startDate ? this.fmtDate(startDate) : '—'} -> ${endDate ? this.fmtDate(endDate) : '—'}`);
        doc.moveDown(1);

        const totalTTC       = sales.reduce((s: number, v: any) => s + v.totalTTC, 0);
        const totalPaid      = sales.reduce((s: number, v: any) => s + v.amountPaid, 0);
        const totalRemaining = sales.reduce((s: number, v: any) => s + v.amountRemaining, 0);
        doc.rect(40, doc.y, doc.page.width - 80, 55).fill('#f0f4f8');
        const summaryY = doc.y;
        doc.fillColor('#000').font('Helvetica-Bold').text(`Total facture: ${this.fmt(totalTTC)}`, 60, summaryY + 8);
        doc.text(`Total paye: ${this.fmt(totalPaid)}`, 60, summaryY + 24);
        doc.fillColor(totalRemaining > 0 ? '#cc0000' : '#007700').text(`Solde: ${this.fmt(totalRemaining)}`, 60, summaryY + 40);
        doc.fillColor('#000').moveDown(3);

        const tableTop = doc.y;
        const cols = [40, 130, 260, 350, 430, 510];
        doc.rect(40, tableTop, doc.page.width - 80, 20).fill('#1e3a5f');
        ['Date', 'N°', 'Montant TTC', 'Paye', 'Reste', 'Statut'].forEach((h, i) => doc.fillColor('#fff').font('Helvetica-Bold').fontSize(8).text(h, cols[i], tableTop+5, { width:(cols[i+1]||560)-cols[i] }));
        doc.fillColor('#000').font('Helvetica').fontSize(8);
        sales.forEach((s: any, idx: number) => {
          const rowY = tableTop + 20 + idx * 18;
          if (idx%2===0) doc.rect(40, rowY, doc.page.width - 80, 18).fill('#f9fafb');
          doc.fillColor('#000').text(this.fmtDate(s.createdAt), cols[0], rowY+4).text(s._id?.toString().slice(-6).toUpperCase(), cols[1], rowY+4).text(this.fmt(s.totalTTC), cols[2], rowY+4).text(this.fmt(s.amountPaid), cols[3], rowY+4);
          doc.fillColor(s.amountRemaining > 0 ? '#cc0000' : '#007700').text(this.fmt(s.amountRemaining), cols[4], rowY+4);
          doc.fillColor('#000').text(s.status?.toUpperCase(), cols[5], rowY+4);
        });
        this.addPdfFooter(doc, company);
        doc.end();
      });
    });
  }

  // ══════════════════════════════════════════════════════════
  //  BILAN CLIENT EXCEL
  // ══════════════════════════════════════════════════════════
  async generateClientBilanExcel(client: any, sales: any[], startDate: string, endDate: string, companyId: string): Promise<Buffer> {
    const company = await this.getCompany(companyId);
    const wb = new ExcelJS.Workbook();
    wb.creator = company?.name || 'ERP';
    const ws = wb.addWorksheet('Releve');

    ws.mergeCells('A1:F1');
    ws.getCell('A1').value = `${company?.name || 'ERP'} — RELEVE CLIENT`;
    ws.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
    ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1e3a5f' } };
    ws.getCell('A1').alignment = { horizontal: 'center' };
    ws.getRow(1).height = 28;

    ws.addRow(['Client:', client.name, '', 'Tel:', client.phone || '—']);
    if (startDate || endDate) ws.addRow(['Periode:', `${startDate || '—'} -> ${endDate || '—'}`]);
    ws.addRow([]);

    const totRow = ws.addRow(['Total TTC:', sales.reduce((s: number, v: any) => s + v.totalTTC, 0), 'Paye:', sales.reduce((s: number, v: any) => s + v.amountPaid, 0), 'Solde:', sales.reduce((s: number, v: any) => s + v.amountRemaining, 0)]);
    totRow.eachCell(c => { c.font = { bold: true }; });
    ws.addRow([]);

    const headerRow = ws.addRow(['Date', 'N° Facture', 'Total TTC', 'Paye', 'Reste', 'Statut']);
    headerRow.eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1e3a5f' } }; });

    sales.forEach((s: any, idx: number) => {
      const r = ws.addRow([this.fmtDate(s.createdAt), s._id?.toString().slice(-6).toUpperCase(), s.totalTTC, s.amountPaid, s.amountRemaining, s.status]);
      if (idx%2===0) r.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F4F8' } }; });
      if (s.amountRemaining > 0) r.getCell(5).font = { color: { argb: 'FFCC0000' } };
    });

    ws.columns = [{ width: 15 }, { width: 15 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 12 }];
    return (wb.xlsx.writeBuffer() as unknown) as Promise<Buffer>;
  }

  // ══════════════════════════════════════════════════════════
  //  RAPPORT VENTES PDF
  // ══════════════════════════════════════════════════════════
  async generateSalesReportPdf(report: any, companyId: string): Promise<Buffer> {
    const company = await this.getCompany(companyId);
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, bufferPages: true });
      const buffers: Buffer[] = [];
      doc.on('data', d => buffers.push(d));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);
      this.addPdfHeader(doc, company, 'RAPPORT DES VENTES').then(() => {
        if (report.period?.startDate || report.period?.endDate) {
          doc.fontSize(10).font('Helvetica').text(`Periode: ${this.fmtDate(report.period.startDate)} -> ${this.fmtDate(report.period.endDate)}`);
        }
        doc.moveDown(0.5);
        doc.rect(40, doc.y, doc.page.width-80, 55).fill('#f0f4f8');
        const sy = doc.y;
        doc.fillColor('#000').font('Helvetica-Bold').fontSize(11)
            .text(`Total TTC: ${this.fmt(report.totals?.total)}`, 60, sy+8)
            .text(`Total Paye: ${this.fmt(report.totals?.paid)}`, 60, sy+25)
            .text(`Total Reste: ${this.fmt(report.totals?.remaining)}`, 60, sy+42)
            .text(`Nombre de ventes: ${report.count}`, 300, sy+8);
        doc.moveDown(4);

        const tableTop = doc.y;
        const cols = [40, 130, 260, 350, 430, 500];
        doc.rect(40, tableTop, doc.page.width-80, 20).fill('#1e3a5f');
        ['Date', 'Client', 'TTC', 'Paye', 'Reste', 'Vendeur'].forEach((h,i) => doc.fillColor('#fff').font('Helvetica-Bold').fontSize(8).text(h, cols[i], tableTop+5, {width:(cols[i+1]||560)-cols[i]}));
        doc.fillColor('#000').font('Helvetica').fontSize(8);
        (report.sales||[]).forEach((s: any, idx: number) => {
          const rowY = tableTop+20+idx*18;
          if (idx%2===0) doc.rect(40, rowY, doc.page.width-80, 18).fill('#f9fafb');
          doc.fillColor('#000').text(this.fmtDate(s.createdAt), cols[0], rowY+4).text(s.clientName||'—', cols[1], rowY+4, {width:120}).text(this.fmt(s.totalTTC), cols[2], rowY+4).text(this.fmt(s.amountPaid), cols[3], rowY+4);
          doc.fillColor(s.amountRemaining>0?'#cc0000':'#007700').text(this.fmt(s.amountRemaining), cols[4], rowY+4);
          doc.fillColor('#000').text(s.createdByName||'—', cols[5], rowY+4, {width:70});
        });
        this.addPdfFooter(doc, company);
        doc.end();
      });
    });
  }

  // ══════════════════════════════════════════════════════════
  //  RAPPORT VENTES EXCEL
  // ══════════════════════════════════════════════════════════
  async generateSalesReportExcel(report: any, companyId: string): Promise<Buffer> {
    const company = await this.getCompany(companyId);
    const wb = new ExcelJS.Workbook();
    wb.creator = company?.name || 'ERP';
    const ws = wb.addWorksheet('Rapport Ventes');

    ws.mergeCells('A1:G1');
    ws.getCell('A1').value = `${company?.name || 'ERP'} — RAPPORT DES VENTES`;
    ws.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
    ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1e3a5f' } };
    ws.getCell('A1').alignment = { horizontal: 'center' };
    ws.getRow(1).height = 28;

    ws.addRow(['Periode:', `${report.period?.startDate || '—'} -> ${report.period?.endDate || '—'}`, '', 'Ventes:', report.count]);
    ws.addRow(['Total TTC:', report.totals?.total, 'Paye:', report.totals?.paid, 'Reste:', report.totals?.remaining]);
    ws.addRow([]);

    const headerRow = ws.addRow(['Date', 'Client', 'Total TTC', 'Paye', 'Reste', 'Statut', 'Vendeur']);
    headerRow.eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1e3a5f' } }; });

    (report.sales||[]).forEach((s: any, idx: number) => {
      const r = ws.addRow([this.fmtDate(s.createdAt), s.clientName, s.totalTTC, s.amountPaid, s.amountRemaining, s.status, s.createdByName]);
      if (idx%2===0) r.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F4F8' } }; });
      if (s.amountRemaining > 0) r.getCell(5).font = { color: { argb: 'FFCC0000' } };
    });

    ws.columns = [{width:15},{width:25},{width:18},{width:18},{width:18},{width:12},{width:20}];
    return (wb.xlsx.writeBuffer() as unknown) as Promise<Buffer>;
  }

  // ══════════════════════════════════════════════════════════
  //  BILAN FOURNISSEUR PDF  (avec paiements par achat)
  // ══════════════════════════════════════════════════════════
  async generateFournisseurBilanPdf(
      fournisseur: any,
      purchases: any[],
      stats: any,
      startDate: string,
      endDate: string,
      companyId: string,
  ): Promise<Buffer> {
    const company = await this.getCompany(companyId);
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, bufferPages: true, size: 'A4' });
      const buffers: Buffer[] = [];
      doc.on('data', d => buffers.push(d));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      this.addPdfHeader(doc, company, 'BILAN FOURNISSEUR').then(() => {

        // ── Infos fournisseur ──
        doc.fontSize(12).font('Helvetica-Bold').text(`Fournisseur: ${fournisseur.name}`);
        doc.fontSize(10).font('Helvetica')
            .text(`Tel: ${fournisseur.phone || '—'}  |  Email: ${fournisseur.email || '—'}`);
        if (startDate || endDate) {
          doc.text(`Periode: ${startDate ? this.fmtDate(startDate) : '—'} -> ${endDate ? this.fmtDate(endDate) : '—'}`);
        }
        doc.moveDown(1);

        // ── Bloc stats globales ──
        const statsY = doc.y;
        doc.rect(40, statsY, doc.page.width - 80, 65).fill('#f0f4f8');
        doc.fillColor('#1e3a5f').font('Helvetica-Bold').fontSize(10)
            .text('SOLDE GLOBAL DU FOURNISSEUR', 60, statsY + 6);
        doc.fillColor('#000').font('Helvetica').fontSize(10)
            .text(`Total depense : ${this.fmt(stats.totalSpent)}`, 60, statsY + 22)
            .text(`Total paye    : ${this.fmt(stats.totalPaid)}`,  60, statsY + 38);
        doc.fillColor(stats.totalDebt > 0 ? '#cc0000' : '#007700').font('Helvetica-Bold')
            .text(`Solde du      : ${this.fmt(stats.totalDebt)}`,  60, statsY + 54);
        doc.fillColor('#000').font('Helvetica')
            .text(`Nb achats total: ${stats.count}`, 350, statsY + 22);
        doc.moveDown(5);

        // ── Tableau des achats ──
        if (purchases.length === 0) {
          doc.fontSize(10).fillColor('#666').text('Aucun achat sur cette periode.', { align: 'center' });
        } else {
          const tCols = [40, 110, 220, 305, 385, 455, 515];
          const tTop  = doc.y;

          // En-tête tableau
          doc.rect(40, tTop, doc.page.width - 80, 20).fill('#1e3a5f');
          ['Date', 'N°', 'Total TTC', 'Paye', 'Reste', 'Statut', 'Art.'].forEach((h, i) =>
              doc.fillColor('#fff').font('Helvetica-Bold').fontSize(8)
                  .text(h, tCols[i], tTop + 5, { width: (tCols[i+1] || 560) - tCols[i] })
          );

          let curY = tTop + 20;
          doc.fillColor('#000').font('Helvetica').fontSize(8);

          purchases.forEach((p: any, idx: number) => {
            // ── Ligne achat ──
            if (idx % 2 === 0) doc.rect(40, curY, doc.page.width - 80, 18).fill('#f9fafb');
            const remaining = p.amountRemaining ?? Math.max(0, p.totalTTC - (p.amountPaid ?? 0));

            doc.fillColor('#000')
                .text(this.fmtDate(p.createdAt),                tCols[0], curY + 4)
                .text(p._id?.toString().slice(-6).toUpperCase(), tCols[1], curY + 4)
                .text(this.fmt(p.totalTTC),                      tCols[2], curY + 4)
                .text(this.fmt(p.amountPaid ?? 0),               tCols[3], curY + 4);
            doc.fillColor(remaining > 0 ? '#cc0000' : '#007700')
                .text(this.fmt(remaining),                       tCols[4], curY + 4);
            doc.fillColor('#000')
                .text((p.status || '').toUpperCase(),            tCols[5], curY + 4)
                .text(`${p.items?.length ?? 0}`,                 tCols[6], curY + 4);
            curY += 18;

            // ── Paiements liés à cet achat ──
            const linked: any[] = p.linkedPayments || [];
            if (linked.length > 0) {
              doc.rect(55, curY, doc.page.width - 95, 14).fill('#e8f5e9');
              doc.fillColor('#2e7d32').font('Helvetica-Bold').fontSize(7)
                  .text('Paiements lies a cet achat :', 60, curY + 3);
              curY += 14;

              linked.forEach((pmt: any) => {
                doc.rect(55, curY, doc.page.width - 95, 14).fill('#f1f8e9');
                doc.fillColor('#388e3c').font('Helvetica').fontSize(7)
                    .text(this.fmtDateTime(pmt.createdAt), 60,  curY + 3, { width: 130 })
                    .text(`+${this.fmt(pmt.amount)}`,       210, curY + 3, { width: 110 })
                    .text(pmt.note || '',                   340, curY + 3, { width: 190 });
                curY += 14;
              });
              curY += 4;
            }
          });
        }

        this.addPdfFooter(doc, company);
        doc.end();
      });
    });
  }

  // ══════════════════════════════════════════════════════════
  //  BILAN FOURNISSEUR EXCEL  (avec paiements par achat)
  // ══════════════════════════════════════════════════════════
  async generateFournisseurBilanExcel(
      fournisseur: any,
      purchases: any[],
      stats: any,
      startDate: string,
      endDate: string,
      companyId: string,
  ): Promise<Buffer> {
    const company = await this.getCompany(companyId);
    const wb = new ExcelJS.Workbook();
    wb.creator = company?.name || 'ERP';
    const ws = wb.addWorksheet('Bilan Fournisseur');

    // En-tête société
    ws.mergeCells('A1:G1');
    ws.getCell('A1').value = `${company?.name || 'ERP'} — BILAN FOURNISSEUR`;
    ws.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
    ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1e3a5f' } };
    ws.getCell('A1').alignment = { horizontal: 'center' };
    ws.getRow(1).height = 28;

    ws.addRow(['Fournisseur:', fournisseur.name, '', 'Tel:', fournisseur.phone || '—']);
    ws.addRow(['Email:', fournisseur.email || '—']);
    if (startDate || endDate) {
      ws.addRow(['Periode:', `${startDate || '—'} -> ${endDate || '—'}`]);
    }
    ws.addRow([]);

    // Stats globales
    const statsRow = ws.addRow([
      'Total depense:', stats.totalSpent,
      'Total paye:',   stats.totalPaid,
      'Solde du:',     stats.totalDebt,
    ]);
    statsRow.eachCell(c => { c.font = { bold: true }; });
    if (stats.totalDebt > 0) {
      statsRow.getCell(6).font = { bold: true, color: { argb: 'FFCC0000' } };
    }
    ws.addRow(['Nb achats total:', stats.count]);
    ws.addRow([]);

    // En-tête tableau achats
    const headerRow = ws.addRow(['Date', 'N° Achat', 'Total TTC', 'Paye', 'Reste', 'Statut', 'Articles']);
    headerRow.eachCell(c => {
      c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1e3a5f' } };
      c.alignment = { horizontal: 'center' };
    });

    if (purchases.length === 0) {
      ws.addRow(['Aucun achat sur cette periode.']);
    } else {
      purchases.forEach((p: any, idx: number) => {
        const remaining = p.amountRemaining ?? Math.max(0, p.totalTTC - (p.amountPaid ?? 0));

        // Ligne achat
        const r = ws.addRow([
          this.fmtDate(p.createdAt),
          p._id?.toString().slice(-6).toUpperCase(),
          p.totalTTC,
          p.amountPaid ?? 0,
          remaining,
          (p.status || '').toUpperCase(),
          p.items?.length ?? 0,
        ]);
        if (idx % 2 === 0) {
          r.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F4F8' } }; });
        }
        if (remaining > 0) {
          r.getCell(5).font = { bold: true, color: { argb: 'FFCC0000' } };
        }

        // Lignes paiements liés
        const linked: any[] = p.linkedPayments || [];
        if (linked.length > 0) {
          const subTitle = ws.addRow(['', '', 'Paiements lies:', '', '', '', '']);
          subTitle.eachCell(c => {
            c.font = { italic: true, bold: true, color: { argb: 'FF2e7d32' }, size: 9 };
            c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFe8f5e9' } };
          });

          linked.forEach((pmt: any) => {
            const pmtRow = ws.addRow([
              '',
              this.fmtDateTime(pmt.createdAt),
              `+${this.fmt(pmt.amount)}`,
              pmt.note || '',
              '', '', '',
            ]);
            pmtRow.eachCell(c => {
              c.font = { italic: true, size: 9, color: { argb: 'FF388e3c' } };
              c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFf1f8e9' } };
            });
          });
        }
      });
    }

    ws.columns = [
      { width: 15 }, { width: 16 }, { width: 18 },
      { width: 18 }, { width: 18 }, { width: 12 }, { width: 10 },
    ];
    return (wb.xlsx.writeBuffer() as unknown) as Promise<Buffer>;
  }
}