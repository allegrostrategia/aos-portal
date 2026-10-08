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
 * The unique column sets of a table, straight from its indexes.
 *
 * Used to decide whether an ORDER BY is total. Expression indexes (`indkey`
 * holding a 0) and partial ones (`indpred`) don't make a sort total, so
 * neither counts.
 */
// Per database, not per table name: a test file with two of them must not
// be told about the other one's schema.
const uniqueSets = new WeakMap();
async function uniqueColumnSets(db, table) {
  if (!uniqueSets.has(db)) uniqueSets.set(db, new Map());
  const cache = uniqueSets.get(db);
  if (!cache.has(table)) {
    const { rows } = await db.query(
      `select (select array_agg(a.attname::text order by k.ord)
                 from unnest(i.indkey) with ordinality as k(attnum, ord)
                 join pg_attribute a
                   on a.attrelid = i.indrelid and a.attnum = k.attnum) as cols
         from pg_index i
         join pg_class c on c.oid = i.indrelid
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = $1
          and i.indisunique and i.indpred is null
          and 0 <> all(i.indkey)
        order by i.indisprimary desc, array_length(i.indkey, 1)`,
      [table],
    );
    cache.set(table, rows.map((r) => r.cols).filter(Boolean));
  }
  return cache.get(table);
}

/**
 * Postgres does not promise an order for rows that tie on every column in
 * ORDER BY, and it does not promise the same one twice. A paged read whose
 * sort is not total can therefore hand back a row on both pages or on
 * neither — a count quietly wrong in either direction.
 *
 * Rather than hope PGlite happens to shuffle seven rows, the harness does
 * what Postgres is allowed to do: when a `.range()` read's sort is not
 * total, tied rows are broken one way on one page of that table and the
 * other way on the next. Paging that leans on an unstable sort then fails
 * here every run, instead of once in production. A sort that already ends in
 * a unique key is left exactly as written.
 */
const pageParity = new Map();
async function unstableTieBreakers(db, table, order) {
  const sets = await uniqueColumnSets(db, table);
  const sorted = order.map(([column]) => column);
  if (sets.some((set) => set.every((column) => sorted.includes(column)))) return [];
  const set = sets[0];
  if (!set) return [];
  const nth = (pageParity.get(table) ?? 0) + 1;
  pageParity.set(table, nth);
  const direction = nth % 2 === 0 ? "desc" : "asc";
  return set.map((column) => `${quoteIdent(column)} ${direction}`);
}

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
/**
 * The actual foreign key between two tables, asked of the schema.
 *
 * The column is NOT always `<singular relation>_id`: report_access points at
 * report_workspaces through plain `workspace_id`. Guessing the name finds
 * nothing, falls through to the one-to-many branch, and returns an empty
 * embed — which looks exactly like "this client has no workspace" and sent a
 * client's whole session to /no-access in a test while working fine live.
 */
async function foreignKeyBetween(db, fromTable, toTable) {
  const { rows } = await db.query(
    `select kcu.column_name as local_col, ccu.column_name as foreign_col
     from information_schema.table_constraints tc
     join information_schema.key_column_usage kcu
       on kcu.constraint_name = tc.constraint_name
      and kcu.table_schema = tc.table_schema
     join information_schema.constraint_column_usage ccu
       on ccu.constraint_name = tc.constraint_name
      and ccu.table_schema = tc.table_schema
     where tc.constraint_type = 'FOREIGN KEY'
       and tc.table_schema = 'public'
       and tc.table_name = $1
       and ccu.table_name = $2`,
    [fromTable, toTable],
  );
  if (rows.length === 0) return null;
  // More than one route (two columns pointing at the same table) is
  // ambiguous in PostgREST too; prefer the conventionally named one so the
  // choice is at least predictable.
  const guess = `${singular(toTable)}_id`;
  return rows.find((r) => r.local_col === guess) ?? rows[0];
}

