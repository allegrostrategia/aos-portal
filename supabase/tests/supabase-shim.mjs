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

/**
 * A one-level embed — `members(full_name, email)` — as a json subquery.
 *
 * The foreign key is guessed the way PostgREST's own convention reads: the
 * related table `members` is reached through `member_id` on the base table.
 * That covers every embed in this codebase. Anything it can't reach fails in
 * SQL with the column named, which is a better outcome than a fixture quietly
 * returning nulls and a test passing for the wrong reason.
 */
function embedSql(relation, columns) {
  const foreignKey = `${relation.replace(/s$/, "")}_id`;
  const selected = splitColumns(columns).map((c) => quoteIdent(c)).join(", ");
  return (
    `(select row_to_json(e) from (select ${selected} ` +
    `from public.${quoteIdent(relation)} where id = base.${quoteIdent(foreignKey)}) e) ` +
    `as ${quoteIdent(relation)}`
  );
}

function quoteIdent(name) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) throw new Error(`Unsafe identifier: ${name}`);
  return `"${name}"`;
}

export function createShimClient(db, uid) {
  async function run(sql, params = []) {
    await db.exec(
      `set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`,
    );
    try {
      return await db.query(sql, params);
    } finally {
      await db.exec(`reset role;`);
    }
  }

  function from(table) {
    const state = {
      table,
      filters: [],
      columns: "*",
      count: null,
      head: false,
      single: null,
      insert: null,
      update: null,
      order: [],
    };

    async function execute() {
      const params = [];
      const where = state.filters
        .map(([column, value]) => {
          params.push(value);
          return `${quoteIdent(column)} = $${params.length}`;
        })
        .join(" and ");
      const whereSql = where ? ` where ${where}` : "";
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
        if (state.insert) {
          const columns = Object.keys(state.insert);
          const values = columns.map((c) => {
            params.push(state.insert[c]);
            return `$${params.length}`;
          });
          await run(
            `insert into public.${quoteIdent(state.table)} (${columns
              .map(quoteIdent)
              .join(", ")}) values (${values.join(", ")})`,
            params,
          );
          return { data: null, error: null };
        }

        if (state.update) {
          const assignments = Object.keys(state.update).map((c) => {
            params.push(state.update[c]);
            return `${quoteIdent(c)} = $${params.length}`;
          });
          // Filters were pushed first, so their placeholders still line up.
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

        const selected = splitColumns(state.columns)
          .map((part) => {
            const embed = /^(\w+)\((.+)\)$/.exec(part);
            return embed ? embedSql(embed[1], embed[2]) : part;
          })
          .join(", ");

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
        return api;
      },
      insert(values) {
        state.insert = values;
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
