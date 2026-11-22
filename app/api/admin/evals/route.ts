import { promises as fs } from "node:fs";
import path from "node:path";
import { isAdmin } from "@/lib/adminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Último informe de la suite de evaluación (evals/results/latest.json, versionado en el repo). */
export async function GET(req: Request) {
  if (!isAdmin(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    const raw = await fs.readFile(path.join(process.cwd(), "evals/results/latest.json"), "utf8");
    return Response.json(JSON.parse(raw));
  } catch {
    return Response.json({ empty: true });
  }
}
