import { AppointmentFilter, IBookingRepository } from "@/core/domain/repositories/IBookingRepository";
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
        status: validated.status ?? "BOOKED",
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

  async getAppointmentsByLead(leadId: string): Promise<Appointment[]> {
    const { data, error } = await supabaseAdmin.from("appointments").select().eq("lead_id", leadId).order("start_time", { ascending: false });
    if (error) throw new Error(`getAppointmentsByLead failed: ${error.message}`);
    return (data as Appointment[]) || [];
  }

  async listAppointments(filter: AppointmentFilter): Promise<{ appointments: Appointment[]; total: number }> {
    let query = supabaseAdmin.from("appointments").select("*", { count: "exact" }).eq("company_id", filter.company_id);
    if (filter.status) query = query.eq("status", filter.status);
    if (filter.employee_id) query = query.eq("employee_id", filter.employee_id);

    const limit = filter.limit || 20;
    const offset = filter.offset || 0;
    query = query.order("start_time", { ascending: false }).range(offset, offset + limit - 1);

    const { data, count, error } = await query;
    if (error) throw new Error(`listAppointments failed: ${error.message}`);
    return { appointments: (data as Appointment[]) || [], total: count || 0 };
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

  async rescheduleAppointment(id: string, startTime: string, endTime: string): Promise<Appointment> {
    const existing = await this.getAppointmentById(id);
    if (!existing) throw new Error("rescheduleAppointment failed: appointment not found");

    const { data, error } = await supabaseAdmin
      .from("appointments")
      .update({ start_time: startTime, end_time: endTime, status: "BOOKED" })
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(`rescheduleAppointment failed: ${error.message}`);
    return data as Appointment;
  }

  async cancelAppointment(id: string, reason?: string): Promise<Appointment> {
    const { data, error } = await supabaseAdmin
      .from("appointments")
      .update({ status: "CANCELLED", cancelled_at: new Date().toISOString(), cancellation_reason: reason })
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(`cancelAppointment failed: ${error.message}`);
    return data as Appointment;
  }
}
