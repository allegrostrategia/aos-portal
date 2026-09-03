/**
 * Enough of the Supabase client to run the app's own Server Actions against
 * PGlite.
 *
 * The actions talk to PostgREST, not to Postgres — `.from().select()`, `.rpc()`.
 * PGlite is raw Postgres, so something has to translate. This is that, covering
 * only the calls the actions actually make; it is a test fixture, not a
 * reimplementation, and it should fail loudly rather than guess.
 *
 * Every query runs as a signed-in member (`set role authenticated` plus the uid
 * claim), so RLS applies exactly as it would live. That's the point: it means a
 * test can catch an action that works only because it was written against a
 * client that ignores policies.
 */

/**
 * Split a PostgREST select list on top-level commas, so `members(a, b)` survives
 * as one part rather than being torn in half.
 */
function splitColumns(columns) {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const char of columns) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

const singular = (table) => table.replace(/s$/, "");

/**
 * A one-level embed, in whichever direction the schema actually goes.
 *
 * PostgREST works this out from the foreign keys; this asks the same question of
 * `information_schema` rather than guessing from the name, because the two
 * directions produce completely different SQL and picking wrong returns nulls
 * rather than failing — a fixture quietly passing for the wrong reason.
 *
 *   many-to-one  `chat_messages` → `members(full_name)`  via members.id = base.member_id
 *   one-to-many  `pairings` → `pairing_participants(member_id)` via participants.pairing_id = base.id
 *
 * The first yields an object, the second an array, matching what PostgREST
 * returns and therefore what the app's own code destructures.
 */
async function embedSql(db, baseTable, relation, columns) {
  const selected = splitColumns(columns).map((c) => quoteIdent(c)).join(", ");
  const foreignKeyOnBase = `${singular(relation)}_id`;

  const { rows } = await db.query(
    `select 1 from information_schema.columns
     where table_schema='public' and table_name=$1 and column_name=$2`,
    [baseTable, foreignKeyOnBase],
  );

  if (rows.length > 0) {
    return (
      `(select row_to_json(e) from (select ${selected} ` +
      `from public.${quoteIdent(relation)} where id = base.${quoteIdent(foreignKeyOnBase)}) e) ` +
      `as ${quoteIdent(relation)}`
    );
  }

  const foreignKeyOnRelation = `${singular(baseTable)}_id`;
  return (
    `(select coalesce(json_agg(row_to_json(e)), '[]'::json) from (select ${selected} ` +
    `from public.${quoteIdent(relation)} ` +
    `where ${quoteIdent(foreignKeyOnRelation)} = base.id) e) ` +
    `as ${quoteIdent(relation)}`
  );
}

/**
 * Postgres OIDs for the date and time types.
 *
 * PGlite hands these back as JavaScript `Date` objects; PostgREST sends JSON, so
 * the app only ever sees strings. Without converting, a fixture diverges from
 * production in a way that bites silently — `"2026-11-01".localeCompare(...)`
 * works, `new Date(...).localeCompare` doesn't exist, and a comparison that is
 * fine live blows up here (or worse, quietly compares differently).
 */
const DATE_OID = 1082;
const TIMESTAMP_OIDS = new Set([1114, 1184]);

function normaliseRows(result) {
  const dateColumns = new Map(
    (result.fields ?? []).map((f) => [f.name, f.dataTypeID]),
  );

  return (result.rows ?? []).map((row) => {
    const out = { ...row };
    for (const [column, value] of Object.entries(out)) {
      if (!(value instanceof Date)) continue;
      const oid = dateColumns.get(column);
      out[column] =
        oid === DATE_OID
          ? value.toISOString().slice(0, 10)
          : TIMESTAMP_OIDS.has(oid)
            ? value.toISOString()
            : value;
    }
    return out;
  });
}

function quoteIdent(name) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) throw new Error(`Unsafe identifier: ${name}`);
  return `"${name}"`;
}

