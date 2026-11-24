import type { jsPDF } from 'jspdf';
import { studentApi } from '@/api/studentApi';

type RecordRow = Record<string, unknown>;

export interface PaymentReceiptRequest {
  paymentId: number;
  registrationId: number;
  studentId: number;
  payment: RecordRow;
  student?: RecordRow | null;
  profile?: RecordRow | null;
  registration?: RecordRow | null;
}

interface ReceiptData {
  paymentId: number;
  paymentDate: string;
  paymentMode: string;
  description: string;
  studentName: string;
  studentEmail: string;
  studentMobile: string;
  permanentId: string;
  registrationCode: string;
  courseName: string;
  branchName: string;
  branchAddress: string;
  gstNumber: string;
  branchEmail: string;
  branchMobile: string;
  totalFees: number;
  discount: number;
  netFees: number;
  currentPayment: number;
  previousPayment: number;
  remainingPayment: number;
}

const NAVY: [number, number, number] = [20, 43, 78];
const BLUE: [number, number, number] = [30, 91, 174];
const MUTED: [number, number, number] = [80, 97, 119];
const BORDER: [number, number, number] = [207, 219, 233];
const PALE: [number, number, number] = [239, 245, 253];

const PAYMENT_ID = ['paymentId', 'payment_Id', 'payment_id', 'PaymentId'];
const REGISTRATION_ID = ['registrationId', 'registration_Id', 'registration_id', 'RegistrationId'];
const STUDENT_ID = ['studentId', 'student_Id', 'student_id', 'StudentId'];
const PAYMENT_DATE = ['paymentDate', 'payment_Date', 'payment_date', 'PaymentDate'];
const PAYMENT_AMOUNT = ['paymentAmount', 'payment_Amount', 'payment_amount', 'PaymentAmount'];

function row(value: unknown): RecordRow | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordRow : null;
}

function read(sources: (RecordRow | null | undefined)[], keys: string[]): unknown {
  for (const source of sources) {
    if (!source) continue;
    for (const key of keys) {
      const value = source[key];
      if (value !== null && value !== undefined && value !== '') return value;
    }
  }
  return null;
}

function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).replace(/[\x00-\x1f\x7f]/g, ' ').trim();
}

function unwrap(value: unknown): RecordRow | null {
  let current = row(value);
  for (let depth = 0; current && depth < 3; depth += 1) {
    const nested = row(read([current], ['data', 'result', 'student', 'studentDetails']));
    if (!nested) break;
    current = nested;
  }
  return current;
}

function children(value: RecordRow | null | undefined, keys: string[]): RecordRow[] | null {
  const list = read([value], keys);
  if (!Array.isArray(list)) return null;
  const rows = list.map(row);
  return rows.every(item => item !== null) ? rows as RecordRow[] : null;
}

function positiveId(value: unknown): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function matchesId(value: RecordRow, keys: string[], expected: number): boolean {
  return positiveId(read([value], keys)) === expected;
}

function matchesIfPresent(value: RecordRow, keys: string[], expected: number): boolean {
  const found = read([value], keys);
  return found === null || positiveId(found) === expected;
}

function cents(value: unknown): number | null {
  if (value === null || value === undefined || (typeof value !== 'number' && typeof value !== 'string')) return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const number = Number(value);
  const scaled = Math.round(number * 100);
  return Number.isSafeInteger(scaled) && number >= 0 ? scaled : null;
}

function paymentDay(value: unknown): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})(?:$|T|\s)/.exec(text(value));
  if (!match) return null;
  const date = new Date(match[1] + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === match[1] ? match[1] : null;
}

function formattedDate(value: string): string {
  const [year, month, day] = value.split('-');
  return day + '-' + month + '-' + year;
}

function money(value: number): string {
  return 'Rs. ' + new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / 100);
}

/**
 * The financial summary is for the selected receipt, not today's overall
 * balance. Derive it only from the matching registration's payment history
 * and fee figures returned by the backend. All arithmetic uses integer paise.
 */
