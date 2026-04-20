export interface FacturXParty {
  name: string;
  siret?: string;
  siren?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  email?: string;
  vatNumber?: string;
}

export interface FacturXLine {
  lineNumber: number;
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
  lineTotal: number;
}

export interface FacturXTotals {
  totalHT: number;
  totalVAT: number;
  totalTTC: number;
}

export interface FacturXData {
  invoiceNumber: string;
  issueDate: string;
  dueDate?: string;
  seller: FacturXParty;
  buyer: FacturXParty;
  lines: FacturXLine[];
  totals: FacturXTotals;
  paymentTerms?: string;
  notes?: string;
  currencyCode?: string;
}

function escapeXml(text: string | undefined | null): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function formatAmount(amount: number): string {
  return amount.toFixed(2);
}

function groupLinesByVatRate(lines: FacturXLine[]): Map<number, { totalHT: number; totalVAT: number }> {
  const groups = new Map<number, { totalHT: number; totalVAT: number }>();
  
  for (const line of lines) {
    const existing = groups.get(line.vatRate) || { totalHT: 0, totalVAT: 0 };
    existing.totalHT += line.lineTotal;
    existing.totalVAT += line.lineTotal * (line.vatRate / 100);
    groups.set(line.vatRate, existing);
  }
  
  return groups;
}

