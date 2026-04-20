import * as Print from 'expo-print';
import { DeliveryNote, DeliveryNoteLine, formatWeight, formatDate } from '@/types/deliveryNote';
import { Document, LineItem } from '@/types/document';
import { Client } from '@/types/client';
import { CompanyInfo, TemplateSettings } from '@/db/settings';

function escapeHtml(text: string | undefined | null): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/\n/g, '<br>');
}

function generateDeliveryNoteLabelHTML(
  note: DeliveryNote,
  lines: DeliveryNoteLine[]
): string {
  const linesHtml = lines.map(line => `
    <tr>
      <td style="padding: 6px 8px; border-bottom: 1px solid #E5E7EB; font-size: 12px;">${escapeHtml(line.label)}</td>
      <td style="padding: 6px 8px; border-bottom: 1px solid #E5E7EB; text-align: center; font-size: 12px;">${line.qty} ${escapeHtml(line.unit)}</td>
      <td style="padding: 6px 8px; border-bottom: 1px solid #E5E7EB; text-align: right; font-size: 12px;">${line.line_weight_kg > 0 ? formatWeight(line.line_weight_kg) : '-'}</td>
    </tr>
  `).join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    @page {
      margin: 10mm;
      size: A5 landscape;
    }
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      font-size: 14px;
      line-height: 1.4;
      color: #1F2937;
      background: #FFFFFF;
    }
    .label {
      width: 100%;
      height: 100%;
      border: 3px solid #1F2937;
      border-radius: 12px;
      padding: 16px;
      display: flex;
      flex-direction: column;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #1F2937;
      padding-bottom: 12px;
      margin-bottom: 12px;
    }
    .header-left {
      flex: 1;
    }
    .doc-title {
      font-size: 20px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 2px;
      color: #1F2937;
    }
    .doc-number {
      font-size: 16px;
      font-weight: 700;
      color: #374151;
      margin-top: 4px;
    }
    .doc-date {
      font-size: 12px;
      color: #6B7280;
      margin-top: 2px;
    }
    .header-right {
      text-align: right;
    }
    .invoice-ref {
      font-size: 11px;
      color: #6B7280;
    }
    .invoice-number {
      font-size: 14px;
      font-weight: 600;
      color: #3B82F6;
    }
    .weight-box {
      background: #1F2937;
      color: #FFFFFF;
      padding: 8px 16px;
      border-radius: 8px;
      margin-top: 8px;
      display: inline-block;
    }
    .weight-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 1px;
      opacity: 0.8;
    }
    .weight-value {
      font-size: 24px;
      font-weight: 800;
    }
    .addresses {
      display: flex;
      gap: 20px;
      margin-bottom: 12px;
    }
    .address-box {
      flex: 1;
      background: #F9FAFB;
      border: 1px solid #E5E7EB;
      border-radius: 8px;
      padding: 12px;
    }
    .address-box.recipient {
      background: #EFF6FF;
      border: 2px solid #3B82F6;
    }
    .address-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #6B7280;
      margin-bottom: 6px;
      font-weight: 600;
    }
    .address-box.recipient .address-label {
      color: #3B82F6;
    }
    .address-name {
      font-size: 18px;
      font-weight: 700;
      color: #1F2937;
      margin-bottom: 4px;
    }
    .address-detail {
      font-size: 13px;
      color: #4B5563;
      line-height: 1.5;
    }
    .address-phone {
      font-size: 12px;
      color: #6B7280;
      margin-top: 4px;
    }
    .contents {
      flex: 1;
      overflow: hidden;
    }
    .contents-title {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #6B7280;
      margin-bottom: 6px;
      font-weight: 600;
    }
    .contents-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    .contents-table th {
      background: #F3F4F6;
      padding: 6px 8px;
      text-align: left;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #6B7280;
      border-bottom: 1px solid #E5E7EB;
    }
    .contents-table th:nth-child(2) {
      text-align: center;
    }
    .contents-table th:nth-child(3) {
      text-align: right;
    }
    .footer {
      margin-top: 12px;
      padding-top: 8px;
      border-top: 1px dashed #D1D5DB;
      text-align: center;
      font-size: 10px;
      color: #9CA3AF;
    }
  </style>
</head>
<body>
  <div class="label">
    <div class="header">
      <div class="header-left">
        <div class="doc-title">Bon de Livraison</div>
        <div class="doc-number">${escapeHtml(note.number)}</div>
        <div class="doc-date">${formatDate(note.created_at)}</div>
      </div>
      <div class="header-right">
        ${note.invoice_number ? `
          <div class="invoice-ref">Facture associée</div>
          <div class="invoice-number">${escapeHtml(note.invoice_number)}</div>
        ` : ''}
        <div class="weight-box">
          <div class="weight-label">Poids total</div>
          <div class="weight-value">${formatWeight(note.total_weight_kg)}</div>
        </div>
      </div>
    </div>

    <div class="addresses">
      <div class="address-box">
        <div class="address-label">📤 Émetteur</div>
        <div class="address-name">${escapeHtml(note.ship_from_name)}</div>
        <div class="address-detail">${escapeHtml(note.ship_from_address)}</div>
        ${note.ship_from_phone ? `<div class="address-phone">📞 ${escapeHtml(note.ship_from_phone)}</div>` : ''}
      </div>
      <div class="address-box recipient">
        <div class="address-label">📦 Destinataire</div>
        <div class="address-name">${escapeHtml(note.ship_to_name)}</div>
        <div class="address-detail">${escapeHtml(note.ship_to_address)}</div>
        ${note.ship_to_phone ? `<div class="address-phone">📞 ${escapeHtml(note.ship_to_phone)}</div>` : ''}
      </div>
    </div>

    <div class="contents">
      <div class="contents-title">Contenu (${lines.length} article${lines.length > 1 ? 's' : ''})</div>
      <table class="contents-table">
        <thead>
          <tr>
            <th style="width: 60%;">Désignation</th>
            <th style="width: 20%;">Quantité</th>
            <th style="width: 20%;">Poids</th>
          </tr>
        </thead>
        <tbody>
          ${linesHtml}
        </tbody>
      </table>
    </div>

    <div class="footer">
      Document généré le ${formatDate(new Date().toISOString())}
    </div>
  </div>