function feeSummary(detail: RecordRow, registration: RecordRow, paymentId: number, registrationId: number, studentId: number) {
  const amount = cents(read([detail], PAYMENT_AMOUNT));
  const date = paymentDay(read([detail], PAYMENT_DATE));
  const history = children(registration, ['payments', 'Payments']);
  if (amount === null || amount <= 0 || !date || !history) return null;

  const seen = new Set<number>();
  let previous = 0;
  let allPaid = 0;
  let found = false;
  for (const payment of history) {
    if (!matchesIfPresent(payment, REGISTRATION_ID, registrationId) ||
        !matchesIfPresent(payment, STUDENT_ID, studentId)) return null;
    const id = positiveId(read([payment], PAYMENT_ID));
    const day = paymentDay(read([payment], PAYMENT_DATE));
    const paid = cents(read([payment], PAYMENT_AMOUNT));
    if (!id || !day || paid === null || seen.has(id)) return null;
    seen.add(id);
    allPaid += paid;
    if (id === paymentId) {
      if (paid !== amount || day !== date) return null;
      found = true;
    } else if (day < date || (day === date && id < paymentId)) {
      previous += paid;
    }
  }
  if (!found || !Number.isSafeInteger(allPaid)) return null;

  const reportedPrevious = cents(read([detail], [
    'previousPayment', 'previousPaymentsTotal', 'previousPaymentAmount', 'previous_Payment',
  ]));
  if (reportedPrevious !== null && reportedPrevious !== previous) return null;

  const throughPayment = previous + amount;
  const paidKeys = ['totalPaid', 'total_Paid', 'total_paid'];
  const balanceKeys = ['remainingBalance', 'remaining_Balance', 'remaining_balance'];
  const totalsSource = [detail, registration].find(source =>
    cents(read([source], paidKeys)) !== null && cents(read([source], balanceKeys)) !== null,
  );
  const totalPaid = cents(read([totalsSource], paidKeys));
  const balance = cents(read([totalsSource], balanceKeys));
  let net = cents(read([detail, registration], ['finalFees', 'final_Fees', 'final_fees', 'netFees', 'net_Fees']));
  let gross = cents(read([detail, registration], [
    'actualFees', 'actual_Fees', 'totalFees', 'total_Fees', 'total_fees', 'courseFees', 'course_Fees',
  ]));
  let discount = cents(read([detail, registration], ['discount', 'Discount', 'discountAmount', 'discount_Amount']));

  // Only infer a net fee from a coherent paid/balance pair. The endpoint
  // may return either a receipt-time total or the current registration total.
  if (totalPaid !== null && totalPaid !== allPaid && totalPaid !== throughPayment) return null;
  if (totalPaid !== null && balance !== null) {
    const reportedNet = totalPaid + balance;
    if (net !== null && net !== reportedNet) return null;
    net = reportedNet;
  }
  if (net === null && gross !== null && discount !== null) net = gross - discount;
  if (gross === null && net !== null && discount !== null) gross = net + discount;
  if (discount === null && gross !== null && net !== null) discount = gross - net;

  if (gross === null || discount === null || net === null ||
      discount < 0 || net < throughPayment || gross - discount !== net ||
      ![gross, discount, net, previous, throughPayment].every(Number.isSafeInteger)) return null;

  return {
    totalFees: gross,
    discount,
    netFees: net,
    currentPayment: amount,
    previousPayment: previous,
    remainingPayment: net - throughPayment,
  };
}

