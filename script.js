// Configurações Oficiais do Firebase
const OFICINA_WHATSAPP = "99999999999";
const OFICINA_NOME = "Mecânica do Carlim";
const OFICINA_ENDERECO = "Manutenção Automotiva Geral - Carlim";

const firebaseConfig = {
  apiKey: "AIzaSyA30qc2LHwpMHRn1CBEjYeHBlt5UheBPrI",
  authDomain: "carlim-mecanica.firebaseapp.com",
  projectId: "carlim-mecanica",
  storageBucket: "carlim-mecanica.firebasestorage.app",
  messagingSenderId: "805458351068",
  appId: "1:805458351068:web:9c5ece2f1817dcb03ef519",
  measurementId: "G-0G36FQ0NE8"
};

// Inicializa o Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

let clients = [];
let quotes = [];
let orders = [];
let transactions = [];
let inventory = [];
let tempQuoteItems = { services: [], parts: [] };
let activeOSDetailId = null;
let activeOSFilter = "todas";

// Monitor de Estado de Autenticação (Abre e fecha as telas com base no login)
auth.onAuthStateChanged(user => {
  if (user) {
    document.getElementById('screen-login').classList.add('hidden');
    document.getElementById('app-container').classList.remove('hidden');
    startRealtimeSync();
    switchScreen('dashboard');
  } else {
    document.getElementById('screen-login').classList.remove('hidden');
    document.getElementById('app-container').classList.add('hidden');
  }
});

function getWhatsAppUrl(phone) {
  const cleanPhone = phone.replace(/\D/g, "");
  return `https://wa.me/${cleanPhone.startsWith("55") ? "" : "55"}${cleanPhone}`;
}

function formatSeqNumber(num) {
  return num ? "#" + String(num).padStart(2, '0') : "#01";
}

