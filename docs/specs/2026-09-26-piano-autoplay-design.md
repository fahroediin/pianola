# Piano Autoplay: Design Spec

Tanggal: 2026-09-26
Status: menunggu review

## 1. Tujuan

Pengguna menempel notasi lagu di panel web lokal, menekan Play, lalu melihat dan mendengar
piano di https://recursivearts.com/virtual-piano/ dimainkan otomatis: tuts ditekan satu per satu
sesuai notasi.

Di luar cakupan:
- Mengubah teks bebas (prosa, tabel, "Tangan Kanan: ...") menjadi format ketat. Pengguna
  melakukannya sendiri lewat Claude/ChatGPT.
- Memainkan lagu tanpa membuka situs (Web Audio sendiri).
- Dinamika (keras/lembut), pedal, dan transpose otomatis.

## 2. Fakta situs (hasil spike 2026-09-26)

- Piano adalah aplikasi Unity WebGL di `<canvas id="canvas">`. Tombol `.piano-load-button`
  harus diklik untuk memuatnya, lalu butuh sekitar 15 detik hingga siap.
- Input hanya diterima dari event keyboard trusted (Playwright/CDP). `dispatchEvent` dari
  JavaScript tidak berpengaruh. Canvas harus diklik sekali dulu untuk memberi fokus.
