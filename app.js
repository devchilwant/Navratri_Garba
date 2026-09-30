import { CONFIG } from "./config.local.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
  getFirestore, collection, doc, getDocs, getDoc, runTransaction,
  query, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const app = initializeApp(CONFIG.FIREBASE);
const db = getFirestore(app);

const els = {
  flatInput: document.getElementById("flatInput"),
  verifyBtn: document.getElementById("verifyBtn"),
  refreshBtn: document.getElementById("refreshBtn"),
  resultCard: document.getElementById("resultCard"),
  flatTable: document.getElementById("flatTable"),
  filterInput: document.getElementById("filterInput"),
  totalFlats: document.getElementById("totalFlats"),
  paidFlats: document.getElementById("paidFlats"),
  entriesToday: document.getElementById("entriesToday"),
  lastUpdated: document.getElementById("lastUpdated"),
  todayLabel: document.getElementById("todayLabel"),
  toast: document.getElementById("toast")
};

let flats = [];
let entries = new Map();

const dateKey = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const normalize = (v) => String(v ?? "").trim().toUpperCase();

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  setTimeout(() => els.toast.classList.remove("show"), 2800);
}

function parsePaid(v) {
  const x = normalize(v);
  return ["YES","Y","PAID","TRUE","1","हो","होय"].includes(x);
}

function findHeader(headers, names) {
  for (const n of names) {
    const i = headers.findIndex(h => normalize(h).replace(/[\s_-]+/g,"") === n);
    if (i >= 0) return i;
  }
  return -1;
}

