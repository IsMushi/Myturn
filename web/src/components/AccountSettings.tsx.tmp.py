path = "web/src/components/AccountSettings.tsx"
src = open(path, encoding="utf-8").read()
lines = src.split("\n")
# Find the section start
start_idx = None
for i, l in enumerate(lines):
    if 'Your account history' in l:
        # walk back to the <section> line
        j = i
        while j >= 0 and '<section className="rounded-2xl bg-white p-5">' not in lines[j]:
            j -= 1
        start_idx = j
        break
assert start_idx is not None, "section start not found"
# find the closing </section> after start
end_idx = None
for j in range(start_idx + 1, len(lines)):
    if lines[j].strip() == "</section>":
        end_idx = j
        break
assert end_idx is not None
print("replacing lines", start_idx+1, "to", end_idx+1)

new_section = '''      <section className="rounded-2xl bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-xl">
            <h2 className="text-lg font-semibold text-deep-green">Your account history</h2>
            <p className="mt-1 text-sm text-medium-green">
              Everything that has happened to this account, newest first.
            </p>
          </div>
          {history.data && history.data.entries.length > 0 && (
            <p className="flex flex-wrap items-center gap-2 text-xs text-medium-green">
              <span className="rounded-full bg-soft-mint px-2.5 py-1 font-semibold text-deep-green">
                {plural(filteredHistory.length, "entry")}
              </span>
              {historyQuery || historyFilter !== "all" ? (
                <span>of {plural(allHistory.length, "total")}</span>
              ) : null}
            </p>
          )}
        </div>

        {history.error ? (
          <p className="mt-3 text-sm text-danger">
            The history could not be read: {history.error.message}
          </p>
        ) : !history.data ? (
          <div className="mt-4 space-y-2" aria-busy="true" aria-label="Reading the history">
            <div className="h-10 animate-pulse rounded-xl bg-soft-mint" />
            <div className="h-10 animate-pulse rounded-xl bg-soft-mint" />
            <div className="h-10 animate-pulse rounded-xl bg-soft-mint" />
          </div>
        ) : history.data.entries.length === 0 ? (
          <div className="mt-4 flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line bg-soft-mint/40 px-5 py-8 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-white text-medium-green">
              <ListChecks size={20} aria-hidden="true" />
            </span>
            <p className="font-semibold text-deep-green">Nothing recorded yet</p>
            <p className="max-w-sm text-sm text-medium-green">
              Sign-ins, password changes and profile edits will appear here.
            </p>
          </div>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <input
                type="search"
                value={historyQuery}
                onChange={(e) => { setHistoryQuery(e.target.value); setHistoryPage(1); }}
                placeholder="Search event, detail or actor…"
                className="min-w-0 flex-1 rounded-full border border-line bg-white px-4 py-2 text-sm text-deep-green placeholder:text-medium-green/60 focus:outline-none focus:ring-2 focus:ring-deep-green/30"
                aria-label="Search account history"
              />
              <select
                value={historyFilter}
                onChange={(e) => { setHistoryFilter(e.target.value); setHistoryPage(1); }}
                className="rounded-full border border-line bg-white px-3 py-2 text-sm text-deep-green focus:outline-none focus:ring-2 focus:ring-deep-green/30"
                aria-label="Filter by event type"
              >
                {historyEventTypes.map((type) => (
                  <option key={type} value={type}>
                    {type === "all" ? "All events" : spoken(type, ACCOUNT_EVENTS)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setHistorySort((s) => (s === "newest" ? "oldest" : "newest"))}
                className="rounded-full border border-line bg-white px-3 py-2 text-sm font-medium text-deep-green hover:bg-soft-mint"
                aria-label="Toggle sort order"
              >
                {historySort === "newest" ? "Newest first" : "Oldest first"}
              </button>
              <select
                value={historyPageSize}
                onChange={(e) => { setHistoryPageSize(Number(e.target.value)); setHistoryPage(1); }}
                className="rounded-full border border-line bg-white px-3 py-2 text-sm text-deep-green focus:outline-none focus:ring-2 focus:ring-deep-green/30"
                aria-label="Rows per page"
              >
                {[10, 25, 50].map((n) => (
                  <option key={n} value={n}>{n} rows</option>
                ))}
              </select>
            </div>

            {filteredHistory.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed border-line bg-soft-mint/40 px-5 py-6 text-center text-sm text-medium-green">
                No entries match your search.
              </div>
            ) : (
              <>
                <div className="mt-4 overflow-x-auto rounded-2xl border border-line">
                  <table className="w-full text-sm">
                    <thead className="bg-soft-mint/60 text-left text-xs font-semibold uppercase tracking-wide text-deep-green">
                      <tr>
                        <th className="px-4 py-3">Event</th>
                        <th className="px-4 py-3">Detail</th>
                        <th className="px-4 py-3">Actor</th>
                        <th className="px-4 py-3 text-right">When</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {pagedHistory.map((entry, index) => (
                        <tr key={`${entry.at}-${index}`} className="hover:bg-soft-mint/30">
                          <td className="px-4 py-3 font-medium text-deep-green">
                            {spoken(entry.event, ACCOUNT_EVENTS)}
                          </td>
                          <td className="px-4 py-3 text-medium-green">
                            {entry.detail ? entry.detail : "—"}
                          </td>
                          <td className="px-4 py-3 text-medium-green">
                            {entry.actor}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right text-xs tabular-nums text-medium-green">
                            {calendarDate(entry.at)} {clockTime(entry.at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile card fallback */}
                <ul className="mt-4 space-y-2 sm:hidden">
                  {pagedHistory.map((entry, index) => (
                    <li
                      key={`m-${entry.at}-${index}`}
                      className="rounded-2xl border border-line bg-white p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-semibold text-deep-green">
                          {spoken(entry.event, ACCOUNT_EVENTS)}
                        </p>
                        <span className="shrink-0 text-xs tabular-nums text-medium-green">
                          {calendarDate(entry.at)} {clockTime(entry.at)}
                        </span>
                      </div>
                      {entry.detail && (
                        <p className="mt-1 text-sm text-medium-green">{entry.detail}</p>
                      )}
                      <p className="mt-1 text-xs text-medium-green/70">by {entry.actor}</p>
                    </li>
                  ))}
                </ul>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-medium-green">
                  <span>
                    Showing {(historySafePage - 1) * historyPageSize + 1}–
                    {Math.min(historySafePage * historyPageSize, filteredHistory.length)} of{" "}
                    {filteredHistory.length}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                      disabled={historySafePage <= 1}
                      className="rounded-full border border-line bg-white px-3 py-1.5 font-medium text-deep-green hover:bg-soft-mint disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Previous
                    </button>
                    <span className="tabular-nums">
                      Page {historySafePage} of {historyTotalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setHistoryPage((p) => Math.min(historyTotalPages, p + 1))}
                      disabled={historySafePage >= historyTotalPages}
                      className="rounded-full border border-line bg-white px-3 py-1.5 font-medium text-deep-green hover:bg-soft-mint disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </section>'''

lines[start_idx:end_idx+1] = new_section.split("\n")
open(path, "w", encoding="utf-8").write("\n".join(lines))
print("done")