function branchDetails(sources: RecordRow[]) {
  const branchName = text(read(sources, ['branchName', 'branch_Name', 'branch_name', 'BranchName']));
  const branchRows = sources.map(source => row(read([source], ['branch', 'Branch', 'branchDetails'])));
  const address = text(read(sources, ['branchAddress', 'branch_Address', 'branch_address'])) ||
    text(read(branchRows, ['address', 'branchAddress', 'branch_Address']));
  const gst = text(read(sources, ['gstNumber', 'gstNo', 'gst_Number', 'gstin', 'GSTNumber'])) ||
    text(read(branchRows, ['gstNumber', 'gstNo', 'gstin']));
  const email = text(read(sources, ['branchEmail', 'branch_Email', 'branch_email'])) ||
    text(read(branchRows, ['email', 'emailAddress', 'branchEmail']));
  const mobile = text(read(sources, ['branchMobile', 'branchPhone', 'branch_Mobile', 'branch_Phone'])) ||
    text(read(branchRows, ['mobile', 'mobileNumber', 'phone', 'branchMobile']));

  // Branch-specific issuer details transcribed from the supplied original
  // Hadapsar receipt. Never reuse these details for a different branch.
  const hadapsar = /^(?:ciit training institute\s+)?hadapsar$/i.test(branchName);
  return {
    branchName,
    branchAddress: address || (hadapsar ? 'Office 12, 1st floor, Marisha Biz, Hadapsar, Near Shankar Math, Pune 28' : ''),
    gstNumber: gst || (hadapsar ? '27AAICC6817A1ZV' : ''),
    branchEmail: email || (hadapsar ? 'ciitpune@gmail.com' : ''),
    branchMobile: mobile || (hadapsar ? '7028658350' : ''),
  };
}

async function loadReceipt(request: PaymentReceiptRequest): Promise<ReceiptData | null> {
  const { paymentId, registrationId, studentId } = request;
  const detail = row(await studentApi.getPaymentById(paymentId));
  if (!detail || !matchesId(detail, PAYMENT_ID, paymentId) ||
      !matchesId(detail, REGISTRATION_ID, registrationId) ||
      !matchesIfPresent(detail, STUDENT_ID, studentId) ||
      !matchesIfPresent(request.payment, PAYMENT_ID, paymentId) ||
      !matchesIfPresent(request.payment, REGISTRATION_ID, registrationId) ||
      !matchesIfPresent(request.payment, STUDENT_ID, studentId)) return null;

  let student = request.student && matchesId(request.student, STUDENT_ID, studentId) ? request.student : null;
  let registration = request.registration;
  if (!student || !registration || !children(registration, ['payments', 'Payments'])) {
    student = unwrap(await studentApi.getRegistrationById(studentId));
    if (!student || !matchesId(student, STUDENT_ID, studentId)) return null;
    const registrations = children(student, ['registrations', 'Registrations']) ?? [student];
    registration = registrations.find(item => matchesId(item, REGISTRATION_ID, registrationId)) ?? null;
  }
  if (!registration || !matchesId(registration, REGISTRATION_ID, registrationId) ||
      !matchesIfPresent(registration, STUDENT_ID, studentId)) return null;

  let profile = request.profile && matchesId(request.profile, STUDENT_ID, studentId) ? request.profile : null;
  if (!profile) {
    try {
      const candidate = unwrap(await studentApi.getStudentDetailsById(studentId));
      if (candidate && matchesId(candidate, STUDENT_ID, studentId)) profile = candidate;
    } catch {
      // The registration and payment APIs may already contain the same data.
    }
  }

  const summary = feeSummary(detail, registration, paymentId, registrationId, studentId);
  const date = paymentDay(read([detail], PAYMENT_DATE));
  if (!summary || !date) return null;

  const studentSources = [profile, detail, student, registration, request.payment];
  const firstName = text(read(studentSources, ['studentName', 'student_Name', 'student_name', 'StudentName']));
  const lastName = text(read(studentSources, ['lastName', 'last_Name', 'last_name', 'LastName']));
  const studentName = lastName && firstName.toLowerCase().endsWith(' ' + lastName.toLowerCase())
    ? firstName
    : [firstName, lastName].filter(Boolean).join(' ');
  const courseName = text(read([detail, registration], ['courseName', 'course_Name', 'course_name', 'CourseName']));
  const registrationCode = text(read([detail, registration], ['registrationCode', 'registration_Code', 'registration_code']));
  const paymentMode = text(read([detail], ['paymentMode', 'payment_Mode', 'payment_mode']));
  const branch = branchDetails([detail, registration, student, ...(profile ? [profile] : [])]);

  if (!studentName || !courseName || !registrationCode || !paymentMode || !branch.branchName || !branch.branchAddress) return null;

  return {
    paymentId,
    paymentDate: date,
    paymentMode,
    description: text(read([detail], ['paymentDescription', 'payment_Description', 'payment_description'])),
    studentName,
    studentEmail: text(read(studentSources, ['emailAddress', 'email_Address', 'email_address', 'EmailAddress'])),
    studentMobile: text(read(studentSources, ['mobileNumber', 'mobile_Number', 'mobile_number', 'MobileNumber'])),
    permanentId: text(read(studentSources, [
      'permanentIdentificationNumber', 'permanent_Identification_Number', 'permanent_IdentificationNumber',
      'permanentIdentificationNo', 'permanent_Identification_No', 'permanentIdentificationId',
      'permanentId', 'permanent_Id', 'permanent_id', 'permanentStudentCode',
      'permanentRegistrationCode', 'permanentRegistrationNumber',
    ])),
    courseName,
    registrationCode,
    ...branch,
    ...summary,
  };
}

