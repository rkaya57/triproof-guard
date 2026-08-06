import { randomUUID } from "node:crypto"
import process from "node:process"

import pg from "pg"

const { Client } = pg
const databaseUrl = process.env.DATABASE_URL?.trim()
const protectedRoles = ["anon", "authenticated"]

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for PostgREST hardening verification.")
}

function isLoopbackHost(hostname) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "")
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1"
}

function clientOptions() {
  try {
    const parsed = new URL(databaseUrl)
    const loopback = isLoopbackHost(parsed.hostname)

    // node-postgres lets sslmode/sslcert/sslkey/sslrootcert in the connection
    // string replace the explicit `ssl` object below. Remove those URL options so
    // hosted Supabase connections keep TLS enabled without rejecting the pooler's
    // managed certificate chain, while local loopback databases remain non-TLS.
    for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert", "uselibpqcompat"]) {
      parsed.searchParams.delete(key)
    }

    return {
      connectionString: parsed.toString(),
      ssl: loopback ? undefined : { rejectUnauthorized: false },
    }
  } catch {
    return { connectionString: databaseUrl }
  }
}

function describeRows(rows, fields) {
  return rows
    .slice(0, 20)
    .map((row) => fields.map((field) => String(row[field] ?? "")).join(":"))
    .join(", ")
}