// Funções Auxiliares de Sanitização
function cleanPlateNumber(plate) {
  return String(plate || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// Controle de Barra Lateral Responsiva
function toggleSidebar(show) {
  const sidebar = document.querySelector('aside');
  const overlay = document.getElementById('sidebar-overlay');
  if (sidebar && overlay) {
    if (show) {
      sidebar.classList.remove('-translate-x-full');
      overlay.classList.remove('hidden');
    } else {
      sidebar.classList.add('-translate-x-full');
      overlay.classList.add('hidden');
    }
  }
}

// Funções de UI (Toast/Confirm)
function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');
  if (!container) { alert(message); return; }
  const toast = document.createElement('div');
  toast.className = `toast-item flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-xl text-xs font-semibold text-white ${type === 'success' ? 'bg-emerald-600' : type === 'error' ? 'bg-red-600' : 'bg-[#0056b3]'}`;
  toast.style.cssText = 'width:100%; backdrop-filter:blur(4px);';
  toast.innerHTML = `<span class="flex-1">${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.classList.add('removing'); setTimeout(() => toast.remove(), 280); }, duration);
}

function showConfirm(message, onConfirm) {
  const modal = document.getElementById('confirm-modal');
  const msgEl = document.getElementById('confirm-message');
  const btnOk = document.getElementById('confirm-ok');
  const btnCancel = document.getElementById('confirm-cancel');
  if (!modal || !msgEl || !btnOk || !btnCancel) return;
  msgEl.textContent = message;
  modal.classList.remove('hidden');
  const close = () => modal.classList.add('hidden');
  btnOk.onclick = () => { close(); onConfirm(); };
  btnCancel.onclick = close;
}

// -------------------------------------------------------------
// SISTEMA DE AUTENTICAÇÃO (FIREBASE AUTH)
// -------------------------------------------------------------
function handleLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pass = document.getElementById('login-pass').value;
  if (!email || !pass) {
    showToast("Preencha o e-mail e a senha.", "error");
    return;
  }
  auth.signInWithEmailAndPassword(email, pass)
    .then(() => {
      showToast("Acesso concedido!", "success");
    })
    .catch(error => {
      showToast("Erro ao entrar: " + translateAuthError(error.code), "error");
    });
}

function handleRegister() {
  const email = document.getElementById('register-email').value.trim();
  const pass = document.getElementById('register-pass').value;
  if (!email || !pass) {
    showToast("Preencha todos os campos do cadastro.", "error");
    return;
  }
  if (pass.length < 6) {
    showToast("A senha deve conter no mínimo 6 caracteres.", "warning");
    return;
  }
  auth.createUserWithEmailAndPassword(email, pass)
    .then(() => {
      showToast("Cadastro realizado com sucesso!", "success");
      toggleRegisterForm(false);
    })
    .catch(error => {
      showToast("Erro ao cadastrar: " + translateAuthError(error.code), "error");
    });
}

function handleLogout() {
  showConfirm("Deseja realmente sair do sistema?", () => {
    auth.signOut().then(() => {
      showToast("Sessão finalizada.", "info");
    });
  });
}

function handlePasswordChange() {
  const email = document.getElementById('pass-email-confirm').value.trim();
  const currentPass = document.getElementById('pass-current').value;
  const newPass = document.getElementById('pass-new').value;

  if (!email || !currentPass || !newPass) {
    showToast("Preencha todos os campos para prosseguir.", "warning");
    return;
  }
  if (newPass.length < 6) {
    showToast("A nova senha deve ter pelo menos 6 caracteres.", "warning");
    return;
  }

  const user = auth.currentUser;
  if (!user) {
    showToast("Usuário não identificado.", "error");
    return;
  }

  const credential = firebase.auth.EmailAuthProvider.credential(email, currentPass);
  user.reauthenticateWithCredential(credential)
    .then(() => {
      user.updatePassword(newPass)
        .then(() => {
          showToast("Senha alterada com sucesso!", "success");
          togglePasswordChange(false);
          document.getElementById('pass-email-confirm').value = '';
          document.getElementById('pass-current').value = '';
          document.getElementById('pass-new').value = '';
        })
        .catch(error => {
          showToast("Erro ao atualizar senha: " + translateAuthError(error.code), "error");
        });
    })
    .catch(error => {
      showToast("Erro na reautenticação: " + translateAuthError(error.code), "error");
    });
}

function toggleRegisterForm(show) {
  document.getElementById('login-form-container').classList.toggle('hidden', show);
  document.getElementById('register-form-container').classList.toggle('hidden', !show);
  document.getElementById('password-change-container').classList.add('hidden');
}

function togglePasswordChange(show) {
  document.getElementById('login-form-container').classList.toggle('hidden', show);
  document.getElementById('password-change-container').classList.toggle('hidden', !show);
  document.getElementById('register-form-container').classList.add('hidden');
}

function translateAuthError(code) {
  switch (code) {
    case 'auth/invalid-email': return 'E-mail em formato inválido.';
    case 'auth/user-disabled': return 'Este usuário está desativado.';
    case 'auth/user-not-found': return 'Usuário não cadastrado.';
    case 'auth/wrong-password': return 'Senha incorreta.';
    case 'auth/email-already-in-use': return 'Este e-mail já está em uso.';
    case 'auth/weak-password': return 'A senha fornecida é muito fraca.';
    case 'auth/invalid-credential': return 'Dados de acesso incorretos.';
    default: return code;
  }
}

// -------------------------------------------------------------
// SINCRONIZAÇÃO DIRETA COM FIREBASE (SEM API EXTERNA)
// -------------------------------------------------------------
function startRealtimeSync() {
  db.collection("clients").onSnapshot(snap => {
    clients = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    populateClientSelects();
    renderClients();
  });
  db.collection("quotes").onSnapshot(snap => {
    quotes = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderQuotesPipeline();
  });
  db.collection("orders").onSnapshot(snap => {
    orders = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderDashboardOS();
    renderOSList();
    updateGlobalCounters();
    if (activeOSDetailId) renderOSDetailContent();
  });
  db.collection("transactions").onSnapshot(snap => {
    transactions = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderFinance();
  });
  db.collection("inventory").onSnapshot(snap => {
    inventory = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderInventory();
  });
}

function switchScreen(screenId) {
  toggleSidebar(false); // Fecha menu lateral em celulares ao mudar de tela
  document.querySelectorAll('main').forEach(m => m.classList.add('hidden'));
  document.getElementById(`screen-${screenId}`).classList.remove('hidden');
  populateClientSelects();
  if (screenId === 'dashboard') renderDashboardOS();
  else if (screenId === 'clients') renderClients();
  else if (screenId === 'os-list') renderOSList();
  else if (screenId === 'quotes-list') renderQuotesPipeline();
  else if (screenId === 'finance') renderFinance();
  else if (screenId === 'inventory') renderInventory();
}

// Funções de Cliente (Direto no Firebase)
document.getElementById('form-client')?.addEventListener('submit', function(e) {
  e.preventDefault();
  const rawPlate = document.getElementById('client-plate').value;
  const c = {
    name: document.getElementById('client-name').value.toUpperCase(),
    phone: document.getElementById('client-phone').value,
    plate: cleanPlateNumber(rawPlate), // Armazena a placa sem hífens ou espaços
    carBrand: document.getElementById('client-car-brand').value.toUpperCase(),
    carModel: document.getElementById('client-car-model').value.toUpperCase(),
    carYear: document.getElementById('client-car-year').value
  };
  db.collection("clients").add(c).then(() => { this.reset(); showToast("Salvo!", 'success'); });
});

function renderClients() {
  const container = document.getElementById('clients-list-container');
  if (!container) return;
  container.innerHTML = clients.length === 0 ? `<p class="text-xs text-slate-400 text-center">Nenhum cliente.</p>` : 
    clients.map(c => `
      <div class="bg-white p-3 border rounded-xl shadow-sm">
        <div class="flex justify-between">
          <h4 class="font-bold text-xs">${c.name}</h4>
          <div>
            <button onclick="openEditModal('${c.id}')" class="text-blue-500 text-[10px] mr-2">Editar</button>
            <button onclick="deleteClient('${c.id}')" class="text-red-500 text-[10px]">Excluir</button>
          </div>
        </div>
        <p class="text-[10px] text-slate-500">${c.carBrand} ${c.carModel} - ${c.plate}</p>
      </div>`).join("");
}

function deleteClient(id) {
  showConfirm("Excluir cliente?", () => db.collection("clients").doc(id).delete().then(() => showToast("Removido!", 'info')));
}

function populateClientSelects() {
  const s = document.getElementById('quote-select-client');
  if (s) s.innerHTML = '<option value="">-- Selecione o Cliente --</option>' + clients.map(c => `<option value="${c.id}">${c.name}</option>`).join("");
}

// Edição de Clientes
function openEditModal(clientId) {
  const client = clients.find(c => c.id === clientId);
  if (!client) return;
  document.getElementById('edit-client-id').value = clientId;
  document.getElementById('edit-client-name').value = client.name || "";
  document.getElementById('edit-client-phone').value = client.phone || "";
  document.getElementById('edit-client-car-brand').value = client.carBrand || "";
  document.getElementById('edit-client-car-model').value = client.carModel || "";
  document.getElementById('edit-client-plate').value = client.plate || "";
  document.getElementById('edit-client-car-year').value = client.carYear || "";
  document.getElementById('modal-edit-client').classList.remove('hidden');
}

function closeEditModal() {
  document.getElementById('modal-edit-client').classList.add('hidden');
}

function saveEditedClient() {
  const id = document.getElementById('edit-client-id').value;
  const rawPlate = document.getElementById('edit-client-plate').value;
  const updatedData = {
    name: document.getElementById('edit-client-name').value.toUpperCase(),
    phone: document.getElementById('edit-client-phone').value,
    plate: cleanPlateNumber(rawPlate),
    carBrand: document.getElementById('edit-client-car-brand').value.toUpperCase(),
    carModel: document.getElementById('edit-client-car-model').value.toUpperCase(),
    carYear: document.getElementById('edit-client-car-year').value
  };
  db.collection("clients").doc(id).update(updatedData)
    .then(() => {
      showToast("Cliente atualizado!", "success");
      closeEditModal();
    })
    .catch(err => {
      showToast("Erro ao atualizar: " + err.message, "error");
    });
}

function updateGlobalCounters() {
  const activeOS = orders.filter(o => o.status !== "concluida");
  const counter = document.getElementById('active-os-counter');
  if (counter) counter.textContent = activeOS.length;
  renderFinance();
}

// Orçamentos
function renderQuotesPipeline() {
  const container = document.getElementById('quotes-pipeline-container');
  if (!container) return;
  container.innerHTML = quotes.length === 0
    ? `<p class="text-xs text-slate-400 text-center py-4">Nenhum orçamento cadastrado.</p>`
    : quotes.map(q => {
        const c = clients.find(cl => cl.id === q.clientId) || { name: "Removido" };
        const status = q.status === "aguardando" ? `<span class="text-[9px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded">Aguardando</span>` : q.status === "aprovado" ? `<span class="text-[9px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded">Aprovado</span>` : `<span class="text-[9px] bg-red-100 text-red-800 font-bold px-2 py-0.5 rounded">Recusado</span>`;
        const act = q.status === "aguardando" ? `<button onclick="approveQuote('${q.id}')" class="flex-1 bg-emerald-600 text-white font-bold py-1.5 rounded text-[10px]">Aprovar e OS</button>` : "";
        const servicesList = q.services || [];
        const partsList = q.parts || [];
        const tot = servicesList.reduce((a, s) => a + s.price, 0) + partsList.reduce((a, p) => a + (p.price * p.qty), 0);
        return `
          <div class="bg-white p-3 border border-slate-200 rounded-xl shadow-sm space-y-3">
            <div class="flex justify-between items-start">
              <div><h4 class="font-bold text-xs text-slate-800 uppercase">${formatSeqNumber(q.seqNumber)} - ${c.name}</h4><p class="text-[10px] text-slate-400">Problema: "${q.problem}"</p></div>
              <div class="text-right">${status}<p class="text-[10px] font-bold text-slate-500 mt-1">R$ ${tot.toFixed(2)}</p></div>
            </div>
            <div class="flex gap-1.5 border-t pt-2.5 flex-wrap">
              ${act}
              <button onclick="sharePDFViaSystem('quote', '${q.id}')" class="flex-1 bg-blue-600 text-white font-bold py-2.5 rounded-xl text-xs hover:bg-blue-700 transition">Compartilhar PDF</button>
              <button onclick="deleteQuote('${q.id}')" class="text-red-500 hover:text-red-700 font-bold text-[10px] px-2">Excluir</button>
            </div>
          </div>`;
      }).join("");
}

function deleteQuote(id) {
  showConfirm("Remover este orçamento permanentemente?", () => {
    db.collection("quotes").doc(id).delete()
      .then(() => showToast("Orçamento removido.", 'info'))
      .catch(e => showToast("Erro ao remover: " + e.message, 'error'));
  });
}

function saveAndPipelineQuote() {
  const clientId = document.getElementById('quote-select-client').value;
  const problem = document.getElementById('quote-problem-desc').value;
  const odometer = document.getElementById('quote-odometer').value || "0";
  const paymentMethod = document.getElementById('quote-select-payment').value;
  if (!clientId) { showToast("Selecione um cliente!", 'warning'); return; }
  let maxSeq = 0;
  quotes.forEach(q => { if (q.seqNumber && q.seqNumber > maxSeq) maxSeq = q.seqNumber; });
  const nextSeq = maxSeq + 1;
  const newId = "quote-" + Date.now().toString();
  const newQuote = {
    clientId, problem: problem || "Ajustes preventivos.", date: new Date().toLocaleDateString('pt-BR'), status: "aguardando", paymentMethod, odometer, seqNumber: nextSeq,
    inspection: {
      fuel: document.getElementById('quote-fuel').value,
      lataria: document.getElementById('quote-chk-lataria').checked,
      estepe: document.getElementById('quote-chk-estepe').checked,
      ferramentas: document.getElementById('quote-chk-ferramentas').checked,
      triangulo: document.getElementById('quote-chk-triangulo').checked,
      luzes: document.getElementById('quote-chk-luzes').checked,
      radio: document.getElementById('quote-chk-radio').checked,
      notes: document.getElementById('quote-inspection-notes').value || "Sem observações."
    },
    services: [...tempQuoteItems.services], parts: [...tempQuoteItems.parts]
  };
  db.collection("quotes").doc(newId).set(newQuote).then(() => {
    resetQuoteForm();
    switchScreen('quotes-list');
  });
}

function addQuoteItem(type) {
  if (type === 'service') {
    const desc = document.getElementById('quote-service-desc').value.trim().toUpperCase();
    const price = parseFloat(document.getElementById('quote-service-price').value);
    if (!desc || isNaN(price) || price <= 0) { showToast('Preencha os campos.', 'warning'); return; }
    tempQuoteItems.services.push({ desc, price });
    document.getElementById('quote-service-desc').value = '';
    document.getElementById('quote-service-price').value = '';
  } else {
    const desc = document.getElementById('quote-part-desc').value.trim().toUpperCase();
    const price = parseFloat(document.getElementById('quote-part-price').value);
    const qty = parseInt(document.getElementById('quote-part-qty').value) || 1;
    if (!desc || isNaN(price) || price <= 0) { showToast('Preencha os campos.', 'warning'); return; }
    tempQuoteItems.parts.push({ desc, price, qty });
    document.getElementById('quote-part-desc').value = '';
    document.getElementById('quote-part-price').value = '';
    document.getElementById('quote-part-qty').value = '1';
  }
  renderQuoteFormItems();
}

function removeQuoteItem(type, index) {
  if (type === 'service') tempQuoteItems.services.splice(index, 1);
  else tempQuoteItems.parts.splice(index, 1);
  renderQuoteFormItems();
}

function renderQuoteFormItems() {
  const servicesList = document.getElementById('quote-services-list');
  const partsList = document.getElementById('quote-parts-list');
  const totalPreview = document.getElementById('quote-total-preview');
  if (servicesList) servicesList.innerHTML = tempQuoteItems.services.map((s, i) => `<li class="py-1.5 flex justify-between"><span>${s.desc}</span><div><span class="font-bold">R$ ${s.price.toFixed(2)}</span><button onclick="removeQuoteItem('service', ${i})" class="text-red-500 ml-2">✕</button></div></li>`).join("");
  if (partsList) partsList.innerHTML = tempQuoteItems.parts.map((p, i) => `<li class="py-1.5 flex justify-between"><span>${p.desc} (x${p.qty})</span><div><span class="font-bold">R$ ${(p.price * p.qty).toFixed(2)}</span><button onclick="removeQuoteItem('part', ${i})" class="text-red-500 ml-2">✕</button></div></li>`).join("");
  const total = tempQuoteItems.services.reduce((a, s) => a + s.price, 0) + tempQuoteItems.parts.reduce((a, p) => a + (p.price * p.qty), 0);
  if (totalPreview) totalPreview.textContent = `R$ ${total.toFixed(2)}`;
}

function resetQuoteForm() {
  tempQuoteItems = { services: [], parts: [] };
  ['quote-service-desc', 'quote-service-price', 'quote-part-desc', 'quote-part-price', 'quote-problem-desc', 'quote-inspection-notes', 'quote-odometer'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('quote-part-qty').value = '1';
  document.getElementById('quote-fuel').value = '1/2';
  ['quote-chk-lataria', 'quote-chk-estepe', 'quote-chk-ferramentas', 'quote-chk-triangulo', 'quote-chk-luzes', 'quote-chk-radio'].forEach(id => {
    const chk = document.getElementById(id);
    if (chk) chk.checked = false;
  });
  renderQuoteFormItems();
}

function approveQuote(quoteId) {
  const quote = quotes.find(q => q.id === quoteId);
  if (!quote) return;
  db.collection("quotes").doc(quoteId).update({ status: "aprovado" }).then(() => {
    showToast("Orçamento aprovado!", 'success');
    const newOS = {
      clientId: quote.clientId, problem: `[APROVADO] ${quote.problem}`, date: new Date().toLocaleDateString('pt-BR'), status: "aberta", paymentMethod: quote.paymentMethod || "pix", odometer: quote.odometer || "0", seqNumber: quote.seqNumber || 1,
      inspection: quote.inspection || { fuel: "1/2", lataria: false, estepe: false, ferramentas: false, triangulo: false, luzes: false, radio: false, notes: "Sem vistoria." },
      services: [...quote.services], parts: [...quote.parts]
    };
    db.collection("orders").doc("OS-" + quoteId).set(newOS).then(() => switchScreen('os-list'));
  });
}

// Ordens de Serviço (OS)
function filterOS(status) {
  activeOSFilter = status;
  ['todas', 'aberta', 'funcionamento', 'concluida'].forEach(tab => {
    const btn = document.getElementById(`tab-os-${tab}`);
    if (btn) btn.className = "flex-1 py-2 text-center rounded-lg hover:bg-slate-50 transition " + (tab === status ? "font-bold border-b-2 border-blue-600 text-blue-600" : "text-slate-500");
  });
  renderOSList();
}

function renderOSList() {
  const container = document.getElementById('os-list-container');
  if (!container) return;
  container.innerHTML = "";
  let filtered = activeOSFilter === "todas" ? orders : orders.filter(o => o.status === activeOSFilter);
  container.innerHTML = filtered.map(os => {
    const c = clients.find(cl => cl.id === os.clientId) || { name: "Removido", carModel: "N/A" };
    const servicesList = os.services || [];
    const partsList = os.parts || [];
    const tot = servicesList.reduce((a, s) => a + s.price, 0) + partsList.reduce((a, p) => a + (p.price * p.qty), 0);
    return `
      <div class="bg-white p-3 border border-slate-200 rounded-xl shadow-sm flex flex-col justify-between">
        <div class="flex justify-between items-start cursor-pointer" onclick="openOSDetail('${os.id}')">
          <div class="flex items-start gap-2.5">
            <div class="w-7 h-7 rounded-full border-2 flex items-center justify-center font-bold text-xs">···</div>
            <div><h4 class="font-bold text-xs text-slate-800 uppercase">${c.name}</h4><p class="text-[10px] text-slate-500">"${os.problem}"</p></div>
          </div>
          <div class="text-right"><span class="text-[9px] font-bold px-2 py-0.5 rounded bg-slate-100">${os.status}</span><p class="text-[10px] font-bold text-slate-500 mt-1">${formatSeqNumber(os.seqNumber)}</p></div>
        </div>
        <div class="border-t border-dashed border-slate-200 my-2 pt-2 flex flex-col sm:flex-row gap-2 justify-between items-start sm:items-center text-[10px]">
          <span>Carro: <strong>${c.carModel}</strong> (${c.plate})</span>
          <div class="flex items-center gap-2 justify-between w-full sm:w-auto">
            <span class="font-bold text-slate-800 text-[11px] bg-slate-100 px-1.5 py-0.5 rounded">R$ ${tot.toFixed(2)}</span>
            <button onclick="openOSDetail('${os.id}')" class="text-[#0056b3] font-bold">Ver Processo &rarr;</button>
          </div>
        </div>
      </div>`;
  }).join("");
}

function renderDashboardOS() {
  const container = document.getElementById('dashboard-os-list');
  if (!container) return;
  const activeOS = orders.filter(o => o.status !== "concluida");
  container.innerHTML = activeOS.map(os => {
    const c = clients.find(cl => cl.id === os.clientId) || { name: "Desconhecido", carModel: "N/A" };
    const servicesList = os.services || [];
    const partsList = os.parts || [];
    const tot = servicesList.reduce((a, s) => a + s.price, 0) + partsList.reduce((a, p) => a + (p.price * p.qty), 0);
    return `
      <div class="bg-slate-50 p-3 border border-slate-200 rounded-xl shadow-sm space-y-2">
        <div class="flex justify-between items-start cursor-pointer" onclick="openOSDetail('${os.id}')">
          <div class="text-xs">
            <div class="flex items-center gap-1.5"><h4 class="font-bold text-slate-800 uppercase text-sm">${c.name}</h4><a href="${getWhatsAppUrl(c.phone)}" target="_blank" class="text-emerald-500" onclick="event.stopPropagation()"><svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12.012 2c-5.506 0-9.988 4.482-9.988 9.988 0 1.761.453 3.42 1.242 4.877l-1.32 4.838 4.977-1.304c1.401.761 3 1.189 4.689 1.189 5.506 0 9.988-4.482 9.988-9.988C22 6.482 17.518 2 12.012 2zm.006 16.512c-1.572 0-3.048-.426-4.32-1.164l-.306-.18-2.952.774.792-2.886-.204-.324a8.125 8.125 0 01-1.242-4.32c0-4.506 3.666-8.172 8.172-8.172s8.172 3.666 8.172 8.172-3.666 8.172-8.172 8.172z"/></svg></a></div>
            <p class="text-[10px] text-slate-500 mt-0.5">Veículo: <strong>${c.carBrand} ${c.carModel}</strong></p>
          </div>
          <div class="text-right flex flex-col items-end gap-1">
            <span class="text-[9px] bg-orange-100 text-orange-800 font-bold px-2 py-0.5 rounded">${os.status}</span>
            <span class="text-[10px] font-extrabold text-[#0056b3]">OS ${formatSeqNumber(os.seqNumber)}</span>
          </div>
        </div>
        <div class="border-t border-dashed border-slate-200 pt-2 flex justify-between items-center text-[10px]">
          <div class="plate-mercosul"><div class="plate-header">BRASIL</div><div class="plate-digits">${c.plate}</div></div>
          <span class="font-extrabold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border">R$ ${tot.toFixed(2)}</span>
        </div>
      </div>`;
  }).join("");
}

function openOSDetail(osId) {
  activeOSDetailId = osId;
  switchScreen('os-detail');
  renderOSDetailContent();
}

function renderOSDetailContent() {
  const os = orders.find(o => o.id === activeOSDetailId);
  const container = document.getElementById('os-detail-card');
  if (!os || !container) return;
  const c = clients.find(cl => cl.id === os.clientId) || { name: "N/A", carModel: "N/A" };
  const servicesList = os.services || [];
  const partsList = os.parts || [];
  const tot = servicesList.reduce((a, s) => a + s.price, 0) + partsList.reduce((a, p) => a + (p.price * p.qty), 0);
  const insp = os.inspection || { fuel: "1/2", lataria: false, estepe: false, ferramentas: false, triangulo: false, luzes: false, radio: false, notes: "Sem vistoria." };

  container.innerHTML = `
    <div class="bg-slate-100 p-3 rounded-lg text-xs space-y-1">
      <div class="flex justify-between font-bold"><span>Cliente: ${c.name}</span><span class="text-[#0056b3]">OS ${formatSeqNumber(os.seqNumber)}</span></div>
      <p>Veículo: ${c.carModel} (${c.carYear}) | Placa: ${c.plate}</p>
      <p>Odômetro: <strong>${os.odometer || "0"} KM</strong></p>
      <p class="text-[11px] text-slate-500 italic">"${os.problem}"</p>
    </div>
    <div class="bg-slate-50 p-2.5 rounded-lg border text-xs space-y-1">
      <h4 class="font-bold text-[10px] text-slate-500 uppercase">Laudo de Vistoria</h4>
      <p>Combustível: <strong>${insp.fuel.toUpperCase()}</strong></p>
      <div class="grid grid-cols-2 gap-1 text-[10px] text-slate-600">
        <div>Lataria: <strong>${insp.lataria ? 'SIM' : 'NÃO'}</strong></div>
        <div>Estepe: <strong>${insp.estepe ? 'SIM' : 'NÃO'}</strong></div>
        <div>Ferramentas: <strong>${insp.ferramentas ? 'SIM' : 'NÃO'}</strong></div>
        <div>Triângulo: <strong>${insp.triangulo ? 'SIM' : 'NÃO'}</strong></div>
        <div>Luzes: <strong>${insp.luzes ? 'SIM' : 'NÃO'}</strong></div>
        <div>Rádio: <strong>${insp.radio ? 'SIM' : 'NÃO'}</strong></div>
      </div>
      <p class="text-[10px] italic border-t pt-1 mt-1">Obs: "${insp.notes}"</p>
    </div>
    <div class="flex gap-2 flex-wrap">
      <select onchange="updateOSStatus(this.value)" class="flex-1 min-w-[120px] text-xs p-2 border rounded bg-white">
        <option value="aberta" ${os.status === 'aberta' ? 'selected' : ''}>Em Aberto</option>
        <option value="funcionamento" ${os.status === 'funcionamento' ? 'selected' : ''}>No Conserto</option>
        <option value="concluida" ${os.status === 'concluida' ? 'selected' : ''}>Pronto</option>
      </select>
      <button onclick="deleteOS('${os.id}')" class="bg-red-100 text-red-700 hover:bg-red-200 transition font-bold text-xs p-2.5 rounded flex-1">Excluir</button>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div class="border p-3 rounded bg-slate-50/50">
        <h4 class="text-xs font-bold uppercase">Adicionar Serviço</h4>
        <div class="flex gap-1 mt-1">
          <input type="text" id="add-srv-desc" placeholder="Procedimento" class="flex-1 text-xs p-1.5 border rounded">
          <input type="number" id="add-srv-price" placeholder="R$" class="w-16 text-xs p-1.5 border rounded">
          <button onclick="addItemToOS('service')" class="bg-[#0056b3] text-white font-bold px-3 rounded">+</button>
        </div>
      </div>
      <div class="border p-3 rounded bg-slate-50/50">
        <h4 class="text-xs font-bold uppercase">Adicionar Peças</h4>
        <div class="flex gap-1 mt-1">
          <input type="text" id="add-part-desc" placeholder="Peça" class="flex-1 text-xs p-1.5 border rounded">
          <input type="number" id="add-part-price" placeholder="R$" class="w-12 text-xs p-1.5 border rounded">
          <input type="number" id="add-part-qty" value="1" class="w-8 text-xs p-1.5 border rounded text-center">
          <button onclick="addItemToOS('part')" class="bg-[#0056b3] text-white font-bold px-3 rounded">+</button>
        </div>
      </div>
    </div>
    <div class="space-y-1 text-xs">
      <h3 class="font-bold text-slate-700">Serviços Executados</h3>
      <ul class="divide-y bg-white border p-2 rounded-lg">
        ${servicesList.map((s, idx) => `<li class="py-1 flex justify-between"><span>${s.desc}</span><div><span class="font-bold">R$ ${s.price.toFixed(2)}</span><button onclick="removeOSItem('service', idx)" class="text-red-500 ml-2">✕</button></div></li>`).join("") || '<p class="text-slate-400">Nenhum registrado.</p>'}
      </ul>
      <h3 class="font-bold text-slate-700 mt-2">Peças Utilizadas</h3>
      <ul class="divide-y bg-white border p-2 rounded-lg">
        ${partsList.map((p, idx) => `<li class="py-1 flex justify-between"><span>${p.desc} (x${p.qty})</span><div><span class="font-bold">R$ ${(p.price * p.qty).toFixed(2)}</span><button onclick="removeOSItem('part', idx)" class="text-red-500 ml-2">✕</button></div></li>`).join("") || '<p class="text-slate-400">Nenhuma registrada.</p>'}
      </ul>
      <div class="bg-blue-50 border p-2.5 rounded-lg flex justify-between font-black text-blue-900 mt-2"><span>VALOR ACUMULADO:</span><span>R$ ${tot.toFixed(2)}</span></div>
      ${os.status === 'concluida' ? `<div class="flex gap-2 mt-3"><button onclick="sharePDFViaSystem('order', '${os.id}')" class="flex-1 bg-blue-600 text-white font-bold py-2.5 rounded-lg transition shadow">Compartilhar PDF</button></div>` : ''}
    </div>`;
}

function updateOSStatus(val) {
  const os = orders.find(o => o.id === activeOSDetailId);
  if (!os) return;
  const old = os.status;
  os.status = val;
  if (val === "concluida" && old !== "concluida") {
    const servicesList = os.services || [];
    const partsList = os.parts || [];
    const tot = servicesList.reduce((a, s) => a + s.price, 0) + partsList.reduce((a, p) => a + (p.price * p.qty), 0);
    if (tot > 0 && !transactions.some(t => t.description === `OS #${os.id} - Serviço Finalizado`)) {
      const tx = { id: "tx-" + Date.now().toString(), type: "entrada", description: `OS #${os.id} - Serviço Finalizado`, value: tot, date: new Date().toLocaleDateString('pt-BR') };
      db.collection("transactions").doc(tx.id).set(tx);
    }
  }
  db.collection("orders").doc(os.id).update({ status: val });
}