function fitText(doc: jsPDF, value: string, width: number, preferredSize: number): void {
  let size = preferredSize;
  doc.setFontSize(size);
  while (doc.getTextWidth(value) > width && size > 7) {
    size -= 0.5;
    doc.setFontSize(size);
  }
}

async function renderReceipt(receipt: ReceiptData): Promise<void> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const width = doc.internal.pageSize.getWidth();
  const edge = 15;
  const right = width - edge;
  const innerWidth = width - edge * 2;

  doc.setFillColor(...BLUE);
  doc.rect(edge, 12, innerWidth, 1.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...NAVY);
  doc.setFontSize(21);
  doc.text('CIIT Training Institute', edge, 24);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MUTED);
  doc.setFontSize(9);
  const addressLines = doc.splitTextToSize(receipt.branchName + ' | ' + receipt.branchAddress, innerWidth) as string[];
  doc.text(addressLines, edge, 31);

  const contact = [
    receipt.gstNumber ? 'GSTIN: ' + receipt.gstNumber : '',
    receipt.branchEmail ? 'Email: ' + receipt.branchEmail : '',
    receipt.branchMobile ? 'Tel: ' + receipt.branchMobile : '',
  ].filter(Boolean).join('  |  ');
  const contactY = 31 + addressLines.length * 4.5;
  if (contact) {
    fitText(doc, contact, innerWidth, 8.5);
    doc.text(contact, edge, contactY);
  }

  const titleY = contactY + 14;
  doc.setDrawColor(...BORDER);
  doc.line(edge, titleY - 6, right, titleY - 6);
  doc.setTextColor(...NAVY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('PAYMENT RECEIPT', edge, titleY + 3);
  doc.setFontSize(10);
  doc.text('Receipt No. ' + receipt.paymentId, right, titleY - 1, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MUTED);
  doc.setFontSize(9);
  doc.text('Payment date: ' + formattedDate(receipt.paymentDate), right, titleY + 5, { align: 'right' });

  const baseStyles = {
    font: 'helvetica',
    fontSize: 10,
    textColor: NAVY,
    lineColor: BORDER,
    lineWidth: 0.18,
    cellPadding: 3.2,
    overflow: 'linebreak' as const,
  };
  const headerStyles = {
    fillColor: NAVY,
    textColor: [255, 255, 255] as [number, number, number],
    fontStyle: 'bold' as const,
    fontSize: 9,
  };
  const margin = { left: edge, right: edge, top: 16, bottom: 16 };

  autoTable(doc, {
    startY: titleY + 12,
    theme: 'grid',
    margin,
    head: [[{ content: 'STUDENT & REGISTRATION DETAILS', colSpan: 4 }]],
    body: [
      ['Student Name', receipt.studentName, 'Course Name', receipt.courseName],
      ['Email Address', receipt.studentEmail || 'Not available', 'Registration Code', receipt.registrationCode],
      ['Mobile Number', receipt.studentMobile || 'Not available', 'Permanent Identification No.', receipt.permanentId || 'Not available'],
    ],
    styles: baseStyles,
    headStyles: headerStyles,
    alternateRowStyles: { fillColor: PALE },
    columnStyles: {
      0: { cellWidth: 33, fontStyle: 'bold', fontSize: 8.5 },
      1: { cellWidth: 57 },
      2: { cellWidth: 35, fontStyle: 'bold', fontSize: 8.5 },
      3: { cellWidth: 55 },
    },
    rowPageBreak: 'avoid',
  });
  type TableDoc = jsPDF & { lastAutoTable?: { finalY: number } };
  const tableEnd = () => (doc as TableDoc).lastAutoTable?.finalY ?? 0;

  autoTable(doc, {
    startY: tableEnd() + 8,
    theme: 'grid',
    margin,
    head: [['PAYMENT DETAILS', 'AMOUNT (INR)']],
    body: [
      ['Total Fees', money(receipt.totalFees)],
      ['Discount', money(receipt.discount)],
      ['Net Fees After Discount', money(receipt.netFees)],
      ['Previous Payment', money(receipt.previousPayment)],
      ['Current Payment', money(receipt.currentPayment)],
      ['Remaining Payment', money(receipt.remainingPayment)],
    ],
    styles: baseStyles,
    headStyles: headerStyles,
    alternateRowStyles: { fillColor: PALE },
    columnStyles: {
      0: { cellWidth: 110 },
      1: { cellWidth: 70, halign: 'right' },
    },
    didParseCell: ({ section, row, cell }) => {
      if (section === 'body' && (row.index === 4 || row.index === 5)) {
        cell.styles.fontStyle = 'bold';
        cell.styles.fillColor = row.index === 4 ? PALE : [224, 235, 249];
        cell.styles.textColor = NAVY;
      }
    },
    rowPageBreak: 'avoid',
  });

  autoTable(doc, {
    startY: tableEnd() + 6,
    theme: 'grid',
    margin,
    body: [
      ['Payment Date', formattedDate(receipt.paymentDate)],
      ['Payment Mode', receipt.paymentMode],
      ['Payment Description', receipt.description || '-'],
    ],
    styles: baseStyles,
    alternateRowStyles: { fillColor: PALE },
    columnStyles: { 0: { cellWidth: 52, fontStyle: 'bold' }, 1: { cellWidth: 128 } },
    rowPageBreak: 'avoid',
  });

  let footerY = tableEnd() + 10;
  if (footerY > 270) {
    doc.addPage();
    footerY = 20;
  }
  doc.setDrawColor(...BORDER);
  doc.line(edge, footerY, right, footerY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.text('Computer-generated receipt based on CIIT ERP payment records.', edge, footerY + 6);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...NAVY);
  doc.setFontSize(10);
  doc.text('Thank you for your payment.', edge, footerY + 13);

  doc.save('CIIT-Payment-Receipt-' + receipt.paymentId + '.pdf');
}

