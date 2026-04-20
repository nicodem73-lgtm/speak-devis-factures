import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as MailComposer from 'expo-mail-composer';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform, Alert } from 'react-native';
import { Document, LineItem, TYPE_LABELS, formatCurrency, formatDate, isCreditNote } from '@/types/document';
import { DepositMode } from '@/types/deposit';
import { Client } from '@/types/client';
import { CompanyInfo, TemplateSettings, TemplateStyle } from '@/db/settings';
import { generateFacturXML, FacturXData } from '@/utils/facturx';
import { DocumentSplit, SplitLineAssignment } from '@/types/splitBilling';

export class PDFError extends Error {
  code: string;
  userMessage: string;

  constructor(code: string, message: string, userMessage: string) {
    super(message);
    this.name = 'PDFError';
    this.code = code;
    this.userMessage = userMessage;
  }
}

export const PDF_ERROR_CODES = {
  GENERATION_FAILED: 'GENERATION_FAILED',
  PRINT_FAILED: 'PRINT_FAILED',
  SHARE_UNAVAILABLE: 'SHARE_UNAVAILABLE',
  SHARE_FAILED: 'SHARE_FAILED',
  MAIL_UNAVAILABLE: 'MAIL_UNAVAILABLE',
  MAIL_FAILED: 'MAIL_FAILED',
  WEB_NOT_SUPPORTED: 'WEB_NOT_SUPPORTED',
} as const;

export const PDF_ERROR_MESSAGES: Record<string, string> = {
  [PDF_ERROR_CODES.GENERATION_FAILED]: 'Impossible de générer le PDF. Veuillez réessayer.',
  [PDF_ERROR_CODES.PRINT_FAILED]: "Impossible d'ouvrir l'impression. Vérifiez qu'une imprimante est disponible.",
  [PDF_ERROR_CODES.SHARE_UNAVAILABLE]: "Le partage n'est pas disponible sur cet appareil.",
  [PDF_ERROR_CODES.SHARE_FAILED]: 'Erreur lors du partage. Veuillez réessayer.',
  [PDF_ERROR_CODES.MAIL_UNAVAILABLE]: "L'envoi d'email n'est pas configuré sur cet appareil.",
  [PDF_ERROR_CODES.MAIL_FAILED]: "Impossible d'ouvrir le composeur d'email.",
  [PDF_ERROR_CODES.WEB_NOT_SUPPORTED]: "Cette fonctionnalité n'est pas disponible sur le web.",
};

export interface PDFGenerationResult {
  uri: string;
  base64?: string;
}

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

async function convertImageToBase64(imageUrl: string): Promise<string> {
  if (!imageUrl || imageUrl.trim() === '') {
    return '';
  }
  
  // If already a data URL, return as is
  if (imageUrl.startsWith('data:')) {
    return imageUrl;
  }
  
  // If remote URL (http/https), return as is - browser can fetch it
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return imageUrl;
  }
  
  // For local file URIs, convert to base64
  try {
    if (Platform.OS === 'web') {
      return imageUrl;
    }
    
    // Check if file exists and is readable before attempting to read
    const fileInfo = await FileSystem.getInfoAsync(imageUrl);
    if (!fileInfo.exists) {
      console.warn('[PDF] Image file does not exist:', imageUrl);
      return '';
    }
    
    const base64 = await FileSystem.readAsStringAsync(imageUrl, {
      encoding: 'base64',
    });
    
    // Detect image type from extension or default to jpeg
    let mimeType = 'image/jpeg';
    if (imageUrl.toLowerCase().includes('.png')) {
      mimeType = 'image/png';
    } else if (imageUrl.toLowerCase().includes('.gif')) {
      mimeType = 'image/gif';
    } else if (imageUrl.toLowerCase().includes('.webp')) {
      mimeType = 'image/webp';
    }
    
    return `data:${mimeType};base64,${base64}`;
  } catch (error) {
    console.warn('[PDF] Image not available for PDF:', imageUrl);
    return '';
  }
}

async function prepareLineItemsWithImages(lineItems: LineItem[]): Promise<LineItem[]> {
  const preparedItems = await Promise.all(
    lineItems.map(async (item) => {
      if (item.image_url && item.image_url.trim() !== '') {
        const base64Image = await convertImageToBase64(item.image_url);
        return { ...item, image_url: base64Image };
      }
      return item;
    })
  );
  return preparedItems;
}

interface TemplateStyleConfig {
  headerBorder: string;
  tableHeader: string;
  tableRowAlt: string;
  tableRowNormal: string;
  totalBox: string;
  accentBar: string;
  notesStyle: string;
  documentTypeBadge: string;
}