function addItemToOS(type) {
  const os = orders.find(o => o.id === activeOSDetailId);
  if (!os) return;
  const servicesList = os.services || [];
  const partsList = os.parts || [];
  if (type === 'service') {
    const desc = document.getElementById('add-srv-desc').value.toUpperCase();
    const price = parseFloat(document.getElementById('add-srv-price').value);
    if (!desc || isNaN(price)) return;
    servicesList.push({ desc, price });
    db.collection("orders").doc(os.id).update({ services: servicesList }).then(() => {
      document.getElementById('add-srv-desc').value = '';
      document.getElementById('add-srv-price').value = '';
    });
  } else {
    const desc = document.getElementById('add-part-desc').value.toUpperCase();
    const price = parseFloat(document.getElementById('add-part-price').value);
    const qty = parseInt(document.getElementById('add-part-qty').value) || 1;
    if (!desc || isNaN(price)) return;
    partsList.push({ desc, price, qty });
    db.collection("orders").doc(os.id).update({ parts: partsList }).then(() => {
      document.getElementById('add-part-desc').value = '';
      document.getElementById('add-part-price').value = '';
      document.getElementById('add-part-qty').value = '1';
    });
  }
}

function removeOSItem(type, index) {
  const os = orders.find(o => o.id === activeOSDetailId);
  if (!os) return;
  const servicesList = os.services || [];
  const partsList = os.parts || [];
  if (type === 'service') {
    servicesList.splice(index, 1);
  } else {
    partsList.splice(index, 1);
  }
  db.collection("orders").doc(os.id).update(type === 'service' ? { services: servicesList } : { parts: partsList });
}