/** Keep the official download available if the financial data is incomplete. */
async function downloadOfficialReceipt(registrationId: number, paymentId: number): Promise<void> {
  const blob = await studentApi.downloadInvoice(registrationId, paymentId);
  if (!(blob instanceof Blob) || blob.size < 5 || await blob.slice(0, 5).text() !== '%PDF-') {
    throw new Error('The invoice service did not return a valid PDF.');
  }
  const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'CIIT-Payment-Receipt-' + paymentId + '.pdf';
  try {
    document.body.appendChild(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
}

export async function downloadPremiumPaymentReceipt(request: PaymentReceiptRequest): Promise<'premium' | 'official'> {
  if (!positiveId(request.paymentId) || !positiveId(request.registrationId)) {
    throw new Error('Valid payment and registration identifiers are required.');
  }
  if (!positiveId(request.studentId)) {
    await downloadOfficialReceipt(request.registrationId, request.paymentId);
    return 'official';
  }

  let receipt: ReceiptData | null = null;
  try {
    receipt = await loadReceipt(request);
  } catch {
    // An unavailable data endpoint must not prevent the existing official
    // invoice service from handling the authorized receipt request.
  }

  if (receipt) {
    await renderReceipt(receipt);
    return 'premium';
  }

  await downloadOfficialReceipt(request.registrationId, request.paymentId);
  return 'official';
}
