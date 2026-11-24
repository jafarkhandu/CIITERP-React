import type { jsPDF } from 'jspdf';

export interface PaymentReceiptData {
  paymentId: number;
  paymentAmount: number;
  paymentDate?: string;
  paymentMode?: string;
  paymentDescription?: string;
  studentName: string;
  studentCode?: string;
  studentEmail?: string;
  studentMobile?: string;
  courseName?: string;
  registrationCode?: string;
  branchName?: string;
}

const NAVY: [number, number, number] = [16, 33, 61];
const BLUE: [number, number, number] = [34, 105, 221];
const MUTED: [number, number, number] = [99, 115, 139];
const BORDER: [number, number, number] = [220, 229, 241];

function safeText(value: unknown, fallback = 'Not available'): string {
  if (value === null || value === undefined) return fallback;
  const text = String(value).replace(/[\x00-\x1F\x7F]/g, ' ').trim();
  return text || fallback;
}

function formattedAmount(amount: number): string {
  return 'INR ' + new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formattedDate(value: unknown): string {
  const text = safeText(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  return match ? match[3] + '-' + match[2] + '-' + match[1] : text;
}

function wrappedText(
  doc: jsPDF,
  value: string,
  x: number,
  y: number,
  width: number,
  lineHeight = 5,
): number {
  const lines = doc.splitTextToSize(value, width) as string[];
  doc.text(lines, x, y);
  return y + (lines.length - 1) * lineHeight;
}

function fieldLabel(doc: jsPDF, label: string, x: number, y: number): void {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(label, x, y);
}

function fieldValue(
  doc: jsPDF,
  value: string,
  x: number,
  y: number,
  width: number,
  fontSize = 10.5,
): number {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(fontSize);
  doc.setTextColor(...NAVY);
  return wrappedText(doc, value, x, y, width);
}

/**
 * A single-payment, frontend-rendered receipt for ERP download buttons.
 * Backend-issued emailed PDFs are controlled separately by the backend.
 */
export async function downloadPremiumPaymentReceipt(receipt: PaymentReceiptData): Promise<void> {
  if (!Number.isSafeInteger(receipt.paymentId) || receipt.paymentId <= 0 ||
      !Number.isFinite(receipt.paymentAmount) || receipt.paymentAmount <= 0 ||
      !safeText(receipt.studentName, '') || !safeText(receipt.courseName, '')) {
    throw new Error('Complete and valid payment details are required to generate the receipt.');
  }

  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const edge = 20;
  const right = pageWidth - edge;

  // Compact two-line institute masthead.
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pageWidth, 51, 'F');
  doc.setFillColor(...BLUE);
  doc.rect(0, 49, pageWidth, 2, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(25);
  doc.text('CIIT', edge, 25);
  doc.setFontSize(10);
  doc.text('TRAINING INSTITUTE', edge + 31, 24.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(204, 221, 247);
  doc.text(
    receipt.branchName ? 'Branch: ' + safeText(receipt.branchName) : 'Training & Skills Development',
    edge,
    36,
    { maxWidth: 96 },
  );

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('PAYMENT RECEIPT', right, 23, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(204, 221, 247);
  doc.text('Receipt No. ' + receipt.paymentId, right, 34, { align: 'right' });

  // Identifies the student and the purchased course without registration date.
  fieldLabel(doc, 'RECEIVED FROM', edge, 70);
  fieldLabel(doc, 'COURSE DETAILS', 111, 70);
  let leftY = fieldValue(doc, safeText(receipt.studentName), edge, 79, 75, 12) + 8;
  if (receipt.studentCode) {
    leftY = fieldValue(doc, 'Student ID: ' + safeText(receipt.studentCode), edge, leftY, 76, 9) + 6;
  }
  if (receipt.studentEmail) {
    leftY = fieldValue(doc, safeText(receipt.studentEmail), edge, leftY, 76, 9) + 6;
  }
  if (receipt.studentMobile) {
    leftY = fieldValue(doc, 'Mobile: ' + safeText(receipt.studentMobile), edge, leftY, 76, 9) + 6;
  }

  let rightY = fieldValue(doc, safeText(receipt.courseName), 111, 79, 77, 12) + 8;
  if (receipt.registrationCode) {
    fieldLabel(doc, 'REGISTRATION CODE', 111, rightY - 1);
    rightY = fieldValue(doc, safeText(receipt.registrationCode), 111, rightY + 6, 77, 9) + 6;
  }

  const amountY = Math.max(124, leftY + 3, rightY + 3);
  doc.setFillColor(238, 245, 255);
  doc.roundedRect(edge, amountY, pageWidth - edge * 2, 46, 4, 4, 'F');
  doc.setFillColor(...BLUE);
  doc.roundedRect(edge, amountY, 3, 46, 1.5, 1.5, 'F');

  fieldLabel(doc, 'AMOUNT RECEIVED', edge + 10, amountY + 13);
  doc.setTextColor(...NAVY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  doc.text(formattedAmount(receipt.paymentAmount), edge + 10, amountY + 33);
  doc.setFontSize(9);
  doc.setTextColor(...BLUE);
  doc.text('PAYMENT RECORDED', right - 10, amountY + 14, { align: 'right' });

  const detailsY = amountY + 59;
  fieldLabel(doc, 'TRANSACTION DETAILS', edge, detailsY);
  doc.setDrawColor(...BORDER);
  doc.line(edge, detailsY + 5, right, detailsY + 5);

  fieldLabel(doc, 'PAYMENT DATE', edge, detailsY + 16);
  fieldLabel(doc, 'PAYMENT METHOD', 111, detailsY + 16);
  fieldValue(doc, formattedDate(receipt.paymentDate), edge, detailsY + 24, 78, 11);
  fieldValue(doc, safeText(receipt.paymentMode), 111, detailsY + 24, 76, 11);

  const noteY = detailsY + 40;
  fieldLabel(doc, 'PAYMENT DESCRIPTION', edge, noteY);
  const note = safeText(receipt.paymentDescription, 'Payment received towards course fees.');
  const noteEnd = fieldValue(doc, note, edge, noteY + 9, pageWidth - edge * 2, 9.5);
  if (noteEnd > 263) {
    throw new Error('The payment description is too long for a single-page receipt.');
  }

  const footerY = Math.max(noteEnd + 17, 270);
  doc.setDrawColor(...BORDER);
  doc.line(edge, footerY, right, footerY);
  doc.setTextColor(...NAVY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('Thank you for your payment.', edge, footerY + 10);

  doc.setTextColor(...MUTED);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Generated by CIIT ERP  |  Receipt for this transaction only', right, footerY + 10, { align: 'right' });

  doc.save('CIIT-Payment-Receipt-' + receipt.paymentId + '.pdf');
}