async function embedSql(db, baseTable, relation, columns) {
  const selected = splitColumns(columns).map((c) => quoteIdent(c)).join(", ");

  const manyToOne = await foreignKeyBetween(db, baseTable, relation);
  if (manyToOne) {
    return (
      `(select row_to_json(e) from (select ${selected} ` +
      `from public.${quoteIdent(relation)} ` +
      `where ${quoteIdent(manyToOne.foreign_col)} = base.${quoteIdent(manyToOne.local_col)}) e) ` +
      `as ${quoteIdent(relation)}`
    );
  }

  const oneToMany = await foreignKeyBetween(db, relation, baseTable);
  if (oneToMany) {
    return (
      `(select coalesce(json_agg(row_to_json(e)), '[]'::json) from (select ${selected} ` +
      `from public.${quoteIdent(relation)} ` +
      `where ${quoteIdent(oneToMany.local_col)} = base.${quoteIdent(oneToMany.foreign_col)}) e) ` +
      `as ${quoteIdent(relation)}`
    );
  }

  // Nothing in the schema says these are related. Fall back to the old
  // name-based guess rather than failing outright, so an embed across a
  // view or a table the harness has not created still behaves as before.
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

const authLog = [];
/** What the auth API was asked to do — reset links, password sets. */
export function authCalls() {
  return authLog;
}
export function resetAuthCalls() {
  authLog.length = 0;
}

export function createShimClient(db, uid) {
  async function run(sql, params = []) {
    // One transaction per query, with the role and the uid claim set LOCAL, so
    // both vanish at commit and nothing is left in the session for the next
    // caller. PGlite serialises transactions, which is what makes this safe:
    // an `after()` job still running from the previous test can't slip its
    // service-role query between this member's `set role` and their query.
    //
    // A null uid is the service role: no member role, no uid — so RLS doesn't
    // apply and `auth.uid()` is null, exactly as live. The earlier version ran
    // service-role queries with no session changes at all, which meant they
    // inherited whichever uid the last member query left behind; a trigger
    // reading `auth.uid()` then saw a member, or an admin, and the day-7 flag
    // write passed here while failing in production (see 20260921100000).
    return db.transaction(async (tx) => {
      if (uid === null) {
        await tx.exec(`set local role none; select set_config('request.jwt.claim.sub', '', true);`);
      } else {
        await tx.exec(
          `set local role authenticated; select set_config('request.jwt.claim.sub', '${uid}', true);`,
        );
      }
      const result = await tx.query(sql, params);
      return { ...result, rows: normaliseRows(result) };
    });
  }

  function from(table) {
    const state = {
      table,
      filters: [],
      inFilters: [],
      isFilters: [],
      or: [],
      columns: "*",
      count: null,
      head: false,
      single: null,
      limit: null,
      insert: null,
      update: null,
      upsert: null,
      onConflict: null,
      ignoreDuplicates: false,
      delete: false,
      order: [],
      returning: false,
    };

    async function execute() {
      const params = [];
      const clauses = state.filters.map(([column, value, op = "="]) => {
        params.push(value);
        return `${quoteIdent(column)} ${op} $${params.length}`;
      });

      for (const [column, values] of state.inFilters) {
        // Compared as text against a text[] parameter, so the same clause
        // works on uuid, text and enum columns. `= any($1)` with a plain JS
        // array came back "malformed array literal" on an enum column (the
        // push tests filtering members on status); casting the column is the
        // one form that reads the same for every type these fixtures use.
        params.push(values);
        clauses.push(`${quoteIdent(column)}::text = any($${params.length}::text[])`);
      }

      // `.is(col, null)` — PostgREST's null comparison, which `= null` isn't.
      // Held separately because they carry no parameters, which is what lets the
      // update path reuse them without disturbing its placeholder numbering.
      const isClauses = state.isFilters.map(([column, value]) =>
        value === "NOT_NULL"
          ? `${quoteIdent(column)} is not null`
          : `${quoteIdent(column)} is ${
              value === null ? "null" : value ? "true" : "false"
            }`,
      );
      clauses.push(...isClauses);

      // PostgREST's `.or("a.is.null,b.eq.x")`: a comma-separated list of
      // its own filter syntax, joined with OR and ANDed with the rest.
      // Only the forms the app actually uses are translated, and an
      // unknown one throws rather than quietly matching everything —
      // a filter that silently widens is how a client sees another
      // client's row.
      for (const group of state.or) {
        const parts = group.split(",").map((part) => {
          const [column, op, ...rest] = part.split(".");
          const raw = rest.join(".");
          if (op === "is" && raw === "null") return `${quoteIdent(column)} is null`;
          if (op === "eq") {
            params.push(raw);
            return `${quoteIdent(column)} = $${params.length}`;
          }
          throw new Error(
            `The shim does not translate .or("${part}") yet. Add it rather than guessing.`,
          );
        });
        clauses.push(`(${parts.join(" or ")})`);
      }

      const whereSql = clauses.length ? ` where ${clauses.join(" and ")}` : "";
      const orderTerms = state.order.map(
        ([column, ascending, nullsFirst]) =>
          `${quoteIdent(column)} ${ascending ? "asc" : "desc"} nulls ${
            nullsFirst ? "first" : "last"
          }`,
      );

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

          // PostgREST's upsert MERGES by default; `ignoreDuplicates: true` is
          // what makes it skip. Treating every upsert as "do nothing" made an
          // update-through-upsert silently no-op here while working live — the
          // fixture diverging from production in the direction that hides real
          // behaviour, which is the worst direction for it to go.
          let conflict = "";
          // PostgREST resolves an upsert with no explicit target on the
          // PRIMARY KEY. Treating it as a plain insert made a perfectly
          // good update fail here with a duplicate-key error while working
          // live — the harness disagreeing with production, which is the
          // one thing it must not do.
          if (state.upsert && !state.onConflict) {
            const { rows: pk } = await db.query(
              `select a.attname from pg_index i
               join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
               where i.indrelid = ('public.' || $1)::regclass and i.indisprimary`,
              [state.table],
            );
            if (pk.length > 0) state.onConflict = pk.map((r) => r.attname).join(",");
          }

          if (state.upsert && state.onConflict) {
            const target = state.onConflict
              .split(",")
              .map((c) => quoteIdent(c.trim()))
              .join(", ");

            if (state.ignoreDuplicates) {
              conflict = ` on conflict (${target}) do nothing`;
            } else {
              const assignments = columns
                .map((c) => `${quoteIdent(c)} = excluded.${quoteIdent(c)}`)
                .join(", ");
              conflict = ` on conflict (${target}) do update set ${assignments}`;
            }
          }

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

        if (state.delete) {
          // `.delete().select(...)` returns what went, which is the only
          // way to tell a delete that removed nothing from one RLS
          // refused — both are a success with no error. Code that checks
          // it was getting null here and reading it as "refused".
          const returning = state.columns ? ` returning ${state.columns}` : "";
          const r = await run(
            `delete from public.${quoteIdent(state.table)}${whereSql}${returning}`,
            params,
          );
          return { data: state.columns ? r.rows : null, error: null };
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
          // Filters were pushed first, so their placeholders still line up; the
          // is-clauses carry no parameters and simply append.
          const updateWhere = [
            ...state.filters.map(
              ([column, , op = "="], i) => `${quoteIdent(column)} ${op} $${i + 1}`,
            ),
            ...isClauses,
          ].join(" and ");
          const returning = state.returning
            ? ` returning ${state.columns === "*" ? "*" : state.columns}`
            : "";
          const result = await run(
            `update public.${quoteIdent(state.table)} set ${assignments.join(", ")}` +
              (updateWhere ? ` where ${updateWhere}` : "") +
              returning,
            params,
          );
          if (!state.returning) return { data: null, error: null };
          return {
            data: state.single === "maybe" ? (result.rows[0] ?? null) : result.rows,
            error: null,
          };
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
              // `members!inner(...)` is the same embed with a join hint on
              // it. The hint changes which rows PostgREST returns when the
              // relation is missing; every embed here is on a NOT NULL
              // foreign key, where inner and left agree, so it is parsed and
              // dropped rather than implemented.
              const embed = /^(\w+)(?:!inner|!left)?\((.+)\)$/.exec(part);
              return embed
                ? await embedSql(db, state.table, embed[1], embed[2])
                : part;
            }),
          )
        ).join(", ");

        const limitSql = state.limit != null ? ` limit ${Number(state.limit)}` : "";
        const offsetSql = state.offset ? ` offset ${Number(state.offset)}` : "";
        const terms =
          state.offset == null
            ? orderTerms
            : [...orderTerms, ...(await unstableTieBreakers(db, state.table, state.order))];
        const orderSql = terms.length ? ` order by ${terms.join(", ")}` : "";
        const r = await run(
          `select ${selected} from public.${quoteIdent(state.table)} base${whereSql}${orderSql}${limitSql}${offsetSql}`,
          params,
        );
        if (state.single === "maybe") {
          return { data: r.rows[0] ?? null, error: null };
        }
        return { data: r.rows, error: null };
      } catch (error) {
        // SQLSTATE as `code`, the way PostgREST sends it. Without it,
        // app code that matches on the code — which is what this project
        // asks for, because Postgres's wording changes between major
        // versions — sees `undefined` here and falls through to its raw
        // message. The harness bends; the app does not.
        return {
          data: null,
          count: null,
          error: { message: error.message, code: error.code ?? null },
        };
      }
    }

    const api = {
      select(columns = "*", options = {}) {
        state.columns = columns;
        state.count = options.count ?? null;
        state.head = options.head ?? false;
        // `.insert(...).select(...)` asks for the written rows back; so does
        // `.update(...).select(...)`, which the overlap check uses to learn
        // whether its conditional update was the one that landed.
        if (state.insert || state.upsert || state.update) state.returning = true;
        return api;
      },
      insert(values) {
        state.insert = values;
        return api;
      },
      upsert(values, options = {}) {
        state.upsert = values;
        state.onConflict = options.onConflict ?? null;
        state.ignoreDuplicates = options.ignoreDuplicates ?? false;
        return api;
      },
      in(column, values) {
        state.inFilters.push([column, values]);
        return api;
      },
      is(column, value) {
        state.isFilters.push([column, value]);
        return api;
      },
      // `.returns<T>()` is a types-only call on the real client — it narrows
      // what TypeScript thinks comes back and changes nothing at runtime.
      // Here it has to exist, or any query written with it throws.
      returns() {
        return api;
      },
      not(column, operator, value) {
        // Only `.not("col", "is", null)` is used, and only as "is not null".
        if (operator !== "is") {
          throw new Error(`Shim does not implement .not(..., '${operator}', ...)`);
        }
        state.isFilters.push([column, value === null ? "NOT_NULL" : value]);
        return api;
      },
      update(values) {
        state.update = values;
        return api;
      },
      delete() {
        state.delete = true;
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
      gte(column, value) {
        state.filters.push([column, value, ">="]);
        return api;
      },
      lt(column, value) {
        state.filters.push([column, value, "<"]);
        return api;
      },
      lte(column, value) {
        state.filters.push([column, value, "<="]);
        return api;
      },
      or(expression) {
        state.or.push(expression);
        return api;
      },
      limit(n) {
        state.limit = n;
        return api;
      },
      // PostgREST's Range header, as supabase-js sends it: inclusive at both
      // ends, so .range(0, 999) is a thousand rows. Without this the paged
      // admin queries could not be tested at all.
      range(from, to) {
        state.offset = Number(from);
        state.limit = Number(to) - Number(from) + 1;
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
      /**
       * There is no GoTrue here, so the session is the uid the test
       * configured. This checks the form's email really is that person's —
       * otherwise a test could believe it had signed in as somebody it had
       * not — and otherwise answers as Supabase does, including the
       * "Invalid login credentials" the form maps to a message.
       *
       * auth.users belongs to GoTrue, not to the member, so it is read
       * outside run()'s `set role authenticated`.
       */
      async signInWithPassword({ email, password } = {}) {
        authLog.push({ kind: "sign_in", email });
        const invalid = {
          data: { user: null, session: null },
          error: { message: "Invalid login credentials" },
        };
        if (!email || !password) return invalid;
        const { rows } = await db.query(
          `select id from auth.users where lower(email) = lower($1)`,
          [email],
        );
        if (rows.length === 0) return invalid;
        if (uid !== null && rows[0].id !== uid) {
          throw new Error(
            `The shim is signed in as ${uid}; signing in as ${email} (${rows[0].id}) would be a lie. configure() that user instead.`,
          );
        }
        return { data: { user: { id: rows[0].id }, session: {} }, error: null };
      },
      // Auth calls that go to GoTrue rather than Postgres are recorded, not
      // performed: a test asserts on what would have been sent or set.
      async resetPasswordForEmail(email, options = {}) {
        authLog.push({ kind: "reset_link", email, redirectTo: options.redirectTo ?? null });
        return { data: {}, error: null };
      },
      admin: {
        /**
         * The address behind a login. The service role's job and nobody
         * else's: `auth.users` is not readable under RLS, which is exactly
         * why a retainer client's email has to be fetched this way.
         */
        async getUserById(id) {
          if (uid !== null) throw new Error("auth.admin needs the service role");
          const { rows } = await db.query(
            `select id, email from auth.users where id = $1`,
            [id],
          );
          if (rows.length === 0) {
            return { data: { user: null }, error: { message: "User not found" } };
          }
          return { data: { user: { id: rows[0].id, email: rows[0].email } }, error: null };
        },
        async updateUserById(id, attributes) {
          if (uid !== null) throw new Error("auth.admin needs the service role");
          authLog.push({ kind: "update_user", id, attributes });
          return { data: { user: { id } }, error: null };
        },
      },
    },
    from,
    async rpc(name, args = {}) {
      const keys = Object.keys(args);
      const call = keys.map((k, i) => `${quoteIdent(k)} => $${i + 1}`).join(", ");
      try {
        // PostgREST shapes the response by what the function returns: a
        // table or setof record as an array of objects, a setof scalar as an
        // array of values (one row is still a list of one), a scalar as the
        // bare value. Decided from the catalogue, as PostgREST decides it.
        const { rows: [proc] } = await run(
          `select p.proretset, t.typtype = 'c' or t.typname = 'record' as composite
             from pg_proc p join pg_type t on t.oid = p.prorettype
            where p.proname = $1 and p.pronamespace = 'public'::regnamespace limit 1`,
          [name],
        );
        const values = keys.map((k) => args[k]);
        let data;
        if (proc?.composite) {
          const r = await run(`select to_jsonb(t) as result from public.${quoteIdent(name)}(${call}) t`, values);
          data = r.rows.map((row) => row.result);
        } else {
          const r = await run(`select public.${quoteIdent(name)}(${call}) as result`, values);
          data = proc?.proretset ? r.rows.map((row) => row.result) : (r.rows[0]?.result ?? null);
        }
        return { data, error: null };
      } catch (error) {
        return { data: null, error: { message: error.message, code: error.code ?? null } };
      }
    },
  };
}
