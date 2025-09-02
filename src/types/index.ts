// src/types/index.ts

// User.ts: Tipo de usuario
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

// Agency.ts: Tipo de agencia
export interface Agency {
  id_agency: number;
  name: string;
  legal_name: string;
  address?: string;
  phone?: string;
  email?: string;
  tax_id: string;
  website?: string;
  foundation_date?: string;
  logo_url?: string;
  creation_date: string;
  users?: User[];
  bookings?: Booking[];
}

// Client.ts: Tipo de cliente
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
  details: string; // Obligatorio
  invoice_type: "Factura A" | "Factura B" | "Coordinar con administracion"; // Obligatorio
  observation?: string; // Obligatorio
  invoice_observation?: string;
  titular: Client;
  user: User;
  agency: Agency;
  departure_date: string; // Obligatorio
  return_date: string; // Obligatorio
  pax_count: number;
  clients: Client[]; // Acompañantes (opcional)
  services?: Service[];
  creation_date: string;
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
  clients_ids: number[]; // Opcional: IDs de acompañantes/clientes a facturar
}

// Service.ts: Tipo de servicio
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
  transfer_fee_pct?: number | null; // proporción (0.024)
  transfer_fee_amount?: number | null;
  departure_date: string;
  return_date: string;
  booking_id: number;
  id_operator: number;
  created_at: string;
}

// Operator.ts: Tipo de operador
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

// Invoice.ts: Tipo de factura
export interface Invoice {
  id_invoice: number;
  invoice_number: string;
  issue_date: string;
  total_amount: number;
  status: string;
  bookingId_booking: number;
  booking: Booking;
  currency: "USD" | "ARS";
  recipient: string;
  client_id: number;

  // nuevo campo:
  payloadAfip?: {
    voucherData: {
      CbteFch: number;
      ImpNeto: number;
      ImpIVA: number;
      Iva: { Id: number; BaseImp: number; Importe: number }[];
    };
  };
}

// SalesTeam.ts: Tipo de equipo de ventas
export interface SalesTeam {
  id_team: number;
  name: string;
  user_teams: UserTeam[];
  id_agency: number;
}

// UserTeam.ts: Tipo de relación entre usuario y equipo de ventas
export interface UserTeam {
  id_user_team: number;
  id_user: number;
  id_team: number;
  user: User;
  sales_team: SalesTeam;
}

// UserProfile.ts: Tipo de perfil de usuario
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
    seller?: string; // Opcional
  }[];
}

// Receipt.ts: Tipo de perfil de usuario
export interface Receipt {
  id_receipt: number;
  receipt_number: string;
  issue_date: string; // fecha de emisión en ISO

  amount: number; // monto numérico
  amount_string: string; // monto como texto ingresado
  amount_currency: string; // moneda del monto/letters (ej: "ARS" | "USD")

  concept: string;

  // En este proyecto `currency` es la descripción del método de pago (se imprime en el PDF)
  currency: string;

  // Nuevos campos
  payment_method?: string | null; // método seleccionado (Efectivo, Transferencia, etc.)
  account?: string | null; // cuenta usada si aplica

  // Conversión (opcionales, sin T.C. ni notas)
  base_amount?: number | string | null;
  base_currency?: string | null;
  counter_amount?: number | string | null;
  counter_currency?: string | null;

  bookingId_booking: number;
  booking?: Booking; // opcionalmente puedes incluir los datos de la reserva
  serviceIds?: number[];
  clientIds?: number[];
}

// src/types/Quote.ts
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
  currency: "ARS" | "USD";
  phone: string;
  logoBase64?: string;
  items: { price: number; concept: string }[];
}

// src/types/Confirmation.ts

// src/types/Confirmation.ts
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
  currency: "ARS" | "USD";
}

// OperatorDue (schema real)
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
  currency: string;
}

// ClientPayment (schema real)
export interface ClientPayment {
  id_payment: number;
  created_at: string;

  booking_id: number;
  booking?: Booking;

  client_id: number;
  client?: Client;

  amount: number | string;
  currency: string;
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
  transferFeeAmount: number; // NUEVO: monto del costo por transferencia
  transferFeePct: number;    // NUEVO: porcentaje aplicado (proporción, ej 0.024)
}