// ==========================================================================
// KONFIGURASI FIREBASE — dioptimalkan untuk penghematan Reads Firestore
// ==========================================================================
export const firebaseConfig = {
  apiKey: "AIzaSyDVD2HB3Q_Ltp-zSIufgN7Ajq9MG2CvADQ",
  authDomain: "jemput-an-nashir-dda51.firebaseapp.com",
  projectId: "jemput-an-nashir-dda51",
  storageBucket: "jemput-an-nashir-dda51.firebasestorage.app",
  messagingSenderId: "709710168570",
  appId: "1:709710168570:web:7897c05cf175414aa0e443",
};

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  initializeFirestore, collection, onSnapshot, getDocs, query, where,
  doc, deleteDoc, updateDoc, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getFunctions, httpsCallable,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const app = initializeApp(firebaseConfig);

export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  useFetchStreams: false,
});

export const auth = getAuth(app);
const functions = getFunctions(app);

/* ---------- roster: Diubah menjadi SEKALI AMBIL (Hemat Reads) ---------- */
export async function getRosterOnce() {
  const snap = await getDocs(collection(db, "students_public"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Tetap disedikan versi listener jika sewaktu-waktu masih dibutuhkan
export function listenRoster(onChange) {
  return onSnapshot(collection(db, "students_public"), (snap) => {
    onChange(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

/* ---------- antrean penjemputan: Dibatasi HANYA HARI INI ---------- */
export function listenQueue(onChange) {
  // Ambil format tanggal hari ini (YYYY-MM-DD) untuk memfilter data queue agar tidak membaca hari lalu
  const todayStr = new Date().toISOString().split('T')[0];
  const q = query(collection(db, "queue"), where("date", "==", todayStr));
  
  return onSnapshot(q, (snap) => {
    onChange(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

/* ---------- antrean penjemputan: dengar SATU entri ---------- */
export function listenQueueEntry(queueId, onChange) {
  return onSnapshot(doc(db, "queue", queueId), (snap) => {
    onChange(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  });
}

/* ---------- guru: tandai siswa sudah dipanggil keluar ---------- */
export async function markCalled(entryId) {
  await updateDoc(doc(db, "queue", entryId), { status: "called", calledAt: serverTimestamp() });
}

/* ---------- guru: tandai selesai diserahkan -> hapus dari papan ---------- */
export async function markPickupDone(entryId) {
  await deleteDoc(doc(db, "queue", entryId));
}

/* ---------- orang tua: kirim permintaan jemput ---------- */
const requestPickupFn = httpsCallable(functions, "requestPickup");
export async function submitPickup(studentId, pin, pickerName, coords) {
  const res = await requestPickupFn({
    studentId, pin, pickerName,
    lat: coords?.latitude, lng: coords?.longitude, accuracy: coords?.accuracy,
  });
  return res.data; 
}

/* ---------- orang tua: ganti PIN keluarga sendiri ---------- */
const changeFamilyPinFn = httpsCallable(functions, "changeFamilyPin");
export async function changeFamilyPin(studentId, currentPin, newPin, coords) {
  const res = await changeFamilyPinFn({
    studentId, currentPin, newPin,
    lat: coords?.latitude, lng: coords?.longitude, accuracy: coords?.accuracy,
  });
  return res.data; 
}

/* ---------- admin: login & sesi ---------- */
export function adminLogin(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}
export function adminLogout() {
  return signOut(auth);
}
export function watchAdminSession(callback) {
  return onAuthStateChanged(auth, (user) => callback(user));
}
export function resetAdminPassword(email) {
  return sendPasswordResetEmail(auth, email);
}

/* ---------- admin: kelola siswa ---------- */
const addStudentFn = httpsCallable(functions, "adminAddStudent");
const updatePinFn = httpsCallable(functions, "adminUpdateStudentPin");
const deleteStudentFn = httpsCallable(functions, "adminDeleteStudent");

export async function addStudent(name, cls, pin) {
  return (await addStudentFn({ name, class: cls, pin })).data;
}
export async function updateStudentPin(studentId, newPin) {
  return (await updatePinFn({ studentId, newPin })).data;
}
export async function deleteStudent(studentId) {
  return (await deleteStudentFn({ studentId })).data;
}