function deleteOS(id) {
  showConfirm("Deletar esta Ordem de Serviço permanentemente?", () => {
    db.collection("orders").doc(id).delete().then(() => {
      showToast("OS deletada.", 'info');
      switchScreen('os-list');
    });
  });
}

// Financeiro
function renderFinance() {
  const inflowsEl = document.getElementById('finance-inflows');
  const outflowsEl = document.getElementById('finance-outflows');
  const ledgerEl = document.getElementById('finance-ledger');
  const dashBalanceEl = document.getElementById('dashboard-balance');
  if (!inflowsEl || !outflowsEl || !ledgerEl) return;
  let totIn = 0, totOut = 0;
  ledgerEl.innerHTML = "";
  transactions.forEach(tx => {
    if (tx.type === "entrada") totIn += tx.value;
    else totOut += tx.value;
    const item = document.createElement('div');
    item.className = `p-2.5 rounded-lg border text-xs flex justify-between items-center ${tx.type === 'entrada' ? 'bg-emerald-50 border-emerald-100 text-emerald-900' : 'bg-red-50 border-red-100 text-red-900'}`;
    item.innerHTML = `<div><p class="font-bold">${tx.description}</p><p class="text-[9px] text-slate-500">${tx.date}</p></div><div><span class="font-black">${tx.type === 'entrada' ? '+' : '-'} R$ ${tx.value.toFixed(2)}</span></div>`;
    ledgerEl.appendChild(item);
  });
  inflowsEl.textContent = `R$ ${totIn.toFixed(2)}`;
  outflowsEl.textContent = `R$ ${totOut.toFixed(2)}`;
  if (dashBalanceEl) dashBalanceEl.textContent = `R$ ${(totIn - totOut).toFixed(2)}`;
}