export function createShimClient(db, uid) {
  async function run(sql, params = []) {
    // A null uid is the service role: no role switch, so RLS doesn't apply and
    // there's no `auth.uid()` — which is exactly how the cron's admin client
    // behaves, and why anything using it must have done its own authorisation
    // first.
    if (uid === null) {
      const result = await db.query(sql, params);
      return { ...result, rows: normaliseRows(result) };
    }

    await db.exec(
      `set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`,
    );
    try {
      const result = await db.query(sql, params);
      return { ...result, rows: normaliseRows(result) };
    } finally {
      await db.exec(`reset role;`);
    }
  }

  function from(table) {
    const state = {
      table,
      filters: [],
      inFilters: [],
      columns: "*",
      count: null,
      head: false,
      single: null,
      insert: null,
      update: null,
      upsert: null,
      onConflict: null,
      order: [],
      returning: false,
    };

    async function execute() {
      const params = [];
      const clauses = state.filters.map(([column, value]) => {
        params.push(value);
        return `${quoteIdent(column)} = $${params.length}`;
      });

      for (const [column, values] of state.inFilters) {
        params.push(values);
        clauses.push(`${quoteIdent(column)} = any($${params.length})`);
      }

      const whereSql = clauses.length ? ` where ${clauses.join(" and ")}` : "";
      const orderSql = state.order.length
        ? ` order by ${state.order
            .map(
              ([column, ascending, nullsFirst]) =>
                `${quoteIdent(column)} ${ascending ? "asc" : "desc"} nulls ${
                  nullsFirst ? "first" : "last"
                }`,
            )
            .join(", ")}`
        : "";

      try {
        const writing = state.insert ?? state.upsert;
        if (writing) {
          // One row or many — PostgREST takes either, and the app uses both.
          const rows = Array.isArray(writing) ? writing : [writing];
          if (rows.length === 0) return { data: null, error: null };

          // Union of keys, so rows that omit an optional column still line up.
          const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];

          const tuples = rows.map((row) => {
            const placeholders = columns.map((column) => {
              const value = row[column];
              // A plain object destined for jsonb has to be sent as json, not
              // as a Postgres record.
              params.push(
                value !== null && typeof value === "object" && !Array.isArray(value)
                  ? JSON.stringify(value)
                  : value ?? null,
              );
              return `$${params.length}`;
            });
            return `(${placeholders.join(", ")})`;
          });

          const conflict =
            state.upsert && state.onConflict
              ? ` on conflict (${state.onConflict
                  .split(",")
                  .map((c) => quoteIdent(c.trim()))
                  .join(", ")}) do nothing`
              : "";

          const returning = state.returning
            ? ` returning ${state.columns === "*" ? "*" : state.columns}`
            : "";

          const result = await run(
            `insert into public.${quoteIdent(state.table)} (${columns
              .map(quoteIdent)
              .join(", ")}) values ${tuples.join(", ")}${conflict}${returning}`,
            params,
          );

          if (!state.returning) return { data: null, error: null };
          return {
            data: state.single === "maybe" ? (result.rows[0] ?? null) : result.rows,
            error: null,
          };
        }

        if (state.update) {
          const assignments = Object.keys(state.update).map((c) => {
            params.push(state.update[c]);
            return `${quoteIdent(c)} = $${params.length}`;
          });
          // Filters were pushed first, so their placeholders still line up.
          if (state.inFilters.length > 0) {
            throw new Error("Shim does not implement .in() on an update");
          }
          const updateWhere = state.filters
            .map(([column], i) => `${quoteIdent(column)} = $${i + 1}`)
            .join(" and ");
          await run(
            `update public.${quoteIdent(state.table)} set ${assignments.join(", ")}` +
              (updateWhere ? ` where ${updateWhere}` : ""),
            params,
          );
          return { data: null, error: null };
        }

        if (state.head && state.count) {
          const r = await run(
            `select count(*)::int as count from public.${quoteIdent(state.table)}${whereSql}`,
            params,
          );
          return { data: null, count: r.rows[0].count, error: null };
        }

        const selected = (
          await Promise.all(
            splitColumns(state.columns).map(async (part) => {
              const embed = /^(\w+)\((.+)\)$/.exec(part);
              return embed
                ? await embedSql(db, state.table, embed[1], embed[2])
                : part;
            }),
          )
        ).join(", ");

        const r = await run(
          `select ${selected} from public.${quoteIdent(state.table)} base${whereSql}${orderSql}`,
          params,
        );
        if (state.single === "maybe") {
          return { data: r.rows[0] ?? null, error: null };
        }
        return { data: r.rows, error: null };
      } catch (error) {
        return { data: null, count: null, error: { message: error.message } };
      }
    }

    const api = {
      select(columns = "*", options = {}) {
        state.columns = columns;
        state.count = options.count ?? null;
        state.head = options.head ?? false;
        // `.insert(...).select(...)` asks for the written rows back.
        if (state.insert || state.upsert) state.returning = true;
        return api;
      },
      insert(values) {
        state.insert = values;
        return api;
      },
      upsert(values, options = {}) {
        state.upsert = values;
        state.onConflict = options.onConflict ?? null;
        return api;
      },
      in(column, values) {
        state.inFilters.push([column, values]);
        return api;
      },
      update(values) {
        state.update = values;
        return api;
      },
      order(column, options = {}) {
        state.order.push([
          column,
          options.ascending ?? true,
          options.nullsFirst ?? false,
        ]);
        return api;
      },
      eq(column, value) {
        state.filters.push([column, value]);
        return api;
      },
      maybeSingle() {
        state.single = "maybe";
        return api;
      },
      then(resolve, reject) {
        return execute().then(resolve, reject);
      },
    };

    return api;
  }

  return {
    auth: {
      async getUser() {
        return { data: { user: uid ? { id: uid } : null }, error: null };
      },
    },
    from,
    async rpc(name, args = {}) {
      const keys = Object.keys(args);
      const call = keys.map((k, i) => `${quoteIdent(k)} => $${i + 1}`).join(", ");
      try {
        const r = await run(
          `select public.${quoteIdent(name)}(${call}) as result`,
          keys.map((k) => args[k]),
        );
        return { data: r.rows[0]?.result ?? null, error: null };
      } catch (error) {
        return { data: null, error: { message: error.message } };
      }
    },
  };
}
