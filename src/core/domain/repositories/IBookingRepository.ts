import { Appointment, CreateAppointmentSchema } from "../models/types";
import { z } from "zod";

export interface AppointmentFilter {
  company_id: string;
  status?: Appointment["status"];
  employee_id?: string;
  limit?: number;
  offset?: number;
}

export interface IBookingRepository {
  createAppointment(data: z.infer<typeof CreateAppointmentSchema>): Promise<Appointment>;
  getAppointmentById(id: string): Promise<Appointment | null>;
  getAppointmentsByEmployee(employeeId: string, startDate: string, endDate: string): Promise<Appointment[]>;
  getAppointmentsByLead(leadId: string): Promise<Appointment[]>;
  listAppointments(filter: AppointmentFilter): Promise<{ appointments: Appointment[]; total: number }>;
  updateAppointmentStatus(id: string, status: Appointment["status"]): Promise<Appointment>;
  rescheduleAppointment(id: string, startTime: string, endTime: string): Promise<Appointment>;
  cancelAppointment(id: string, reason?: string): Promise<Appointment>;
}
