// ─── Supabase client (key dibaca dari js/env.js) ───────────────────────────
const sb = supabase.createClient(ENV.SUPABASE_URL, ENV.SUPABASE_KEY);

// ─── Tailwind custom colors ─────────────────────────────────────────────────
if (window.tailwind) tailwind.config = {
  theme: { extend: { colors: { cream: '#FEF9F3', sand: '#E7B2B5', blush: '#E7B2B5', wine: '#59624F' } } }
};

// ─── Helpers ────────────────────────────────────────────────────────────────
const $ = (s) => document.querySelector(s);
// Halaman di folder admin/ perlu naik satu level ke root
const ROOT = /\/admin\//.test(location.pathname) ? '../' : '';

const DAYS   = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
const STATUS = { pending:'Menunggu', approved:'Disetujui', rejected:'Ditolak', cancelled:'Dibatalkan', completed:'Selesai' };

const rupiah = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
const ico    = (n) => `<img src="${ROOT}assets/icons/${n}.png" alt="${n}" class="w-4 h-4">`;
const today  = ()  => new Date().toLocaleDateString('sv-SE');
const hm     = (t) => (t || '').slice(0, 5);
const fd     = (d) => new Date(d + 'T00:00').toLocaleDateString('id-ID', { weekday:'short', day:'numeric', month:'short', year:'numeric' });
const esc    = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const badge  = (s) => `<span class="px-3 py-1 rounded-full text-xs ${{ pending:'bg-sand', approved:'bg-wine text-cream', rejected:'bg-blush', cancelled:'bg-blush/50', completed:'bg-sand/60' }[s]}">${STATUS[s]}</span>`;

// ─── Toast notification ──────────────────────────────────────────────────────
function toast(msg, ok = true) {
  const t = document.createElement('div');
  t.textContent = msg;
  t.className = `fixed top-4 right-4 z-[60] px-4 py-2 rounded-full text-sm shadow ${ok ? 'bg-wine text-cream' : 'bg-blush text-wine'}`;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// ─── Modal helpers ───────────────────────────────────────────────────────────
const openModal  = (id) => $('#' + id).classList.remove('hidden');
const closeModal = (id) => $('#' + id).classList.add('hidden');

// ─── Auth helpers (hanya admin) ──────────────────────────────────────────────
let ME = null; // profil admin yang sedang login (diisi oleh guard)

async function getProfile(retry = 0) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return null;
  for (let i = 0; i <= retry; i++) {
    const { data } = await sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
    if (data) return data;
    if (i < retry) await new Promise((r) => setTimeout(r, 600));
  }
  return null;
}

/**
 * Route guard.
 * role = 'guest' (halaman login) | 'admin' | 'grand' (khusus grand admin)
 */
async function guard(role) {
  const p = await getProfile(role === 'guest' ? 0 : 3);
  let to = null;
  if (role === 'guest') {
    if (p?.role === 'admin') to = 'admin/dashboard.html';
  } else if (!p) {
    to = 'admin/login.html';
  } else if (p.role !== 'admin') {
    await sb.auth.signOut();
    to = 'index.html';
  } else if (role === 'grand' && !p.is_grand_admin) {
    to = 'admin/dashboard.html';
  }
  if (to) { location.replace(ROOT + to); return new Promise(() => {}); }
  ME = p;
  document.body.classList.remove('invisible');
  return p;
}

// ─── Login / Logout ──────────────────────────────────────────────────────────
async function doLogin(email, password) {
  const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
  if (error) return toast('Email atau password salah', false);
  const p = await getProfile(3);
  if (!p || p.role !== 'admin') { await sb.auth.signOut(); return toast('Akun ini bukan admin', false); }
  location.href = ROOT + 'admin/dashboard.html';
}

async function logout() {
  await sb.auth.signOut();
  location.href = ROOT + 'index.html';
}

