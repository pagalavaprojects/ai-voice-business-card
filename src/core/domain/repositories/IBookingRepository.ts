import { Appointment, CreateAppointmentSchema } from "../models/types";
import { z } from "zod";

export interface IBookingRepository {
  createAppointment(data: z.infer<typeof CreateAppointmentSchema>): Promise<Appointment>;
  getAppointmentById(id: string): Promise<Appointment | null>;
  getAppointmentsByEmployee(employeeId: string, startDate: string, endDate: string): Promise<Appointment[]>;
  updateAppointmentStatus(id: string, status: Appointment["status"]): Promise<Appointment>;
}