async function loadSheet() {
  const url =
    `https://docs.google.com/spreadsheets/d/${encodeURIComponent(CONFIG.GOOGLE_SHEET_ID)}` +
    `/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(CONFIG.GOOGLE_SHEET_NAME)}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Google Sheet could not be read.");
  const text = await res.text();
  const json = JSON.parse(text.substring(text.indexOf("{"), text.lastIndexOf("}") + 1));

  const rows = json.table.rows.map(r => r.c.map(c => c?.v ?? ""));
  if (!rows.length) throw new Error("Google Sheet is empty.");

  const headers = rows[0].map(x => String(x));
  const flatIdx = findHeader(headers, ["FLAT","FLATNO","FLATNUMBER","FLATNUMBERNO"]);
  const countIdx = findHeader(headers, ["COUNT","MEMBERS","MEMBERCOUNT","ALLOWED","ALLOWEDCOUNT","NOOFPEOPLE"]);
  const paidIdx = findHeader(headers, ["PAID","CULTURALFUNDPAID","FUNDPaid".toUpperCase(),"PAYMENTSTATUS","STATUS"]);

  if (flatIdx < 0 || countIdx < 0 || paidIdx < 0) {
    throw new Error("Sheet headers must include Flat, Count/Members, and Paid/Payment Status.");
  }

  flats = rows.slice(1)
    .map(r => ({
      flat: normalize(r[flatIdx]),
      allowed: Number(r[countIdx]) || 0,
      paid: parsePaid(r[paidIdx])
    }))
    .filter(x => x.flat);

  flats.sort((a,b) => a.flat.localeCompare(b.flat, undefined, {numeric:true}));
}

async function loadEntries() {
  entries = new Map();
  const q = query(collection(db, "entryDays"), where("date", "==", dateKey()));
  const snap = await getDocs(q);
  snap.forEach(d => {
    const data = d.data();
    entries.set(normalize(data.flat), Number(data.approved || 0));
  });
}

function renderSummary() {
  els.totalFlats.textContent = flats.length;
  els.paidFlats.textContent = flats.filter(x => x.paid).length;
  let total = 0;
  entries.forEach(v => total += v);
  els.entriesToday.textContent = total;
  els.lastUpdated.textContent = `Updated ${new Date().toLocaleTimeString()}`;
}

function getFlat(flat) {
  return flats.find(x => normalize(x.flat) === normalize(flat));
}

function renderResult(flatNo) {
  const f = getFlat(flatNo);
  els.resultCard.classList.remove("hidden");

  if (!f) {
    els.resultCard.innerHTML = `<div class="status-box">
      <div class="status-head"><h2>Flat not found</h2><span class="badge no">NOT FOUND</span></div>
      <p class="muted">Check the flat number and try again.</p>
    </div>`;
    return;
  }

  const approved = entries.get(f.flat) || 0;
  const remaining = Math.max(0, f.allowed - approved);
  const canEnter = f.paid && remaining > 0;

  els.resultCard.innerHTML = `
    <div class="status-box">
      <div class="status-head">
        <div><h2>${escapeHtml(f.flat)}</h2><p class="muted">${f.paid ? "Cultural Fund paid" : "Cultural Fund not paid"}</p></div>
        <span class="badge ${canEnter ? "ok" : "no"}">${canEnter ? "ENTRY ALLOWED" : "ENTRY NOT ALLOWED"}</span>
      </div>
      <div class="counts">
        <div class="count"><span>Original Count</span><strong>${f.allowed}</strong></div>
        <div class="count"><span>Approved Today</span><strong>${approved}</strong></div>
        <div class="count"><span>Remaining</span><strong>${remaining}</strong></div>
      </div>
      <button id="approveBtn" class="approve" ${canEnter ? "" : "disabled"}>
        ${canEnter ? "Approve 1 Entry" : (f.paid ? "Daily Limit Reached" : "Fund Not Paid")}
      </button>
    </div>`;

  const btn = document.getElementById("approveBtn");
  if (canEnter) {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.textContent = "Processing...";
      try {
        await approveEntry(f.flat, f.allowed);
        await loadEntries();
        renderSummary();
        renderResult(f.flat);
        renderTable();
        showToast(`Entry approved for ${f.flat}.`);
      } catch (e) {
        console.error(e);
        showToast(e.message || "Could not approve entry.");
        renderResult(f.flat);
      }
    });
  }
}

async function approveEntry(flat, allowed) {
  const id = `${dateKey()}_${safeId(flat)}`;
  const ref = doc(db, "entryDays", id);

  await runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    const current = snap.exists() ? Number(snap.data().approved || 0) : 0;

    if (current >= allowed) {
      throw new Error("Daily limit has already been reached.");
    }

    tx.set(ref, {
      date: dateKey(),
      flat: flat,
      approved: current + 1,
      updatedAt: serverTimestamp()
    }, { merge: true });
  });
}

function renderTable() {
  const filter = normalize(els.filterInput.value);
  els.flatTable.innerHTML = flats
    .filter(f => !filter || f.flat.includes(filter))
    .map(f => {
      const approved = entries.get(f.flat) || 0;
      const remaining = Math.max(0, f.allowed - approved);
      const status = !f.paid ? `<span class="bad">Not Paid</span>` :
        remaining <= 0 ? `<span class="bad">Full</span>` :
        `<span class="good">Open</span>`;
      return `<tr>
        <td><strong>${escapeHtml(f.flat)}</strong></td>
        <td>${f.allowed}</td>
        <td>${approved}</td>
        <td>${remaining}</td>
        <td>${status}</td>
      </tr>`;
    }).join("");
}

function safeId(s) {
  return normalize(s).replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

async function refresh() {
  try {
    els.refreshBtn.disabled = true;
    await loadSheet();
    await loadEntries();
    renderSummary();
    renderTable();
    const current = els.flatInput.value.trim();
    if (current) renderResult(current);
  } catch (e) {
    console.error(e);
    showToast(e.message || "Refresh failed.");
  } finally {
    els.refreshBtn.disabled = false;
  }
}

els.verifyBtn.addEventListener("click", () => renderResult(els.flatInput.value));
els.flatInput.addEventListener("keydown", e => {
  if (e.key === "Enter") renderResult(els.flatInput.value);
});
els.filterInput.addEventListener("input", renderTable);
els.refreshBtn.addEventListener("click", refresh);
els.todayLabel.textContent = new Date().toLocaleDateString(undefined, {weekday:"long", year:"numeric", month:"long", day:"numeric"});

refresh();
