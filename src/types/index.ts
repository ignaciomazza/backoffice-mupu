// ===================== Tipos base compartidos =====================

export type Currency = "ARS" | "USD";

// DocType es solo TypeScript (NO prisma enum). Podés extender con strings.
export type DocType =
  | "confirmation"
  | "quote"
  | "voucher"
  | "invoice"
  | (string & {}); // permite strings personalizados

// ===================== Usuario / Agencia =====================

export interface AgencySocial {
  instagram?: string;
  facebook?: string;
  twitter?: string;
  tiktok?: string;
  whatsapp?: string;
  [k: string]: string | undefined;
}

export interface Agency {
  id_agency: number;
  name: string;
  legal_name: string;
  address?: string;
  phone?: string;
  phones: string[];
  email?: string;
  social?: AgencySocial | null;
  tax_id: string;
  website?: string;
  foundation_date?: string;
  logo_url?: string;
  creation_date: string;
  users?: User[];
  bookings?: Booking[];
}

export interface User {
  id_user: number;
  email: string;
  password?: string;
  first_name: string;
  last_name: string;
  position: string;
  role: string;
  id_agency: number;
  agency: Agency;
  bookings?: Booking[];
  clients?: Client[];
  sales_teams?: UserTeam[];
}

// ===================== Clientes / Reservas / Servicios =====================

export interface Client {
  id_client: number;
  first_name: string;
  last_name: string;
  phone: string;
  address?: string;
  postal_code?: string;
  locality?: string;
  company_name?: string;
  tax_id?: string;
  commercial_address?: string;
  dni_number?: string;
  passport_number?: string;
  birth_date: string;
  nationality: string;
  gender: string;
  email?: string;
  registration_date: string;
  id_user: number;
  user: User;
  bookings?: Booking[];
  titular_bookings?: Booking[];
  invoices?: Invoice[];
  id_agency: number;
}

export interface Booking {
  id_booking: number;
  clientStatus: string;
  operatorStatus: string;
  status: string;
  details: string;
  invoice_type: "Factura A" | "Factura B" | "Coordinar con administracion";
  observation?: string;
  invoice_observation?: string;
  titular: Client;
  user: User;
  agency: Agency;
  departure_date: string;
  return_date: string;
  pax_count: number;
  clients: Client[];
  services?: Service[];
  creation_date: string;
  totalSale?: number;
  totalCommission?: number;
  debt?: number;
}

export interface BookingFormData {
  clientStatus: string;
  operatorStatus: string;
  status: string;
  details: string;
  invoice_type: "Factura A" | "Factura B" | "Coordinar con administracion";
  observation?: string;
  invoice_observation?: string;
  titular_id: number;
  id_user: number;
  id_agency: number;
  departure_date: string;
  return_date: string;
  pax_count: number;
  clients_ids: number[];
}

export interface Service {
  id_service: number;
  type: string;
  description: string;
  sale_price: number;
  cost_price: number;
  destination: string;
  reference: string;
  tax_21?: number;
  tax_105?: number;
  exempt?: number;
  other_taxes?: number;
  card_interest?: number;
  card_interest_21?: number;
  taxableCardInterest?: number;
  vatOnCardInterest?: number;
  currency: string;
  nonComputable?: number;
  taxableBase21?: number;
  taxableBase10_5?: number;
  commissionExempt?: number;
  commission21?: number;
  commission10_5?: number;
  vatOnCommission21?: number;
  vatOnCommission10_5?: number;
  totalCommissionWithoutVAT?: number;
  impIVA?: number;
  transfer_fee_pct?: number | null;
  transfer_fee_amount?: number | null;
  departure_date: string;
  return_date: string;
  booking_id: number;
  id_operator: number;
  created_at: string;
}

export interface Operator {
  id_operator: number;
  name: string;
  email: string;
  phone: string;
  website: string;
  address: string;
  postal_code: string;
  city: string;
  state: string;
  country: string;
  vat_status: string;
  legal_name: string;
  tax_id: string;
  registration_date: string;
  credit_balance: number;
  debit_balance: number;
  bookings?: Booking[];
  id_agency: number;
}

// ===================== Facturación / Recibos =====================

export interface Invoice {
  id_invoice: number;
  invoice_number: string;
  issue_date: string;
  total_amount: number;
  status: string;
  bookingId_booking: number;
  booking: Booking;
  currency: Currency;
  recipient: string;
  client_id: number;
  payloadAfip?: {
    voucherData: {
      CbteFch: number;
      ImpNeto: number;
      ImpIVA: number;
      Iva: { Id: number; BaseImp: number; Importe: number }[];
    };
  };
}

