// src/webui/client.ts
var zh = {
  feeds: {
    title: "Rss/Atom \u7BA1\u7406",
    desc: "\u52A0\u6E90\u3001\u6539\u8282\u594F\u3001\u770B\u72B6\u6001\u3002\u6BCF\u4E2A\u6E90\u81EA\u5DF1\u51B3\u5B9A\u591A\u4E45\u62C9\u4E00\u6B21\u3001\u51E0\u70B9\u62C9\u3001\u8D85\u65F6\u591A\u957F\u3001\u4E00\u6B21\u9012\u51E0\u6761\u3002",
    refresh: "\u5237\u65B0",
    empty: "\u8FD8\u6CA1\u6709\u8BA2\u9605\u6E90\u3002\u586B\u4E00\u4E2A\u5730\u5740\uFF0C\u6BD4\u5982 https://example.com/feed.xml",
    colTitle: "\u540D\u79F0",
    colUrl: "\u5730\u5740",
    colState: "\u72B6\u6001",
    colSchedule: "\u62C9\u53D6",
    colLimit: "\u4E00\u6B21\u6700\u591A",
    colModel: "\u6A21\u578B\u53EF\u62C9",
    colLast: "\u4E0A\u6B21",
    colActions: "\u64CD\u4F5C",
    addTitle: "\u6DFB\u52A0\u8BA2\u9605\u6E90",
    editTitle: "\u4FEE\u6539\u8BA2\u9605\u6E90",
    url: "\u8BA2\u9605\u5730\u5740",
    urlPlaceholder: "https://example.com/feed.xml",
    name: "\u540D\u79F0\uFF08\u7559\u7A7A\u7528\u6E90\u6807\u9898\uFF09",
    interval: "\u95F4\u9694\uFF08\u5206\u949F\uFF0C0 = \u4E0D\u6309\u95F4\u9694\uFF09",
    times: "\u5B9A\u65F6\u62C9\u53D6\uFF08HH:MM\uFF0C\u9017\u53F7\u5206\u9694\uFF0C\u53EF\u7559\u7A7A\uFF09",
    timeout: "\u8D85\u65F6\uFF08\u79D2\uFF09",
    maxItems: "\u4E00\u6B21\u6700\u591A\u9012\u51E0\u6761",
    allowModel: "\u5141\u8BB8\u5979\u81EA\u5DF1\u62C9\u8FD9\u4E2A\u6E90",
    enabled: "\u542F\u7528",
    add: "\u6DFB\u52A0",
    save: "\u4FDD\u5B58\u4FEE\u6539",
    cancel: "\u53D6\u6D88",
    probe: "\u6D4B\u8BD5\u5730\u5740",
    edit: "\u7F16\u8F91",
    pull: "\u7ACB\u5373\u62C9\u53D6",
    disable: "\u505C\u7528",
    enable: "\u542F\u7528",
    remove: "\u5220\u9664",
    on: "\u542F\u7528",
    off: "\u505C\u7528",
    yes: "\u53EF\u4EE5",
    no: "\u4E0D\u53EF\u4EE5",
    never: "\u8FD8\u6CA1\u62C9\u8FC7",
    next: "\u4E0B\u6B21",
    messages: "\u6761\u6D88\u606F",
    pulled: (fresh, handed) => fresh ? `\u62C9\u5230 ${fresh} \u6761\u65B0\u6D88\u606F\uFF08\u8FD9\u6B21\u9012\u4E86 ${handed} \u6761\uFF09` : `\u6CA1\u6709\u65B0\u6D88\u606F\uFF08\u8FD9\u6B21\u9012\u4E86 ${handed} \u6761\uFF09`,
    removed: "\u5DF2\u5220\u9664",
    saved: "\u5DF2\u4FDD\u5B58",
    added: "\u5DF2\u6DFB\u52A0",
    confirmRemove: "\u5220\u6389\u8FD9\u4E2A\u8BA2\u9605\u6E90\uFF1F\u5B83\u7684\u8BBE\u7F6E\u548C\u5DF2\u62C9\u5230\u7684\u6D88\u606F\u90FD\u4F1A\u4E00\u8D77\u6D88\u5931\u3002",
    probeOk: (r) => `\u80FD\u8BFB\uFF1A${r.title || "(\u6CA1\u6709\u6807\u9898)"} \xB7 ${r.kind ?? "\u672A\u77E5\u683C\u5F0F"} \xB7 ${r.entries ?? 0} \u6761`,
    probeFailed: "\u8BFB\u4E0D\u4E86",
    failed: "\u5931\u8D25",
    itemUnit: "\u6761",
    timeoutUnit: "\u79D2",
    copyLink: "\u590D\u5236\u94FE\u63A5"
  },
  messages: {
    title: "Rss/Atom \u6E90\u7684\u6D88\u606F",
    desc: "\u5DF2\u7ECF\u62C9\u5230\u7684\u6761\u76EE\uFF0C\u4ECE\u65B0\u5230\u65E7\uFF1B\u70B9\u4E00\u6761\u770B\u6B63\u6587\u548C\u94FE\u63A5\u3002",
    refresh: "\u5237\u65B0",
    clear: "\u6E05\u7A7A\u6D88\u606F",
    clearAll: "\u5168\u90E8",
    all: "\u5168\u90E8\u6765\u6E90",
    search: "\u5728\u6807\u9898\u3001\u6458\u8981\u91CC\u627E",
    empty: "\u8FD8\u6CA1\u6709\u6D88\u606F\u3002\u7BA1\u7406\u9875\u52A0\u4E2A\u6E90\u3001\u62C9\u4E00\u6B21\u5C31\u6709\u4E86\u3002",
    noHits: "\u6CA1\u6709\u5339\u914D\u7684\u6D88\u606F\u3002",
    count: (n, page, pages) => `${n} \u6761 \xB7 \u7B2C ${page}/${pages} \u9875`,
    prev: "\u4E0A\u4E00\u9875",
    next: "\u4E0B\u4E00\u9875",
    readMore: "\u70B9\u5F00\u770B\u6B63\u6587",
    confirmClear: "\u6E05\u7A7A\u6D88\u606F\u5B58\u6863\uFF1F\u8BA2\u9605\u6E90\u4F1A\u7559\u7740\u3002",
    cleared: (n) => `\u6E05\u6389\u4E86 ${n} \u6761`,
    failed: "\u5931\u8D25",
    link: "\u539F\u6587\u94FE\u63A5",
    emptyBody: "\u8FD9\u6761\u6D88\u606F\u6CA1\u6709\u6B63\u6587\uFF0C\u53EA\u6709\u6807\u9898\u3002"
  }
};
var en = {
  feeds: {
    title: "RSS / Atom feeds",
    desc: "Add feeds, adjust cadence, watch state. Each feed decides its own interval, clock times, timeout and item limit.",
    refresh: "Refresh",
    empty: "No feed yet. Paste an address, e.g. https://example.com/feed.xml",
    colTitle: "Name",
    colUrl: "Address",
    colState: "State",
    colSchedule: "Cadence",
    colLimit: "Per pull",
    colModel: "Model pulls",
    colLast: "Last",
    colActions: "Actions",
    addTitle: "Add a feed",
    editTitle: "Edit feed",
    url: "Feed URL",
    urlPlaceholder: "https://example.com/feed.xml",
    name: "Name (empty = feed title)",
    interval: "Interval (minutes, 0 = none)",
    times: "Clock times (HH:MM, comma separated, optional)",
    timeout: "Timeout (seconds)",
    maxItems: "Items per pull",
    allowModel: "She may pull this feed",
    enabled: "Enabled",
    add: "Add",
    save: "Save",
    cancel: "Cancel",
    probe: "Test address",
    edit: "Edit",
    pull: "Pull now",
    disable: "Disable",
    enable: "Enable",
    remove: "Delete",
    on: "on",
    off: "off",
    yes: "yes",
    no: "no",
    never: "never",
    next: "next",
    messages: "messages",
    pulled: (fresh, handed) => fresh ? `pulled ${fresh} new items (${handed} handed over)` : `nothing new (${handed} items)`,
    removed: "Deleted",
    saved: "Saved",
    added: "Added",
    confirmRemove: "Delete this feed? Its settings and already pulled messages go with it.",
    probeOk: (r) => `Readable: ${r.title || "(no title)"} \xB7 ${r.kind ?? "unknown"} \xB7 ${r.entries ?? 0} entries`,
    probeFailed: "Unreadable",
    failed: "Failed",
    itemUnit: "items",
    timeoutUnit: "s",
    copyLink: "Copy link"
  },
  messages: {
    title: "Feed messages",
    desc: "Items already pulled, newest first; open one for the body and link.",
    refresh: "Refresh",
    clear: "Clear messages",
    clearAll: "all",
    all: "All feeds",
    search: "Search titles and summaries",
    empty: "No message yet. Add a feed and pull once.",
    noHits: "No matching message.",
    count: (n, page, pages) => `${n} items \xB7 page ${page}/${pages}`,
    prev: "Previous",
    next: "Next",
    readMore: "open for the body",
    confirmClear: "Clear the message archive? Feeds stay.",
    cleared: (n) => `cleared ${n}`,
    failed: "Failed",
    link: "Source link",
    emptyBody: "This item has no body, only a title."
  }
};
var stringsFor = (language) => String(language).toLowerCase().startsWith("zh") ? zh : en;
async function attempt(message, run, done) {
  message.classList.remove("bad");
  try {
    message.textContent = done(await run());
  } catch (error) {
    message.classList.add("bad");
    message.textContent = error instanceof Error ? error.message : String(error);
  }
}
function secondsText(ms) {
  return `${Math.round(ms / 1e3)}`;
}
var feedsPanel = {
  mount: async (ctx) => {
    const S = stringsFor(ctx.language).feeds;
    const { ui, root } = ctx;
    const card = ui.sheet({ title: S.title, desc: S.desc });
    const status = ui.msgline("");
    const refresh = ui.button(S.refresh);
    const topBar = ui.rowbar();
    topBar.append(refresh, status);
    const sub = (text) => {
      const el = ui.h("div", null, text);
      el.style.color = "var(--ink-soft)";
      el.style.fontSize = "12px";
      el.style.marginTop = "2px";
      return el;
    };
    const form = ui.sheet({ title: S.addTitle });
    const url = ui.input({ placeholder: S.urlPlaceholder, cls: "mono" });
    const name = ui.input({ placeholder: S.name });
    const interval = ui.input({ type: "number", value: "" });
    const times = ui.input({ placeholder: "08:00, 20:00" });
    const timeout = ui.input({ type: "number", value: "" });
    const maxItems = ui.input({ type: "number", value: "" });
    const allowModel = ui.checkbox(S.allowModel, { checked: true });
    const enabled = ui.checkbox(S.enabled, { checked: true });
    const grid = ui.h("div", "statgrid");
    grid.append(
      ui.field(S.url, url),
      ui.field(S.name, name),
      ui.field(S.interval, interval),
      ui.field(S.times, times),
      ui.field(S.timeout, timeout),
      ui.field(S.maxItems, maxItems)
    );
    const addButton = ui.button(S.add, { variant: "primary" });
    const probeButton = ui.button(S.probe);
    const saveButton = ui.button(S.save, { variant: "primary" });
    const cancelButton = ui.button(S.cancel);
    saveButton.style.display = "none";
    cancelButton.style.display = "none";
    const formBar = ui.rowbar();
    formBar.append(addButton, probeButton, saveButton, cancelButton, allowModel.el, enabled.el);
    const formNote = ui.msgline("");
    form.body.append(grid, formBar, formNote);
    const table = ui.table({
      head: [S.colTitle, S.colSchedule, S.colLimit, S.colModel, S.colLast, S.colActions],
      maxHeight: "calc(100vh - 520px)"
    });
    card.body.append(topBar, table.el);
    root.append(card.el, form.el);
    let editing = null;
    let lastState = null;
    const resetForm = () => {
      editing = null;
      const heading = form.el.querySelector("h3");
      if (heading) heading.textContent = S.addTitle;
      url.value = "";
      name.value = "";
      interval.value = "";
      times.value = "";
      timeout.value = "";
      maxItems.value = "";
      const defaults = lastState?.defaults;
      if (defaults) {
        interval.placeholder = String(defaults.intervalMinutes);
        timeout.placeholder = secondsText(defaults.timeoutMs);
        maxItems.placeholder = String(defaults.maxNewItems);
        allowModel.setChecked(defaults.allowModel);
      }
      enabled.setChecked(true);
      addButton.style.display = "";
      saveButton.style.display = "none";
      cancelButton.style.display = "none";
    };
    const formValues = () => ({
      url: url.value.trim(),
      title: name.value.trim(),
      intervalMinutes: interval.value.trim() || void 0,
      scheduleTimes: times.value.trim(),
      timeoutMs: timeout.value.trim() ? String(Number(timeout.value.trim()) * 1e3) : void 0,
      maxNewItems: maxItems.value.trim() || void 0,
      allowModel: allowModel.checked,
      enabled: enabled.checked
    });
    const render = (state) => {
      lastState = state;
      table.clear(S.empty);
      if (!editing) resetForm();
      for (const feed of state.feeds) {
        const errorPill = feed.lastError ? ui.pill(S.failed, "off") : null;
        const titleCell = ui.h("div");
        titleCell.append(ui.h("div", null, feed.title));
        titleCell.append(sub(feed.url));
        if (errorPill) {
          const err = ui.h("div", "msgline bad", feed.lastError ?? "");
          titleCell.append(err);
        }
        const limitCell = ui.h("div");
        limitCell.append(ui.h("div", null, `${feed.maxNewItems} ${S.itemUnit}`));
        limitCell.append(sub(`${secondsText(feed.timeoutMs)}${S.timeoutUnit}`));
        const lastCell = ui.h("div");
        lastCell.append(ui.h("div", null, feed.lastFetchedText ?? S.never));
        const detail = feed.lastNewCount > 0 ? `${feed.lastNewCount} ${S.itemUnit}` : `${feed.messageCount} ${S.messages}`;
        lastCell.append(sub(feed.nextRunText ? `${S.next} ${feed.nextRunText}` : detail));
        const actions = ui.h("div", "rowbar");
        const edit = ui.button(S.edit, { size: "sm" });
        edit.addEventListener("click", () => {
          editing = feed.id;
          const heading = form.el.querySelector("h3");
          if (heading) heading.textContent = S.editTitle;
          url.value = feed.url;
          name.value = feed.title;
          interval.value = String(feed.intervalMinutes);
          times.value = feed.scheduleTimes.join(", ");
          timeout.value = secondsText(feed.timeoutMs);
          maxItems.value = String(feed.maxNewItems);
          allowModel.setChecked(feed.allowModel);
          enabled.setChecked(feed.enabled);
          addButton.style.display = "none";
          saveButton.style.display = "";
          cancelButton.style.display = "";
          formNote.textContent = "";
          formNote.classList.remove("bad");
        }, { signal: ctx.signal });
        const pull = ui.button(S.pull, { size: "sm" });
        pull.addEventListener("click", () => void attempt(formNote, () => ctx.invoke("pull", [feed.id]), (result) => {
          void load();
          return S.pulled(result.newCount, result.itemCount);
        }), { signal: ctx.signal });
        const toggle = ui.button(feed.enabled ? S.disable : S.enable, { size: "sm" });
        toggle.addEventListener("click", () => void attempt(formNote, () => ctx.invoke("update", [feed.id, { enabled: !feed.enabled }]), () => {
          void load();
          return S.saved;
        }), { signal: ctx.signal });
        const remove = ui.button(S.remove, { size: "sm", variant: "danger" });
        remove.addEventListener("click", () => void (async () => {
          const ok = await ui.confirm({ title: S.remove, body: S.confirmRemove, danger: true });
          if (!ok) return;
          await attempt(formNote, () => ctx.invoke("remove", [feed.id]), () => {
            void load();
            return S.removed;
          });
        })(), { signal: ctx.signal });
        actions.append(edit, pull, toggle, remove);
        table.addRow([
          { el: titleCell },
          { text: feed.scheduleText },
          { el: limitCell },
          { el: ui.pill(feed.allowModel ? S.yes : S.no, feed.allowModel ? "on" : "plain") },
          { el: lastCell },
          { el: actions }
        ]);
      }
    };
    const load = async () => {
      await attempt(status, () => ctx.invoke("list"), (state) => {
        render(state);
        return `${state.feeds.length} ${S.itemUnit}${state.timezone ? ` \xB7 ${state.timezone}` : ""}`;
      });
      await ctx.refresh();
    };
    addButton.addEventListener("click", () => void attempt(formNote, () => ctx.invoke("add", [formValues()]), () => {
      resetForm();
      void load();
      return S.added;
    }), { signal: ctx.signal });
    saveButton.addEventListener("click", () => void attempt(formNote, () => {
      const id = editing;
      if (!id) throw new Error(S.failed);
      return ctx.invoke("update", [id, formValues()]).then((value) => {
        resetForm();
        void load();
        return value;
      });
    }, () => S.saved), { signal: ctx.signal });
    cancelButton.addEventListener("click", () => {
      if (lastState) render(lastState);
      else resetForm();
    }, { signal: ctx.signal });
    probeButton.addEventListener("click", () => void attempt(formNote, () => ctx.invoke("probe", [
      url.value.trim(),
      timeout.value.trim() ? Number(timeout.value.trim()) * 1e3 : void 0
    ]), (result) => {
      if (!result.ok) {
        formNote.classList.add("bad");
        return `${S.probeFailed}\uFF1A${result.error ?? ""}`;
      }
      formNote.classList.remove("bad");
      return S.probeOk(result);
    }), { signal: ctx.signal });
    refresh.addEventListener("click", () => void load(), { signal: ctx.signal });
    await load();
  }
};
var messagesPanel = {
  mount: async (ctx) => {
    const S = stringsFor(ctx.language).messages;
    const { ui, root } = ctx;
    const card = ui.sheet({ title: S.title, desc: S.desc });
    const status = ui.msgline("");
    const feedSelect = ui.select({ options: [S.all] });
    const query = ui.input({ type: "search", placeholder: S.search });
    const refresh = ui.button(S.refresh, { variant: "primary" });
    const clear = ui.button(S.clear, { variant: "danger", size: "sm" });
    const bar = ui.rowbar();
    bar.append(feedSelect, query, refresh, clear, status);
    const doc = root.ownerDocument ?? globalThis.document;
    const list = ui.log({ variant: "conversation", maxHeight: "calc(100vh - 300px)", empty: S.empty });
    const prev = ui.button(S.prev, { size: "sm" });
    const next = ui.button(S.next, { size: "sm" });
    const pageLabel = ui.msgline("");
    const pager = ui.rowbar();
    pager.append(prev, next, pageLabel);
    card.body.append(bar, list.el, pager);
    root.append(card.el);
    let page = 1;
    let feedId = "";
    let last = null;
    const showRow = (row) => {
      const titleLine = list.append(row.title, "plain");
      titleLine.style.cursor = "pointer";
      titleLine.title = S.readMore;
      const tag = typeof row.seq === "number" ? `#${row.seq} \xB7 ` : "";
      list.append(`${tag}${row.timeText} \xB7 ${row.feedTitle}`, "dim");
      if (row.summary && row.summary !== row.title) list.append(row.summary, "plain");
      list.append("", "dim");
      const open = () => {
        const body = ui.h("div");
        body.append(ui.msgline(`${typeof row.seq === "number" ? `#${row.seq} \xB7 ` : ""}${row.feedTitle} \xB7 ${row.timeText}`));
        const text = ui.h("div");
        text.textContent = row.body || row.summary || S.emptyBody;
        text.style.whiteSpace = "pre-wrap";
        body.append(text);
        if (row.link) {
          const linkRow = ui.rowbar();
          const anchor = ui.h("a", "mono", row.link);
          anchor.href = row.link;
          anchor.target = "_blank";
          anchor.rel = "noreferrer";
          linkRow.append(anchor);
          body.append(ui.section(S.link), linkRow);
        }
        ctx.own(ui.drawer(row.title, body));
      };
      titleLine.addEventListener("click", open, { signal: ctx.signal });
    };
    const render = (state) => {
      last = state;
      const options = [{ value: "", label: S.all }];
      for (const feed of state.feeds) options.push({ value: feed.id, label: feed.title });
      const current = feedId;
      feedSelect.replaceChildren(...options.map((option) => {
        const node = doc.createElement("option");
        node.value = option.value;
        node.textContent = option.label;
        return node;
      }));
      feedSelect.value = current;
      list.clear();
      if (!state.rows.length) {
        list.append(query.value.trim() ? S.noHits : S.empty, "dim");
      } else {
        for (const row of state.rows) showRow(row);
      }
      pageLabel.textContent = S.count(state.total, state.page, state.pageCount);
      prev.disabled = state.page <= 1;
      next.disabled = state.page >= state.pageCount;
    };
    const load = async () => {
      await attempt(status, () => ctx.invoke("list", [{
        feedId: feedId || void 0,
        query: query.value.trim() || void 0,
        page,
        pageSize: 20
      }]), (state) => {
        render(state);
        return "";
      });
    };
    feedSelect.addEventListener("change", () => {
      feedId = feedSelect.value;
      page = 1;
      void load();
    }, { signal: ctx.signal });
    query.addEventListener("input", () => {
      page = 1;
      void load();
    }, { signal: ctx.signal });
    refresh.addEventListener("click", () => {
      page = last?.page ?? 1;
      void load();
    }, { signal: ctx.signal });
    prev.addEventListener("click", () => {
      page = Math.max(1, page - 1);
      void load();
    }, { signal: ctx.signal });
    next.addEventListener("click", () => {
      page = Math.min(last?.pageCount ?? 1, page + 1);
      void load();
    }, { signal: ctx.signal });
    clear.addEventListener("click", () => void (async () => {
      const ok = await ui.confirm({ title: S.clear, body: S.confirmClear, danger: true });
      if (!ok) return;
      await attempt(status, () => ctx.invoke("clear", [feedId || void 0]), (result) => {
        page = 1;
        void load();
        return S.cleared(result.cleared);
      });
    })(), { signal: ctx.signal });
    await load();
  }
};
var client_default = {
  panels: {
    feeds: feedsPanel,
    messages: messagesPanel
  }
};
export {
  client_default as default
};
