import { useState, useMemo, useRef, useEffect, useCallback } from "react";

const SUPABASE_URL = "https://aghubdcnpcrirngtpiyk.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFnaHViZGNucGNyaXJuZ3RwaXlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4Mzg1ODIsImV4cCI6MjEwMTQxNDU4Mn0.6Y3Uy6tjY41hLaMwfELLqfHYB1wp46SFuqDhpKFsrcA";
const TABLE = "inventory_items";
const PASSWORD = "kixy";
const GAS_URL = "https://script.google.com/macros/s/AKfycbz2ICyvGq1sgr1l6tHbLD8h6QylYBkn86fmGWspfs8pBGx03fQPfyDMRncthEVz-0BU/exec";

const CATEGORIES = ["すべて", "ウイスキー", "スピリッツ", "リキュール", "ジュース", "ビール", "ワイン", "焼酎"];
const LOCATIONS = ["", "１番", "1-2番", "２番", "３番", "４番", "4-5番", "５番", "バック", "ショーケース"];

const STORES = [
  { id: "heavens", name: "ヘブンズキッチン", col: "heavens_out", color: "#7c3aed", bg: "#f5f3ff", border: "#ddd6fe", icon: "🍽️" },
  { id: "boost",   name: "ブースト",         col: "boost_out",   color: "#0369a1", bg: "#f0f9ff", border: "#bae6fd", icon: "⚡" },
  { id: "maddy",   name: "マディー",          col: "muddy_out",   color: "#be185d", bg: "#fdf2f8", border: "#fbcfe8", icon: "🌸" },
];

// Supabase API呼び出し
async function sbFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation",
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// 全件取得
async function fetchItems() {
  return await sbFetch(`${TABLE}?select=*&order=id.asc`);
}

// 1件更新
async function updateItem(id, data) {
  return await sbFetch(`${TABLE}?id=eq.${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

// 1件追加
async function insertItem(data) {
  return await sbFetch(TABLE, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// 1件削除
async function deleteItemDb(id) {
  return await sbFetch(`${TABLE}?id=eq.${id}`, {
    method: "DELETE",
  });
}

// データ正規化
function normalizeItem(i) {
  return {
    id: Number(i.id),
    name: String(i.name || ""),
    category: String(i.category || ""),
    location: String(i.location || ""),
    stock: Number(i.stock) || 0,
    minStock: Number(i.low_stock) || 0,
    unit: String(i.unit || "本"),
    price: Number(i.cost_price) || 0,
    heavens_out: Number(i.heavens_out) || 0,
    boost_out: Number(i.boost_out) || 0,
    muddy_out: Number(i.muddy_out) || 0,
    received: Number(i.received) || 0,
  };
}

function toDbRow(item) {
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    location: item.location,
    stock: item.stock,
    low_stock: item.minStock,
    unit: item.unit,
    cost_price: item.price,
    heavens_out: item.heavens_out || 0,
    boost_out: item.boost_out || 0,
    muddy_out: item.muddy_out || 0,
    received: item.received || 0,
  };
}

function splitCsvLine(line) {
  const cols = []; let cur = "", inQ = false;
  for (let ci = 0; ci < line.length; ci++) {
    const ch = line[ci];
    if (ch === '"') { inQ = !inQ; }
    else if (ch === "," && !inQ) { cols.push(cur); cur = ""; }
    else cur += ch;
  }
  cols.push(cur);
  return cols;
}

function parseCsv(text) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(l => l.trim());
  if (lines.length < 2) return { items: [], errors: ["データ行がありません"] };
  const errors = [], items = [];
  const headers = splitCsvLine(lines[0]).map(h => h.replace(/^"|"$/g, "").trim());
  const hMap = {};
  headers.forEach((h, i) => {
    if (h === "id") hMap.id = i;
    else if (h === "名前" || h === "商品名") hMap.name = i;
    else if (h === "カテゴリー" || h === "カテゴリ") hMap.category = i;
    else if (h === "場所") hMap.location = i;
    else if (h === "在庫数" || h === "在庫") hMap.stock = i;
    else if (h === "最低在庫数" || h === "低在庫") hMap.minStock = i;
    else if (h === "単位") hMap.unit = i;
    else if (h === "仕入れ価格") hMap.price = i;
  });
  lines.slice(1).forEach((line, idx) => {
    if (!line.trim()) return;
    const cols = splitCsvLine(line).map(c => c.replace(/^"|"$/g, "").trim());
    const name = hMap.name !== undefined ? cols[hMap.name] : "";
    if (!name) { errors.push(`行 ${idx + 2}: 商品名が空です`); return; }
    items.push({
      id: hMap.id !== undefined ? Number(cols[hMap.id]) : Date.now(),
      name,
      category: hMap.category !== undefined ? cols[hMap.category] : "",
      location: hMap.location !== undefined ? cols[hMap.location] : "",
      stock: hMap.stock !== undefined ? Number(cols[hMap.stock]) || 0 : 0,
      minStock: hMap.minStock !== undefined ? Number(cols[hMap.minStock]) || 0 : 0,
      unit: hMap.unit !== undefined ? cols[hMap.unit] || "本" : "本",
      price: hMap.price !== undefined ? Number(cols[hMap.price]) || 0 : 0,
      heavens_out: 0, boost_out: 0, muddy_out: 0, received: 0,
    });
  });
  return { items, errors };
}

function itemsToCsv(items) {
  const esc = v => `"${String(v).replace(/"/g, '""')}"`;
  const headers = ["商品名","カテゴリー","場所","在庫数","最低在庫数","単位","仕入れ価格","ヘブンズキッチン出庫","ブースト出庫","マディー出庫","入荷数","ヘブンズ出庫金額","ブースト出庫金額","マディー出庫金額"];
  const rows = [headers.join(",")];
  items.forEach(i => {
    const price = Number(i.price) || 0;
    const h = Number(i.heavens_out) || 0;
    const b = Number(i.boost_out) || 0;
    const m = Number(i.muddy_out) || 0;
    rows.push([
      i.name, i.category, i.location, i.stock, i.minStock, i.unit, price,
      h, b, m, i.received||0,
      price * h, price * b, price * m
    ].map(esc).join(","));
  });
  return "\uFEFF" + rows.join("\r\n");
}