document.getElementById('form-expense')?.addEventListener('submit', function(e) {
  e.preventDefault();
  const desc = document.getElementById('expense-desc').value.toUpperCase();
  const value = parseFloat(document.getElementById('expense-value').value);
  if (!desc || isNaN(value)) return;
  const txId = "tx-expense-" + Date.now().toString();
  const tx = { type: "saida", description: `DESPESA: ${desc}`, value, date: new Date().toLocaleDateString('pt-BR') };
  db.collection("transactions").doc(txId).set(tx).then(() => this.reset());
});

function resetFinance() {
  showConfirm("Zerar todo o histórico financeiro?", () => {
    db.collection("transactions").get().then(snap => {
      snap.forEach(doc => doc.ref.delete());
      showToast("Histórico zerado.", 'info');
    });
  });
}

// Histórico de Veículo
function resetHistoryScreen() {
  const input = document.getElementById("history-search-input");
  if (input) input.value = "";
  const results = document.getElementById("history-results");
  if (results) results.innerHTML = `<div class="text-center py-10 text-slate-400 text-xs">Insira uma placa de veículo acima para consultar o histórico clínico de revisões.</div>`;
}

function searchVehicleHistory() {
  const input = document.getElementById("history-search-input");
  const container = document.getElementById("history-results");
  if (!input || !container) return;

  const rawInput = input.value;
  const plateQueryClean = cleanPlateNumber(rawInput);
  if (plateQueryClean === "") {
    showToast("Digite uma placa para pesquisar.", 'warning');
    return;
  }

  // Busca normalizada comparando as placas sem hifens ou espaços
  const matched = clients.filter(c => cleanPlateNumber(c.plate) === plateQueryClean);
  const client = matched[0];
  if (!client) {
    container.innerHTML = `<div class="text-center py-10 text-red-500 text-xs font-bold bg-red-50 border rounded-xl">Placa "${rawInput.toUpperCase()}" não localizada.</div>`;
    return;
  }

  const vOrders = orders.filter(o => o.clientId === client.id);
  if (vOrders.length === 0) {
    container.innerHTML = `<div class="bg-white p-4 border rounded-xl space-y-2"><h3 class="font-bold text-xs uppercase">${client.name}</h3><p class="text-[10px] text-slate-500">Placa: ${client.plate}</p><div class="text-center py-6 text-slate-400 text-xs border-t border-dashed mt-2">Nenhuma OS aberta ainda.</div></div>`;
    return;
  }

  vOrders.sort((a, b) => b.id.localeCompare(a.id));
  let html = `<div class="bg-white p-3 border rounded-xl space-y-1"><h3 class="font-black text-sm uppercase">${client.name}</h3><p class="text-[10px] text-slate-500">Veículo: ${client.carModel} | Contato: ${client.phone}</p></div><h3 class="text-xs font-bold text-slate-500 uppercase mt-4 mb-2">Linha do Tempo</h3><div class="space-y-3">`;
  vOrders.forEach(os => {
    const sList = os.services || [];
    const pList = os.parts || [];
    const tot = sList.reduce((a, s) => a + s.price, 0) + pList.reduce((a, p) => a + (p.price * p.qty), 0);
    html += `<div class="bg-slate-50 border rounded-xl p-3 space-y-2"><div class="flex justify-between items-center border-b border-dashed pb-1.5"><span class="text-[10px] text-slate-400 font-bold">Data: ${os.date}</span><span class="text-[10px] font-black">OS ${formatSeqNumber(os.seqNumber)}</span></div><p class="text-xs">"${os.problem}"</p><div class="text-[11px] bg-white p-2 rounded border">${sList.map(s => `<p class="text-slate-500">- ${s.desc}</p>`).join("")}${pList.map(p => `<p class="text-slate-500">- ${p.desc} (x${p.qty})</p>`).join("")}</div><div class="flex justify-between items-center text-[11px]"><span>Status: ${os.status}</span><span class="font-bold text-emerald-600">R$ ${tot.toFixed(2)}</span></div></div>`;
  });
  container.innerHTML = html + `</div>`;
}

