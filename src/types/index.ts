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
  admin_records?: AdminRecord[];
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
  iva_condition?: string;
  billing_preference?: string;
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

// Booking.ts: Tipo de reserva
export interface Booking {
  id_booking: number;
  status: string;
  details?: string;
  titular: Client; // Relación completa con el titular, como en Client
  user: User; // Relación completa con el usuario que generó la reserva
  agency: Agency; // Relación completa con la agencia asociada
  departure_date: string; // Fecha de salida (puede ser null)
  return_date: string; // Fecha de regreso (puede ser null)
  observation?: string; // Observaciones adicionales
  pax_count: number; // Cantidad de pasajeros
  clients: Client[]; // Lista completa de clientes relacionados con la reserva
  services?: Service[]; // Servicios asociados con la reserva
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
  transactions?: OperatorTransaction[];
}

// OperatorTransaction.ts: Tipo de transacción de operador
export interface OperatorTransaction {
  id_transaction: number;
  type: string;
  amount: number;
  date: string;
  id_operator: number;
  operator: Operator;
  details?: string;
}

// AdminRecord.ts: Tipo de registro administrativo
export interface AdminRecord {
  id_transaction: number;
  type: string;
  amount: number;
  date: string;
  description?: string;
  id_user: number;
  user: User;
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
}

// AFIPAuthentication.ts: Tipo de autenticación de AFIP
export interface AFIPAuthentication {
  id_authentication: number;
  token: string;
  expiration_date: string;
  created_at: string;
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


