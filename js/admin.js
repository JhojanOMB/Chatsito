import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";

import {
getFirestore,
collection,
onSnapshot,
addDoc,
doc,
updateDoc,
deleteDoc
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";


const firebaseConfig = {
apiKey: "AIzaSy...",
authDomain: "chatsito-df6a8.firebaseapp.com",
projectId: "chatsito-df6a8",
storageBucket: "chatsito-df6a8.appspot.com",
messagingSenderId: "659126906398",
appId: "1:659126906398:web:f32dd5e72d1778f5ee880f"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);


/* ======================
ELEMENTOS
====================== */

const usersDiv = document.getElementById("admin-users");
const presenceDiv = document.getElementById("admin-presence");
const messagesDiv = document.getElementById("admin-messages");

const newName = document.getElementById("new-name");
const newPass = document.getElementById("new-pass");
const createBtn = document.getElementById("create-user");


/* ======================
CREAR USUARIO
====================== */

createBtn.onclick = async () => {

const nombre = newName.value.trim();
const clave = newPass.value.trim();

if(!nombre || !clave){
alert("Falta nombre o clave");
return;
}

await addDoc(collection(db,"usuarios"),{

nombre,
clave,
isAdmin:false,
avatar:""

});

newName.value="";
newPass.value="";

};


/* ======================
VER USUARIOS
====================== */

onSnapshot(collection(db,"usuarios"), snap => {

usersDiv.innerHTML="";

snap.forEach(d=>{

const u=d.data();

const el=document.createElement("div");

el.className="bg-slate-700 p-2 rounded";

el.innerHTML=`

<div class="font-semibold">${u.nombre}</div>

<div class="flex gap-2 mt-2">

<button data-id="${d.id}" class="editUser bg-blue-600 px-2 py-1 rounded text-xs">
Editar
</button>

<button data-id="${d.id}" class="adminUser bg-yellow-600 px-2 py-1 rounded text-xs">
Admin
</button>

<button data-id="${d.id}" class="deleteUser bg-red-600 px-2 py-1 rounded text-xs">
Eliminar
</button>

</div>
`;

usersDiv.appendChild(el);

});

});


/* ======================
USUARIOS ONLINE
====================== */

onSnapshot(collection(db,"usuarios_online"), snap=>{

presenceDiv.innerHTML="";

snap.forEach(d=>{

const u=d.data();

const el=document.createElement("div");

el.className="bg-slate-700 p-2 rounded";

el.innerHTML=`${u.nombre} 🟢`;

presenceDiv.appendChild(el);

});

});


/* ======================
MENSAJES
====================== */

onSnapshot(collection(db,"mensajes"), snap=>{

messagesDiv.innerHTML="";

snap.forEach(d=>{

const m=d.data();

const el=document.createElement("div");

el.className="bg-slate-700 p-2 rounded";

el.innerHTML=`

<div><b>${m.usuario}</b>: ${m.texto || ""}</div>

<div class="flex gap-2 mt-2">

<button data-id="${d.id}" class="editMsg bg-blue-600 px-2 py-1 rounded text-xs">
Editar
</button>

<button data-id="${d.id}" class="deleteMsg bg-red-600 px-2 py-1 rounded text-xs">
Eliminar
</button>

</div>
`;

messagesDiv.appendChild(el);

});

});


/* ======================
BOTONES
====================== */

document.addEventListener("click",async e=>{

const id=e.target.dataset.id;

if(!id) return;


/* EDITAR USUARIO */

if(e.target.classList.contains("editUser")){

const nombre=prompt("Nuevo nombre");
const clave=prompt("Nueva clave");

await updateDoc(doc(db,"usuarios",id),{

nombre,
clave

});

}


/* HACER ADMIN */

if(e.target.classList.contains("adminUser")){

await updateDoc(doc(db,"usuarios",id),{

isAdmin:true

});

}


/* BORRAR USUARIO */

if(e.target.classList.contains("deleteUser")){

if(!confirm("Eliminar usuario?")) return;

await deleteDoc(doc(db,"usuarios",id));

}


/* EDITAR MENSAJE */

if(e.target.classList.contains("editMsg")){

const texto=prompt("Nuevo mensaje");

await updateDoc(doc(db,"mensajes",id),{

texto

});

}


/* BORRAR MENSAJE */

if(e.target.classList.contains("deleteMsg")){

if(!confirm("Eliminar mensaje?")) return;

await deleteDoc(doc(db,"mensajes",id));

}

});