import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  doc,
  setDoc,
  updateDoc,
  getDocs,
  where,
  getDoc
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-storage.js";

/* =======================
   CONFIG FIREBASE — Pega tus credenciales reales
   ======================= */
const firebaseConfig = {
  apiKey: "AIzaSy...", // <-- reemplaza si hace falta
  authDomain: "chatsito-df6a8.firebaseapp.com",
  projectId: "chatsito-df6a8",
  storageBucket: "chatsito-df6a8.appspot.com",
  messagingSenderId: "659126906398",
  appId: "1:659126906398:web:f32dd5e72d1778f5ee880f"
};

tryAutoLogin();

/* =======================
   Inicialización Firebase — IMPORTANTE: debe ejecutarse antes de usar db/storage
   ======================= */
let app = null;
let db = null;
let storage = null;

try {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  storage = getStorage(app);
  console.log("Firebase inicializado OK — app, db y storage listos.");
  // expón para debugging rápido
  window.__CHATSITO__ = { app, db, storage };
} catch (err) {
  console.error("Error inicializando Firebase:", err);
  alert("Error inicializando Firebase. Revisa la consola.");
}

/* =======================
   SELECTORES
   ======================= */
const $ = id => document.getElementById(id);
const chatApp = $("chat-app");
const chatBox = $("chat-box");
const sendBtn = $("send-btn");
const messageInput = $("message");

const userNameUI = $("user-name");
const userImgUI = $("user-img");

const nameModal = $("name-modal");
const nameInput = $("name-input");
const passInput = $("pass-input");
const loginBtn = $("login-btn");

const presenceList = $("presence-list");
const onlineCountEl = $("online-count");
const typingIndicator = $("typing");

const configBtn = $("config-btn");
const configModal = $("config-modal");
const closeConfigBtn = $("close-config");
const saveConfigBtn = $("save-config");
const configNameInput = $("config-name-input");
const configAvatarInput = $("config-avatar-input");
const configAvatarPreview = $("config-avatar");

const emojiBtn = $("emoji-btn");
const emojiPicker = $("emoji-picker");
const userStatusUI = $("user-status");

/* =======================
   ESTADO LOCAL
   ======================= */
const LS_AVATAR = "chatsito_avatar";
const LS_NAME = "chatsito_nombre";
let profile = null; // { nombre, clave, isAdmin, avatar, uidDoc }
let uidLocal = localStorage.getItem("chatsito_uid") || null;
if (!uidLocal && crypto?.randomUUID) { uidLocal = crypto.randomUUID(); localStorage.setItem("chatsito_uid", uidLocal); }
else if (!uidLocal) { uidLocal = `u_${Date.now()}`; localStorage.setItem("chatsito_uid", uidLocal); }

let avatarUrlLocal = localStorage.getItem(LS_AVATAR) || null;
let presenceInterval = null;
const PRESENCE_TTL = 20000;
let messagesUnsub = null;
let presenceUnsub = null;
let typingUnsub = null;
let pendingImageFile = null;

/* =======================
   UTIL
   ======================= */
