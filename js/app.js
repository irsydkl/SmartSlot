// ─── Supabase client (key dibaca dari js/env.js) ───────────────────────────
const sb = supabase.createClient(ENV.SUPABASE_URL, ENV.SUPABASE_KEY);

// ─── Tailwind custom colors ─────────────────────────────────────────────────
if (window.tailwind) tailwind.config = {
  theme: { extend: { colors: { cream: '#FEF9F3', sand: '#E7B2B5', blush: '#E7B2B5', wine: '#59624F' } } }
};

// ─── Auth helpers ────────────────────────────────────────────────────────────
let ME = null; // profil user yang sedang login (diisi oleh guard)

// retry = berapa kali coba ulang jika profil belum terbentuk oleh trigger
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
 * role = 'guest' | 'customer' | 'admin' | 'grand'
 * Jika akses tidak sesuai role → redirect ke halaman yang tepat.
 * Jika sesuai → tampilkan body (hapus class invisible) dan return profile.
 */
async function guard(role) {
  const p = await getProfile(role === 'guest' ? 0 : 3);
  const home = p?.role === 'admin' ? 'admin/dashboard.html' : 'customer/dashboard.html';
  let to = null;
  if      (role === 'guest'    && p)                       to = home;
  else if (role === 'customer' && p?.role !== 'customer')  to = p ? home : 'login.html';
  else if (role === 'admin'    && p?.role !== 'admin')     to = p ? home : 'admin/login.html';
  else if (role === 'grand'    && !(p?.role === 'admin' && p.is_grand_admin)) to = p ? home : 'admin/login.html';
  if (to) { location.replace(ROOT + to); return new Promise(() => {}); }
  ME = p;
  document.body.classList.remove('invisible');
  return p;
}

// ─── Login / Logout ──────────────────────────────────────────────────────────
async function doLogin(email, password, need) {
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return toast('Email atau password salah', false);
  const p = await getProfile(3);
  if (!p) {
    await sb.auth.signOut();
    return toast('Profil akun tidak ditemukan', false);
  }
  if (need === 'admin' && p.role !== 'admin') {
    await sb.auth.signOut();
    return toast('Akun ini bukan admin', false);
  }
  location.href = ROOT + (p.role === 'admin' ? 'admin/dashboard.html' : 'customer/dashboard.html');
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

// ─── Navbar ──────────────────────────────────────────────────────────────────
function mountNav(role) {
  const links = role === 'admin'
    ? [['dashboard.html','Dashboard'],['bookings.html','Booking'],['setting.html','Setting'],
       ...(ME?.is_grand_admin ? [['users.html','Kelola Akun']] : [])]
    : [['dashboard.html','Dashboard'],['bookings.html','Booking Saya']];
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