// -------------------------------------------------------------
// SISTEMA DE ESTOQUE (INVENTORY CRUD)
// -------------------------------------------------------------
function handleInventorySubmit(e) {
  if (e) e.preventDefault();
  const partId = document.getElementById('inventory-part-id').value;
  const name = document.getElementById('inventory-name').value.toUpperCase().trim();
  const qty = parseInt(document.getElementById('inventory-qty').value) || 0;
  const price = parseFloat(document.getElementById('inventory-price').value) || 0;

  if (!name || qty < 0 || price < 0) {
    showToast("Preencha todos os campos corretamente.", "error");
    return;
  }

  const data = { name, qty, price };

  if (partId) {
    db.collection("inventory").doc(partId).update(data)
      .then(() => {
        showToast("Peça atualizada no estoque!", "success");
        clearInventoryForm();
      })
      .catch(err => showToast("Erro ao atualizar: " + err.message, "error"));
  } else {
    db.collection("inventory").add(data)
      .then(() => {
        showToast("Peça adicionada ao estoque!", "success");
        clearInventoryForm();
      })
      .catch(err => showToast("Erro ao adicionar: " + err.message, "error"));
  }
}

function clearInventoryForm() {
  document.getElementById('inventory-part-id').value = "";
  document.getElementById('inventory-name').value = "";
  document.getElementById('inventory-qty').value = "";
  document.getElementById('inventory-price').value = "";
  document.getElementById('inventory-form-title').textContent = "Nova Peça";
  document.getElementById('inventory-btn-cancel').classList.add('hidden');
  document.getElementById('inventory-btn-submit').textContent = "Salvar Peça";
}

function editInventoryPart(id) {
  const part = inventory.find(p => p.id === id);
  if (!part) return;
  document.getElementById('inventory-part-id').value = part.id;
  document.getElementById('inventory-name').value = part.name;
  document.getElementById('inventory-qty').value = part.qty;
  document.getElementById('inventory-price').value = part.price;
  document.getElementById('inventory-form-title').textContent = "Editar Peça";
  document.getElementById('inventory-btn-cancel').classList.remove('hidden');
  document.getElementById('inventory-btn-submit').textContent = "Atualizar";
}

function deleteInventoryPart(id) {
  showConfirm("Deseja realmente excluir esta peça do estoque?", () => {
    db.collection("inventory").doc(id).delete()
      .then(() => showToast("Peça excluída do estoque.", "info"))
      .catch(err => showToast("Erro ao excluir: " + err.message, "error"));
  });
}

function renderInventory() {
  const body = document.getElementById('inventory-table-body');
  if (!body) return;
  const searchQuery = document.getElementById('inventory-search').value.toUpperCase().trim();
  const filtered = inventory.filter(p => p.name.includes(searchQuery));

  if (filtered.length === 0) {
    body.innerHTML = `<tr><td colspan="4" class="px-4 py-4 text-center text-slate-400">Nenhuma peça encontrada.</td></tr>`;
    return;
  }

  body.innerHTML = filtered.map(p => `
    <tr class="border-b border-slate-100 hover:bg-slate-50">
      <td class="px-4 py-3 font-medium text-slate-900">${p.name}</td>
      <td class="px-4 py-3 text-center">${p.qty}</td>
      <td class="px-4 py-3 text-right">R$ ${p.price.toFixed(2)}</td>
      <td class="px-4 py-3 text-right space-x-1 whitespace-nowrap">
        <button onclick="editInventoryPart('${p.id}')" class="text-blue-600 hover:text-blue-800 font-bold px-1.5 py-0.5">Editar</button>
        <button onclick="deleteInventoryPart('${p.id}')" class="text-red-600 hover:text-red-800 font-bold px-1.5 py-0.5">Excluir</button>
      </td>
    </tr>
  `).join("");
}