const fmtTime = (ts) => { try { if (!ts) return ""; const d = ts?.toDate ? ts.toDate() : new Date(ts); return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };
function sysNotice(text) { const n = document.createElement("div"); n.className = "text-center text-rose-300 text-sm my-2"; n.textContent = text; chatBox && chatBox.appendChild(n); chatBox && (chatBox.scrollTop = chatBox.scrollHeight); }
function safeLower(s){ return (typeof s === "string") ? s.toLowerCase() : ""; }
function showSpecialGreeting() {
  if (!profile?.nombre) return;
  const normalized = profile.nombre.trim().toLowerCase();
  if (normalized === "daniela" || normalized.includes("daniela")) {
    const text = "Hola Bonitaa Animo ❤️‍🔥";
    sysNotice(text);
    showFloatingAlert(text);
  }
}

function showFloatingAlert(message) {
  const existing = document.getElementById("special-greeting-alert");
  if (existing) existing.remove();

  const alertEl = document.createElement("div");
  alertEl.id = "special-greeting-alert";
  alertEl.className = "floating-alert";
  alertEl.textContent = message;
  document.body.appendChild(alertEl);

  window.requestAnimationFrame(() => {
    alertEl.classList.add("floating-alert--show");
  });

  setTimeout(() => {
    alertEl.classList.remove("floating-alert--show");
    setTimeout(() => {
      alertEl.remove();
    }, 500);
  }, 3200);
}

function setUserStatusOnline() {
  if (userStatusUI) userStatusUI.textContent = "online";
}

/* =======================
   CARGAR PERFIL LOCAL (si hay)
   ======================= */
function loadLocal() {
  const name = localStorage.getItem(LS_NAME);
  if (name) {
    if (nameInput) nameInput.value = name;
  }
  if (avatarUrlLocal && userImgUI) userImgUI.src = avatarUrlLocal;
}
loadLocal();

async function tryAutoLogin() {
  const uidDoc = localStorage.getItem("chatsito_uidDoc");
  if (!uidDoc) return;

  try {
    const ref = doc(db, "usuarios", uidDoc);
    const snap = await getDoc(ref);

    if (!snap.exists()) return;

    const data = snap.data();

    profile = {
      nombre: data.nombre,
      isAdmin: !!data.isAdmin,
      avatar: data.avatar || null,
      uidDoc: uidDoc
    };

    userNameUI.textContent = profile.nombre;

    if (profile.avatar) {
      avatarUrlLocal = profile.avatar;
      userImgUI.src = profile.avatar;
    }

    nameModal.style.display = "none";

    initAfterLogin();

  } catch (err) {
    console.error("AutoLogin error:", err);
  }
}

/* =======================
   LOGIN: buscar en colección 'usuarios' por nombre+clave
   ======================= */
async function loginWithNameClave() {
  if (!db) {
    alert("Error interno: Firestore no inicializado.");
    return;
  }

  const n = (nameInput?.value || "").trim();
  const p = (passInput?.value || "").trim();

  if (!n || !p) {
    alert("Ingresa nombre y clave");
    return;
  }

  try {
    const usuariosRef = collection(db, "usuarios");
    const q = query(
      usuariosRef,
      where("nombre", "==", n),
      where("clave", "==", p)
    );

    const snap = await getDocs(q);

    if (snap.empty) {
      alert("Nombre o clave incorrectos.");
      return;
    }

    const docSnap = snap.docs[0];
    const data = docSnap.data();

    profile = {
      nombre: data.nombre,
      isAdmin: !!data.isAdmin,
      avatar: data.avatar || null,
      uidDoc: docSnap.id
    };

    // GUARDAR SESIÓN
    localStorage.setItem("chatsito_uidDoc", docSnap.id);
    localStorage.setItem(LS_NAME, profile.nombre);

    if (profile.avatar) {
      avatarUrlLocal = profile.avatar;
      localStorage.setItem(LS_AVATAR, avatarUrlLocal);
    }

    // UI
    userNameUI.textContent = profile.nombre;
    if (avatarUrlLocal) userImgUI.src = avatarUrlLocal;

    nameModal.style.display = "none";

    initAfterLogin();

  } catch (err) {
    console.error(err);
    alert("Error al iniciar sesión");
  }
}

loginBtn && loginBtn.addEventListener("click", loginWithNameClave);

/* =======================
   INICIAR SESIÓN: presence, listeners, UI
   ======================= */
function initAfterLogin(){
  if (chatApp && chatApp.classList && chatApp.classList.contains("hidden")) chatApp.classList.remove("hidden");
  if (avatarUrlLocal && userImgUI) userImgUI.src = avatarUrlLocal;
  setUserStatusOnline();
  startPresence();
  listenPresence();
  listenTyping();
  listenMessages();
  bindUI();

  // Mensaje especial para Daniela
  showSpecialGreeting();
}

/* =======================
   PRESENCE
   ======================= */
async function startPresence(){
  if (!profile) return;
  const pDoc = doc(db, "usuarios_online", profile.uidDoc || uidLocal);
  const touch = async () => {
    try {
      await setDoc(pDoc, { uidLocal, nombre: profile.nombre, avatar: avatarUrlLocal || profile.avatar || null, lastSeenClient: Date.now(), online: true }, { merge: true });
    } catch (err) { console.error("presence touch error:", err); }
  };
  touch();
  presenceInterval && clearInterval(presenceInterval);
  presenceInterval = setInterval(touch, 5000);
  window.addEventListener("beforeunload", async () => {
    try { await setDoc(pDoc, { online: false, lastSeenClient: Date.now() }, { merge: true }); } catch(e) {}
  });
}

function listenPresence(){
  if (presenceUnsub) presenceUnsub();
  const q = query(collection(db, "usuarios_online"));
  presenceUnsub = onSnapshot(q, snap => {
    if (!presenceList) return;
    presenceList.innerHTML = "";
    const arr = [];
    snap.forEach(s => arr.push(s.data()));
    const now = Date.now();
    const active = arr.filter(p => (now - (p.lastSeenClient || 0) < PRESENCE_TTL) && p.online);
    active.sort((a,b) => (b.lastSeenClient||0)-(a.lastSeenClient||0));
    active.forEach(p => {
      const isMe = p.uidLocal === (profile?.uidDoc || uidLocal);
      const row = document.createElement("div");
      row.className = "flex items-center gap-3 p-2 rounded hover:bg-[#170909]";
      row.innerHTML = `<img src="${p.avatar || '../img/sin-hogar.png'}" class="w-8 h-8 rounded-full"><div><div class="text-sm font-medium">${p.nombre}${isMe ? ' (Tú)' : ''}</div><div class="text-xs text-slate-400">online</div></div>`;
      presenceList.appendChild(row);
    });
    onlineCountEl && (onlineCountEl.textContent = `${active.length} online`);
  }, err => {
    console.error("presence listen error:", err);
  });
}

/* =======================
   TYPING indicator
   ======================= */
function listenTyping(){
  if (typingUnsub) typingUnsub();
  const q = query(collection(db, "typing"));
  typingUnsub = onSnapshot(q, snap => {
    let typingUsers = [];
    snap.forEach(d => {
      const data = d.data();
      const ourUidRef = profile?.uidDoc || uidLocal;
      if (data.uidLocal !== ourUidRef && data.typing) typingUsers.push(data.nombre);
    });
    if (!typingIndicator) return;
    if (typingUsers.length === 0) typingIndicator.textContent = "";
    else if (typingUsers.length === 1) typingIndicator.textContent = `${typingUsers[0]} está escribiendo...`;
    else typingIndicator.textContent = "Varios usuarios están escribiendo...";
  }, err => console.error("typing listen err:", err));
}

async function publishTyping(val) {
  try {
    const uidRef = profile?.uidDoc || uidLocal;
    await setDoc(doc(db, "typing", uidRef), { uidLocal: uidRef, nombre: profile?.nombre || localStorage.getItem(LS_NAME), typing: val, lastClient: Date.now() }, { merge: true });
  } catch (err) { /* ignore */ }
}

/* =======================
   AVATAR upload (Storage) — actualiza usuarios/{uid} y usuarios_online
   ======================= */
async function uploadAvatarFile(file) {
  if (!file) return null;
  if (typeof storage === "undefined" || storage === null) {
    console.error("uploadAvatarFile: storage NO inicializado");
    return null;
  }
  try {
    const path = `avatars/${(profile?.uidDoc || uidLocal)}_${Date.now()}_${file.name.replace(/\s+/g,"_")}`;
    const ref = storageRef(storage, path);
    await uploadBytes(ref, file);
    const url = await getDownloadURL(ref);
    avatarUrlLocal = url;
    localStorage.setItem(LS_AVATAR, url);
    if (userImgUI) userImgUI.src = url;
    // update usuarios doc (only if profile exists with uidDoc)
    try {
      if (profile?.uidDoc) {
        await updateDoc(doc(db, "usuarios", profile.uidDoc), { avatar: url });
        await setDoc(doc(db, "usuarios_online", profile.uidDoc), { uidLocal, nombre: profile.nombre, avatar: url, lastSeenClient: Date.now(), online: true }, { merge: true });
      }
    } catch (err) { console.error("update avatar doc error", err); }
    return url;
  } catch (err) { console.error("avatar upload err", err); sysNotice("No se pudo subir avatar"); return null; }
}

/* bind config actions */
if (configBtn && configModal) configBtn.addEventListener("click", ()=> configModal.classList.remove("hidden"));
if (closeConfigBtn) closeConfigBtn.addEventListener("click", ()=> configModal.classList.add("hidden"));
if (saveConfigBtn) {
  saveConfigBtn.addEventListener("click", async () => {
    const newName = (configNameInput?.value || "").trim();
    if (newName && profile?.uidDoc) {
      await updateDoc(doc(db, "usuarios", profile.uidDoc), { nombre: newName }).catch(()=>{});
      profile.nombre = newName;
      userNameUI && (userNameUI.textContent = newName);
      sysNotice("Nombre actualizado");
    }
    const f = configAvatarInput?.files?.[0];
    if (f) await uploadAvatarFile(f);
    configModal.classList.add("hidden");
  });
}

/* =======================
   Message image upload helper
   ======================= */
const uploadMsgBtn = $("upload-btn");
const imageFileInput = $("image-file");
if (uploadMsgBtn && imageFileInput) {
  uploadMsgBtn.addEventListener("click", ()=> imageFileInput.click());
  imageFileInput.addEventListener("change", (e)=> { pendingImageFile = e.target.files?.[0] || null; if (messageInput) messageInput.placeholder = pendingImageFile ? `Imagen lista: ${pendingImageFile.name}` : "Escribe un mensaje..."; });
}

if (emojiBtn && emojiPicker && messageInput) {
  emojiBtn.addEventListener("click", (event) => {
    event.preventDefault();
    emojiPicker.classList.toggle("hidden");
  });

  emojiPicker.addEventListener("emoji-click", (event) => {
    const emoji = event.detail?.unicode || event.detail?.emoji;
    if (!emoji) return;
    messageInput.value += emoji;
    messageInput.focus();
  });

  document.addEventListener("click", (event) => {
    if (!emojiPicker.contains(event.target) && event.target !== emojiBtn) {
      emojiPicker.classList.add("hidden");
    }
  });
}

async function uploadImageAndGetURL(file) {
  if (!file) return null;
  if (typeof storage === "undefined" || storage === null) {
    console.error("uploadImageAndGetURL: storage NO inicializado");
    return null;
  }
  try {
    const path = `messages/${(profile?.uidDoc || uidLocal)}_${Date.now()}_${file.name.replace(/\s+/g,"_")}`;
    const ref = storageRef(storage, path);
    await uploadBytes(ref, file);
    return await getDownloadURL(ref);
  } catch (err) { console.error("upload message image err:", err); return null; }
}

/* =======================
   Enviar mensaje (optimista) — solo usuarios válidos (no invitados)
   ======================= */
async function sendMessage() {
  try {
    if (!profile) { alert("Inicia sesión con nombre y clave"); return; }
    const text = (messageInput && messageInput.value || "").trim();
    if (!text && !pendingImageFile) return;
    const payload = {
      uidLocal: profile.uidDoc || uidLocal,
      usuario: profile.nombre,
      texto: text || "",
      imageUrl: null,
      avatar: avatarUrlLocal || profile.avatar || null,
      fecha: serverTimestamp(),
      createdAtClient: Date.now(),
      deleted: false,
      edits: []
    };
    // optimistic
    renderLocal("_local_" + Date.now(), payload);
    if (pendingImageFile) {
      const url = await uploadImageAndGetURL(pendingImageFile);
      if (url) payload.imageUrl = url;
    }
    await addDoc(collection(db, "mensajes"), payload);
    messageInput.value = "";
    pendingImageFile = null;
    if (messageInput) messageInput.placeholder = "Escribe un mensaje...";
  } catch (err) {
    console.error("sendMessage err", err);
    sysNotice("Error al enviar (ver consola).");
  }
}
sendBtn && sendBtn.addEventListener("click", sendMessage);
messageInput && messageInput.addEventListener("keydown", (e)=> { if (e.key === "Enter") { e.preventDefault(); sendMessage(); } });
messageInput && messageInput.addEventListener("input", ()=> { publishTyping(true); clearTimeout(window._typingTO); window._typingTO = setTimeout(()=> publishTyping(false), 1400); });

/* =======================
   Escuchar mensajes
   ======================= */
function listenMessages() {
  if (typeof db === "undefined" || db === null) {
    console.error("listenMessages: Firestore 'db' NO está inicializado.");
    return;
  }
  if (messagesUnsub) messagesUnsub();
  const q = query(collection(db, "mensajes"), orderBy("fecha"));
  messagesUnsub = onSnapshot(q, snap => {
    if (!chatBox) return;
    chatBox.innerHTML = "";
    snap.forEach(s => renderServerMessage(s.id, s.data()));
  }, err => {
    console.error("listenMessages err", err);
    sysNotice("No se pueden cargar mensajes (permiso).");
  });
}

/* =======================
   Render local optimistic
   ======================= */
function renderLocal(tempId, payload) {
  if (!chatBox) return;
  const isMine = payload.uidLocal === (profile?.uidDoc || uidLocal);
  const wrap = document.createElement("div");
  wrap.id = tempId;
  wrap.className = `flex gap-3 items-end ${isMine ? "justify-end" : "justify-start"} opacity-80`;
  const bubble = document.createElement("div");
  bubble.className = `max-w-[78%] p-3 rounded-2xl shadow ${isMine ? "bg-red-900 text-white" : "bg-[#140909] text-white"}`;
  const header = document.createElement("div"); header.className = "text-xs opacity-80 mb-1";
  header.innerHTML = `<strong>${payload.usuario}</strong> <span class="text-[10px] opacity-60 ml-2">${fmtTime(payload.createdAtClient)}</span> <span class="text-[10px] italic ml-2">(enviando)</span>`;
  const content = document.createElement("div");
  if (payload.texto) { const p = document.createElement("div"); p.className = "whitespace-pre-wrap"; p.innerText = payload.texto; content.appendChild(p); }
  if (payload.imageUrl) { const img = document.createElement("img"); img.src = payload.imageUrl; img.className = "mt-2 max-w-full rounded-md"; content.appendChild(img); }
  bubble.appendChild(header); bubble.appendChild(content); wrap.appendChild(bubble); chatBox.appendChild(wrap); chatBox.scrollTop = chatBox.scrollHeight;
}

/* =======================
   Render server message + admin controls
   ======================= */
function renderServerMessage(id, data) {
  if (!chatBox) return;
  const isMine = data.uidLocal === (profile?.uidDoc || uidLocal);
  const wrapper = document.createElement("div");
  wrapper.className = `flex gap-3 items-end ${isMine ? "justify-end" : "justify-start"}`;
  const bubble = document.createElement("div");
  bubble.className = `max-w-[78%] p-3 rounded-2xl shadow ${isMine ? "bg-red-900 text-white" : "bg-[#140909] text-white"}`;

  if (data.deleted) {
    if (profile?.isAdmin) {
      bubble.innerHTML = `<div class="text-xs text-yellow-200 mb-1">⚠️ Eliminado — visible para admins</div><div class="line-through opacity-80">${data.texto || ""}</div>`;
    } else {
      bubble.innerHTML = `<em class="text-sm text-gray-300">Mensaje eliminado</em>`;
    }
    if (!isMine) { const av = document.createElement("img"); av.src = data.avatar || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'; av.className = 'w-8 h-8 rounded-full'; wrapper.appendChild(av); }
    wrapper.appendChild(bubble); chatBox.appendChild(wrapper); chatBox.scrollTop = chatBox.scrollHeight; return;
  }

  const header = document.createElement("div"); header.className = "text-xs opacity-80 mb-1";
  header.innerHTML = `<strong class="text-sm">${data.usuario || 'Anon'}</strong> <span class="text-[10px] opacity-60 ml-2">${fmtTime(data.fecha || data.createdAtClient)}</span>`;

  if (data.edits && Array.isArray(data.edits) && data.edits.length) {
    const editedTag = document.createElement("span"); editedTag.className = "text-[10px] opacity-60 ml-2 italic"; editedTag.innerText = "(editado)";
    editedTag.style.cursor = "pointer";
    editedTag.title = "Ver historial de ediciones";
    editedTag.addEventListener("click", () => {
      const hist = data.edits.map((e, i) => `${i+1}. ${new Date(e.at).toLocaleString()} — ${e.by}\n${e.text}`).join("\n\n");
      alert("Historial de ediciones:\n\n" + hist);
    });
    header.appendChild(editedTag);
  }

  const content = document.createElement("div");
  if (data.texto) { const p = document.createElement("div"); p.className = "whitespace-pre-wrap"; p.innerText = data.texto; content.appendChild(p); }
  if (data.imageUrl) { const img = document.createElement("img"); img.src = data.imageUrl; img.className = "mt-2 max-w-full rounded-md"; content.appendChild(img); }

  bubble.appendChild(header); bubble.appendChild(content);

  if (profile?.isAdmin) {
    const controls = document.createElement("div"); controls.className = "mt-2 flex gap-2";
    const delBtn = document.createElement("button"); delBtn.className = "text-xs bg-red-600 px-2 py-1 rounded text-white"; delBtn.textContent = "Eliminar";
    delBtn.title = "Marcar mensaje como eliminado";
    delBtn.addEventListener("click", async () => {
      if (!confirm("Marcar mensaje como eliminado?")) return;
      try { await updateDoc(doc(db, "mensajes", id), { deleted: true, deletedBy: profile.uidDoc || uidLocal, deletedAt: serverTimestamp() }); }
      catch (err) { console.error("admin delete err", err); sysNotice("No se pudo marcar eliminado"); }
    });
    const restoreBtn = document.createElement("button"); restoreBtn.className = "text-xs bg-slate-700 px-2 py-1 rounded text-white"; restoreBtn.textContent = "Restaurar";
    restoreBtn.title = "Restaurar mensaje";
    restoreBtn.addEventListener("click", async () => {
      if (!confirm("Restaurar mensaje?")) return;
      try { await updateDoc(doc(db, "mensajes", id), { deleted: false, restoredBy: profile.uidDoc || uidLocal, restoredAt: serverTimestamp() }); }
      catch (err) { console.error("admin restore err", err); sysNotice("No se pudo restaurar"); }
    });
    controls.appendChild(delBtn); controls.appendChild(restoreBtn);
    bubble.appendChild(controls);
  }

  if (!isMine) {
    const av = document.createElement("img"); av.src = data.avatar || '../img/sin-hogar.png'; av.className = 'w-8 h-8 rounded-full';
    wrapper.appendChild(av); wrapper.appendChild(bubble);
  } else wrapper.appendChild(bubble);

  chatBox.appendChild(wrapper);
  chatBox.scrollTop = chatBox.scrollHeight;
}

/* =======================
   BIND UI (typing)
   ======================= */
function bindUI(){
  // no-op (handlers attached where needed)
}

/* =======================
   Carga final: prefill nombre si existía
   ======================= */
if (localStorage.getItem(LS_NAME)) {
  if (nameInput) nameInput.value = localStorage.getItem(LS_NAME);
}