export function generateFacturXML(data: FacturXData): string {
  const currency = data.currencyCode || 'EUR';
  const vatGroups = groupLinesByVatRate(data.lines);
  
  const vatBreakdownXml = Array.from(vatGroups.entries())
    .map(([rate, totals]) => `
      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>${formatAmount(totals.totalVAT)}</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>
        <ram:BasisAmount>${formatAmount(totals.totalHT)}</ram:BasisAmount>
        <ram:CategoryCode>S</ram:CategoryCode>
        <ram:RateApplicablePercent>${formatAmount(rate)}</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>`)
    .join('');

  const lineItemsXml = data.lines
    .map((line) => `
    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument>
        <ram:LineID>${line.lineNumber}</ram:LineID>
      </ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct>
        <ram:Name>${escapeXml(line.description)}</ram:Name>
      </ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement>
        <ram:NetPriceProductTradePrice>
          <ram:ChargeAmount>${formatAmount(line.unitPrice)}</ram:ChargeAmount>
        </ram:NetPriceProductTradePrice>
      </ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery>
        <ram:BilledQuantity unitCode="C62">${formatAmount(line.quantity)}</ram:BilledQuantity>
      </ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax>
          <ram:TypeCode>VAT</ram:TypeCode>
          <ram:CategoryCode>S</ram:CategoryCode>
          <ram:RateApplicablePercent>${formatAmount(line.vatRate)}</ram:RateApplicablePercent>
        </ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation>
          <ram:LineTotalAmount>${formatAmount(line.lineTotal)}</ram:LineTotalAmount>
        </ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>`)
    .join('');

  const sellerTaxRegistrationXml = data.seller.vatNumber
    ? `<ram:SpecifiedTaxRegistration>
        <ram:ID schemeID="VA">${escapeXml(data.seller.vatNumber)}</ram:ID>
      </ram:SpecifiedTaxRegistration>`
    : '';

  const sellerSiretXml = data.seller.siret
    ? `<ram:ID schemeID="0002">${escapeXml(data.seller.siret)}</ram:ID>`
    : '';

  const buyerSiretXml = data.buyer.siret
    ? `<ram:ID schemeID="0002">${escapeXml(data.buyer.siret)}</ram:ID>`
    : '';

  const dueDateXml = data.dueDate
    ? `<ram:DueDateDateTime>
        <udt:DateTimeString format="102">${formatDate(data.dueDate)}</udt:DateTimeString>
      </ram:DueDateDateTime>`
    : '';

  const paymentTermsXml = data.paymentTerms
    ? `<ram:SpecifiedTradePaymentTerms>
        <ram:Description>${escapeXml(data.paymentTerms)}</ram:Description>
        ${dueDateXml}
      </ram:SpecifiedTradePaymentTerms>`
    : '';

  const notesXml = data.notes
    ? `<ram:IncludedNote>
        <ram:Content>${escapeXml(data.notes)}</ram:Content>
      </ram:IncludedNote>`
    : '';

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
  xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100"
  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
  xmlns:xs="http://www.w3.org/2001/XMLSchema"
  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">

  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>urn:factur-x.eu:1p0:en16931</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>

  <rsm:ExchangedDocument>
    <ram:ID>${escapeXml(data.invoiceNumber)}</ram:ID>
    <ram:TypeCode>380</ram:TypeCode>
    <ram:IssueDateTime>
      <udt:DateTimeString format="102">${formatDate(data.issueDate)}</udt:DateTimeString>
    </ram:IssueDateTime>
    ${notesXml}
  </rsm:ExchangedDocument>

  <rsm:SupplyChainTradeTransaction>
    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty>
        ${sellerSiretXml}
        <ram:Name>${escapeXml(data.seller.name)}</ram:Name>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${escapeXml(data.seller.postalCode)}</ram:PostcodeCode>
          <ram:LineOne>${escapeXml(data.seller.address)}</ram:LineOne>
          <ram:CityName>${escapeXml(data.seller.city)}</ram:CityName>
          <ram:CountryID>${escapeXml(data.seller.country) || 'FR'}</ram:CountryID>
        </ram:PostalTradeAddress>
        ${data.seller.email ? `<ram:URIUniversalCommunication>
          <ram:URIID schemeID="EM">${escapeXml(data.seller.email)}</ram:URIID>
        </ram:URIUniversalCommunication>` : ''}
        ${sellerTaxRegistrationXml}
      </ram:SellerTradeParty>

      <ram:BuyerTradeParty>
        ${buyerSiretXml}
        <ram:Name>${escapeXml(data.buyer.name)}</ram:Name>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${escapeXml(data.buyer.postalCode)}</ram:PostcodeCode>
          <ram:LineOne>${escapeXml(data.buyer.address)}</ram:LineOne>
          <ram:CityName>${escapeXml(data.buyer.city)}</ram:CityName>
          <ram:CountryID>${escapeXml(data.buyer.country) || 'FR'}</ram:CountryID>
        </ram:PostalTradeAddress>
        ${data.buyer.email ? `<ram:URIUniversalCommunication>
          <ram:URIID schemeID="EM">${escapeXml(data.buyer.email)}</ram:URIID>
        </ram:URIUniversalCommunication>` : ''}
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>

    <ram:ApplicableHeaderTradeDelivery/>

    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>${currency}</ram:InvoiceCurrencyCode>
      ${paymentTermsXml}
      ${vatBreakdownXml}
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${formatAmount(data.totals.totalHT)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${formatAmount(data.totals.totalHT)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="${currency}">${formatAmount(data.totals.totalVAT)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${formatAmount(data.totals.totalTTC)}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${formatAmount(data.totals.totalTTC)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>

    ${lineItemsXml}
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;

  return xml.trim();
}

export function validateFacturXData(data: FacturXData): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!data.invoiceNumber) {
    errors.push('Numéro de facture requis');
  }

  if (!data.issueDate) {
    errors.push("Date d'émission requise");
  }

  if (!data.seller.name) {
    errors.push("Nom de l'émetteur requis");
  }

  if (!data.seller.siret && !data.seller.siren) {
    errors.push("SIRET ou SIREN de l'émetteur requis pour la facturation électronique");
  }

  if (!data.buyer.name) {
    errors.push('Nom du destinataire requis');
  }

  if (data.lines.length === 0) {
    errors.push('Au moins une ligne de facture requise');
  }

  for (const line of data.lines) {
    if (!line.description) {
      errors.push(`Ligne ${line.lineNumber}: description requise`);
    }
    if (line.quantity <= 0) {
      errors.push(`Ligne ${line.lineNumber}: quantité invalide`);
    }
    if (line.unitPrice < 0) {
      errors.push(`Ligne ${line.lineNumber}: prix unitaire invalide`);
    }
  }

  if (data.totals.totalTTC <= 0) {
    errors.push('Total TTC doit être supérieur à 0');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

export function getFacturXProfile(): string {
  return 'EN16931 (Factur-X Extended)';
}

export function getFacturXVersion(): string {
  return '1.0';
}