function StartScreen({ onStart }) {
  return (
    <div style={{ minHeight: "100vh", background: "#1a2332", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter','Segoe UI',sans-serif" }}>
      <div style={{ background: "#fff", borderRadius: 20, padding: "40px 32px", width: "100%", maxWidth: 360, boxShadow: "0 25px 60px rgba(0,0,0,0.4)", textAlign: "center" }}>
        <div style={{ background: "#f59e0b", width: 72, height: 72, borderRadius: 20, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40, margin: "0 auto 20px" }}>📦</div>
        <div style={{ fontWeight: 800, fontSize: 22, color: "#1a2332", marginBottom: 8 }}>ヘブンズ在庫管理</div>
        <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 32 }}>INVENTORY MANAGER</div>
        <button onClick={onStart} style={{ width: "100%", padding: "16px", background: "#1a2332", border: "none", borderRadius: 12, cursor: "pointer", fontWeight: 800, color: "#fff", fontSize: 18, letterSpacing: "0.05em" }}>スタート</button>
      </div>
    </div>
  );
}

function AdminPasswordModal({ onSuccess, onClose }) {
  const [input, setInput] = useState("");
  const [error, setError] = useState(false);
  const handleSubmit = () => {
    if (input === PASSWORD) { onSuccess(); }
    else { setError(true); setTimeout(() => setError(false), 2000); }
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 340, boxShadow: "0 25px 60px rgba(0,0,0,0.25)", overflow: "hidden" }}>
        <div style={{ background: "#1a2332", padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, color: "#fff", fontSize: 15, fontWeight: 600 }}>🔐 管理者パスワード</h2>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "#fff", width: 28, height: 28, borderRadius: 6, cursor: "pointer", fontSize: 16 }}>×</button>
        </div>
        <div style={{ padding: 20 }}>
          <input type="password" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSubmit()} placeholder="パスワードを入力"
            style={{ width: "100%", padding: "12px 16px", border: `2px solid ${error ? "#ef4444" : "#e2e8f0"}`, borderRadius: 10, fontSize: 16, outline: "none", boxSizing: "border-box", textAlign: "center", letterSpacing: "0.1em", marginBottom: 8 }} autoFocus />
          {error && <div style={{ color: "#ef4444", fontSize: 12, marginBottom: 8, textAlign: "center" }}>パスワードが違います</div>}
          <button onClick={handleSubmit} style={{ width: "100%", padding: "11px", background: "#1a2332", border: "none", borderRadius: 10, cursor: "pointer", fontWeight: 700, color: "#fff", fontSize: 14 }}>確認</button>
        </div>
      </div>
    </div>
  );
}

function StockBar({ stock, minStock }) {
  const max = Math.max(Number(minStock) * 3, Number(stock) * 1.2, 1);
  const pct = Math.min((Number(stock) / max) * 100, 100);
  const color = Number(stock) === 0 ? "#ef4444" : Number(stock) <= Number(minStock) ? "#f59e0b" : "#22c55e";
  return (
    <div style={{ width: "100%", background: "#e2e8f0", borderRadius: 4, height: 6, overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, background: color, height: "100%", borderRadius: 4 }} />
    </div>
  );
}

function Badge({ children, color }) {
  const map = { red: { bg: "#fee2e2", text: "#dc2626" }, amber: { bg: "#fef3c7", text: "#d97706" }, green: { bg: "#dcfce7", text: "#16a34a" }, blue: { bg: "#dbeafe", text: "#2563eb" }, gray: { bg: "#f1f5f9", text: "#475569" } };
  const c = map[color] || map.gray;
  return <span style={{ background: c.bg, color: c.text, padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>{children}</span>;
}

function Modal({ title, onClose, children }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 480, boxShadow: "0 25px 60px rgba(0,0,0,0.25)", display: "flex", flexDirection: "column", maxHeight: "90vh" }}>
        <div style={{ background: "#1a2332", padding: "20px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", borderRadius: "16px 16px 0 0", flexShrink: 0 }}>
          <h2 style={{ margin: 0, color: "#fff", fontSize: 17, fontWeight: 600 }}>{title}</h2>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "#fff", width: 32, height: 32, borderRadius: 8, cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
        </div>
        <div style={{ padding: 24, overflowY: "auto" }}>{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</label>
      {children}
    </div>
  );
}