</body>
</html>
  `;
}

export async function generateDeliveryNotePDF(
  note: DeliveryNote,
  lines: DeliveryNoteLine[]
): Promise<string> {
  console.log('[DeliveryNotePDF] Generating PDF for:', note.number);
  
  const html = generateDeliveryNoteLabelHTML(note, lines);
  
  try {
    const result = await Print.printToFileAsync({
      html,
      width: 595,
      height: 420,
      base64: false,
    });
    
    console.log('[DeliveryNotePDF] PDF generated:', result.uri);
    return result.uri;
  } catch (error) {
    console.error('[DeliveryNotePDF] Error:', error);
    throw error;
  }
}

export async function printDeliveryNoteWithInvoice(
  note: DeliveryNote,
  noteLines: DeliveryNoteLine[],
  invoice: Document,
  invoiceLines: LineItem[],
  client: Client | null,
  companyInfo: CompanyInfo,
  templateSettings?: TemplateSettings
): Promise<{ printed: boolean; labelUri?: string; invoiceUri?: string }> {
  console.log('[DeliveryNotePDF] Printing BL + Invoice:', note.number, invoice.number);
  
  const { generatePDF } = await import('./pdfGenerator');
  
  try {
    const labelHtml = generateDeliveryNoteLabelHTML(note, noteLines);
    const invoicePdf = await generatePDF(invoice, invoiceLines, client, companyInfo, templateSettings);
    
    const combinedHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @page { margin: 0; size: A4; }
    .page-break { page-break-after: always; }
    body { margin: 0; padding: 0; }
  </style>
</head>
<body>
  <div style="padding: 20mm;">
    ${labelHtml.replace(/<html>.*?<body>/s, '').replace(/<\/body>.*?<\/html>/s, '')}
  </div>
</body>
</html>
    `;
    
    await Print.printAsync({ html: combinedHtml });
    
    const labelResult = await Print.printToFileAsync({
      html: labelHtml,
      width: 595,
      height: 420,
    });
    
    console.log('[DeliveryNotePDF] Print completed');
    return {
      printed: true,
      labelUri: labelResult.uri,
      invoiceUri: invoicePdf.uri,
    };
  } catch (error) {
    console.error('[DeliveryNotePDF] Print error:', error);
    throw error;
  }
}

export async function printDeliveryNoteLabel(
  note: DeliveryNote,
  lines: DeliveryNoteLine[]
): Promise<void> {
  console.log('[DeliveryNotePDF] Printing label only:', note.number);
  
  const html = generateDeliveryNoteLabelHTML(note, lines);
  
  try {
    await Print.printAsync({ html });
    console.log('[DeliveryNotePDF] Label printed');
  } catch (error) {
    console.error('[DeliveryNotePDF] Print error:', error);
    throw error;
  }
}

export async function reprintDeliveryNoteWithInvoice(
  note: DeliveryNote,
  noteLines: DeliveryNoteLine[],
  _invoice: Document,
  _invoiceLines: LineItem[],
  _client: Client | null,
  _companyInfo: CompanyInfo,
  _templateSettings?: TemplateSettings
): Promise<void> {
  console.log('[DeliveryNotePDF] Reprinting BL:', note.number);
  
  try {
    const labelHtml = generateDeliveryNoteLabelHTML(note, noteLines);
    
    const combinedHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @page { margin: 0; size: A4; }
    .page-break { page-break-after: always; }
    body { margin: 0; padding: 0; }
  </style>
</head>
<body>
  <div style="padding: 20mm;">
    ${labelHtml.replace(/<html>.*?<body>/s, '').replace(/<\/body>.*?<\/html>/s, '')}
  </div>
</body>
</html>
    `;
    
    await Print.printAsync({ html: combinedHtml });
    console.log('[DeliveryNotePDF] Reprint completed');
  } catch (error) {
    console.error('[DeliveryNotePDF] Reprint error:', error);
    throw error;
  }
}

export async function shareDeliveryNotePDF(
  note: DeliveryNote,
  noteLines: DeliveryNoteLine[],
  _invoice: Document,
  _invoiceLines: LineItem[],
  _client: Client | null,
  _companyInfo: CompanyInfo,
  _templateSettings?: TemplateSettings
): Promise<void> {
  console.log('[DeliveryNotePDF] Sharing PDF:', note.number);
  
  const { shareAsync } = await import('expo-sharing');
  
  try {
    const labelHtml = generateDeliveryNoteLabelHTML(note, noteLines);
    
    const labelResult = await Print.printToFileAsync({
      html: labelHtml,
      width: 595,
      height: 420,
    });
    
    console.log('[DeliveryNotePDF] PDF generated for sharing:', labelResult.uri);
    
    await shareAsync(labelResult.uri, {
      mimeType: 'application/pdf',
      dialogTitle: `Bon de livraison ${note.number}`,
      UTI: 'com.adobe.pdf',
    });
    
    console.log('[DeliveryNotePDF] Share completed');
  } catch (error) {
    console.error('[DeliveryNotePDF] Share error:', error);
    throw error;
  }
}
