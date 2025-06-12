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
}

export interface Booking {
  id_booking: number;
  clientStatus: string;
  operatorStatus: string;
  status: string;
  details: string; // Obligatorio
  note?: string;
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
  note?: string;
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
  note?: string;
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
  departure_date: string;
  return_date: string;
  booking_id: number;
  id_operator: number;
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
}

// SalesTeam.ts: Tipo de equipo de ventas
export interface SalesTeam {
  id_team: number;
  name: string;
  user_teams: UserTeam[];
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
  amount_currency: string;
  concept: string;
  currency: string;
  bookingId_booking: number;
  booking?: Booking; // opcionalmente puedes incluir los datos de la reserva
  serviceIds?: number[];
}
