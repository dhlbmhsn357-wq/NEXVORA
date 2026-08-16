/**
 * عميل Supabase وهمي بسيط للاختبارات (Phase D) — بيدعم بالظبط أنماط
 * الاستدعاء المستخدمة في conversation-service.ts وproject-assistant-actions.ts:
 * insert().select().single()/maybeSingle()، select().eq()...order()،
 * select().in()، update().eq(). مش بديل عام لـ supabase-js — مقصود يكون
 * أبسط شيء يغطي الاستخدامات الفعلية بس.
 */

type Row = Record<string, unknown>;

interface QueryState {
  mode: "select" | "insert" | "update" | null;
  filters: Array<[string, unknown]>;
  inFilters: Array<[string, unknown[]]>;
  insertRows: Row[] | null;
  updateData: Row | null;
  single: boolean;
  maybeSingle: boolean;
  selectAfterInsert: boolean;
  orderCol: string | null;
  orderAsc: boolean;
}

let idCounter = 0;

export function makeFakeSupabase(tables: Record<string, Row[]>) {
  function matches(state: QueryState, row: Row): boolean {
    return (
      state.filters.every(([c, v]) => row[c] === v) &&
      state.inFilters.every(([c, arr]) => arr.includes(row[c]))
    );
  }

  function builder(table: string) {
    const state: QueryState = {
      mode: null,
      filters: [],
      inFilters: [],
      insertRows: null,
      updateData: null,
      single: false,
      maybeSingle: false,
      selectAfterInsert: false,
      orderCol: null,
      orderAsc: true,
    };

    function execute() {
      const rows = tables[table] ?? (tables[table] = []);

      if (state.mode === "insert") {
        const inserted = (state.insertRows ?? []).map((r) => {
          const row: Row = { id: `fake-${table}-${++idCounter}`, created_at: new Date().toISOString(), ...r };
          rows.push(row);
          return row;
        });
        if (state.selectAfterInsert) {
          const data = state.single || state.maybeSingle ? inserted[0] ?? null : inserted;
          return { data, error: null };
        }
        return { data: null, error: null };
      }

      if (state.mode === "update") {
        for (const row of rows) {
          if (matches(state, row)) Object.assign(row, state.updateData);
        }
        return { data: null, error: null };
      }

      // select
      let filtered = rows.filter((r) => matches(state, r));
      if (state.orderCol) {
        const col = state.orderCol;
        filtered = [...filtered].sort((a, b) => {
          const av = a[col] as string;
          const bv = b[col] as string;
          if (av < bv) return state.orderAsc ? -1 : 1;
          if (av > bv) return state.orderAsc ? 1 : -1;
          return 0;
        });
      }
      if (state.single) {
        return { data: filtered[0] ?? null, error: filtered[0] ? null : { message: "not found" } };
      }
      if (state.maybeSingle) {
        return { data: filtered[0] ?? null, error: null };
      }
      return { data: filtered, error: null };
    }

    const api = {
      select(_cols?: string) {
        if (state.mode === "insert") state.selectAfterInsert = true;
        else state.mode = state.mode ?? "select";
        return api;
      },
      insert(data: Row | Row[]) {
        state.mode = "insert";
        state.insertRows = Array.isArray(data) ? data : [data];
        return api;
      },
      update(data: Row) {
        state.mode = "update";
        state.updateData = data;
        return api;
      },
      eq(col: string, val: unknown) {
        state.filters.push([col, val]);
        return api;
      },
      in(col: string, arr: unknown[]) {
        state.inFilters.push([col, arr]);
        return api;
      },
      order(col: string, opts?: { ascending?: boolean }) {
        state.orderCol = col;
        state.orderAsc = opts?.ascending !== false;
        return api;
      },
      single() {
        state.single = true;
        return api;
      },
      maybeSingle() {
        state.maybeSingle = true;
        return api;
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      then(resolve: (v: any) => void, reject?: (e: any) => void) {
        try {
          resolve(execute());
        } catch (e) {
          if (reject) reject(e);
          else throw e;
        }
      },
    };
    return api;
  }

  return {
    from(table: string) {
      return builder(table);
    },
  };
}
