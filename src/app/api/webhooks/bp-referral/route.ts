import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const data = await req.json();

    const {
      referring_employee_id,
      referring_employee_name,
      referring_employee_branch,
      vehicle_image_url,
      customer_phone,
      submitted_at,
    } = data;

    // Log for debugging
    console.log("Received B&P Referral Webhook:", data);

    // Optional: Save to Database if table exists
    try {
      await query(
        `INSERT INTO bp_referrals (
          referring_employee_id,
          referring_employee_name,
          referring_employee_branch,
          vehicle_image_url,
          customer_phone,
          submitted_at
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          referring_employee_id,
          referring_employee_name,
          referring_employee_branch,
          vehicle_image_url,
          customer_phone,
          submitted_at,
        ]
      );
      console.log("Successfully saved B&P referral to database.");
    } catch (dbError: any) {
      // If table doesn't exist yet, just log and continue. 
      // This prevents the webhook from failing while the schema is being setup.
      console.error("Could not save to DB (table might not exist yet):", dbError.message);
    }

    return NextResponse.json({ success: true, message: "B&P Referral received" }, { status: 200 });
  } catch (error) {
    console.error("Error processing B&P Referral Webhook:", error);
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
  }
}