function exportInventoryToPDF() {
  const jsPDFObj = window.jspdf ? window.jspdf.jsPDF : window.jsPDF;
  if (!jsPDFObj) { showToast("Erro: Biblioteca jsPDF não carregada.", 'error'); return; }

  showToast("Gerando PDF do estoque...", 'info', 2000);

  const doc = new jsPDFObj('p', 'mm', 'a4');
  let y = 15;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(30, 58, 138); // Cor azul escura padrão do sistema
  doc.text(OFICINA_NOME.toUpperCase(), 15, y);

  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text("ESTOQUE DE PECAS", 195, y, { align: "right" });

  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(OFICINA_ENDERECO, 15, y);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(`DATA DE EMISSAO: ${new Date().toLocaleDateString('pt-BR')}`, 195, y, { align: "right" });

  y += 4;
  doc.setDrawColor(30, 58, 138);
  doc.setLineWidth(0.8);
  doc.line(15, y, 195, y);

  y += 10;
  // Cabeçalho da tabela
  doc.setFillColor(241, 245, 249);
  doc.rect(15, y, 180, 7, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  doc.text("Descricao da Peca / Codigo", 18, y + 4.5);
  doc.text("Quantidade", 120, y + 4.5, { align: "center" });
  doc.text("Valor Unit.", 155, y + 4.5, { align: "right" });
  doc.text("Valor Total", 192, y + 4.5, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setTextColor(15, 23, 42);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.15);

  let grandTotal = 0;

  if (inventory.length === 0) {
    y += 7;
    doc.rect(15, y, 180, 7);
    doc.text("Nenhuma peca cadastrada no estoque.", 18, y + 4.5);
  } else {
    inventory.forEach(p => {
      const itemTotal = p.qty * p.price;
      grandTotal += itemTotal;
      y += 7;

      // Verificação para paginação segura
      if (y > 270) {
        doc.addPage();
        y = 15;
        // Desenha o cabeçalho novamente na nova página
        doc.setFillColor(241, 245, 249);
        doc.rect(15, y, 180, 7, "F");
        doc.setFont("helvetica", "bold");
        doc.text("Descricao da Peca / Codigo", 18, y + 4.5);
        doc.text("Quantidade", 120, y + 4.5, { align: "center" });
        doc.text("Valor Unit.", 155, y + 4.5, { align: "right" });
        doc.text("Valor Total", 192, y + 4.5, { align: "right" });
        doc.setFont("helvetica", "normal");
        y += 7;
      }

      doc.rect(15, y, 180, 7);
      doc.text(p.name, 18, y + 4.5);
      doc.text(String(p.qty), 120, y + 4.5, { align: "center" });
      doc.text(`R$ ${p.price.toFixed(2)}`, 155, y + 4.5, { align: "right" });
      doc.text(`R$ ${itemTotal.toFixed(2)}`, 192, y + 4.5, { align: "right" });
    });
  }

  y += 12;
  if (y > 270) {
    doc.addPage();
    y = 15;
  }
  doc.setFillColor(248, 250, 252);
  doc.rect(130, y, 65, 20, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(30, 58, 138);
  doc.text("VALOR TOTAL DO ESTOQUE:", 135, y + 7);
  doc.setFontSize(14);
  doc.text(`R$ ${grandTotal.toFixed(2)}`, 135, y + 15);

  const filename = `estoque_mecanica_carlim_${new Date().toISOString().slice(0,10)}.pdf`;
  const pdfBlob = doc.output('blob');
  const pdfFile = new File([pdfBlob], filename, { type: "application/pdf" });
  const filesArray = [pdfFile];

  if (navigator.canShare && navigator.canShare({ files: filesArray })) {
    navigator.share({ files: filesArray, title: 'Estoque de Peças', text: `Mecânica do Carlim - PDF.` }).catch(() => {});
  } else {
    showToast("Baixando arquivo...", 'warning');
    doc.save(filename);
  }
}

// PDF Creator (Clientes/OS)
function sharePDFViaSystem(type, id) {
  const isQuote = type === 'quote';
  const docData = isQuote ? quotes.find(q => q.id === id) : orders.find(o => o.id === id);
  if (!docData) { showToast("Documento não encontrado.", 'error'); return; }

  const client = clients.find(c => c.id === docData.clientId) || { name: "Cliente", phone: "N/A", carModel: "N/A", plate: "N/A", carBrand: "N/A", carYear: "N/A" };
  const associatedOS = isQuote ? orders.find(o => o.id === "OS-" + docData.id) : null;

  const activeServices = ((isQuote && associatedOS) ? associatedOS.services : docData.services) || [];
  const activeParts = ((isQuote && associatedOS) ? associatedOS.parts : docData.parts) || [];
  const paymentMethod = (isQuote && associatedOS) ? (associatedOS.paymentMethod || "pix") : (docData.paymentMethod || "pix");
  const odometer = (isQuote && associatedOS) ? (associatedOS.odometer || "0") : (docData.odometer || "0");
  const insp = (isQuote && associatedOS) ? (associatedOS.inspection || { fuel: "1/2", lataria: false, estepe: false, ferramentas: false, triangulo: false, luzes: false, radio: false, notes: "Sem vistoria." }) : (docData.inspection || { fuel: "1/2", lataria: false, estepe: false, ferramentas: false, triangulo: false, luzes: false, radio: false, notes: "Sem vistoria." });

  const sTotal = activeServices.reduce((acc, curr) => acc + curr.price, 0);
  const pTotal = activeParts.reduce((acc, curr) => acc + (curr.price * curr.qty), 0);
  const total = sTotal + pTotal;

  const seqNum = docData.seqNumber || 1;
  const formattedSeq = formatSeqNumber(seqNum);

  const docTitle = isQuote ? "ORCAMENTO DE REPARO" : "RECIBO DE SERVICO";
  const docBadge = isQuote ? "Estimativa" : "Servico Concluido";

  const jsPDFObj = window.jspdf ? window.jspdf.jsPDF : window.jsPDF;
  if (!jsPDFObj) { showToast("Erro: Biblioteca jsPDF não carregada.", 'error'); return; }

  showToast("Gerando PDF oficial...", 'info', 2000);

  const doc = new jsPDFObj('p', 'mm', 'a4');
  const primaryColor = isQuote ? [30, 58, 138] : [16, 185, 129];

  let y = 15;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(OFICINA_NOME.toUpperCase(), 15, y);
  
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(docTitle, 195, y, { align: "right" });
  
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(OFICINA_ENDERECO, 15, y);
  
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text(docBadge.toUpperCase(), 195, y, { align: "right" });

  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`WhatsApp: ${OFICINA_WHATSAPP}`, 15, y);
  doc.text(`ID: ${formattedSeq} | Data: ${docData.date}`, 195, y, { align: "right" });

  y += 4;
  doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.setLineWidth(0.8);
  doc.line(15, y, 195, y);

  y += 8;
  doc.setLineWidth(0.2);
  
  doc.setDrawColor(203, 213, 225);
  doc.setFillColor(248, 250, 252);
  doc.rect(15, y, 87, 24, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text("PROPRIETARIO / CLIENTE", 18, y + 5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(`Nome: ${client.name}`, 18, y + 11);
  doc.text(`Telefone: ${client.phone}`, 18, y + 18);

  doc.setDrawColor(203, 213, 225);
  doc.setFillColor(248, 250, 252);
  doc.rect(108, y, 87, 24, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text("DADOS DO VEICULO", 111, y + 5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(`Modelo: ${client.carBrand || ""} ${client.carModel || ""} (${client.carYear || ""})`, 111, y + 11);
  doc.text(`Placa: ${client.plate || ""} | KM Entrada: ${odometer} KM`, 111, y + 18);

  y += 28;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.setLineWidth(0.8);
  doc.line(15, y - 3, 15, y + 1);
  doc.text("VISTORIA DE ENTRADA (LAUDO)", 18, y);

  y += 3;
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.15);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  
  doc.rect(15, y, 90, 6); doc.text(`Combustivel: ${insp.fuel ? insp.fuel.toUpperCase() : '1/2'}`, 18, y + 4);
  doc.rect(105, y, 90, 6); doc.text(`Lataria sem riscos: ${insp.lataria ? 'SIM' : 'NAO'}`, 108, y + 4);
  y += 6;
  doc.rect(15, y, 90, 6); doc.text(`Estepe Presente: ${insp.estepe ? 'SIM' : 'NAO'}`, 18, y + 4);
  doc.rect(105, y, 90, 6); doc.text(`Macaco / Chaves de roda: ${insp.ferramentas ? 'SIM' : 'NAO'}`, 108, y + 4);
  y += 6;
  doc.rect(15, y, 90, 6); doc.text(`Triangulo de seguranca: ${insp.triangulo ? 'SIM' : 'NAO'}`, 18, y + 4);
  doc.rect(105, y, 90, 6); doc.text(`Luzes e painel Ok: ${insp.luzes ? 'SIM' : 'NAO'}`, 108, y + 4);
  y += 6;
  doc.rect(15, y, 90, 6); doc.text(`Som / Radio Presente: ${insp.radio ? 'SIM' : 'NAO'}`, 18, y + 4);
  doc.rect(105, y, 90, 6); doc.text(`Observacoes: ${insp.notes || 'Sem observacoes.'}`, 108, y + 4);

  y += 12;
  doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  doc.line(15, y - 3, 15, y + 1); doc.text("1. SERVICOS DE MAO DE OBRA", 18, y);

  y += 3;
  doc.setFillColor(241, 245, 249); doc.rect(15, y, 180, 6, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(51, 65, 85);
  doc.text("Procedimento Tecnico", 18, y + 4); doc.text("Valor", 195, y + 4, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setTextColor(15, 23, 42);
  
  if (activeServices.length === 0) {
    y += 6; doc.rect(15, y, 180, 6); doc.text("Nenhum servico registrado.", 18, y + 4);
  } else {
    activeServices.forEach(s => {
      y += 6; doc.rect(15, y, 180, 6); doc.text(s.desc, 18, y + 4);
      doc.text(`R$ ${s.price.toFixed(2)}`, 195, y + 4, { align: "right" });
    });
  }

  y += 12;
  doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  doc.line(15, y - 3, 15, y + 1); doc.text("2. PECAS E COMPONENTES APLICADOS", 18, y);

  y += 3;
  doc.setFillColor(241, 245, 249); doc.rect(15, y, 180, 6, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(51, 65, 85);
  doc.text("Peca / Descricao", 18, y + 4); doc.text("Qtd", 130, y + 4, { align: "center" });
  doc.text("Unitario", 160, y + 4, { align: "right" }); doc.text("Subtotal", 195, y + 4, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setTextColor(15, 23, 42);

  if (activeParts.length === 0) {
    y += 6; doc.rect(15, y, 180, 6); doc.text("Nenhuma peca aplicada.", 18, y + 4);
  } else {
    activeParts.forEach(p => {
      y += 6; doc.rect(15, y, 180, 6); doc.text(p.desc, 18, y + 4);
      doc.text(String(p.qty), 130, y + 4, { align: "center" });
      doc.text(`R$ ${p.price.toFixed(2)}`, 160, y + 4, { align: "right" });
      doc.text(`R$ ${(p.price * p.qty).toFixed(2)}`, 195, y + 4, { align: "right" });
    });
  }

  y += 12;
  doc.setDrawColor(203, 213, 225); doc.rect(15, y, 110, 24);
  doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(100, 116, 139);
  doc.text("FORMAS DE PAGAMENTO", 18, y + 5);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(15, 23, 42);
  doc.text(`Metodo Escolhido: ${paymentMethod.toUpperCase()}`, 18, y + 11);
  doc.setFontSize(7.5); doc.setTextColor(100, 116, 139);
  const terms = isQuote ? "* Nota: Estimativa sujeita a atualizacoes. Validade: 10 dias." : "Garantia legal de 90 dias sobre mao de obra e pecas descritas nesta OS, CDC.";
  doc.text(doc.splitTextToSize(terms, 104), 18, y + 17);

  doc.setFillColor(248, 250, 252); doc.rect(130, y, 65, 24, "FD");
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text("VALOR TOTAL:", 135, y + 8);
  doc.setFontSize(16); doc.text(`R$ ${total.toFixed(2)}`, 135, y + 18);

  if (!isQuote) {
    y += 35;
    doc.line(15, y, 95, y); doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(15, 23, 42);
    doc.text(client.name.substring(0, 35), 15, y + 4);
    doc.setFont("helvetica", "normal"); doc.setTextColor(100, 116, 139); doc.text("Assinatura do Cliente / Recebimento", 15, y + 8);

    doc.line(115, y, 195, y); doc.setFont("helvetica", "bold"); doc.setTextColor(15, 23, 42);
    doc.text("Mecanica do Carlim", 115, y + 4);
    doc.setFont("helvetica", "normal"); doc.setTextColor(100, 116, 139); doc.text("Assinatura do Responsavel Tecnico", 115, y + 8);
  }

  const formattedSeqFilename = String(seqNum).padStart(2, '0');
  const cleanClientName = client.name.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase();
  const filename = isQuote ? `orcamento_${formattedSeqFilename}_${cleanClientName}.pdf` : `recibo_${formattedSeqFilename}_${cleanClientName}.pdf`;

  const pdfBlob = doc.output('blob');
  const pdfFile = new File([pdfBlob], filename, { type: "application/pdf" });
  const filesArray = [pdfFile];

  if (navigator.canShare && navigator.canShare({ files: filesArray })) {
    navigator.share({ files: filesArray, title: isQuote ? 'Orçamento de Reparo' : 'Recibo de Serviço', text: `Mecânica do Carlim - PDF.` }).catch(() => {});
  } else {
    showToast("Baixando arquivo...", 'warning'); doc.save(filename);
  }
}

// -------------------------------------------------------------
// INICIALIZAÇÃO DE ESCUTADORES DINÂMICOS (FORA DE WRAPPERS DOM)
// -------------------------------------------------------------
function initEventListeners() {
  // Menu Responsivo Celular
  document.getElementById('mobile-menu-open-btn')?.addEventListener('click', () => toggleSidebar(true));
  document.getElementById('mobile-menu-close-btn')?.addEventListener('click', () => toggleSidebar(false));
  document.getElementById('sidebar-overlay')?.addEventListener('click', () => toggleSidebar(false));

  // Eventos de Estoque (Evita submits fantasmas e reloads)
  document.getElementById('form-inventory')?.addEventListener('submit', handleInventorySubmit);
  document.getElementById('inventory-btn-cancel')?.addEventListener('click', clearInventoryForm);
  document.getElementById('inventory-search')?.addEventListener('input', renderInventory);
  document.getElementById('inventory-export-pdf-btn')?.addEventListener('click', exportInventoryToPDF);

  // Busca do Histórico Clínico
  document.getElementById('history-search-btn')?.addEventListener('click', searchVehicleHistory);
}

// Execução segura independente do estado de carregamento do arquivo script.js
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initEventListeners);
} else {
  initEventListeners();
}