const inp = { width: "100%", padding: "10px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 14, color: "#1a2332", outline: "none", boxSizing: "border-box", fontFamily: "inherit", background: "#f8fafc" };

export default function App() {
  const [unlocked, setUnlocked] = useState(false);
  const [adminModal, setAdminModal] = useState(null); // 管理者パスワードモーダル用
  const [items, setItems] = useState([]);
  const [selCat, setSelCat] = useState("すべて");
  const [q, setQ] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [adjAmt, setAdjAmt] = useState("");
  const [adjType, setAdjType] = useState("add");
  const [dispAmt, setDispAmt] = useState("");
  const [importResult, setImportResult] = useState(null);
  const [stockFilter, setStockFilter] = useState(null);
  const [locFilter, setLocFilter] = useState(null);
  const [syncStatus, setSyncStatus] = useState("loading");
  const [lastSync, setLastSync] = useState(null);
  const fileRef = useRef(null);

  const loadItems = useCallback(async () => {
    try {
      setSyncStatus("loading");
      const data = await fetchItems();
      setItems(data.map(normalizeItem));
      setLastSync(new Date());
      setSyncStatus("synced");
    } catch (e) {
      console.error(e);
      setSyncStatus("error");
    }
  }, []);

  useEffect(() => {
    loadItems();
    const interval = setInterval(loadItems, 15000);
    return () => clearInterval(interval);
  }, [loadItems]);

  const lowStock = useMemo(() => items.filter(i => Number(i.stock) <= Number(i.minStock)), [items]);

  const filtered = useMemo(() => {
    let arr = [...items];
    if (selCat !== "すべて") arr = arr.filter(i => i.category === selCat);
    if (q) arr = arr.filter(i => i.name.toLowerCase().includes(q.toLowerCase()));
    if (stockFilter === "low") arr = arr.filter(i => Number(i.stock) <= Number(i.minStock));
    if (stockFilter === "out") arr = arr.filter(i => Number(i.stock) === 0);
    if (locFilter) arr = arr.filter(i => i.location === locFilter);
    arr.sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name, "ja");
      if (sortBy === "category") return a.category.localeCompare(b.category, "ja");
      if (sortBy === "location") return (a.location || "").localeCompare(b.location || "", "ja");
      return 0;
    });
    return arr;
  }, [items, selCat, q, sortBy, stockFilter, locFilter]);

  const stats = useMemo(() => ({
    low: lowStock.length,
    out: items.filter(i => Number(i.stock) === 0).length,
    total: items.reduce((s, i) => s + (Number(i.stock) * (Number(i.price) || 0)), 0),
  }), [items, lowStock]);

  const openAdd = () => { setForm({ name: "", category: "ウイスキー", location: "", stock: "", minStock: "", unit: "本", price: "" }); setModal({ type: "form" }); };
  const openEdit = (item) => { setForm({ ...item, stock: String(item.stock), minStock: String(item.minStock), price: String(item.price || "") }); setModal({ type: "form", item }); };

  const saveItem = async () => {
    const data = {
      id: modal.item ? modal.item.id : Date.now(),
      name: form.name,
      category: form.category || "",
      location: form.location || "",
      stock: Number(form.stock) || 0,
      minStock: Number(form.minStock) || 0,
      unit: form.unit || "本",
      price: Number(form.price) || 0,
      heavens_out: modal.item ? modal.item.heavens_out : 0,
      boost_out: modal.item ? modal.item.boost_out : 0,
      muddy_out: modal.item ? modal.item.muddy_out : 0,
      received: modal.item ? modal.item.received : 0,
    };
    if (!data.name) return;
    try {
      setSyncStatus("saving");
      if (modal.item) {
        await updateItem(data.id, toDbRow(data));
      } else {
        await insertItem(toDbRow(data));
      }
      await loadItems();
      setModal(null);
    } catch(e) { setSyncStatus("error"); console.error(e); }
  };

  const deleteItem = async (id) => {
    try {
      setSyncStatus("saving");
      await deleteItemDb(id);
      await loadItems();
      setModal(null);
    } catch(e) { setSyncStatus("error"); console.error(e); }
  };

  const openAdj = (item) => { setAdjAmt(""); setAdjType("add"); setModal({ type: "adjust", item }); };
  const openDisp = (item, store) => { setDispAmt(""); setModal({ type: "dispatch", item, store }); };

  const applyDisp = async () => {
    const amt = parseInt(dispAmt);
    if (isNaN(amt) || amt <= 0) return;
    const actual = Math.min(amt, Number(modal.item.stock));
    const item = modal.item;
    const store = modal.store;
    try {
      setSyncStatus("saving");
      await updateItem(item.id, {
        stock: Number(item.stock) - actual,
        [store.col]: Number(item[store.col] || 0) + actual,
      });
      await loadItems();
      setModal(null);
    } catch(e) { setSyncStatus("error"); console.error(e); }
  };

  const applyAdj = async () => {
    const amt = parseInt(adjAmt, 10);
    if (!adjAmt || isNaN(amt) || amt <= 0) { alert("数量を入力してください"); return; }
    const item = modal.item;
    const newStock = adjType === "add" ? Number(item.stock) + amt : Math.max(0, Number(item.stock) - amt);
    const updateData = { stock: newStock };
    if (adjType === "add") updateData.received = Number(item.received || 0) + amt;
    try {
      setSyncStatus("saving");
      await updateItem(item.id, updateData);
      await loadItems();
      setModal(null);
    } catch(e) { setSyncStatus("error"); console.error(e); }
  };

  const handleExport = () => setModal({ type: "export", csv: itemsToCsv(items) });

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = "";
    const tryParse = (text) => {
      const { items: parsed, errors } = parseCsv(text);
      if (parsed.length > 0) setModal({ type: "importConfirm", parsed, errors });
      else setImportResult({ added: 0, errors });
    };
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      if (text.includes("\uFFFD")) { const r2 = new FileReader(); r2.onload = ev2 => tryParse(ev2.target.result); r2.readAsText(file, "Shift-JIS"); }
      else tryParse(text);
    };
    reader.readAsText(file, "UTF-8");
  };

  const applyImport = async (mode) => {
    const parsed = modal.parsed;
    try {
      setSyncStatus("saving");
      if (mode === "replace") {
        // 全削除して追加
        for (const item of items) { await deleteItemDb(item.id); }
      }
      for (const item of parsed) { await insertItem(toDbRow(item)); }
      await loadItems();
      setImportResult({ added: parsed.length, errors: modal.errors, mode });
      setModal(null);
    } catch(e) { setSyncStatus("error"); console.error(e); }
  };

  const sendToGas = () => {
    const allRows = items.map(i =>
      [i.id, i.name, i.location||"", i.category, i.stock, i.heavens_out||0, i.boost_out||0, i.muddy_out||0, i.unit, i.price||0, i.received||0, i.minStock].join("|")
    );
    const chunkSize = 8;
    const chunks = [];
    for (let i = 0; i < allRows.length; i += chunkSize) {
      chunks.push({ data: allRows.slice(i, i + chunkSize).join("~"), action: i === 0 ? "savecsv" : "appendcsv" });
    }
    chunks.forEach((chunk, idx) => {
      setTimeout(() => {
        window.open(`${GAS_URL}?action=${chunk.action}&data=${encodeURIComponent(chunk.data)}&callback=test`, "_blank");
      }, idx * 2500);
    });
  };

  const syncDot = syncStatus === "loading" ? { color: "#94a3b8", label: "読込中..." }
    : syncStatus === "saving" ? { color: "#f59e0b", label: "保存中..." }
    : syncStatus === "error" ? { color: "#ef4444", label: "エラー" }
    : { color: "#22c55e", label: lastSync ? `${lastSync.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })} 同期済` : "同期済" };

  if (!unlocked) return <StartScreen onStart={() => setUnlocked(true)} />;

  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9", fontFamily: "'Inter','Segoe UI',sans-serif", color: "#1a2332" }}>
      <div style={{ background: "#1a2332", padding: "0 12px", position: "sticky", top: 0, zIndex: 100, boxShadow: "0 2px 12px rgba(0,0,0,0.2)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 52 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <div style={{ background: "#f59e0b", width: 28, height: 28, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>📦</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: "#fff", fontWeight: 700, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>ヘブンズ在庫管理</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(255,255,255,0.06)", borderRadius: 20, padding: "2px 8px", flexShrink: 0 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: syncDot.color }} />
              <span style={{ fontSize: 10, color: "#94a3b8", whiteSpace: "nowrap" }}>{syncDot.label}</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <input ref={fileRef} type="file" accept=".csv" onChange={handleImport} style={{ display: "none" }} />
            <button onClick={() => setAdminModal({ onSuccess: () => { setAdminModal(null); setModal({ type: "adminMenu" }); } })} style={{ background: "rgba(255,255,255,0.08)", color: "#cbd5e1", border: "1px solid rgba(255,255,255,0.15)", padding: "6px 16px", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>⚙️ 管理</button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "16px 12px" }}>
        <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
          {[
            { key: "low", label: "低在庫", value: stats.low, unit: "種", icon: "⚠️", color: "#d97706", activeColor: "#fef3c7" },
            { key: "out", label: "在庫切れ", value: stats.out, unit: "種", icon: "🚫", color: "#dc2626", activeColor: "#fee2e2" },
          ].map(s => {
            const isActive = stockFilter === s.key;
            return (
              <div key={s.key} onClick={() => setStockFilter(isActive ? null : s.key)}
                style={{ background: isActive ? s.activeColor : "#fff", borderRadius: 10, padding: "10px 16px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", borderLeft: `3px solid ${s.color}`, cursor: "pointer", outline: isActive ? `2px solid ${s.color}` : "none", display: "flex", alignItems: "center", gap: 8, userSelect: "none" }}>
                <span style={{ fontSize: 18 }}>{s.icon}</span>
                <div>
                  <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600, textTransform: "uppercase" }}>{s.label}{isActive && <span style={{ marginLeft: 4, color: s.color }}>▼</span>}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "#1a2332" }}>{s.value}<span style={{ fontSize: 11, color: "#64748b", marginLeft: 2 }}>{s.unit}</span></div>
                </div>
              </div>
            );
          })}
          <div style={{ background: "#fff", borderRadius: 10, padding: "10px 16px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", borderLeft: "3px solid #16a34a", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18 }}>💴</span>
            <div>
              <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600, textTransform: "uppercase" }}>仕入れ総額</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#1a2332" }}>¥{stats.total.toLocaleString()}</div>
            </div>
          </div>
        </div>

        <div style={{ background: "#fff", borderRadius: 12, padding: 16, marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
            <input placeholder="🔍　商品名で検索..." value={q} onChange={e => setQ(e.target.value)} style={{ ...inp, flex: "1 1 200px", maxWidth: 280 }} />
            <select value={selCat} onChange={e => setSelCat(e.target.value)}
              style={{ ...inp, width: "auto", WebkitAppearance: "menulist", appearance: "menulist", cursor: "pointer", touchAction: "manipulation" }}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)}
              style={{ ...inp, width: "auto", WebkitAppearance: "menulist", appearance: "menulist", cursor: "pointer", touchAction: "manipulation" }}>
              <option value="name">名前順</option>
              <option value="category">カテゴリ順</option>
              <option value="location">場所順</option>
            </select>
            <span style={{ color: "#94a3b8", fontSize: 13, marginLeft: "auto" }}>{filtered.length} 件表示</span>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {["すべて", ...LOCATIONS.filter(l => l !== "")].map(l => (
              <button key={l} onClick={() => setLocFilter(l === "すべて" ? null : l)}
                style={{ padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "1.5px solid", whiteSpace: "nowrap", borderColor: locFilter === l || (l === "すべて" && !locFilter) ? "#1a2332" : "#e2e8f0", background: locFilter === l || (l === "すべて" && !locFilter) ? "#1a2332" : "#f8fafc", color: locFilter === l || (l === "すべて" && !locFilter) ? "#fff" : "#64748b" }}>
                {l}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 360px), 1fr))", gap: 10 }}>
          {syncStatus === "loading" && items.length === 0 ? (
            <div style={{ gridColumn: "1/-1", padding: 48, textAlign: "center", color: "#94a3b8", background: "#fff", borderRadius: 12 }}>⏳ データを読み込み中...</div>
          ) : filtered.length === 0 ? (
            <div style={{ gridColumn: "1/-1", padding: 48, textAlign: "center", color: "#94a3b8", background: "#fff", borderRadius: 12 }}>該当する商品が見つかりません</div>
          ) : filtered.map(item => {
            const isLow = Number(item.stock) <= Number(item.minStock);
            const isOut = Number(item.stock) === 0;
            return (
              <div key={item.id} style={{ background: "#fff", borderRadius: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", padding: "14px 16px", borderLeft: `4px solid ${isOut ? "#ef4444" : isLow ? "#f59e0b" : "#22c55e"}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: "#1a2332" }}>{item.name}</div>
                      {item.price ? <span style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#15803d", padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700 }}>¥{Number(item.price).toLocaleString()}</span> : null}
                    </div>
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{item.location || "—"} · {item.category}</div>
                  </div>
                  <button onClick={() => setModal({ type: "detail", item })} style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", color: "#475569", padding: "4px 12px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", marginLeft: 8 }}>操作 ▶</button>
                </div>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <span style={{ fontWeight: 800, fontSize: 22, color: isOut ? "#dc2626" : isLow ? "#d97706" : "#1a2332" }}>{item.stock}</span>
                    <span style={{ fontSize: 12, color: "#94a3b8" }}>{item.unit} / 最低 {item.minStock}{item.unit}</span>
                    <span style={{ marginLeft: "auto" }}><Badge color={isOut ? "red" : isLow ? "amber" : "green"}>{isOut ? "在庫切れ" : isLow ? "低在庫" : "正常"}</Badge></span>
                  </div>
                  <StockBar stock={item.stock} minStock={item.minStock} />
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {STORES.map(store => (
                    <button key={store.id} onClick={() => openDisp(item, store)} disabled={isOut}
                      style={{ background: isOut ? "#f1f5f9" : store.bg, border: `1px solid ${isOut ? "#e2e8f0" : store.border}`, color: isOut ? "#cbd5e1" : store.color, padding: "8px 12px", borderRadius: 8, cursor: isOut ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 4, flex: 1, justifyContent: "center" }}>
                      <span>{store.icon}</span>{store.name}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {adminModal && <AdminPasswordModal onSuccess={adminModal.onSuccess} onClose={() => setAdminModal(null)} />}

      {modal && modal.type === "adminMenu" && (
        <Modal title="⚙️ 管理者メニュー" onClose={() => setModal(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button onClick={() => { setModal(null); setTimeout(openAdd, 50); }} style={{ width: "100%", padding: "12px", background: "#f0f9ff", border: "1.5px solid #bae6fd", borderRadius: 8, cursor: "pointer", fontWeight: 700, color: "#0369a1", fontSize: 14, textAlign: "left" }}>＋ 商品追加</button>
            <button onClick={() => { setModal(null); setTimeout(() => fileRef.current.click(), 50); }} style={{ width: "100%", padding: "12px", background: "#f0fdf4", border: "1.5px solid #bbf7d0", borderRadius: 8, cursor: "pointer", fontWeight: 700, color: "#15803d", fontSize: 14, textAlign: "left" }}>📥 CSVインポート</button>
            <button onClick={() => { setModal(null); setTimeout(handleExport, 50); }} style={{ width: "100%", padding: "12px", background: "#f0fdf4", border: "1.5px solid #bbf7d0", borderRadius: 8, cursor: "pointer", fontWeight: 700, color: "#15803d", fontSize: 14, textAlign: "left" }}>📤 CSVエクスポート</button>
            <button onClick={() => { setModal(null); setTimeout(sendToGas, 100); }} style={{ width: "100%", padding: "12px", background: "#f5f3ff", border: "1.5px solid #ddd6fe", borderRadius: 8, cursor: "pointer", fontWeight: 700, color: "#7c3aed", fontSize: 14, textAlign: "left" }}>📊 スプレッドシートに送信</button>
            <button onClick={() => setModal({ type: "resetConfirm" })} style={{ width: "100%", padding: "12px", background: "#fff7ed", border: "1.5px solid #fed7aa", borderRadius: 8, cursor: "pointer", fontWeight: 700, color: "#c2410c", fontSize: 14, textAlign: "left" }}>🔄 月次リセット</button>
          </div>
        </Modal>
      )}

      {modal && modal.type === "resetConfirm" && (
        <Modal title="🔄 月次リセット" onClose={() => setModal(null)}>
          <div style={{ background: "#fff7ed", border: "1.5px solid #fed7aa", borderRadius: 10, padding: "14px 16px", marginBottom: 20 }}>
            <div style={{ fontWeight: 700, color: "#92400e", fontSize: 14, marginBottom: 6 }}>⚠️ 以下がリセットされます</div>
            <div style={{ fontSize: 13, color: "#78350f" }}>・各店舗への出庫数 → 0<br/>・入荷数 → 0</div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setModal(null)} style={{ flex: 1, padding: "10px", background: "#f1f5f9", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, color: "#475569" }}>キャンセル</button>
            <button onClick={async () => {
              try {
                setSyncStatus("saving");
                for (const item of items) {
                  await updateItem(item.id, { heavens_out: 0, boost_out: 0, muddy_out: 0, received: 0 });
                }
                await loadItems();
                setModal(null);
              } catch(e) { setSyncStatus("error"); }
            }} style={{ flex: 2, padding: "10px", background: "#dc2626", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700, color: "#fff", fontSize: 14 }}>🔄 リセットする</button>
          </div>
        </Modal>
      )}

      {modal && modal.type === "detail" && (() => {
        const item = modal.item;
        const isOut = Number(item.stock) === 0;
        const isLow = Number(item.stock) <= Number(item.minStock);
        return (
          <Modal title={item.name} onClose={() => setModal(null)}>
            <div style={{ background: "#f8fafc", borderRadius: 10, padding: "14px 18px", marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: "#64748b" }}>現在の在庫</span>
                <Badge color={isOut ? "red" : isLow ? "amber" : "green"}>{isOut ? "在庫切れ" : isLow ? "低在庫" : "正常"}</Badge>
              </div>
              <div style={{ fontSize: 40, fontWeight: 800, color: isOut ? "#dc2626" : isLow ? "#d97706" : "#1a2332", lineHeight: 1 }}>
                {item.stock}<span style={{ fontSize: 16, color: "#94a3b8", marginLeft: 4 }}>{item.unit}</span>
              </div>
              <div style={{ marginTop: 8 }}><StockBar stock={item.stock} minStock={item.minStock} /></div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>最低在庫：{item.minStock}{item.unit}</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 20, fontSize: 13 }}>
              <div style={{ background: "#f8fafc", borderRadius: 8, padding: "8px 12px" }}>
                <div style={{ color: "#94a3b8", fontSize: 11, marginBottom: 2 }}>カテゴリ</div>
                <div style={{ fontWeight: 600 }}>{item.category || "—"}</div>
              </div>
              <div style={{ background: "#f8fafc", borderRadius: 8, padding: "8px 12px" }}>
                <div style={{ color: "#94a3b8", fontSize: 11, marginBottom: 2 }}>場所</div>
                <div style={{ fontWeight: 600 }}>{item.location || "—"}</div>
              </div>
              <div style={{ background: "#f8fafc", borderRadius: 8, padding: "8px 12px" }}>
                <div style={{ color: "#94a3b8", fontSize: 11, marginBottom: 2 }}>仕入れ価格</div>
                <div style={{ fontWeight: 600 }}>{item.price ? `¥${Number(item.price).toLocaleString()}` : "—"}</div>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button onClick={() => { setModal(null); setTimeout(() => openAdj(item), 50); }} style={{ width: "100%", padding: "12px", background: "#eff6ff", border: "1.5px solid #bfdbfe", borderRadius: 8, cursor: "pointer", fontWeight: 700, color: "#2563eb", fontSize: 14 }}>📦 入荷・出庫</button>
              <button onClick={() => setAdminModal({ onSuccess: () => { setAdminModal(null); setModal(null); setTimeout(() => openEdit(item), 50); } })} style={{ width: "100%", padding: "12px", background: "#f0fdf4", border: "1.5px solid #bbf7d0", borderRadius: 8, cursor: "pointer", fontWeight: 700, color: "#15803d", fontSize: 14 }}>✏️ 編集</button>
              <button onClick={() => setAdminModal({ onSuccess: () => { setAdminModal(null); setModal({ type: "deleteConfirm", item }); } })} style={{ width: "100%", padding: "12px", background: "#fff1f2", border: "1.5px solid #fecdd3", borderRadius: 8, cursor: "pointer", fontWeight: 700, color: "#be123c", fontSize: 14 }}>🗑️ 削除</button>
            </div>
          </Modal>
        );
      })()}

      {modal && modal.type === "deleteConfirm" && (
        <Modal title="🗑️ 削除の確認" onClose={() => setModal(null)}>
          <div style={{ background: "#fff1f2", border: "1.5px solid #fecdd3", borderRadius: 10, padding: "14px 16px", marginBottom: 20, textAlign: "center" }}>
            <div style={{ fontSize: 14, color: "#be123c", fontWeight: 700, marginBottom: 4 }}>「{modal.item.name}」</div>
            <div style={{ fontSize: 13, color: "#475569" }}>を削除しますか？この操作は元に戻せません。</div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setModal(null)} style={{ flex: 1, padding: "10px", background: "#f1f5f9", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, color: "#475569" }}>キャンセル</button>
            <button onClick={() => deleteItem(modal.item.id)} style={{ flex: 2, padding: "10px", background: "#dc2626", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700, color: "#fff", fontSize: 14 }}>🗑️ 削除する</button>
          </div>
        </Modal>
      )}

      {modal && modal.type === "form" && (
        <Modal title={modal.item ? "商品を編集" : "商品を追加"} onClose={() => setModal(null)}>
          <Field label="商品名"><input style={inp} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="例：山崎12年" /></Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="カテゴリ">
              <select style={{ ...inp, WebkitAppearance: "menulist", appearance: "menulist", cursor: "pointer", touchAction: "manipulation" }} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                {CATEGORIES.filter(c => c !== "すべて").map(c => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="場所">
              <select style={{ ...inp, WebkitAppearance: "menulist", appearance: "menulist", cursor: "pointer", touchAction: "manipulation" }} value={form.location || ""} onChange={e => setForm(f => ({ ...f, location: e.target.value }))}>
                {LOCATIONS.map(l => <option key={l} value={l}>{l || "— 未設定 —"}</option>)}
              </select>
            </Field>
            <Field label="在庫数"><input style={inp} type="number" min="0" value={form.stock} onChange={e => setForm(f => ({ ...f, stock: e.target.value }))} /></Field>
            <Field label="最低在庫数"><input style={inp} type="number" min="0" value={form.minStock} onChange={e => setForm(f => ({ ...f, minStock: e.target.value }))} /></Field>
            <Field label="単位"><input style={inp} value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} placeholder="本、缶..." /></Field>
            <Field label="仕入れ価格（円）"><input style={inp} type="number" min="0" value={form.price || ""} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="例：1500" /></Field>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <button onClick={() => setModal(null)} style={{ flex: 1, padding: "10px", background: "#f1f5f9", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, color: "#475569" }}>キャンセル</button>
            <button onClick={saveItem} style={{ flex: 2, padding: "10px", background: "#1a2332", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700, color: "#fff", fontSize: 14 }}>{modal.item ? "保存する" : "追加する"}</button>
          </div>
        </Modal>
      )}

      {modal && modal.type === "adjust" && (
        <Modal title={`入荷・出庫：${modal.item.name}`} onClose={() => setModal(null)}>
          <div style={{ textAlign: "center", padding: "8px 0 20px" }}>
            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 4 }}>現在の在庫</div>
            <div style={{ fontSize: 48, fontWeight: 800, color: "#1a2332", lineHeight: 1 }}>{modal.item.stock}<span style={{ fontSize: 18, color: "#64748b", marginLeft: 4 }}>{modal.item.unit}</span></div>
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            <button onClick={() => setAdjType("add")} style={{ flex: 1, padding: "12px 8px", border: `2px solid ${adjType === "add" ? "#2563eb" : "#e2e8f0"}`, borderRadius: 10, background: adjType === "add" ? "#2563eb" : "#f8fafc", color: adjType === "add" ? "#fff" : "#475569", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>
              <span style={{ fontSize: 20, display: "block" }}>＋</span>入荷
            </button>
            <button onClick={() => setAdjType("sub")} style={{ flex: 1, padding: "12px 8px", border: `2px solid ${adjType === "sub" ? "#dc2626" : "#e2e8f0"}`, borderRadius: 10, background: adjType === "sub" ? "#dc2626" : "#f8fafc", color: adjType === "sub" ? "#fff" : "#475569", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>
              <span style={{ fontSize: 20, display: "block" }}>－</span>出庫
            </button>
          </div>
          <Field label="数量">
            <input style={{ ...inp, fontSize: 20, fontWeight: 700, textAlign: "center" }} type="number" min="1" value={adjAmt} onChange={e => setAdjAmt(e.target.value)} placeholder="0" />
          </Field>
          {adjAmt && !isNaN(parseInt(adjAmt)) && parseInt(adjAmt) > 0 && (
            <div style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#475569", textAlign: "center" }}>
              調整後：<strong style={{ fontSize: 16, color: "#1a2332" }}>{adjType === "add" ? Number(modal.item.stock) + parseInt(adjAmt) : Math.max(0, Number(modal.item.stock) - parseInt(adjAmt))}</strong> {modal.item.unit}
            </div>
          )}
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setModal(null)} style={{ flex: 1, padding: "10px", background: "#f1f5f9", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, color: "#475569" }}>キャンセル</button>
            <button onClick={applyAdj} style={{ flex: 2, padding: "10px", background: adjType === "add" ? "#2563eb" : "#dc2626", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700, color: "#fff", fontSize: 14 }}>
              {adjType === "add" ? "入荷する" : "出庫する"}
            </button>
          </div>
        </Modal>
      )}

      {modal && modal.type === "dispatch" && (
        <Modal title={`${modal.store.icon} ${modal.store.name}へ出庫`} onClose={() => setModal(null)}>
          <div style={{ background: modal.store.bg, border: `1.5px solid ${modal.store.border}`, borderRadius: 10, padding: "12px 16px", marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 600, color: modal.store.color, fontSize: 14 }}>{modal.item.name}</span>
            <span style={{ fontSize: 13, color: "#64748b" }}>在庫：<strong>{modal.item.stock}{modal.item.unit}</strong></span>
          </div>
          <Field label="出庫数量">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input style={{ ...inp, fontSize: 24, fontWeight: 800, textAlign: "center", flex: 1 }} type="number" min="1" max={modal.item.stock} value={dispAmt} onChange={e => setDispAmt(e.target.value)} placeholder="0" autoFocus />
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <button onClick={() => setDispAmt(v => String(Math.min(Number(modal.item.stock), (parseInt(v) || 0) + 1)))} style={{ width: 36, height: 36, background: "#f1f5f9", border: "1.5px solid #e2e8f0", borderRadius: 8, cursor: "pointer", fontSize: 18, fontWeight: 700, color: "#1a2332", display: "flex", alignItems: "center", justifyContent: "center" }}>＋</button>
                <button onClick={() => setDispAmt(v => String(Math.max(1, (parseInt(v) || 0) - 1)))} style={{ width: 36, height: 36, background: "#f1f5f9", border: "1.5px solid #e2e8f0", borderRadius: 8, cursor: "pointer", fontSize: 18, fontWeight: 700, color: "#1a2332", display: "flex", alignItems: "center", justifyContent: "center" }}>－</button>
              </div>
            </div>
          </Field>
          {dispAmt && !isNaN(parseInt(dispAmt)) && parseInt(dispAmt) > 0 && (
            <div style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#475569", textAlign: "center" }}>
              出庫後の在庫：<strong style={{ fontSize: 16 }}>{Math.max(0, Number(modal.item.stock) - parseInt(dispAmt))}</strong> {modal.item.unit}
            </div>
          )}
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setModal(null)} style={{ flex: 1, padding: "10px", background: "#f1f5f9", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, color: "#475569" }}>キャンセル</button>
            <button onClick={applyDisp} style={{ flex: 2, padding: "10px", background: modal.store.color, border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700, color: "#fff", fontSize: 14 }}>{modal.store.icon} {modal.store.name}へ出庫する</button>
          </div>
        </Modal>
      )}

      {modal && modal.type === "export" && (
        <Modal title="📤 CSVエクスポート" onClose={() => setModal(null)}>
          <textarea readOnly value={modal.csv} onClick={e => e.target.select()} style={{ width: "100%", height: 220, fontFamily: "monospace", fontSize: 12, padding: 10, borderRadius: 8, border: "1.5px solid #e2e8f0", background: "#f8fafc", color: "#1a2332", resize: "none", boxSizing: "border-box", outline: "none" }} />
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={() => setModal(null)} style={{ flex: 1, padding: "10px", background: "#f1f5f9", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, color: "#475569" }}>閉じる</button>
            <button onClick={() => {
              const ta = document.createElement("textarea");
              ta.value = modal.csv;
              ta.style.position = "fixed";
              ta.style.opacity = "0";
              document.body.appendChild(ta);
              ta.select();
              document.execCommand("copy");
              document.body.removeChild(ta);
            }} style={{ flex: 1, padding: "10px", background: "#1a2332", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700, color: "#fff", fontSize: 14 }}>📋 コピー</button>
            <button onClick={() => {
              const blob = new Blob([modal.csv], { type: "text/csv;charset=utf-8;" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `heavens_${new Date().toISOString().slice(0,10)}.csv`;
              a.click();
              URL.revokeObjectURL(url);
            }} style={{ flex: 1, padding: "10px", background: "#16a34a", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700, color: "#fff", fontSize: 14 }}>💾 保存</button>
          </div>
        </Modal>
      )}

      {modal && modal.type === "importConfirm" && (
        <Modal title="📥 CSVインポート確認" onClose={() => setModal(null)}>
          <div style={{ background: "#f0fdf4", border: "1.5px solid #bbf7d0", borderRadius: 10, padding: "12px 16px", marginBottom: 16 }}>
            <div style={{ fontWeight: 700, color: "#15803d", fontSize: 14, marginBottom: 4 }}>✅ {modal.parsed.length}件の商品を読み込みました</div>
            <div style={{ fontSize: 12, color: "#475569" }}>
              {modal.parsed.slice(0, 4).map((i, idx) => <div key={idx}>・{i.name}（{i.category}・{i.location}・在庫{i.stock}{i.unit}）</div>)}
              {modal.parsed.length > 4 && <div style={{ color: "#94a3b8" }}>… 他 {modal.parsed.length - 4}件</div>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setModal(null)} style={{ flex: 1, padding: "10px", background: "#f1f5f9", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, color: "#475569" }}>キャンセル</button>
            <button onClick={() => applyImport("append")} style={{ flex: 2, padding: "10px", background: "#2563eb", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700, color: "#fff" }}>＋ 既存に追加</button>
            <button onClick={() => applyImport("replace")} style={{ flex: 2, padding: "10px", background: "#dc2626", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700, color: "#fff" }}>🔄 全て置き換え</button>
          </div>
        </Modal>
      )}

      {importResult && (
        <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 2000, background: "#1a2332", color: "#fff", borderRadius: 12, padding: "14px 20px", boxShadow: "0 8px 24px rgba(0,0,0,0.2)", fontSize: 13 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <div style={{ fontWeight: 700 }}>✅ {importResult.added}件を{importResult.mode === "replace" ? "置き換え" : "追加"}しました</div>
            <button onClick={() => setImportResult(null)} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 18 }}>×</button>
          </div>
        </div>
      )}
    </div>
  );
}
