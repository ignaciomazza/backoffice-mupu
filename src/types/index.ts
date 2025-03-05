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
  sales_teams?: UserTeam[];
}

// Agency.ts: Tipo de agencia
export interface Agency {
  id_agency: number;
  name: string;
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
  phone?: string;
  address?: string;
  postal_code?: string;
  locality?: string;
  company_name?: string;
  tax_id?: string;
  commercial_address?: string;
  dni_number?: string;
  passport_number?: string;
  dni_issue_date?: string;
  dni_expiry_date?: string;
  birth_date?: string;
  nationality?: string;
  gender?: string;
  registration_date: string;
  passport_issue?: string;
  passport_expiry?: string;
  bookings?: Booking[];
  titular_reservas?: Booking[];
}

export interface Booking {
  id_booking: number;
  status: string;
  details?: string;
  titular: Client;
  user: User;
  agency: Agency;
  departure_date: string;
  return_date: string;
  observation?: string;
  pax_count: number;
  clients: Client[];
  services?: Service[];
}

export interface BookingFormData {
  status: string;
  details?: string;
  titular_id: number;
  id_user: number;
  id_agency: number;
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
  not_computable?: number;
  taxable_21?: number;
  taxable_105?: number;
  currency: string;
  payment_due_date: string;
  created_at: string;
  booking_id: number;
  booking: Booking;
  id_operator: number;
  operator: Operator;
  departure_date: string;
  return_date: string;
}

// Operator.ts: Tipo de operador
export interface Operator {
  id_operator: number;
  name: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  postal_code?: string;
  city?: string;
  state?: string;
  country?: string;
  vat_status?: string;
  legal_name?: string;
  tax_id?: string;
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
