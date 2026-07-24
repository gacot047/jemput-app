# Jemput — Frontend (An Nashir Islamic School, SD)

3 halaman terpisah, sudah tersambung ke backend Firebase (`jemput-backend/`):

| File | Untuk siapa | Link dibagikan ke |
|---|---|---|
| `index.html` | Orang tua/wali | Publik — share via WA/QR ke semua wali murid |
| `admin.html` | Guru/admin kelola data siswa & PIN | **Jangan disebar** — hanya untuk yang punya akun |
| `monitor.html` | Layar TV di tiap kelas | Dibuka sekali di perangkat TV, login sekali, biarkan terbuka |

## Sebelum dipakai

1. **Selesaikan setup backend dulu** — ikuti `jemput-backend/README.md` (buat project Firebase, aktifkan Firestore + Auth, deploy rules & functions, buat akun guru).
2. **Isi `firebase-config.js`** — ganti 6 baris `ISI_DARI_FIREBASE_CONSOLE` dengan nilai asli dari Firebase Console (Project settings → Your apps → Web app).
3. Ketiga file HTML memanggil file ini (`<script type="module" src="./firebase-config.js">` secara implisit lewat `import`), jadi **kelima file harus tetap dalam satu folder yang sama**: `index.html`, `admin.html`, `monitor.html`, `style.css`, `firebase-config.js`, `logo.png`.

## Deploy ke GitHub Pages

Sama seperti project GitHub Pages Anda yang lain — upload semua file di folder ini (jangan folder `jemput-backend`, itu terpisah dan di-deploy lewat `firebase deploy`, bukan GitHub Pages) ke repo, aktifkan GitHub Pages dari branch tersebut. Karena pakai ES module (`import`), file harus diakses lewat `http://` atau `https://` (GitHub Pages otomatis begitu) — tidak akan jalan kalau dibuka langsung dari file lokal (`file://`).

## Alur pemakaian sehari-hari
- **Orang tua**: buka `index.html` dari HP → izinkan lokasi → cari nama anak → masukkan PIN → tunggu di luar/mobil.
- **Guru piket di kelas**: buka `monitor.html` di TV kelas pagi hari, login sekali pakai akun guru → biarkan terbuka sepanjang hari. Nama yang dipanggil otomatis muncul real-time. Tekan "Selesai" setelah anak diserahkan.
- **Admin/kepala sekolah**: buka `admin.html` untuk tambah siswa baru, ganti PIN, atau hapus siswa yang sudah lulus/pindah.

## Yang berubah dari prototipe satu-file sebelumnya
- Sudah tidak ada tab Admin yang kelihatan di aplikasi orang tua — benar-benar file terpisah
- PIN & radius diverifikasi di server (Cloud Function), bukan di browser
- Data real-time pakai `onSnapshot` (langsung update, tanpa jeda polling)
- Login admin/guru pakai akun Firebase Authentication asli, bisa reset password lewat email