export interface Receipt {
  id_receipt: number;
  receipt_number: string;
  issue_date: string;
  amount: number;
  amount_string: string;
  amount_currency: Currency;
  concept: string;
  // En este proyecto `currency` es la descripción del método de pago impresa en PDF
  currency: string;
  payment_method?: string | null;
  account?: string | null;
  base_amount?: number | string | null;
  base_currency?: Currency | string | null;
  counter_amount?: number | string | null;
  counter_currency?: Currency | string | null;
  bookingId_booking: number;
  booking?: Booking;
  serviceIds?: number[];
  clientIds?: number[];
}

// ===================== Reportes / perfiles =====================

export interface SalesTeam {
  id_team: number;
  name: string;
  user_teams: UserTeam[];
  id_agency: number;
}

export interface UserTeam {
  id_user_team: number;
  id_user: number;
  id_team: number;
  user: User;
  sales_team: SalesTeam;
}

export interface UserProfile {
  name: string;
  email: string;
  position: string;
  role: string;
  salesData: {
    id_booking: number;
    details: string | null;
    totalServices: number;
    totalSales: number;
    seller?: string;
  }[];
}

// ===================== Cobranzas =====================

export interface OperatorDue {
  id_due: number;
  created_at: string;
  booking_id: number;
  booking?: Booking;
  service_id: number;
  service?: Service;
  due_date: string;
  concept: string;
  status: string;
  amount: number | string;
  currency: Currency | string;
}

export interface ClientPayment {
  id_payment: number;
  created_at: string;
  booking_id: number;
  booking?: Booking;
  client_id: number;
  client?: Client;
  amount: number | string;
  currency: Currency | string;
  due_date: string;
}

export interface BillingData {
  nonComputable: number;
  taxableBase21: number;
  taxableBase10_5: number;
  commissionExempt: number;
  commission21: number;
  commission10_5: number;
  vatOnCommission21: number;
  vatOnCommission10_5: number;
  totalCommissionWithoutVAT: number;
  impIVA: number;
  taxableCardInterest: number;
  vatOnCardInterest: number;
  transferFeeAmount: number;
  transferFeePct: number;
}

// ===================== Templates: estructuras sugeridas =====================

export interface ConfirmationTemplateConfig {
  styles?: {
    colors?: {
      background?: string;
      text?: string;
      accent?: string;
      overlayOpacity?: number;
    };
    fonts?: { heading?: string; body?: string };
  };
  coverImage?: { mode?: "url" | "none"; url?: string };
  contactItems?: Array<
    | "phones"
    | "email"
    | "website"
    | "address"
    | "instagram"
    | "facebook"
    | "twitter"
    | "tiktok"
  >;
  labels?: {
    header?: string;
    confirmedData?: string;
    pax?: string;
    services?: string;
    terms?: string;
    planPago?: string;
  };
  termsAndConditions?: string;
  metodosDePago?: Record<string, string>;
}

export interface QuoteTemplateConfig {
  labels?: {
    title?: string;
    prices?: string;
    planPago?: string;
  };
  metodosDePago?: Record<string, string>;
}

// Registro genérico de TemplateConfig
export interface TemplateConfig<T extends DocType = DocType> {
  id_template: number;
  id_agency: number;
  doc_type: T;
  // 👇 sin `any`
  config:
    | ConfirmationTemplateConfig
    | QuoteTemplateConfig
    | Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ===================== Documentos (form data) =====================

export interface Quote {
  tripTitle: string;
  dateRange: string;
  region:
    | ""
    | "norte-argentino"
    | "patagonia"
    | "ski"
    | "iguazu"
    | "mendoza"
    | "brasil"
    | "caribe"
    | "peru"
    | "safari"
    | "desierto-africa"
    | "europa"
    | "norte-europa"
    | "playa-europa"
    | "auroras-boreales"
    | "tailandia"
    | "japon"
    | "miami"
    | "nueva-york"
    | "california"
    | "seleccion"
    | "formula-1";
  currency: Currency;
  phone: string;
  logoBase64?: string;
  items: { price: number; concept: string }[];
}

export interface Confirmation {
  confirmationNumber: string;
  clientName: string;
  issueDate: string;
  expiryDate: string;
  payment: string;
  services: string;
  itemsPassenger: { name: string; dni: string; birth: string }[];
  items: { price: number; concept: string }[];
  phone: string;
  currency: Currency;
}
