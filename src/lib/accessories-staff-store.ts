import { pool } from "./db";

export type AccessoriesStaffMember = { id: number; branch: string; name: string };

/** Every Accessories staff member, across every branch — for the /data
 * admin page. Grouping by branch is the caller's job (simple, and keeps
 * this one query reusable). */
export async function listAllAccessoriesStaff(): Promise<AccessoriesStaffMember[]> {
  const { rows } = await pool.query<AccessoriesStaffMember>("select id, branch, name from accessories_staff order by branch, name");
  return rows;
}

/** Just one branch's names, as a plain string array — what ssrv089/parse.ts
 * needs. Fetched once per upload (not once per row) by the upload route,
 * then passed into the parser as a plain argument, so parse.ts itself stays
 * a pure function with no DB dependency of its own. */
export async function listAccessoriesStaffNamesForBranch(branch: string): Promise<string[]> {
  const { rows } = await pool.query<{ name: string }>("select name from accessories_staff where branch = $1 order by name", [branch]);
  return rows.map((r) => r.name);
}

export async function addAccessoriesStaff(branch: string, name: string): Promise<void> {
  await pool.query("insert into accessories_staff (branch, name) values ($1, $2) on conflict (branch, name) do nothing", [branch, name]);
}

export async function removeAccessoriesStaff(id: number): Promise<void> {
  await pool.query("delete from accessories_staff where id = $1", [id]);
}