function getTemplateStyleConfig(style: TemplateStyle, primaryColor: string): TemplateStyleConfig {
  const configs: Record<TemplateStyle, TemplateStyleConfig> = {
    classic: {
      headerBorder: `border-bottom: 3px solid ${primaryColor}`,
      tableHeader: `background: ${primaryColor}; color: #FFF`,
      tableRowAlt: 'background: #F9FAFB',
      tableRowNormal: 'background: #FFFFFF',
      totalBox: `border: 2px solid ${primaryColor}; border-radius: 8px; background: #FFFFFF`,
      accentBar: '',
      notesStyle: `border-left: 4px solid ${primaryColor}; background: #F9FAFB`,
      documentTypeBadge: `background: ${primaryColor}; color: #FFF; border-radius: 4px`,
    },
    modern: {
      headerBorder: 'border-bottom: none',
      tableHeader: 'background: #F3F4F6; color: #374151',
      tableRowAlt: 'background: #FAFAFA',
      tableRowNormal: 'background: #FFFFFF',
      totalBox: `border-left: 4px solid ${primaryColor}; border-radius: 0; background: #F9FAFB`,
      accentBar: `<div style="position: absolute; left: 0; top: 0; bottom: 0; width: 6px; background: linear-gradient(180deg, ${primaryColor}, ${primaryColor}88);"></div>`,
      notesStyle: `border-left: 3px solid ${primaryColor}; background: #FAFAFA`,
      documentTypeBadge: `background: ${primaryColor}; color: #FFF; border-radius: 20px`,
    },
    elegant: {
      headerBorder: `border-bottom: 1px solid ${primaryColor}`,
      tableHeader: `background: transparent; color: ${primaryColor}; border-bottom: 2px solid ${primaryColor}`,
      tableRowAlt: 'background: transparent; border-bottom: 1px solid #E5E7EB',
      tableRowNormal: 'background: transparent; border-bottom: 1px solid #E5E7EB',
      totalBox: `border: 1px solid ${primaryColor}; border-radius: 4px; background: #FFFFFF`,
      accentBar: '',
      notesStyle: `border: 1px solid ${primaryColor}; border-radius: 4px; background: #FFFFFF`,
      documentTypeBadge: `background: transparent; color: ${primaryColor}; border: 2px solid ${primaryColor}; border-radius: 4px`,
    },
    professional: {
      headerBorder: 'border-bottom: 2px solid #1F2937',
      tableHeader: 'background: #1F2937; color: #FFF',
      tableRowAlt: 'background: #F9FAFB',
      tableRowNormal: 'background: #FFFFFF',
      totalBox: 'border: 2px solid #1F2937; border-radius: 4px; background: #FFFFFF',
      accentBar: '',
      notesStyle: 'border: 1px solid #1F2937; background: #F9FAFB',
      documentTypeBadge: 'background: #1F2937; color: #FFF; border-radius: 4px',
    },
    minimal: {
      headerBorder: 'border-bottom: 1px solid #E5E7EB',
      tableHeader: 'background: transparent; color: #6B7280; border-bottom: 1px solid #E5E7EB',
      tableRowAlt: 'background: transparent',
      tableRowNormal: 'background: transparent',
      totalBox: 'border: 1px solid #E5E7EB; border-radius: 4px; background: #FFFFFF',
      accentBar: '',
      notesStyle: 'border: 1px solid #E5E7EB; background: #FFFFFF',
      documentTypeBadge: `background: transparent; color: ${primaryColor}; border: 1px solid ${primaryColor}; border-radius: 4px`,
    },
    creative: {
      headerBorder: `border-bottom: 4px solid ${primaryColor}`,
      tableHeader: `background: linear-gradient(135deg, ${primaryColor}, ${primaryColor}BB); color: #FFF`,
      tableRowAlt: `background: ${primaryColor}08`,
      tableRowNormal: 'background: #FFFFFF',
      totalBox: `border: 2px solid ${primaryColor}; border-radius: 12px; background: ${primaryColor}08`,
      accentBar: `<div style="position: absolute; top: 0; left: 0; right: 0; height: 8px; background: linear-gradient(90deg, ${primaryColor}, ${primaryColor}66);"></div>`,
      notesStyle: `border-left: 4px solid ${primaryColor}; background: ${primaryColor}08; border-radius: 0 8px 8px 0`,
      documentTypeBadge: `background: linear-gradient(135deg, ${primaryColor}, ${primaryColor}BB); color: #FFF; border-radius: 8px`,
    },
  };
  return configs[style] || configs.classic;
}

export interface PDFDepositInfo {
  enabled: boolean;
  mode: DepositMode;
  value: number;
  installmentCount: number;
  totalDepositAmount: number;
  remainingBalance: number;
  installments: { index: number; amount: number; percentage: number; dueDate?: string }[];
}

