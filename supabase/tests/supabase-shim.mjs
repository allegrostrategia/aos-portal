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

        if (state.head && state.count) {
          const r = await run(
            `select count(*)::int as count from public.${quoteIdent(state.table)}${whereSql}`,
            params,
          );
          return { data: null, count: r.rows[0].count, error: null };
        }

        // `select("*, relation(col)")` is PostgREST embedding, which this
        // fixture does not do. Nothing under test needs it; if something starts
        // to, that's a real gap and should stop the run rather than pass.
        if (state.columns.includes("(")) {
          throw new Error(
            `Shim does not implement embedded selects: ${state.columns}`,
          );
        }

        const r = await run(
          `select ${state.columns} from public.${quoteIdent(state.table)}${whereSql}`,
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