function confirmLogout() {
  const el = document.createElement('div');
  el.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-wine/40 backdrop-blur-sm';
  el.innerHTML = `
    <div class="bg-cream rounded-2xl shadow-xl p-8 w-full max-w-sm text-center space-y-5">
      <div class="w-14 h-14 rounded-full bg-sand/60 flex items-center justify-center mx-auto">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-7 h-7 text-wine" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
        </svg>
      </div>
      <div>
        <h3 class="text-xl font-bold font-display text-wine">Yakin ingin keluar?</h3>
        <p class="text-sm opacity-60 mt-1">Kamu akan melakukan login lagi.</p>
      </div>
      <div class="flex gap-3 justify-center">
        <button id="_lcancel" class="btn btn-soft">Batal</button>
        <button id="_lconfirm" class="btn btn-primary">Ya, Keluar</button>
      </div>
    </div>`;
  document.body.appendChild(el);
  el.querySelector('#_lcancel').onclick  = () => el.remove();
  el.querySelector('#_lconfirm').onclick = () => logout();
  el.addEventListener('click', (e) => { if (e.target === el) el.remove(); });
}

// ─── Navbar admin ────────────────────────────────────────────────────────────
function mountNav() {
  const links = [['dashboard.html','Dashboard'],['bookings.html','Booking'],['setting.html','Setting'],
    ...(ME?.is_grand_admin ? [['users.html','Kelola Admin']] : [])];
  const cur = location.pathname.split('/').pop();
  $('#nav').innerHTML = `<div class="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
    <img class="h-[50px]" src="${ROOT}assets/images/SmartSlot.png" alt="SmartSlot">
    <nav class="flex items-center gap-1 text-sm flex-wrap">
      ${links.map(([h, t]) => `<a href="${h}" class="px-3 py-1.5 rounded-full ${cur === h ? 'bg-wine text-cream' : 'hover:bg-sand'}">${t}</a>`).join('')}
      <button onclick="confirmLogout()" class="px-3 py-1.5 rounded-full hover:bg-sand">Keluar</button>
    </nav></div>`;
}

// ─── Storage ─────────────────────────────────────────────────────────────────
async function viewProof(path) {
  const w = window.open('', '_blank');
  const { data, error } = await sb.storage.from('deposit-proofs').createSignedUrl(path, 3600);
  if (error) { w.close(); return toast('Gagal membuka bukti', false); }
  w.location = data.signedUrl;
}

// ─── Generic save ────────────────────────────────────────────────────────────
async function save(q, reload) {
  const { error } = await q;
  if (error) { toast(error.message, false); return false; }
  toast('Tersimpan');
  if (reload) reload();
}

// ─── Dynamic form modal ──────────────────────────────────────────────────────
// fields: [{ name, label, type, options, required }]
function formModal({ title, fields, values = {}, onSubmit }) {
  const el = document.createElement('div');
  el.className = 'modal';
  el.innerHTML = `<div><h3 class="text-2xl font-bold mb-4">${title}</h3><form class="space-y-3">
    ${fields.map((f) => {
      const ctrl =
        f.type === 'select'   ? `<select name="${f.name}" class="input">${f.options.map(([v,t]) => `<option value="${v}">${t}</option>`).join('')}</select>` :
        f.type === 'textarea' ? `<textarea name="${f.name}" rows="3" class="input"></textarea>` :
        f.type === 'checkbox' ? `<input type="checkbox" name="${f.name}" class="w-5 h-5 accent-[#59624F]">` :
                                `<input name="${f.name}" type="${f.type || 'text'}" class="input" ${f.required === false ? '' : 'required'}>`;
      return `<div><label class="label">${f.label}</label>${ctrl}</div>`;
    }).join('')}
    <div class="flex justify-end gap-2 pt-2"><button type="button" data-x class="btn btn-soft">Batal</button><button class="btn btn-primary">Simpan</button></div>
  </form></div>`;
  document.body.appendChild(el);
  const form = el.querySelector('form');
  fields.forEach((f) => {
    const v = values[f.name], i = form.elements[f.name];
    if (v === undefined || v === null || !i) return;
    f.type === 'checkbox' ? (i.checked = !!v) : (i.value = v);
  });
  el.querySelector('[data-x]').onclick = () => el.remove();
  form.onsubmit = async (e) => {
    e.preventDefault();
    const out = {};
    fields.forEach((f) => {
      const i = form.elements[f.name];
      out[f.name] = f.type === 'checkbox' ? i.checked : f.type === 'number' ? Number(i.value) : i.value;
    });
    if ((await onSubmit(out)) !== false) el.remove();
  };
}