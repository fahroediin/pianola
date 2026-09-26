# Pianola

Tempel notasi lagu, tekan Play, dan piano di
[recursivearts.com/virtual-piano](https://recursivearts.com/virtual-piano/) dimainkan otomatis.
Tuts benar-benar ditekan di situsnya, jadi kamu bisa melihat dan mendengar setiap not.

Namanya diambil dari *pianola*, piano mekanis awal abad ke-20 yang memainkan dirinya sendiri dari
gulungan kertas berlubang. Bedanya, gulungannya sekarang berupa teks.

## Cara kerja

```
notasi (teks) -> parser -> penjadwal -> Playwright -> piano Unity di browser
                  |           |
                  |           +-- daftar aksi keyboard berwaktu (down/up, Shift)
                  +-- validasi + error per baris
```

- **Parser** membaca format ketat dua jalur (tangan kanan `RH` dan tangan kiri `LH`), lalu
  menolak seluruh lagu kalau ada kesalahan. Semua error dilaporkan sekaligus dengan nomor
  barisnya.
- **Penjadwal** mengubah not menjadi aksi keyboard dengan waktu absolut. Not kres dimainkan
  dengan Shift + tombol not naturalnya, sesuai tata letak keyboard situs.
- **Player** membuka Chromium lewat Playwright dan mengirim input keyboard asli (trusted). Situs
  ini aplikasi Unity WebGL yang mengabaikan event JavaScript buatan.

Catatan teknis: Unity membaca status Shift satu kali per frame. Jeda milidetik saja tidak cukup,
karena not natural dan Shift bisa jatuh di frame yang sama sehingga natural ikut terbaca kres.
Hanya 16 dari 32 not akord campuran yang benar sebelum ini diperbaiki. Player sekarang menunggu
halaman merender frame baru sebelum setiap perubahan Shift. Setelah perbaikan, verifikasi lewat
sadapan WebAudio menunjukkan 225 dari 225 nada benar.

## Kebutuhan

- Node.js 24 atau lebih baru. File TypeScript dijalankan langsung tanpa build.
- Koneksi internet, karena piano dimuat dari situs aslinya.

## Instalasi

```bash
npm install
npx playwright install chromium
```

## Pemakaian

### Panel web

```bash
npm start
```

Buka http://127.0.0.1:5178. Chromium terbuka sendiri dan memuat piano (sekitar 15-20 detik)
sampai status panel menjadi `Siap`. Setelah itu:

1. Tempel notasi ke kotak teks.
2. Atur kecepatan (50-200%) bila perlu.
3. Tekan **Play**. **Stop** menghentikan lagu dan melepas semua tuts.

Kalau notasi salah, error per baris tampil di panel dan piano tidak disentuh. Teks notasi
tersimpan di browser, jadi tidak hilang saat halaman di-refresh.

### Command line

```bash
npm run smoke songs/ode-to-joy.txt
```

## Format yang diterima

Pianola **hanya** menerima format di bawah ini. Formatnya sengaja ketat: satu kesalahan saja
membuat seluruh lagu ditolak, dan tidak ada yang dimainkan setengah jalan. Semua kesalahan
dilaporkan sekaligus dengan nomor barisnya.

### Contoh

```
tempo: 90
# Contoh format (melodi buatan)

# Bagian A
RH: C4 E4 G4 [C5 E5] | R:0.5 G4:0.5 F#4 E4:2
LH: C3:2 G2:2 | A2:2 C3:2

# Bagian B
RH: [D4 F#4 A4]:2 Bb4:1.5 A4:0.5 | G4:4
LH: D3:4 | G2:2 [G2 D3]:2
```

### Struktur

1. `tempo: N` di awal file, sebelum blok pertama. N = BPM 20-300. Opsional, default 90. Hanya
   boleh sekali.
2. Lagu terdiri dari **blok**. Blok dipisahkan satu atau lebih baris kosong.
3. Setiap blok berisi paling banyak satu baris `RH:` (tangan kanan) dan satu baris `LH:` (tangan
   kiri). Boleh hanya salah satunya. Label tidak peka huruf besar/kecil.
4. RH dan LH dalam satu blok **mulai bersamaan**. Blok berikutnya mulai setelah jalur terpanjang
   di blok sebelumnya selesai. Kalau total ketuk RH dan LH tidak sama, jalur yang lebih pendek
   diam sampai jalur yang lebih panjang selesai.
5. Komentar diawali `#` di awal baris atau setelah spasi. Baris yang hanya berisi komentar
   diabaikan: bukan bagian blok dan tidak memutus blok. `#` yang menempel pada huruf not (`C#4`)
   adalah tanda kres.

### Token di baris RH/LH

Token dipisahkan spasi.

| Token | Contoh | Aturan |
|---|---|---|
| Not | `C4`, `F#3`, `Bb5`, `e5` | Huruf A-G, opsional `#` atau `b`, lalu satu digit oktaf. Tengah piano = C4. Mol diubah ke kres padanannya (`Bb5` = `A#5`). |
| Akord | `[C4 E4 G4]` | Not dalam kurung siku, dipisahkan spasi. Minimal satu not, tanpa not ganda. |
| Istirahat | `R` | Diam selama durasinya. |
| Durasi | `C4:2`, `[C3 G3]:0.5`, `R:1.5` | Dalam ketuk, ditulis di belakang not, akord, atau istirahat. Default 1. Boleh desimal, harus lebih dari 0. |
| Garis birama | `\|` | Hanya pemisah visual, diabaikan. |

### Batasan piano

- **Jangkauan C2 sampai C7** (61 tuts). Not di luar rentang ini ditolak. Pindahkan satu oktaf.
- **Satu tombol, satu not dalam satu waktu.** Situs memainkan not kres dengan Shift + tombol not
  natural di bawahnya. Karena itu, pasangan berikut memakai tombol fisik yang sama dan tidak
  boleh berbunyi bersamaan:
  - not yang sama persis di RH dan LH, misalnya E4 dan E4;
  - sebuah not dan kresnya di oktaf yang sama: C/C#, D/D#, F/F#, G/G#, A/A#. Mol ikut padanannya
    (Db=C#, Eb=D#, Gb=F#, Ab=G#, Bb=A#).

  Aturan ini berlaku di dalam satu akord (`[C4 C#4]`) maupun antar-tangan. Not yang sama boleh
  dimainkan berurutan (`E4 E4`).

### Tidak didukung

Dinamika (p, f, crescendo), pedal, legato/staccato, tanda ulang (x2, D.C., volta), tanda kunci,
lirik, dan teks bebas di luar komentar. Bagian yang diulang harus ditulis ulang utuh. Triplet
ditulis dengan durasi desimal: `C4:0.333 D4:0.333 E4:0.334`.

### Pesan error

| Pesan | Artinya |
|---|---|
| `X di luar jangkauan piano (C2-C7)` | Not terlalu rendah atau tinggi. Pindahkan satu oktaf. |
| `bentrok tombol: A (baris m) dan B (baris n) ...` | Dua not memakai tombol yang sama pada waktu bersamaan. |
| `token "..." tidak dikenal` | Ada simbol di luar format. |
| `durasi "..." tidak valid pada "..."` | Durasi kosong, nol, negatif, atau bukan angka. |
| `kurung akord "[" tidak ditutup` / `akord kosong` | Penulisan akord salah. |
| `not X ditulis dua kali dalam akord` | Not ganda di dalam satu akord. |
| `baris harus diawali RH: atau LH:` | Ada teks di luar komentar, termasuk baris backtick yang ikut tertempel. |
| `label "..." tidak dikenal, gunakan RH: atau LH:` | Label selain RH/LH. |
| `RH sudah ada di blok ini` | Dua baris RH (atau LH) dalam satu blok. Kemungkinan lupa baris kosong. |
| `tempo harus angka 20-300, bukan "..."` | Tempo di luar rentang atau bukan angka. |
| `tempo ditulis lebih dari sekali` / `tempo harus ditulis sebelum blok pertama` | Posisi atau jumlah baris tempo salah. |
| `tidak ada not untuk dimainkan` | File kosong atau hanya berisi istirahat. |

## Membuat notasi dengan LLM

Kebanyakan orang tidak menulis notasi dengan tangan. Salin prompt di bawah ke ChatGPT, Claude,
atau Gemini, lalu ganti `{{LAGU}}` dengan judul lagu atau bahan mentahnya (misalnya teks
aransemen bebas). Yang ditempel ke panel atau file `.txt` hanya isi notasinya. Baris pembuka dan
penutup code block (tiga backtick) jangan ikut.

````text
Ubah lagu berikut menjadi notasi piano dalam FORMAT KETAT di bawah. Notasi ini dibaca oleh
program, bukan manusia. Satu pelanggaran format membuat seluruh lagu ditolak.

LAGU: {{LAGU}}

## Format

1. Baris pertama: `tempo: N` (BPM, angka 20-300). 1 ketuk = 1 satuan durasi.
2. Lagu dibagi menjadi BLOK. Antar-blok dipisahkan SATU BARIS KOSONG.
3. Setiap blok berisi paling banyak satu baris `RH:` (tangan kanan) dan satu baris `LH:`
   (tangan kiri). Boleh hanya salah satunya. RH dan LH dalam satu blok MULAI BERSAMAAN.
   Blok berikutnya mulai setelah jalur terpanjang di blok sebelumnya selesai.
4. Komentar diawali `#` di awal baris atau setelah spasi. Baris komentar boleh diletakkan di
   mana saja dan tidak memutus blok.
5. Isi baris RH/LH adalah token yang dipisahkan spasi:
   - Not: huruf A-G, opsional `#` (kres) atau `b` (mol), lalu SATU digit oktaf.
     Contoh: `C4`, `F#3`, `Bb5`. Tengah piano = C4.
   - Akord: not-not dalam kurung siku, dipisahkan spasi: `[C4 E4 G4]`. Tanpa not ganda.
   - Istirahat: `R`.
   - Durasi dalam ketuk ditulis dengan `:angka` di belakang not, akord, atau istirahat. Default
     1. Boleh desimal: `E4:0.5`, `[C3 G3]:2`, `R:1.5`. Harus lebih dari 0.
     Triplet ditulis dengan pembulatan: `C4:0.333 D4:0.333 E4:0.334`.
   - `|` boleh dipakai sebagai garis birama. Program mengabaikannya.
6. Tidak ada simbol lain: tanpa dinamika (p, f), pedal, legato, ulangan (x2, D.C.), tanda
   kunci, lirik, atau teks di luar komentar. Bagian yang diulang harus ditulis ulang utuh.

## Batasan piano (wajib)

A. JANGKAUAN HANYA C2 SAMPAI C7. Not di bawah C2 (misalnya A1) naikkan satu oktaf. Not di atas
   C7 turunkan satu oktaf.
B. TIDAK BOLEH ADA DUA NOT YANG MEMAKAI TOMBOL YANG SAMA PADA WAKTU BERSAMAAN. Tombol sama berarti:
   - not yang sama persis di RH dan LH yang berbunyi bersamaan, atau
   - sebuah not dan kresnya di oktaf yang sama: C dan C#, D dan D#, F dan F#, G dan G#,
     A dan A# (mol ikut padanannya: Db=C#, Eb=D#, Gb=F#, Ab=G#, Bb=A#).
   Ini juga berlaku di dalam satu akord (`[C4 C#4]` dilarang) dan antar-tangan. Kalau
   bertabrakan, pindahkan salah satu not satu oktaf atau buang not yang merupakan pengisi.
   Not yang sama boleh dimainkan BERURUTAN (`E4 E4`).
C. Dalam satu blok, total ketuk RH dan LH sebaiknya SAMA. Kalau tidak sama, jalur yang lebih
   pendek akan diam sampai jalur yang lebih panjang selesai.

## Kejujuran

Kalau kamu tidak yakin dengan melodi aslinya, tetap buat aransemen terbaik yang kamu bisa, lalu
tulis satu baris komentar di bagian atas: `# catatan: <bagian yang kamu kira-kira>`. Jangan
mengarang lalu mengaku akurat.

## Contoh valid (melodi buatan, hanya contoh format)

tempo: 90
# Contoh format

# Bagian A
RH: C4 E4 G4 [C5 E5] | R:0.5 G4:0.5 F#4 E4:2
LH: C3:2 G2:2 | A2:2 C3:2

# Bagian B
RH: [D4 F#4 A4]:2 Bb4:1.5 A4:0.5 | G4:4
LH: D3:4 | G2:2 [G2 D3]:2

## Sebelum menjawab, periksa sendiri

- [ ] Baris pertama `tempo: N`.
- [ ] Setiap baris not diawali `RH:` atau `LH:`, dan tiap label paling banyak sekali per blok.
- [ ] Semua not ada di rentang C2-C7.
- [ ] Tidak ada tombol yang dipakai dua not pada saat bersamaan (aturan B).
- [ ] Total ketuk RH = LH di setiap blok.
- [ ] Hanya token yang diizinkan: not, `[...]`, `R`, `:durasi`, `|`, dan komentar `#`.

## Format jawaban

Jawab HANYA dengan satu code block berisi notasi lengkap dari awal sampai akhir lagu. Tanpa
penjelasan sebelum atau sesudahnya.
````

### Kalau notasi ditolak

Kirim semua baris error kembali ke LLM yang sama:

```text
Program menolak notasimu dengan error berikut. Perbaiki hanya baris yang disebut, lalu kirim
ulang notasi lengkap dalam satu code block:

<tempel semua baris error di sini>
```

### Soal hak cipta

Notasi lagu ciptaan orang lain, termasuk hasil LLM, tetap merupakan aransemen dari karya yang
dilindungi hak cipta. Boleh dimainkan untuk diri sendiri, tapi **jangan di-commit ke repo
publik**. Folder `songs/` di repo ini hanya berisi lagu domain publik dan lagu uji buatan
sendiri.

## Lagu contoh

| File | Isi |
|---|---|
| `songs/ode-to-joy.txt` | Ode to Joy, Beethoven (domain publik) |
| `songs/twinkle.txt` | Twinkle Twinkle Little Star (domain publik) |
| `songs/fur-elise.txt` | Für Elise, Beethoven (domain publik) |
| `songs/uji-kres.txt` | Uji akord campuran kres + natural dan tangga nada kromatik |

## Pengujian

```bash
npm test
```

44 tes otomatis mencakup pemetaan tombol, parser, penjadwal (termasuk aturan Shift dan deteksi
bentrok tombol), lagu contoh, dan API server dengan player palsu. Player tidak dites otomatis
karena bergantung pada situs nyata.

## Struktur

```
src/keymap.ts      nama not -> tombol keyboard situs
src/notation.ts    parser + pesan error
src/schedule.ts    not -> aksi keyboard berwaktu
src/player.ts      Playwright yang menekan tuts
src/server.ts      HTTP API untuk panel
src/main.ts        titik masuk npm start
public/panel.html  panel web
scripts/smoke.ts   pemutaran dari command line
docs/              spec desain dan rencana implementasi
```

## Keterbatasan

- Bergantung pada struktur situs recursivearts.com. Kalau situsnya berubah, player bisa berhenti
  bekerja.
- Timing bisa meleset sesekali, sampai sekitar 200 ms, biasanya di akord pertama.
- Tidak ada dinamika (keras/lembut) dan pedal. Semua not ditekan dengan kekuatan yang sama.

Proyek pribadi untuk eksperimen, tidak berafiliasi dengan Recursive Arts. Pakai secukupnya dan
hormati situs penyedia pianonya.
