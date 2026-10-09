import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const data = await req.json();

    const {
      referring_employee_id,
      referring_employee_name,
      referring_employee_branch,
      vehicle_image_url,
      vehicle_reg_no,
      location,
      description,
      customer_phone,
      submitted_at,
    } = data;

    console.log("Received B&P Referral Webhook:", data);

    try {
      await pool.query(
        `INSERT INTO bp_referrals (
          referring_employee_id,
          referring_employee_name,
          referring_employee_branch,
          vehicle_image_url,
          vehicle_reg_no,
          location,
          description,
          customer_phone,
          submitted_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          referring_employee_id,
          referring_employee_name,
          referring_employee_branch,
          vehicle_image_url || null,
          vehicle_reg_no || null,
          location || null,
          description || null,
          customer_phone || null,
          submitted_at,
        ]
      );
      console.log("Successfully saved B&P referral to database.");
    } catch (dbError: any) {
      console.error("Could not save to DB:", dbError.message);
    }

    return NextResponse.json({ success: true, message: "B&P Referral received" }, { status: 200 });
  } catch (error) {
    console.error("Error processing B&P Referral Webhook:", error);
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
  }
}
