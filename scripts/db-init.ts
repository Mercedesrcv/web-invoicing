import postgres from "postgres";
import { SCHEMA_SQL } from "../lib/store/postgres";

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) {
  console.error("Define DATABASE_URL (o POSTGRES_URL) para crear la tabla.");
  process.exit(1);
}
const sql = postgres(url, { ssl: url.includes("localhost") ? false : "require" });
await sql.unsafe(SCHEMA_SQL);
console.log("Tabla agent_events lista.");
await sql.end();
