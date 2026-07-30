import { IBookingRepository } from "@/core/domain/repositories/IBookingRepository";
import { Appointment, CreateAppointmentSchema } from "@/core/domain/models/types";
import { supabaseAdmin } from "@/shared/lib/supabase";
import { z } from "zod";

export class SupabaseBookingRepository implements IBookingRepository {
  async createAppointment(data: z.infer<typeof CreateAppointmentSchema>): Promise<Appointment> {
    const validated = CreateAppointmentSchema.parse(data);
    const { data: appointment, error } = await supabaseAdmin
      .from("appointments")
      .insert({
        company_id: validated.company_id,
        employee_id: validated.employee_id,
        lead_id: validated.lead_id,
        start_time: validated.start_time,
        end_time: validated.end_time,
        calcom_booking_id: validated.calcom_booking_id,
        meeting_url: validated.meeting_url,
        status: "BOOKED",
      })
      .select()
      .single();

    if (error) throw new Error(`createAppointment failed: ${error.message}`);
    return appointment as Appointment;
  }

  async getAppointmentById(id: string): Promise<Appointment | null> {
    const { data, error } = await supabaseAdmin.from("appointments").select().eq("id", id).single();
    if (error && error.code !== "PGRST116") throw new Error(`getAppointmentById failed: ${error.message}`);
    return (data as Appointment) || null;
  }

  async getAppointmentsByEmployee(employeeId: string, startDate: string, endDate: string): Promise<Appointment[]> {
    const { data, error } = await supabaseAdmin
      .from("appointments")
      .select()
      .eq("employee_id", employeeId)
      .gte("start_time", startDate)
      .lte("end_time", endDate);

    if (error) throw new Error(`getAppointmentsByEmployee failed: ${error.message}`);
    return (data as Appointment[]) || [];
  }

  async updateAppointmentStatus(id: string, status: Appointment["status"]): Promise<Appointment> {
    const { data, error } = await supabaseAdmin
      .from("appointments")
      .update({ status })
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(`updateAppointmentStatus failed: ${error.message}`);
    return data as Appointment;
  }
}