function generatePDFHTML(
  document: Document,
  lineItems: LineItem[],
  client: Client | null,
  companyInfo: CompanyInfo,
  templateSettings?: TemplateSettings,
  facturXml?: string,
  depositInfo?: PDFDepositInfo
): string {
  const isDevis = document.type === 'devis';
  const isCreditNoteDoc = isCreditNote(document);
  const primaryColor = isCreditNoteDoc
    ? '#EF4444'
    : isDevis 
      ? (templateSettings?.primaryColor || '#3B82F6') 
      : (templateSettings?.accentColor || '#10B981');
  const fontFamily = templateSettings?.fontFamily === 'System' 
    ? "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    : templateSettings?.fontFamily || "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  const footerText = templateSettings?.footerText || '';
  const showLogo = templateSettings?.showLogo !== false;
  const templateStyle = templateSettings?.templateStyle || 'classic';
  const styleConfig = getTemplateStyleConfig(templateStyle, primaryColor);
  const typeLabel = isCreditNoteDoc ? 'AVOIR' : TYPE_LABELS[document.type].toUpperCase();

  const logoHtml = showLogo && companyInfo.logo
    ? `<img src="${companyInfo.logo}" alt="Logo" style="max-height: 60px; max-width: 180px; object-fit: contain;" />`
    : `<div style="font-size: 24px; font-weight: 700; color: ${primaryColor};">${escapeHtml(companyInfo.name) || 'Mon Entreprise'}</div>`;

  const companyAddressHtml = [
    companyInfo.address,
    [companyInfo.postalCode, companyInfo.city].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join('<br>');

  const companyLegalParts: string[] = [];
  if (companyInfo.legalForm) {
    let legalFormText = companyInfo.legalForm;
    if (companyInfo.capital) {
      legalFormText += ` au capital de ${companyInfo.capital}`;
    }
    companyLegalParts.push(legalFormText);
  }
  if (companyInfo.siret) {
    companyLegalParts.push(`SIRET: ${companyInfo.siret}`);
  }
  if (companyInfo.tvaNumber && !companyInfo.vatExempt) {
    companyLegalParts.push(`TVA: ${companyInfo.tvaNumber}`);
  }
  if (companyInfo.rcsNumber && companyInfo.rcsCity) {
    companyLegalParts.push(`RCS ${companyInfo.rcsCity} ${companyInfo.rcsNumber}`);
  } else if (companyInfo.rcsNumber) {
    companyLegalParts.push(`RCS ${companyInfo.rcsNumber}`);
  }
  if (companyInfo.rmNumber) {
    const rmText = companyInfo.rmDepartment 
      ? `RM ${companyInfo.rmDepartment} ${companyInfo.rmNumber}`
      : `RM ${companyInfo.rmNumber}`;
    companyLegalParts.push(rmText);
  }
  const companyLegalHtml = companyLegalParts.join('<br>');

  const companyContactHtml = [
    companyInfo.email ? `Email: ${companyInfo.email}` : '',
    companyInfo.phone ? `Tél: ${companyInfo.phone}` : '',
  ]
    .filter(Boolean)
    .join('<br>');

  const clientAddressHtml = client
    ? [
        client.address,
        [client.postal_code, client.city].filter(Boolean).join(' '),
        client.country && client.country !== 'France' ? client.country : '',
      ]
        .filter(Boolean)
        .join('<br>')
    : '';

  const clientLegalParts: string[] = [];
  if (client?.siret) {
    clientLegalParts.push(`SIRET: ${client.siret}`);
  }
  if (client?.tva_number) {
    clientLegalParts.push(`TVA: ${client.tva_number}`);
  }
  const clientLegalHtml = clientLegalParts.join('<br>');

  const hasDeliveryAddress = client && (
    client.delivery_address || client.delivery_city || client.delivery_postal_code
  );
  const deliveryAddressHtml = hasDeliveryAddress
    ? [
        client?.delivery_address,
        [client?.delivery_postal_code, client?.delivery_city].filter(Boolean).join(' '),
        client?.delivery_country && client?.delivery_country !== 'France' ? client?.delivery_country : '',
      ]
        .filter(Boolean)
        .join('<br>')
    : '';

  const vatExemptMention = companyInfo.vatExempt
    ? 'TVA non applicable, article 293 B du Code Général des Impôts.'
    : '';

  const hasAnyImage = lineItems.some(item => item.image_url && item.image_url.trim() !== '');

  const isAutoLiquidation = document.auto_liquidation === 1;
  const noTva = isAutoLiquidation || companyInfo.vatExempt;

  const lineItemsHtml = lineItems
    .map(
      (item, index) => {
        const hasImage = item.image_url && item.image_url.trim() !== '';
        const imageCell = hasAnyImage 
          ? `<td style="padding: 8px 6px; border-bottom: 1px solid #E5E7EB; vertical-align: middle; text-align: center; width: 55px;">
              ${hasImage ? `<img src="${item.image_url}" alt="" style="width: 45px; height: 45px; object-fit: cover; border-radius: 4px; border: 1px solid #E5E7EB;" onerror="this.parentElement.innerHTML='';" />` : ''}
            </td>`
          : '';
        
        const descriptionHtml = `<div>
          <div style="font-weight: 500; color: #111827;">${escapeHtml(item.label || item.description)}</div>
          ${item.label && item.description ? `<div style="font-size: 11px; color: #6B7280; margin-top: 2px;">${escapeHtml(item.description)}</div>` : ''}
        </div>`;
        
        return `
      <tr style="${index % 2 === 0 ? styleConfig.tableRowAlt : styleConfig.tableRowNormal}">
        ${imageCell}
        <td style="padding: 12px 10px; border-bottom: 1px solid #E5E7EB; vertical-align: top;">
          ${descriptionHtml}
        </td>
        <td style="padding: 12px 10px; text-align: center; border-bottom: 1px solid #E5E7EB; color: #374151; vertical-align: top;">${item.quantity}</td>
        <td style="padding: 12px 10px; text-align: right; border-bottom: 1px solid #E5E7EB; color: #374151; vertical-align: top;">${formatCurrency(item.unit_price)}</td>
        ${noTva ? '' : `<td style="padding: 12px 10px; text-align: center; border-bottom: 1px solid #E5E7EB; color: #374151; vertical-align: top;">${item.tva_rate}%</td>`}
        <td style="padding: 12px 10px; text-align: right; border-bottom: 1px solid #E5E7EB; font-weight: 500; color: #111827; vertical-align: top;">${formatCurrency(item.total_ht)}</td>
      </tr>
    `;
      }
    )
    .join('');

  const autoLiquidationHtml =
    isAutoLiquidation
      ? `
      <tr>
        <td colspan="2" style="padding: 8px 0; font-size: 11px; color: #D97706; font-style: italic;">
          ⚠️ Auto-liquidation de TVA applicable (Art. 283-2 du CGI)
        </td>
      </tr>
    `
      : (companyInfo.vatExempt && !isAutoLiquidation)
        ? `
      <tr>
        <td colspan="2" style="padding: 8px 0; font-size: 11px; color: #D97706; font-style: italic;">
          TVA non applicable, article 293 B du Code Général des Impôts
        </td>
      </tr>
    `
        : '';

  const globalDiscountHtml =
    document.global_discount_value > 0
      ? `
      <tr>
        <td style="padding: 8px 0; color: #6B7280;">Remise globale${document.global_discount_type === 'percent' ? ` (${document.global_discount_value}%)` : ''}</td>
        <td style="padding: 8px 0; text-align: right; color: #DC2626;">-${formatCurrency(document.global_discount_type === 'percent' ? document.total_ht * (document.global_discount_value / 100) / (1 - document.global_discount_value / 100) : document.global_discount_value)}</td>
      </tr>
    `
      : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    @page {
      margin: 25mm 20mm 20mm 20mm;
      size: A4;
    }
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: ${fontFamily};
      font-size: 12px;
      line-height: 1.5;
      color: #374151;
      background: #FFFFFF;
    }
    .page-header-repeat {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 20mm;
      padding: 4mm 20mm;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid ${primaryColor};
      background: #FFFFFF;
      z-index: 1000;
    }
    .page-header-repeat .ph-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .page-header-repeat .ph-logo img {
      max-height: 36px;
      max-width: 120px;
      object-fit: contain;
    }
    .page-header-repeat .ph-company-name {
      font-size: 13px;
      font-weight: 700;
      color: ${primaryColor};
    }
    .page-header-repeat .ph-right {
      text-align: right;
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .page-header-repeat .ph-doc-ref {
      font-size: 11px;
      color: #374151;
      font-weight: 600;
    }
    .page-header-repeat .ph-doc-type {
      display: inline-block;
      padding: 2px 10px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.5px;
      ${styleConfig.documentTypeBadge};
    }
    .page-footer-repeat {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      height: 12mm;
      padding: 2mm 20mm;
      display: flex;
      justify-content: center;
      align-items: center;
      font-size: 10px;
      color: #9CA3AF;
      background: #FFFFFF;
    }
    .page-footer-repeat::after {
      content: "Page " counter(page) "/" counter(pages);
    }
    .page {
      width: 210mm;
      min-height: auto;
      padding: 0;
      margin: 0 auto;
      background: #FFFFFF;
      position: relative;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 30px;
      padding-bottom: 20px;
      ${styleConfig.headerBorder};
    }
    .company-info {
      max-width: 50%;
    }
    .company-contact {
      margin-top: 10px;
      font-size: 11px;
      color: #6B7280;
    }
    .document-info {
      text-align: right;
    }
    .document-type {
      display: inline-block;
      padding: 6px 16px;
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 1px;
      margin-bottom: 10px;
      ${styleConfig.documentTypeBadge};
    }
    .document-number {
      font-size: 18px;
      font-weight: 700;
      color: #111827;
      margin-bottom: 8px;
    }
    .document-dates {
      font-size: 11px;
      color: #6B7280;
    }
    .document-dates strong {
      color: #374151;
    }
    .parties {
      display: flex;
      justify-content: space-between;
      margin-bottom: 30px;
    }
    .party-box {
      width: 48%;
    }
    .party-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #9CA3AF;
      margin-bottom: 8px;
      font-weight: 600;
    }
    .party-name {
      font-size: 16px;
      font-weight: 600;
      color: #111827;
      margin-bottom: 4px;
    }
    .party-company {
      font-size: 13px;
      color: #6B7280;
      margin-bottom: 4px;
    }
    .party-address {
      font-size: 12px;
      color: #6B7280;
      line-height: 1.6;
    }
    .party-legal {
      font-size: 10px;
      color: #9CA3AF;
      line-height: 1.5;
      margin-top: 6px;
      padding-top: 6px;
      border-top: 1px solid #E5E7EB;
    }
    .delivery-box {
      margin-top: 16px;
      padding-top: 12px;
      border-top: 1px dashed #E5E7EB;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    .items-table th {
      ${styleConfig.tableHeader};
      padding: 12px 10px;
      text-align: left;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .items-table th:nth-child(2),
    .items-table th:nth-child(4) {
      text-align: center;
    }
    .items-table th:nth-child(3),
    .items-table th:nth-child(5) {
      text-align: right;
    }
    .totals-section {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 30px;
    }
    .totals-box {
      width: 280px;
      padding: 16px;
      ${styleConfig.totalBox};
    }
    .totals-table {
      width: 100%;
    }
    .totals-table td {
      padding: 8px 0;
    }
    .totals-table .label {
      color: #6B7280;
    }
    .totals-table .value {
      text-align: right;
      font-weight: 500;
      color: #111827;
    }
    .totals-table .total-row td {
      padding-top: 12px;
      border-top: 2px solid ${primaryColor};
    }
    .totals-table .total-row .label {
      font-size: 14px;
      font-weight: 600;
      color: #111827;
    }
    .totals-table .total-row .value {
      font-size: 18px;
      font-weight: 700;
      color: ${primaryColor};
    }
    .notes-section {
      margin-bottom: 20px;
    }
    .notes-title {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #9CA3AF;
      margin-bottom: 6px;
      font-weight: 600;
    }
    .notes-content {
      font-size: 11px;
      color: #6B7280;
      line-height: 1.6;
      padding: 10px;
      text-align: center;
      ${styleConfig.notesStyle};
    }
    .legal-section {
      margin-top: auto;
      padding-top: 20px;
      border-top: 1px solid #E5E7EB;
    }
    .legal-text {
      font-size: 9px;
      color: #9CA3AF;
      line-height: 1.4;
      text-align: center;
    }
    .footer {
      margin-top: 30px;
      text-align: center;
      font-size: 10px;
      color: #9CA3AF;
    }
      .items-table thead {
      display: table-header-group;
    }
    .items-table tbody {
      display: table-row-group;
    }
    .items-table tr {
      page-break-inside: avoid;
    }
  </style>
</head>
<body>
  <div class="page-header-repeat">
    <div class="ph-left">
      ${showLogo && companyInfo.logo
        ? `<div class="ph-logo"><img src="${companyInfo.logo}" alt="Logo" /></div>`
        : `<div class="ph-company-name">${escapeHtml(companyInfo.name) || 'Mon Entreprise'}</div>`
      }
    </div>
    <div class="ph-right">
      <span class="ph-doc-type">${typeLabel}</span>
      <span class="ph-doc-ref">${escapeHtml(document.number)}</span>
    </div>
  </div>
  <div class="page-footer-repeat"></div>
  <div class="page">
    ${styleConfig.accentBar}
    <div class="header">
      <div class="company-info">
        ${logoHtml}
        ${companyAddressHtml ? `<div class="company-contact">${companyAddressHtml}</div>` : ''}
        ${companyContactHtml ? `<div class="company-contact">${companyContactHtml}</div>` : ''}
      </div>
      <div class="document-info">
        <div class="document-type">${typeLabel}</div>
        <div class="document-number">${escapeHtml(document.number)}</div>
        ${isCreditNoteDoc && document.original_invoice_id ? `
        <div style="font-size: 11px; color: #6B7280; margin-top: 4px;">
          Réf. facture d'origine: ${escapeHtml(document.notes?.match(/FAC-[\d-]+/)?.[0] || '')}
        </div>
        ` : ''}
        <div class="document-dates">
          <div><strong>Date :</strong> ${formatDate(document.date)}</div>
          ${document.due_date ? `<div><strong>Échéance :</strong> ${formatDate(document.due_date)}</div>` : ''}
        </div>
      </div>
    </div>

    ${(document.dossier || document.objet) ? `
    <div style="margin-bottom: 20px; padding: 12px 16px; background: #F9FAFB; border-radius: 8px; border-left: 4px solid ${primaryColor};">
      ${document.dossier ? `<div style="margin-bottom: ${document.objet ? '8px' : '0'};"><strong style="color: #6B7280; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Dossier :</strong> <span style="color: #111827; font-weight: 500;">${escapeHtml(document.dossier)}</span></div>` : ''}
      ${document.objet ? `<div><strong style="color: #6B7280; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Objet :</strong> <span style="color: #111827;">${escapeHtml(document.objet)}</span></div>` : ''}
    </div>
    ` : ''}

    <div class="parties">
      <div class="party-box">
        <div class="party-label">Émetteur</div>
        <div class="party-name">${escapeHtml(companyInfo.name) || 'Mon Entreprise'}</div>
        ${companyAddressHtml ? `<div class="party-address">${companyAddressHtml}</div>` : ''}
        ${companyLegalHtml ? `<div class="party-legal">${companyLegalHtml}</div>` : ''}
        ${companyContactHtml ? `<div class="party-address">${companyContactHtml}</div>` : ''}
      </div>
      <div class="party-box">
        <div class="party-label">Destinataire</div>
        <div class="party-name">${escapeHtml(client?.name || document.client_name || 'Client')}</div>
        ${client?.company ? `<div class="party-company">${escapeHtml(client.company)}</div>` : ''}
        ${clientAddressHtml ? `<div class="party-address">${clientAddressHtml}</div>` : ''}
        ${clientLegalHtml ? `<div class="party-legal">${clientLegalHtml}</div>` : ''}
        ${client?.email ? `<div class="party-address">Email: ${escapeHtml(client.email)}</div>` : ''}
      </div>
      ${hasDeliveryAddress ? `
      <div class="party-box delivery-box">
        <div class="party-label">Adresse de livraison</div>
        <div class="party-address">${deliveryAddressHtml}</div>
      </div>
      ` : ''}
    </div>

    <table class="items-table">
      <thead>
        <tr>
          ${hasAnyImage ? '<th style="width: 55px;">Illustration</th>' : ''}
          <th style="width: ${hasAnyImage ? (noTva ? '50%' : '43%') : (noTva ? '56%' : '50%')};">Description</th>
          <th style="width: 10%;">Qté</th>
          <th style="width: 14%;">Prix unit. HT</th>
          ${noTva ? '' : '<th style="width: 10%;">TVA</th>'}
          <th style="width: 14%;">Total HT</th>
        </tr>
      </thead>
      <tbody>
        ${lineItemsHtml || `<tr><td colspan="${hasAnyImage ? (noTva ? 5 : 6) : (noTva ? 4 : 5)}" style="padding: 20px; text-align: center; color: #9CA3AF; font-style: italic;">Aucune ligne</td></tr>`}
      </tbody>
    </table>

    <div class="totals-section">
      <div class="totals-box">
        <table class="totals-table">
          ${autoLiquidationHtml}
          ${globalDiscountHtml}
          <tr>
            <td class="label">Total HT</td>
            <td class="value">${formatCurrency(document.total_ht)}</td>
          </tr>
          ${noTva ? '' : `<tr>
            <td class="label">TVA</td>
            <td class="value">${formatCurrency(document.total_tva)}</td>
          </tr>`}
          <tr class="total-row">
            <td class="label">${noTva ? 'Total HT net' : 'Total TTC'}</td>
            <td class="value">${formatCurrency(noTva ? document.total_ht : document.total_ttc)}</td>
          </tr>
        </table>
      </div>
    </div>

    ${depositInfo && depositInfo.enabled && isDevis ? `
    <div style="margin-bottom: 20px; padding: 16px; border: 2px solid #F59E0B; border-radius: 8px; background: #FFFBEB;">
      <div style="font-size: 13px; font-weight: 700; color: #B45309; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px;">Échéancier d'acompte</div>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 10px;">
        <tr style="border-bottom: 1px solid #FDE68A;">
          <td style="padding: 6px 0; font-size: 11px; font-weight: 600; color: #92400E;">Échéance</td>
          <td style="padding: 6px 0; font-size: 11px; font-weight: 600; color: #92400E; text-align: right;">Montant TTC</td>
          <td style="padding: 6px 0; font-size: 11px; font-weight: 600; color: #92400E; text-align: right;">Date</td>
        </tr>
        ${depositInfo.installments.map(inst => `
        <tr style="border-bottom: 1px solid #FEF3C7;">
          <td style="padding: 6px 0; font-size: 11px; color: #78350F;">Acompte ${inst.index}/${depositInfo.installmentCount} (${inst.percentage.toFixed(1)}%)</td>
          <td style="padding: 6px 0; font-size: 11px; color: #78350F; text-align: right; font-weight: 500;">${formatCurrency(inst.amount)}</td>
          <td style="padding: 6px 0; font-size: 11px; color: #78350F; text-align: right;">${inst.dueDate ? formatDate(inst.dueDate) : '—'}</td>
        </tr>
        `).join('')}
      </table>
      <div style="display: flex; justify-content: space-between; padding-top: 8px; border-top: 2px solid #FDE68A;">
        <div>
          <div style="font-size: 10px; color: #92400E;">Total acomptes</div>
          <div style="font-size: 13px; font-weight: 700; color: #B45309;">${formatCurrency(depositInfo.totalDepositAmount)}</div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 10px; color: #92400E;">Solde à facturer</div>
          <div style="font-size: 13px; font-weight: 700; color: #B45309;">${formatCurrency(depositInfo.remainingBalance)}</div>
        </div>
      </div>
    </div>
    ` : ''}

    ${
      document.notes
        ? `
    <div class="notes-section">
      <div class="notes-title">Notes</div>
      <div class="notes-content">${escapeHtml(document.notes)}</div>
    </div>
    `
        : ''
    }

    ${
      document.conditions
        ? `
    <div class="notes-section">
      <div class="notes-title">Conditions particulières</div>
      <div class="notes-content">${escapeHtml(document.conditions)}</div>
    </div>
    `
        : ''
    }

    ${
      companyInfo.defaultConditions
        ? `
    <div class="notes-section">
      <div class="notes-title">Conditions de paiement</div>
      <div class="notes-content">${escapeHtml(companyInfo.defaultConditions)}</div>
    </div>
    `
        : ''
    }

    ${
      companyInfo.defaultLegalMentions || vatExemptMention
        ? `
    <div class="legal-section">
      <div class="legal-text">
        ${vatExemptMention ? `<div style="font-weight: 500; margin-bottom: 4px;">${escapeHtml(vatExemptMention)}</div>` : ''}
        ${companyInfo.defaultLegalMentions ? escapeHtml(companyInfo.defaultLegalMentions) : ''}
      </div>
    </div>
    `
        : ''
    }

    ${facturXml ? `
    <div style="margin-top: 20px; padding: 12px 16px; background: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 8px;">
      <div style="display: flex; align-items: center; margin-bottom: 6px;">
        <span style="font-size: 13px; font-weight: 600; color: #1E40AF;">📄 Factur-X / PDF/A-3</span>
      </div>
      <div style="font-size: 10px; color: #3B82F6;">Profil EN16931 (Extended) — Norme NF EN 16931 — Conforme Factur-X v1.0</div>
      <div style="font-size: 9px; color: #6B7280; margin-top: 4px;">Ce document contient les données structurées XML Factur-X intégrées conformément au standard PDF/A-3.</div>
    </div>
    ` : ''}

    <div class="footer">
      ${footerText ? `<div style="margin-bottom: 8px;">${escapeHtml(footerText)}</div>` : ''}
      Document généré le ${formatDate(new Date().toISOString())}
      ${facturXml ? '<div style="margin-top: 4px; font-size: 9px; color: #6B7280;">Format: PDF/A-3 avec données Factur-X embarquées (XML EN16931)</div>' : ''}
    </div>

    ${facturXml ? `
    <div id="facturx-xml-data" style="display: none;" data-facturx-profile="EN16931" data-facturx-version="1.0">
      ${escapeHtml(facturXml)}
    </div>
    ` : ''}
  </div>
</body>
</html>
  `;
}

export async function generatePDF(
  document: Document,
  lineItems: LineItem[],
  client: Client | null,
  companyInfo: CompanyInfo,
  templateSettings?: TemplateSettings,
  facturXml?: string,
  depositInfo?: PDFDepositInfo
): Promise<PDFGenerationResult> {
  console.log('[PDF] Generating PDF for document:', document.number, facturXml ? '(Factur-X PDF/A-3)' : '', depositInfo?.enabled ? '(with deposit)' : '');
  
  const preparedLineItems = await prepareLineItemsWithImages(lineItems);
  
  const html = generatePDFHTML(document, preparedLineItems, client, companyInfo, templateSettings, facturXml, depositInfo);
  
  try {
    const result = await Print.printToFileAsync({
      html,
      width: 595,
      height: 842,
      base64: false,
    });
    
    console.log('[PDF] PDF generated successfully:', result.uri);
    return { uri: result.uri };
  } catch (error) {
    console.error('[PDF] Error generating PDF:', error);
    throw new PDFError(
      PDF_ERROR_CODES.GENERATION_FAILED,
      error instanceof Error ? error.message : 'Unknown error',
      PDF_ERROR_MESSAGES[PDF_ERROR_CODES.GENERATION_FAILED]
    );
  }
}

export async function printDocument(
  document: Document,
  lineItems: LineItem[],
  client: Client | null,
  companyInfo: CompanyInfo,
  templateSettings?: TemplateSettings,
  facturXml?: string,
  depositInfo?: PDFDepositInfo
): Promise<void> {
  console.log('[PDF] Printing document:', document.number);
  
  const preparedLineItems = await prepareLineItemsWithImages(lineItems);
  
  const html = generatePDFHTML(document, preparedLineItems, client, companyInfo, templateSettings, facturXml, depositInfo);
  
  try {
    await Print.printAsync({ html });
    console.log('[PDF] Print dialog opened');
  } catch (error) {
    console.error('[PDF] Error printing:', error);
    throw new PDFError(
      PDF_ERROR_CODES.PRINT_FAILED,
      error instanceof Error ? error.message : 'Unknown error',
      PDF_ERROR_MESSAGES[PDF_ERROR_CODES.PRINT_FAILED]
    );
  }
}

export async function sharePDF(uri: string): Promise<void> {
  console.log('[PDF] Sharing PDF:', uri);
  
  if (Platform.OS === 'web') {
    console.log('[PDF] Web sharing not supported');
    throw new PDFError(
      PDF_ERROR_CODES.WEB_NOT_SUPPORTED,
      'Web sharing not supported',
      PDF_ERROR_MESSAGES[PDF_ERROR_CODES.WEB_NOT_SUPPORTED]
    );
  }
  
  try {
    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      throw new PDFError(
        PDF_ERROR_CODES.SHARE_UNAVAILABLE,
        'Sharing not available',
        PDF_ERROR_MESSAGES[PDF_ERROR_CODES.SHARE_UNAVAILABLE]
      );
    }
    
    await Sharing.shareAsync(uri, {
      UTI: '.pdf',
      mimeType: 'application/pdf',
      dialogTitle: 'Partager le document',
    });
    console.log('[PDF] Share dialog opened');
  } catch (error) {
    if (error instanceof PDFError) throw error;
    console.error('[PDF] Error sharing:', error);
    throw new PDFError(
      PDF_ERROR_CODES.SHARE_FAILED,
      error instanceof Error ? error.message : 'Unknown error',
      PDF_ERROR_MESSAGES[PDF_ERROR_CODES.SHARE_FAILED]
    );
  }
}

export async function sendEmailWithPDF(
  document: Document,
  client: Client | null,
  pdfUri: string
): Promise<boolean> {
  console.log('[PDF] Sending email with PDF:', document.number);
  
  try {
    const isAvailable = await MailComposer.isAvailableAsync();
    if (!isAvailable) {
      console.log('[PDF] Mail composer not available');
      throw new PDFError(
        PDF_ERROR_CODES.MAIL_UNAVAILABLE,
        'Mail composer not available',
        PDF_ERROR_MESSAGES[PDF_ERROR_CODES.MAIL_UNAVAILABLE]
      );
    }
    
    const typeLabel = TYPE_LABELS[document.type];
    const subject = `${typeLabel} ${document.number}`;
    const body = `Bonjour,

Veuillez trouver ci-joint votre ${typeLabel.toLowerCase()} n°${document.number}.

Montant ${document.auto_liquidation === 1 ? 'HT' : 'TTC'}: ${formatCurrency(document.auto_liquidation === 1 ? document.total_ht : document.total_ttc)}
${document.due_date ? `Date d'échéance: ${formatDate(document.due_date)}` : ''}

Cordialement`;

    const result = await MailComposer.composeAsync({
      recipients: client?.email ? [client.email] : [],
      subject,
      body,
      attachments: Platform.OS !== 'web' ? [pdfUri] : [],
    });
    
    console.log('[PDF] Email compose result:', result.status);
    return result.status !== MailComposer.MailComposerStatus.CANCELLED;
  } catch (error) {
    if (error instanceof PDFError) throw error;
    console.error('[PDF] Error composing email:', error);
    throw new PDFError(
      PDF_ERROR_CODES.MAIL_FAILED,
      error instanceof Error ? error.message : 'Unknown error',
      PDF_ERROR_MESSAGES[PDF_ERROR_CODES.MAIL_FAILED]
    );
  }
}

export function getDocumentFileName(document: Document): string {
  const typePrefix = document.type === 'devis' ? 'Devis' : 'Facture';
  const safeNumber = document.number.replace(/[^a-zA-Z0-9-_]/g, '_');
  return `${typePrefix}_${safeNumber}.pdf`;
}

export interface EInvoiceFilesResult {
  pdfUri: string;
  xmlUri: string;
}

export async function generateFacturXFiles(
  document: Document,
  lineItems: LineItem[],
  client: Client | null,
  companyInfo: CompanyInfo,
  templateSettings?: TemplateSettings
): Promise<EInvoiceFilesResult> {
  console.log('[PDF] Generating Factur-X files (PDF + XML) for:', document.number);

  const facturXData: FacturXData = {
    invoiceNumber: document.number,
    issueDate: document.date,
    dueDate: document.due_date,
    seller: {
      name: companyInfo.name,
      siret: companyInfo.siret,
      address: companyInfo.address,
      city: companyInfo.city,
      postalCode: companyInfo.postalCode,
      country: 'FR',
      email: companyInfo.email,
      vatNumber: companyInfo.tvaNumber,
    },
    buyer: {
      name: client?.company || client?.name || document.client_name || 'Client',
      siret: client?.siret,
      address: client?.address,
      city: client?.city,
      postalCode: client?.postal_code,
      country: client?.country || 'FR',
      email: client?.email,
      vatNumber: client?.tva_number,
    },
    lines: lineItems.map((item, index) => ({
      lineNumber: index + 1,
      description: item.label || item.description,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      vatRate: item.tva_rate,
      lineTotal: item.total_ht,
    })),
    totals: {
      totalHT: document.total_ht,
      totalVAT: document.total_tva,
      totalTTC: document.total_ttc,
    },
    paymentTerms: document.conditions,
    notes: document.notes,
  };

  const xmlContent = generateFacturXML(facturXData);

  console.log('[PDF] Generating PDF/A-3 with embedded Factur-X XML');
  const pdfResult = await generatePDF(document, lineItems, client, companyInfo, templateSettings, xmlContent);

  let xmlUri = '';
  if (Platform.OS !== 'web') {
    const safeNumber = document.number.replace(/[^a-zA-Z0-9-_]/g, '_');
    const xmlFileName = `facturx_${safeNumber}_${Date.now()}.xml`;
    xmlUri = `${FileSystem.cacheDirectory}${xmlFileName}`;
    await FileSystem.writeAsStringAsync(xmlUri, xmlContent, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    console.log('[PDF] Factur-X XML also saved separately to:', xmlUri);
  } else {
    console.log('[PDF] XML file generation skipped on web');
  }

  return { pdfUri: pdfResult.uri, xmlUri };
}

export async function shareEInvoiceFiles(pdfUri: string, xmlUri: string): Promise<void> {
  console.log('[PDF] Sharing e-invoice files:', { pdfUri, xmlUri });

  if (Platform.OS === 'web') {
    throw new PDFError(
      PDF_ERROR_CODES.WEB_NOT_SUPPORTED,
      'Web sharing not supported',
      PDF_ERROR_MESSAGES[PDF_ERROR_CODES.WEB_NOT_SUPPORTED]
    );
  }

  try {
    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      throw new PDFError(
        PDF_ERROR_CODES.SHARE_UNAVAILABLE,
        'Sharing not available',
        PDF_ERROR_MESSAGES[PDF_ERROR_CODES.SHARE_UNAVAILABLE]
      );
    }

    await Sharing.shareAsync(pdfUri, {
      UTI: '.pdf',
      mimeType: 'application/pdf',
      dialogTitle: 'Partager la facture Factur-X (PDF)',
    });

    if (xmlUri) {
      await Sharing.shareAsync(xmlUri, {
        UTI: 'public.xml',
        mimeType: 'application/xml',
        dialogTitle: 'Partager le fichier XML Factur-X',
      });
    }

    console.log('[PDF] E-invoice files shared');
  } catch (error) {
    if (error instanceof PDFError) throw error;
    console.error('[PDF] Error sharing e-invoice files:', error);
    throw new PDFError(
      PDF_ERROR_CODES.SHARE_FAILED,
      error instanceof Error ? error.message : 'Unknown error',
      PDF_ERROR_MESSAGES[PDF_ERROR_CODES.SHARE_FAILED]
    );
  }
}

export async function sendEmailWithEInvoice(
  document: Document,
  client: Client | null,
  pdfUri: string,
  xmlUri: string
): Promise<boolean> {
  console.log('[PDF] Sending e-invoice email with PDF + XML:', document.number);

  try {
    const isAvailable = await MailComposer.isAvailableAsync();
    if (!isAvailable) {
      throw new PDFError(
        PDF_ERROR_CODES.MAIL_UNAVAILABLE,
        'Mail composer not available',
        PDF_ERROR_MESSAGES[PDF_ERROR_CODES.MAIL_UNAVAILABLE]
      );
    }

    const typeLabel = TYPE_LABELS[document.type];
    const subject = `${typeLabel} ${document.number} — Factur-X`;
    const body = `Bonjour,

Veuillez trouver ci-joint votre ${typeLabel.toLowerCase()} n°${document.number} au format Factur-X (PDF/A + XML).

Montant ${document.auto_liquidation === 1 ? 'HT' : 'TTC'}: ${formatCurrency(document.auto_liquidation === 1 ? document.total_ht : document.total_ttc)}
${document.due_date ? `Date d'échéance: ${formatDate(document.due_date)}` : ''}

Cordialement`;

    const attachments: string[] = [];
    if (Platform.OS !== 'web') {
      attachments.push(pdfUri);
      if (xmlUri) {
        attachments.push(xmlUri);
      }
    }

    const result = await MailComposer.composeAsync({
      recipients: client?.email ? [client.email] : [],
      subject,
      body,
      attachments,
    });

    console.log('[PDF] E-invoice email compose result:', result.status);
    return result.status !== MailComposer.MailComposerStatus.CANCELLED;
  } catch (error) {
    if (error instanceof PDFError) throw error;
    console.error('[PDF] Error composing e-invoice email:', error);
    throw new PDFError(
      PDF_ERROR_CODES.MAIL_FAILED,
      error instanceof Error ? error.message : 'Unknown error',
      PDF_ERROR_MESSAGES[PDF_ERROR_CODES.MAIL_FAILED]
    );
  }
}

export function handlePDFError(error: unknown): string {
  if (error instanceof PDFError) {
    return error.userMessage;
  }
  if (error instanceof Error) {
    console.error('[PDF] Unhandled error:', error.message);
    return 'Une erreur inattendue est survenue. Veuillez réessayer.';
  }
  return 'Une erreur inconnue est survenue.';
}

export function showPDFErrorAlert(error: unknown, title: string = 'Erreur'): void {
  const message = handlePDFError(error);
  Alert.alert(title, message, [{ text: 'OK' }]);
}

export async function generateSplitPDF(
  split: DocumentSplit,
  masterDocument: Document,
  lineAssignments: SplitLineAssignment[],
  client: Client | null,
  companyInfo: CompanyInfo,
  templateSettings?: TemplateSettings
): Promise<PDFGenerationResult> {
  console.log('[PDF] Generating split PDF:', split.number_full);
  
  try {
    const splitDocument: Document = {
      ...masterDocument,
      id: parseInt(split.id, 10) || 0,
      number: split.number_full,
      client_id: split.client_id,
      client_name: split.client_name,
      client_company: split.client_company,
      total_ht: split.total_ht,
      total_tva: split.total_tva,
      total_ttc: split.total_ttc,
      status: split.status === 'paid' ? 'paid' : split.status === 'sent' ? 'sent' : 'draft',
      sent_at: split.sent_at,
      paid_at: split.paid_at,
      payment_method: split.payment_method,
    };

    const splitLineItems: LineItem[] = lineAssignments.map((la, index) => ({
      id: index + 1,
      document_id: parseInt(split.id, 10) || 0,
      product_id: la.product_id,
      label: la.label,
      description: la.description,
      quantity: la.quantity,
      unit_price: la.unit_price,
      tva_rate: la.tva_rate,
      discount_type: la.discount_type,
      discount_value: la.discount_value,
      total_ht: la.total_ht,
      created_at: new Date().toISOString(),
    }));

    return generatePDF(splitDocument, splitLineItems, client, companyInfo, templateSettings);
  } catch (error) {
    console.error('[PDF] Error generating split PDF:', error);
    throw new PDFError(
      PDF_ERROR_CODES.GENERATION_FAILED,
      error instanceof Error ? error.message : 'Unknown error',
      PDF_ERROR_MESSAGES[PDF_ERROR_CODES.GENERATION_FAILED]
    );
  }
}

export async function shareSplitPDF(
  split: DocumentSplit,
  masterDocument: Document,
  lineAssignments: SplitLineAssignment[],
  client: Client | null,
  companyInfo: CompanyInfo,
  templateSettings?: TemplateSettings
): Promise<void> {
  const result = await generateSplitPDF(split, masterDocument, lineAssignments, client, companyInfo, templateSettings);
  await sharePDF(result.uri);
}

export async function sendSplitEmailWithPDF(
  split: DocumentSplit,
  masterDocument: Document,
  lineAssignments: SplitLineAssignment[],
  client: Client | null,
  companyInfo: CompanyInfo,
  templateSettings?: TemplateSettings
): Promise<boolean> {
  console.log('[PDF] Sending split email with PDF:', split.number_full);
  
  try {
    const isAvailable = await MailComposer.isAvailableAsync();
    if (!isAvailable) {
      throw new PDFError(
        PDF_ERROR_CODES.MAIL_UNAVAILABLE,
        'Mail composer not available',
        PDF_ERROR_MESSAGES[PDF_ERROR_CODES.MAIL_UNAVAILABLE]
      );
    }

    const result = await generateSplitPDF(split, masterDocument, lineAssignments, client, companyInfo, templateSettings);
    
    const typeLabel = TYPE_LABELS[masterDocument.type];
    const subject = `${typeLabel} ${split.number_full}`;
    const body = `Bonjour,

Veuillez trouver ci-joint votre ${typeLabel.toLowerCase()} n°${split.number_full}.

Ce document correspond à votre part dans le cadre d'une facturation partagée.
Document maître: ${masterDocument.number}

Montant TTC: ${formatCurrency(split.total_ttc)}
${masterDocument.due_date ? `Date d'échéance: ${formatDate(masterDocument.due_date)}` : ''}

Cordialement`;

    const mailResult = await MailComposer.composeAsync({
      recipients: client?.email ? [client.email] : [],
      subject,
      body,
      attachments: Platform.OS !== 'web' ? [result.uri] : [],
    });
    
    return mailResult.status !== MailComposer.MailComposerStatus.CANCELLED;
  } catch (error) {
    if (error instanceof PDFError) throw error;
    console.error('[PDF] Error sending split email:', error);
    throw new PDFError(
      PDF_ERROR_CODES.MAIL_FAILED,
      error instanceof Error ? error.message : 'Unknown error',
      PDF_ERROR_MESSAGES[PDF_ERROR_CODES.MAIL_FAILED]
    );
  }
}

export function getSplitFileName(split: DocumentSplit, masterType: 'devis' | 'facture'): string {
  const typePrefix = masterType === 'devis' ? 'Devis' : 'Facture';
  const safeNumber = split.number_full.replace(/[^a-zA-Z0-9-_]/g, '_');
  return `${typePrefix}_${safeNumber}.pdf`;
}