async function verifyRuntimeCrud(client) {
  const suffix = randomUUID()
  const userId = `postgrest-verify-${suffix}`
  const email = `postgrest-verify-${suffix}@example.invalid`

  await client.query("BEGIN")
  try {
    await client.query(
      `INSERT INTO public."User"
        ("id", "name", "email", "passwordHash", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [userId, "PostgREST verification", email, "not-a-real-password-hash"]
    )
    const updated = await client.query(
      `UPDATE public."User"
       SET "name" = $2, "updatedAt" = CURRENT_TIMESTAMP
       WHERE "id" = $1
       RETURNING "id"`,
      [userId, "PostgREST verification updated"]
    )
    if (updated.rowCount !== 1) {
      throw new Error("The server-side database role could not update its verification row.")
    }
    const deleted = await client.query(
      `DELETE FROM public."User" WHERE "id" = $1 RETURNING "id"`,
      [userId]
    )
    if (deleted.rowCount !== 1) {
      throw new Error("The server-side database role could not delete its verification row.")
    }
  } finally {
    await client.query("ROLLBACK").catch(() => undefined)
  }
}

async function main() {
  const client = new Client(clientOptions())
  await client.connect()

  try {
    const tables = await client.query(`
      SELECT relation.relname AS "tableName", relation.relrowsecurity AS "rlsEnabled"
      FROM pg_class AS relation
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relkind IN ('r', 'p')
      ORDER BY relation.relname
    `)

    if (tables.rowCount === 0) {
      throw new Error("No public application tables were found to verify.")
    }

    const withoutRls = tables.rows.filter((row) => row.rlsEnabled !== true)
    if (withoutRls.length > 0) {
      throw new Error(
        `RLS is disabled on public tables: ${describeRows(withoutRls, ["tableName"])}`
      )
    }

    const existingRoles = await client.query(
      `SELECT rolname FROM pg_roles WHERE rolname = ANY($1::text[]) ORDER BY rolname`,
      [protectedRoles]
    )
    const roleNames = existingRoles.rows.map((row) => String(row.rolname))

    if (roleNames.length > 0) {
      const tableGrants = await client.query(
        `SELECT grantee, table_name AS "tableName", privilege_type AS privilege
         FROM information_schema.role_table_grants
         WHERE table_schema = 'public'
           AND grantee = ANY($1::text[])
         ORDER BY grantee, table_name, privilege_type`,
        [roleNames]
      )
      if (tableGrants.rowCount > 0) {
        throw new Error(
          `PostgREST table grants remain: ${describeRows(tableGrants.rows, ["grantee", "tableName", "privilege"])}`
        )
      }

      const sequenceGrants = await client.query(
        `SELECT role.rolname AS grantee,
                relation.relname AS "sequenceName",
                acl.privilege_type AS privilege
         FROM pg_class AS relation
         JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
         CROSS JOIN LATERAL aclexplode(
           COALESCE(relation.relacl, acldefault('S'::"char", relation.relowner))
         ) AS acl
         JOIN pg_roles AS role ON role.oid = acl.grantee
         WHERE namespace.nspname = 'public'
           AND relation.relkind = 'S'
           AND role.rolname = ANY($1::text[])
         ORDER BY role.rolname, relation.relname, acl.privilege_type`,
        [roleNames]
      )
      if (sequenceGrants.rowCount > 0) {
        throw new Error(
          `PostgREST sequence grants remain: ${describeRows(sequenceGrants.rows, ["grantee", "sequenceName", "privilege"])}`
        )
      }

      const functionGrants = await client.query(
        `SELECT COALESCE(role.rolname, 'PUBLIC') AS grantee,
                procedure.proname AS "functionName",
                acl.privilege_type AS privilege
         FROM pg_proc AS procedure
         JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
         CROSS JOIN LATERAL aclexplode(
           COALESCE(procedure.proacl, acldefault('f'::"char", procedure.proowner))
         ) AS acl
         LEFT JOIN pg_roles AS role ON role.oid = acl.grantee
         WHERE namespace.nspname = 'public'
           AND acl.privilege_type = 'EXECUTE'
           AND (acl.grantee = 0 OR role.rolname = ANY($1::text[]))
         ORDER BY grantee, procedure.proname`,
        [roleNames]
      )
      if (functionGrants.rowCount > 0) {
        throw new Error(
          `Public/PostgREST RPC grants remain: ${describeRows(functionGrants.rows, ["grantee", "functionName", "privilege"])}`
        )
      }

      const defaultGrants = await client.query(
        `SELECT COALESCE(role.rolname, 'PUBLIC') AS grantee,
                defaults.defaclobjtype AS "objectType",
                acl.privilege_type AS privilege
         FROM pg_default_acl AS defaults
         JOIN pg_namespace AS namespace ON namespace.oid = defaults.defaclnamespace
         CROSS JOIN LATERAL aclexplode(defaults.defaclacl) AS acl
         LEFT JOIN pg_roles AS role ON role.oid = acl.grantee
         WHERE namespace.nspname = 'public'
           AND (
             role.rolname = ANY($1::text[])
             OR (acl.grantee = 0 AND defaults.defaclobjtype = 'f')
           )
         ORDER BY grantee, defaults.defaclobjtype, acl.privilege_type`,
        [roleNames]
      )
      if (defaultGrants.rowCount > 0) {
        throw new Error(
          `Unsafe future-object default grants remain: ${describeRows(defaultGrants.rows, ["grantee", "objectType", "privilege"])}`
        )
      }
    } else {
      console.log("Supabase anon/authenticated roles are absent; direct grant checks were skipped.")
    }

    const runtime = await client.query(`
      SELECT current_user AS "currentUser",
             role.rolsuper AS "isSuperuser",
             role.rolbypassrls AS "bypassesRls",
             COUNT(*) FILTER (WHERE relation.relowner <> role.oid)::int AS "nonOwnedTables"
      FROM pg_roles AS role
      CROSS JOIN pg_class AS relation
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE role.rolname = current_user
        AND namespace.nspname = 'public'
        AND relation.relkind IN ('r', 'p')
      GROUP BY current_user, role.rolsuper, role.rolbypassrls
    `)
    const runtimeRow = runtime.rows[0]
    if (!runtimeRow) {
      throw new Error("The server-side database role could not be inspected.")
    }
    if (
      runtimeRow.isSuperuser !== true &&
      runtimeRow.bypassesRls !== true &&
      Number(runtimeRow.nonOwnedTables) > 0
    ) {
      throw new Error(
        `Runtime role ${runtimeRow.currentUser} neither bypasses RLS nor owns every public table.`
      )
    }

    await verifyRuntimeCrud(client)

    console.log(
      `PostgREST hardening verified for ${tables.rowCount} public tables; runtime role ${runtimeRow.currentUser} remains operational.`
    )
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error("PostgREST hardening verification failed:")
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