- Jangkauan 61 tuts: C2 sampai C7.
- Tuts natural: `1234567890qwertyuiopasdfghjklzxcvbnm` berurutan = C2 D2 E2 F2 G2 A2 B2 C3 ... C7.
- Tuts kres = Shift + tombol not natural di bawahnya (Shift+`1` = C#2, Shift+`t` = C#4).
  Tidak ada kres untuk E dan B.
- Unity membaca status Shift per frame (sekitar 16 ms). Shift dikunci pada frame saat tombol
  ditekan: kres tetap berbunyi setelah Shift dilepas, dan natural yang sudah ditekan tidak
  berubah saat Shift ditekan. Kalau Shift ditekan dan dilepas dalam frame yang sama, kres
  terbaca sebagai natural.
- Melepas tombol fisik (`keyup`) menghentikan not tersebut, apa pun status Shift.

## 3. Format notasi

```
tempo: 90
# komentar

RH: E4 F4 E4 F4 | E5 F5 E5 C5:3
LH: A2 E3 A3:5

RH: [E5 E6] [F5 F6] [E5 E6] [C5 C6]:2
LH: A2:0.5 E3:0.5 A3:0.5 C4:0.5 E4:3
```

Aturan:
- `tempo: N`: BPM, opsional, default 90. Rentang 20-300. Hanya boleh muncul satu kali, sebelum
  blok pertama.
- `#` sampai akhir baris adalah komentar.
- **Blok** = kelompok baris tidak kosong yang dipisahkan satu atau lebih baris kosong. Tiap baris
  di blok diawali label `RH:` atau `LH:`. Tiap label paling banyak sekali per blok. Blok boleh
  hanya berisi satu jalur.
- Jalur-jalur dalam satu blok mulai bersamaan. Blok berikutnya mulai setelah jalur terpanjang di
  blok sebelumnya selesai.
- Token, dipisahkan spasi:
  - Not: `<huruf A-G><aksidental opsional # atau b><oktaf 0-9>`, contoh `C4`, `F#3`, `Bb5`.
    Huruf tidak peka besar/kecil. Mol diubah ke kres padanannya (`Bb5` = `A#5`, `Cb4` = `B3`,
    `Fb4` = `E4`, `E#4` = `F4`, `B#3` = `C4`).
  - Akord: `[` not-not dipisahkan spasi `]`, contoh `[E5 E6]`. Minimal satu not, tanpa not ganda.
  - Istirahat: `R`.
  - Durasi opsional `:<angka>` pada not, akord, atau istirahat, dalam ketuk. Default 1. Boleh
    desimal (`0.5`). Harus lebih dari 0.
  - `|` diabaikan (pemisah visual).
- 1 ketuk = `60000 / (tempo * kecepatan)` ms. `kecepatan` berasal dari panel (lihat bagian 6).

Validasi (semua error dikumpulkan, dilaporkan dengan nomor baris, dan pemutaran tidak dimulai
selama masih ada error):
- Token tidak dikenal, label tidak dikenal, label ganda dalam blok, tempo di luar rentang atau
  ganda, durasi tidak valid, kurung akord tidak tertutup.
- Not di luar C2-C7. Pesan: `baris 12: A1 di luar jangkauan piano (C2-C7)`.
- **Bentrok tombol**: dua not yang memakai tombol fisik sama (misal C4 dan C#4, atau E4 di RH dan
  LH) memiliki interval bunyi `[start, start + dur)` yang tumpang tindih. Pesan menyebut kedua
  not dan baris-barisnya. Karena butuh waktu, validasi ini dilakukan di `schedule`, tidak di
  parser.
- Teks tanpa not sama sekali.

## 4. Penjadwalan (Song -> daftar aksi keyboard)

Keluaran: daftar aksi `{ at: ms, type: 'down' | 'up', key: string }` terurut waktu. `key` berupa
tombol natural huruf kecil/angka, atau `Shift`.

1. **Waktu not.** Not mulai di `start` dan berbunyi selama `dur` ms. Tombolnya dilepas di
   `start + dur - gap`, dengan `gap = min(30, dur * 0.1)` ms, supaya not sama yang berurutan
   (E4 E4) terdengar sebagai dua ketukan.
2. **Aturan Shift.** Di tiap titik waktu yang memiliki `down`:
   - Tekan semua tombol natural lebih dulu.
   - Kalau ada kres: `Shift down`, lalu tombol-tombol kres `down`, lalu `Shift up` pada
     `+SHIFT_HOLD` (40 ms).
   - Selama jendela Shift aktif, `down` natural yang terjadwal dimundurkan ke saat `Shift up`.
     `down` kres dalam jendela itu ikut memakai Shift yang sedang aktif, dan jendelanya
     diperpanjang 40 ms dari penekanan terakhir.
   - `up` tidak terpengaruh Shift.
3. Aksi `up` yang mundur ke sebelum `down`-nya (not sangat pendek) dipaksa minimal
   `down + 20 ms`.

## 5. Komponen

Node 24 menjalankan TypeScript langsung (type stripping). Tanpa build step. Satu dependensi
runtime: `playwright`.

```
piano-autoplay/
  package.json          type: module; scripts: start, test
  src/keymap.ts         noteToKey("C#4") -> { key: "t", shift: true } | null
  src/notation.ts       parse(text) -> { song, errors[] }
  src/schedule.ts       schedule(song, speed) -> { actions: Action[], errors[] }; errors = bentrok tombol
  src/player.ts         Playwright: buka situs, load piano, fokus, jalankan aksi, stop
  src/server.ts         HTTP (node:http): panel + API
  public/panel.html     UI
  songs/                contoh domain publik: ode-to-joy.txt, twinkle.txt
  test/                 node:test untuk keymap, notation, schedule
```

Batas tanggung jawab:
- `keymap`, `notation`, `schedule` adalah fungsi murni. Tidak menyentuh browser atau jaringan.
- `player` tidak tahu soal notasi, hanya menerima `Action[]`.
- `player` memakai jam absolut: tiap aksi dieksekusi saat `performance.now() - t0 >= at`.
  Keterlambatan satu aksi tidak menumpuk ke aksi berikutnya.

## 6. Panel dan API

Panel (`GET /`):
- Textarea notasi. Isinya disimpan di `localStorage` supaya tidak hilang saat refresh.
- Kecepatan: 50-200%, default 100%. Mengalikan tempo di teks.
- Tombol Play dan Stop, serta baris status: `Memuat piano...`, `Siap`, `Memainkan...`,
  `Selesai`, `Berhenti`.
- Daftar error dari server, satu per baris.

API:
- `POST /play` `{ text, speed }`: kalau ada error, balas 400 `{ errors: [...] }`. Kalau valid,
  hentikan pemutaran yang sedang berjalan, mulai yang baru, dan balas 200.
- `POST /stop`: hentikan pemutaran dan lepas semua tombol, termasuk Shift.
- `GET /status`: `{ state: 'loading' | 'ready' | 'playing' | 'done' | 'stopped' | 'error', message? }`.
  Panel melakukan polling setiap 500 ms selama tidak `ready`/`done`/`stopped`.

Siklus browser:
- Chromium (headed) dibuka saat server start, lalu memuat piano. Status `loading` sampai siap.
- Kalau jendela Chromium ditutup pengguna, Play berikutnya membukanya lagi.
- Server hanya mendengarkan `127.0.0.1:5178`.

## 7. Penanganan error

- Error notasi: ditampilkan di panel. Browser tidak disentuh.
- Situs gagal dimuat atau `.piano-load-button` tidak ditemukan: status `error` dengan pesan.
  Play berikutnya mencoba lagi.
- Stop di tengah lagu, atau proses berhenti: semua tombol yang sedang ditekan dilepas.

## 8. Pengujian

Otomatis (`npm test` -> `node --test`), ditulis TDD:
- keymap: batas C2/C7, semua 12 nama not, mol ke kres, di luar jangkauan -> null.
- notation: tempo default/eksplisit, durasi default/desimal, akord, istirahat, `|`, komentar,
  pemisahan blok, tiap jenis error beserta nomor barisnya.
- schedule: waktu down/up termasuk gap, blok paralel dan blok berurutan, kecepatan, aturan Shift
  (akord campuran, natural yang dimundurkan, perpanjangan jendela), bentrok tombol.

Manual (oleh pengguna): Ode to Joy dan Twinkle dimainkan dengan benar dan terdengar, akord
campuran berbunyi benar, Stop langsung menghentikan suara, error notasi tampil di panel.
