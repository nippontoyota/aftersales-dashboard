import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const data = await req.json();

    const {
      referral_date,
      vehicle_reg_no,
      vehicle_model,
      customer_name,
      customer_phone_1,
      customer_phone_2,
      customer_address,
      referring_employee_id,
      referring_employee_name,
      referring_employee_branch,
      dealer_code,
      submitted_at,
    } = data;

    console.log("Received Inactive Customer Referral Webhook:", data);

    try {
      await pool.query(
        `INSERT INTO inactive_customer_referrals (
          referral_date,
          vehicle_reg_no,
          vehicle_model,
          customer_name,
          customer_phone_1,
          customer_phone_2,
          customer_address,
          referring_employee_id,
          referring_employee_name,
          referring_employee_branch,
          dealer_code,
          submitted_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          referral_date || null,
          vehicle_reg_no || null,
          vehicle_model || null,
          customer_name || null,
          customer_phone_1 || null,
          customer_phone_2 || null,
          customer_address || null,
          referring_employee_id || null,
          referring_employee_name || null,
          referring_employee_branch || null,
          dealer_code || null,
          submitted_at || new Date().toISOString(),
        ]
      );
      console.log("Successfully saved Inactive Customer referral to database.");
    } catch (dbError: any) {
      console.error("Could not save Inactive Customer referral to DB:", dbError.message);
    }

    return NextResponse.json({ success: true, message: "Inactive Customer Referral received" }, { status: 200 });
  } catch (error) {
    console.error("Error processing Inactive Customer Referral Webhook:", error);
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
  }
}
