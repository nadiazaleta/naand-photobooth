/* ==========================================================
   AMBIL SEMUA ELEMEN HTML YANG DIPERLUKAN
========================================================== */

// Halaman-halaman
const pageStart = document.getElementById('pageStart');
const pageLayout = document.getElementById('pageLayout');
const pageCamera = document.getElementById('pageCamera');
const pageResult = document.getElementById('pageResult');

// Tombol-tombol utama
const btnStartCamera = document.getElementById('btnStartCamera');
const btnConfirmLayout = document.getElementById('btnConfirmLayout');
const btnTakePhoto = document.getElementById('btnTakePhoto');
const btnDownload = document.getElementById('btnDownload');
const btnRetake = document.getElementById('btnRetake');

// Pemilih layout
const layoutPicker = document.getElementById('layoutPicker');

// Elemen kamera & countdown
const video = document.getElementById('video');
const flashEffect = document.getElementById('flashEffect');
const countdownOverlay = document.getElementById('countdownOverlay');
const photoCounter = document.getElementById('photoCounter');
const statusMessage = document.getElementById('statusMessage');

// Pemilih filter & frame
const filterPicker = document.getElementById('filterPicker');
const framePicker = document.getElementById('framePicker');

// Kontrol kecerahan manual
const brightnessSlider = document.getElementById('brightnessSlider');
const brightnessValue = document.getElementById('brightnessValue');

// Canvas
const hiddenCanvas = document.getElementById('hiddenCanvas');
const hiddenCtx = hiddenCanvas.getContext('2d');

// Canvas kerja tambahan: tempat menyimpan frame video APA ADANYA dulu (tanpa filter),
// sebelum digambar ulang dengan filter ke hiddenCanvas. Lihat penjelasan di capturePhoto().
const rawFrameCanvas = document.createElement('canvas');
const rawFrameCtx = rawFrameCanvas.getContext('2d');
const resultCanvas = document.getElementById('resultCanvas');
const resultCtx = resultCanvas.getContext('2d');


/* ==========================================================
   DATA: PILIHAN FILTER & FRAME
   - FILTERS: nilai CSS filter yang diterapkan ke Canvas (ctx.filter)
     saat foto benar-benar diambil, supaya hasil akhirnya konsisten
     dengan apa yang dilihat user di preview video.
   - FRAMES: tema warna untuk photo strip di halaman hasil.
========================================================== */

const FILTERS = {
  original: 'none',
  vintage: 'grayscale(55%) sepia(35%) contrast(1.1) saturate(1.15)',
  bw: 'grayscale(100%) contrast(1.15)',
  warm: 'sepia(25%) saturate(1.3) contrast(1.05)',
  nokia: 'contrast(1.2) saturate(1.55) sepia(0.1) hue-rotate(-6deg)',
  softfocus: 'brightness(1.18) contrast(0.85) saturate(0.9) blur(0.4px)',
  hazydays: 'sepia(0.4) saturate(1.5) brightness(1.12) hue-rotate(-8deg)',
  rose: 'sepia(0.3) hue-rotate(-30deg) saturate(2) contrast(1.1)',
  retro: 'sepia(0.25) hue-rotate(175deg) saturate(1.7) contrast(1.15)',
  cocoa: 'sepia(0.55) contrast(1.05) brightness(0.96) saturate(1.15)',
  xpro: 'contrast(1.35) saturate(1.7) hue-rotate(25deg)',
  envy: 'sepia(0.3) hue-rotate(65deg) saturate(1.8) contrast(1.1)',
  zinc: 'grayscale(30%) hue-rotate(180deg) saturate(1.2) contrast(1.08)'
};

// Filter-filter "moody" ini dikasih vignette gelap di pinggir foto
// supaya berasa lebih dramatis, seperti di aplikasi webcam filter.
const VIGNETTE_FILTERS = ['cocoa', 'retro', 'xpro'];

const FRAMES = {
  cream:    { background: '#F3ECDD', photoBorder: '#FFFFFF', text: '#2A2420' },
  noir:     { background: '#1C1815', photoBorder: '#2A2420', text: '#F3ECDD' },
  rose:     { background: '#F1DCD3', photoBorder: '#FFFFFF', text: '#6B3F36' },
  mint:     { background: '#DCE8DF', photoBorder: '#FFFFFF', text: '#33503B' },
  polkadot: {
    background: '#F7D7DE',
    photoBorder: '#FFFFFF',
    text: '#4A3428',
    pattern: 'polkadot',   // menandakan frame ini perlu digambar pola titik-titik
    dotColor: '#4A3428'
  },
  polaroid: {
    background: '#141414',
    photoBorder: '#FFFFFF',
    text: '#FFFFFF',
    tiltedSingle: true // menandakan: 1 foto dimiringkan + bingkai putih ala polaroid, bukan strip
  },
  none: {
    background: '#FFFFFF', // tetap putih solid (bukan transparan) supaya aman saat diekspor JPG
    photoBorder: '#FFFFFF',
    text: '#2A2420',
    noFrame: true // menandakan: skip border, pola, dan nama brand di bawah
  }
};

// Nama brand yang dicetak di bagian bawah photo strip.
// Ganti teks ini kalau suatu saat mau ubah nama lagi.
const BRAND_NAME = 'NANAD PHOTOBOOTH';

// Pilihan layout: jumlah pose dan jumlah kolom penyusunannya di strip.
// "columns: 1" artinya strip vertikal biasa, "columns: 2" artinya grid.
const LAYOUTS = {
  a: { poses: 4, columns: 1 },
  b: { poses: 3, columns: 1 },
  c: { poses: 2, columns: 1 },
  d: { poses: 6, columns: 2 },
  e: { poses: 1, columns: 1 } // layout foto tunggal, cocok dipasangkan sama frame Polaroid/Tanpa Frame
};


/* ==========================================================
   VARIABEL PENYIMPANAN DATA
========================================================== */

let mediaStream = null;
let capturedPhotos = [];
let layoutPhotoCount = 4; // jumlah foto sesuai layout yang dipilih di halaman awal
let TOTAL_PHOTOS = 4;     // jumlah foto yang berlaku sekarang (bisa di-override jadi 1 oleh "Tanpa Frame")

let currentFilter = 'original'; // filter yang sedang dipilih
let currentFrame = 'cream';     // frame/template yang sedang dipilih
let currentBrightness = 100;    // persen kecerahan, diatur lewat slider
let currentLayout = 'a';        // layout yang sedang dipilih (a/b/c/d)


/* ==========================================================
   FUNGSI: BERPINDAH HALAMAN
========================================================== */
function showPage(pageToShow) {
  pageStart.classList.remove('active');
  pageLayout.classList.remove('active');
  pageCamera.classList.remove('active');
  pageResult.classList.remove('active');

  pageToShow.classList.add('active');
}


/* ==========================================================
   FUNGSI: PILIH LAYOUT
========================================================== */
function selectLayout(layoutId) {
  currentLayout = layoutId;

  layoutPicker.querySelectorAll('.layout-card').forEach(card => {
    card.classList.toggle('active', card.dataset.layout === layoutId);
  });
}


/* ==========================================================
   FUNGSI: MENYALAKAN KAMERA
========================================================== */
async function startCamera() {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user' },
      audio: false
    });

    video.srcObject = mediaStream;
    updateVideoPreview(); // pastikan filter + kecerahan yang sedang aktif langsung terpasang

    capturedPhotos = [];
    updateCounter();

    showPage(pageCamera);
    statusMessage.textContent = 'Kamera siap digunakan';

  } catch (error) {
    alert(
      'Tidak bisa mengakses kamera.\n\n' +
      'Kemungkinan penyebab:\n' +
      '- Izin kamera ditolak\n' +
      '- Browser tidak mendukung kamera\n' +
      '- Website dibuka bukan lewat https:// atau localhost\n\n' +
      'Coba buka lagi lewat Live Server (bukan langsung dobel klik file HTML).'
    );
    console.error('Gagal mengakses kamera:', error);
  }
}


/* ==========================================================
   FUNGSI: MEMATIKAN KAMERA
========================================================== */
function stopCamera() {
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }
}


/* ==========================================================
   FUNGSI: UPDATE TEKS "X / 4 foto"
========================================================== */
function updateCounter() {
  photoCounter.textContent = `${capturedPhotos.length} / ${TOTAL_PHOTOS} foto`;
}


/* ==========================================================
   FUNGSI: GABUNGKAN FILTER + KECERAHAN JADI SATU STRING CSS
   Dipakai untuk preview video (video.style.filter) DAN untuk
   proses capture (ctx.filter), supaya hasilnya selalu sama
   persis dengan apa yang dilihat user di layar.
========================================================== */
function getCombinedFilterCss() {
  const base = FILTERS[currentFilter] === 'none' ? '' : FILTERS[currentFilter];
  return `${base} brightness(${currentBrightness}%)`.trim();
}

// Menerapkan filter+kecerahan gabungan ke preview video secara langsung
function updateVideoPreview() {
  video.style.filter = getCombinedFilterCss();
}


/* ==========================================================
   FUNGSI: PILIH FILTER
   Menyimpan pilihan filter, lalu update preview video.
   Kecerahan yang sedang diatur user tidak ikut ter-reset.
========================================================== */
function selectFilter(filterId) {
  currentFilter = filterId;

  // Ganti class aktif pada tombol-tombol pilihan filter
  filterPicker.querySelectorAll('.picker-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filterId);
  });

  updateVideoPreview();
}


/* ==========================================================
   FUNGSI: PILIH FRAME/TEMPLATE
   Hanya menyimpan pilihan, dipakai nanti saat buildPhotoStrip().
========================================================== */
function selectFrame(frameId) {
  currentFrame = frameId;

  framePicker.querySelectorAll('.frame-swatch').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.frame === frameId);
  });

  // Reset progress foto kalau frame diganti di tengah sesi,
  // supaya hitungan "X / Y foto" tidak jadi rancu.
  capturedPhotos = [];
  recomputeTotalPhotos();
}


/* ==========================================================
   FUNGSI: COUNTDOWN SEBELUM FOTO (dengan animasi "pop")
========================================================== */
function runCountdown() {
  return new Promise((resolve) => {
    let count = 3;
    triggerCountdownAnimation(count);

    const timer = setInterval(() => {
      count--;

      if (count > 0) {
        triggerCountdownAnimation(count);
      } else {
        triggerCountdownAnimation('📸');
        clearInterval(timer);

        setTimeout(() => {
          countdownOverlay.textContent = '';
          countdownOverlay.classList.remove('countdown-pop');
          resolve();
        }, 400);
      }
    }, 1000);
  });
}

// Fungsi bantu: menampilkan angka/emoji dengan animasi pop.
// Trik "reflow" (offsetWidth) dipakai supaya animasi CSS bisa
// diulang setiap kali teks berganti, bukan cuma jalan sekali.
function triggerCountdownAnimation(content) {
  countdownOverlay.classList.remove('countdown-pop');
  void countdownOverlay.offsetWidth; // memaksa browser "reset" animasi
  countdownOverlay.textContent = content;
  countdownOverlay.classList.add('countdown-pop');
}


/* ==========================================================
   FUNGSI: EFEK KILAT (FLASH) SAAT FOTO DIAMBIL
========================================================== */
function triggerFlash() {
  flashEffect.classList.remove('flash-on');
  void flashEffect.offsetWidth;
  flashEffect.classList.add('flash-on');
}


/* ==========================================================
   FUNGSI: MENGAMBIL SATU FRAME DARI VIDEO
   Filter yang dipilih user diterapkan langsung lewat Canvas API
   (ctx.filter), lalu hasilnya disimpan sebagai data gambar.
========================================================== */
function capturePhoto() {
  const width = video.videoWidth;
  const height = video.videoHeight;

  // LANGKAH 1: gambar frame video APA ADANYA (tanpa filter) ke canvas polos dulu.
  // Ini penting: beberapa browser di HP (terutama Safari/WebView/in-app browser)
  // diam-diam MENGABAIKAN ctx.filter kalau sumber gambarnya langsung elemen <video>.
  // Makanya efek kelihatan jalan di preview (pakai CSS filter), tapi hilang di hasil
  // foto (pakai Canvas filter). Solusinya: pindahkan dulu videonya ke canvas biasa...
  rawFrameCanvas.width = width;
  rawFrameCanvas.height = height;
  rawFrameCtx.save();
  rawFrameCtx.translate(width, 0);
  rawFrameCtx.scale(-1, 1); // mirror, sama seperti preview
  rawFrameCtx.drawImage(video, 0, 0, width, height);
  rawFrameCtx.restore();

  // LANGKAH 2: ...lalu gambar ULANG canvas polos tadi ke hiddenCanvas, kali ini
  // DENGAN filter aktif. Karena sumbernya sekarang <canvas> (bukan <video>),
  // ctx.filter jauh lebih konsisten diterapkan di semua browser/HP.
  hiddenCanvas.width = width;
  hiddenCanvas.height = height;
  hiddenCtx.save();
  hiddenCtx.filter = getCombinedFilterCss();
  hiddenCtx.drawImage(rawFrameCanvas, 0, 0);
  hiddenCtx.restore();

  // Filter "Nokia" dikasih efek kilat flash di tengah + noise warna-warni kasar,
  // biar berasa jepretan kamera HP jadul pakai flash dari dekat.
  if (currentFilter === 'nokia') {
    applyFlashGlow(hiddenCtx, width, height);
    addFilmGrain(hiddenCtx, width, height);
  }

  // Filter-filter moody (Cocoa/Retro/X-Pro) dikasih vignette gelap di pinggir
  if (VIGNETTE_FILTERS.includes(currentFilter)) {
    applyVignette(hiddenCtx, width, height);
  }

  triggerFlash();

  const imageData = hiddenCanvas.toDataURL('image/jpeg', 0.92);
  capturedPhotos.push(imageData);
  updateCounter();
}


/* ==========================================================
   FUNGSI: TAMBAH NOISE/GRAIN KASAR (efek kamera jadul)
   Menambah bintik acak ke tiap piksel, meniru sensor kamera
   HP jadul yang noise-nya kasar di kondisi cahaya kurang.
========================================================== */
function addFilmGrain(ctx, width, height, intensity = 0.4) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const pixels = imageData.data;

  for (let i = 0; i < pixels.length; i += 4) {
    // Noise di-generate TERPISAH untuk tiap channel (R, G, B), bukan satu nilai
    // yang sama dipakai bertiga. Ini yang bikin hasilnya bintik warna-warni
    // (chromatic noise) ala sensor kamera digital jadul, bukan cuma abu-abu.
    pixels[i]     = clampColor(pixels[i]     + (Math.random() - 0.5) * 255 * intensity);
    pixels[i + 1] = clampColor(pixels[i + 1] + (Math.random() - 0.5) * 255 * intensity);
    pixels[i + 2] = clampColor(pixels[i + 2] + (Math.random() - 0.5) * 255 * intensity);
  }

  ctx.putImageData(imageData, 0, 0);
}

// Fungsi bantu: memastikan nilai warna tetap di antara 0-255
function clampColor(value) {
  return Math.min(255, Math.max(0, value));
}

// Fungsi bantu: menggelapkan bagian pinggir foto (vignette),
// dipakai untuk filter-filter yang kesannya moody/dramatis.
function applyVignette(ctx, width, height, strength = 0.32) {
  const gradient = ctx.createRadialGradient(
    width / 2, height / 2, height * 0.25,
    width / 2, height / 2, height * 0.75
  );
  gradient.addColorStop(0, 'rgba(0,0,0,0)');
  gradient.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

// Fungsi bantu: efek "kena sorot flash kamera" di tengah foto —
// area tengah dibikin sedikit lebih terang, memudar ke pinggir.
// Dipakai khusus untuk filter Nokia, biar berasa jepretan kamera HP
// jadul pakai lampu flash dari dekat.
function applyFlashGlow(ctx, width, height, strength = 0.22) {
  const gradient = ctx.createRadialGradient(
    width / 2, height / 2, 0,
    width / 2, height / 2, height * 0.7
  );
  gradient.addColorStop(0, `rgba(255,255,255,${strength})`);
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}


/* ==========================================================
   FUNGSI: MENGGABUNGKAN 4 FOTO MENJADI PHOTO STRIP
   Tampilan strip (warna latar, warna bingkai foto, warna teks)
   mengikuti frame/template yang dipilih user.
========================================================== */
function buildPhotoStrip() {
  const theme = FRAMES[currentFrame];

  // "Tanpa Frame" bukan photo strip sama sekali, cuma 1 foto polos apa adanya.
  if (theme.noFrame) {
    buildSinglePhotoResult();
    return;
  }

  // "Polaroid Miring" juga cuma 1 foto, tapi dikasih bingkai putih + dimiringkan
  // di atas latar gelap, ala webcamtoy.com.
  if (theme.tiltedSingle) {
    buildTiltedPolaroidResult(theme);
    return;
  }

  const columns = LAYOUTS[currentLayout].columns;
  const rows = Math.ceil(TOTAL_PHOTOS / columns);

  // Sel foto dibuat sedikit lebih kecil kalau layout-nya grid (2 kolom),
  // supaya lebar total strip tidak jadi terlalu besar.
  const photoWidth = columns === 1 ? 400 : 280;
  const photoHeight = columns === 1 ? 300 : 210;

  const padding = 14;
  const gapBetween = 10;
  const borderThickness = theme.noFrame ? 0 : 4;
  const footerHeight = theme.noFrame ? 0 : 50;

  const stripWidth = padding * 2 + photoWidth * columns + gapBetween * (columns - 1);
  const stripHeight = padding + (photoHeight + gapBetween) * rows + footerHeight;

  resultCanvas.width = stripWidth;
  resultCanvas.height = stripHeight;

  // Latar belakang strip mengikuti warna tema frame terpilih
  resultCtx.fillStyle = theme.background;
  resultCtx.fillRect(0, 0, stripWidth, stripHeight);

  // Kalau frame yang dipilih punya pola (misalnya Polkadot), gambar polanya
  // di atas warna latar tadi, sebelum foto-foto ditempel di atasnya.
  if (theme.pattern === 'polkadot') {
    drawPolkadotPattern(resultCtx, stripWidth, stripHeight, theme.dotColor);
  }

  let loadedCount = 0;

  capturedPhotos.forEach((photoDataUrl, index) => {
    const img = new Image();

    img.onload = () => {
      // Posisi foto dihitung dari baris & kolomnya.
      // Untuk layout 1 kolom, col selalu 0 (sama seperti sebelumnya).
      const col = index % columns;
      const row = Math.floor(index / columns);

      const x = padding + col * (photoWidth + gapBetween);
      const y = padding + row * (photoHeight + gapBetween);

      // Bingkai kecil di belakang tiap foto, warnanya ikut tema
      resultCtx.fillStyle = theme.photoBorder;
      resultCtx.fillRect(
        x - borderThickness,
        y - borderThickness,
        photoWidth + borderThickness * 2,
        photoHeight + borderThickness * 2
      );

      drawImageCover(resultCtx, img, x, y, photoWidth, photoHeight);

      loadedCount++;

      if (loadedCount === TOTAL_PHOTOS) {
        // Kalau frame-nya bermotif (misalnya Polkadot), kasih backing solid
        // di belakang teks supaya tulisannya tidak numpuk sama pola titik-titik.
        if (theme.pattern) {
          resultCtx.fillStyle = theme.background;
          resultCtx.fillRect(0, stripHeight - footerHeight, stripWidth, footerHeight);
        }

        resultCtx.fillStyle = theme.text;
        resultCtx.font = 'bold 20px Poppins, sans-serif';
        resultCtx.textAlign = 'center';
        resultCtx.fillText(
          BRAND_NAME,
          stripWidth / 2,
          stripHeight - footerHeight / 2 + 6
        );
      }
    };

    img.src = photoDataUrl;
  });
}


/* ==========================================================
   FUNGSI: GAMBAR FOTO KE SLOT TANPA DISTORSI (mirip object-fit: cover)
   Rasio foto asli dijaga: bagian yang kelebihan di-crop (bukan di-stretch),
   supaya wajah tidak gepeng/penyong walau rasio kamera HP beda-beda.
========================================================== */
function drawImageCover(ctx, img, x, y, targetWidth, targetHeight) {
  const imgRatio = img.width / img.height;
  const boxRatio = targetWidth / targetHeight;

  let sx, sy, sWidth, sHeight;

  if (imgRatio > boxRatio) {
    // Foto lebih "lebar" dari slot -> crop sisi kiri & kanan
    sHeight = img.height;
    sWidth = sHeight * boxRatio;
    sx = (img.width - sWidth) / 2;
    sy = 0;
  } else {
    // Foto lebih "tinggi" dari slot -> crop sisi atas & bawah
    sWidth = img.width;
    sHeight = sWidth / boxRatio;
    sx = 0;
    sy = (img.height - sHeight) / 2;
  }

  ctx.drawImage(img, sx, sy, sWidth, sHeight, x, y, targetWidth, targetHeight);
}


/* ==========================================================
   FUNGSI: HASIL "POLAROID MIRING"
   1 foto dikasih bingkai putih tebal ala polaroid, dimiringkan
   sedikit, lalu diletakkan di atas latar gelap — meniru gaya
   hasil jepretan di webcamtoy.com.
========================================================== */
function buildTiltedPolaroidResult(theme) {
  const img = new Image();

  img.onload = () => {
    // Bingkai putih dibuat proporsional ke ukuran foto (bukan angka tetap),
    // supaya tetap pas walau foto dari HP resolusinya beda-beda.
    const borderThickness = Math.round(img.width * 0.045);
    const photoW = img.width;
    const photoH = img.height;
    const cardW = photoW + borderThickness * 2;
    const cardH = photoH + borderThickness * 2;

    const angleRad = (-4 * Math.PI) / 180; // miring dikit ke kiri

    // Canvas dibuat persegi & cukup besar, supaya kartu yang dimiringkan
    // tidak terpotong di sudut-sudutnya.
    const canvasSize = Math.ceil(Math.sqrt(cardW * cardW + cardH * cardH));
    resultCanvas.width = canvasSize;
    resultCanvas.height = canvasSize;

    resultCtx.fillStyle = theme.background;
    resultCtx.fillRect(0, 0, canvasSize, canvasSize);

    resultCtx.save();
    resultCtx.translate(canvasSize / 2, canvasSize / 2);
    resultCtx.rotate(angleRad);

    // Bayangan halus di belakang kartu, biar kesannya melayang/nempel
    resultCtx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    resultCtx.shadowBlur = 24;
    resultCtx.shadowOffsetY = 8;

    resultCtx.fillStyle = theme.photoBorder;
    resultCtx.fillRect(-cardW / 2, -cardH / 2, cardW, cardH);

    resultCtx.shadowColor = 'transparent';

    resultCtx.drawImage(img, -photoW / 2, -photoH / 2, photoW, photoH);

    resultCtx.restore();
  };

  img.src = capturedPhotos[0];
}


/* ==========================================================
   FUNGSI: HASIL 1 FOTO POLOS (mode "Tanpa Frame")
   Tidak ada strip, tidak ada border, tidak ada nama brand.
   Canvas hasil langsung ukuran foto aslinya.
========================================================== */
function buildSinglePhotoResult() {
  const img = new Image();

  img.onload = () => {
    resultCanvas.width = img.width;
    resultCanvas.height = img.height;
    resultCtx.drawImage(img, 0, 0);
  };

  img.src = capturedPhotos[0];
}


/* ==========================================================
   FUNGSI: MENGGAMBAR POLA POLKADOT
   Dipakai sebagai latar belakang untuk frame "Polkadot".
   Titik-titik disusun dalam grid, dengan baris genap digeser
   setengah jarak supaya terlihat seperti pola kain polkadot asli.
========================================================== */
function drawPolkadotPattern(ctx, width, height, dotColor) {
  const spacing = 18; // jarak antar titik (lebih kecil = lebih rapat, seperti kain)
  const radius = 3;   // ukuran titik (dikecilkan drastis dari sebelumnya)

  ctx.fillStyle = dotColor;

  let row = 0;
  for (let y = spacing / 2; y < height + spacing; y += spacing) {
    const offsetX = (row % 2 === 0) ? 0 : spacing / 2;

    for (let x = spacing / 2 + offsetX; x < width + spacing; x += spacing) {
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    row++;
  }
}


/* ==========================================================
   FUNGSI: DOWNLOAD HASIL PHOTO STRIP
========================================================== */
function downloadPhotoStrip() {
  const link = document.createElement('a');
  link.download = 'photobooth-strip.jpg';
  link.href = resultCanvas.toDataURL('image/jpeg', 0.95);
  link.click();
}


/* ==========================================================
   ALUR UTAMA: SAAT TOMBOL "AMBIL FOTO" DIKLIK
========================================================== */
async function handleTakePhotoClick() {
  btnTakePhoto.disabled = true;
  statusMessage.textContent = 'Bersiap-siap...';

  await runCountdown();
  capturePhoto();

  statusMessage.textContent = `Foto ${capturedPhotos.length} berhasil diambil!`;

  if (capturedPhotos.length < TOTAL_PHOTOS) {
    btnTakePhoto.disabled = false;
  } else {
    stopCamera();
    buildPhotoStrip();
    showPage(pageResult);
    playPrintAnimation();
  }
}

// Fungsi bantu: memicu ulang animasi "keluar dari cetakan"
// setiap kali strip baru selesai dibuat (termasuk saat foto ulang).
function playPrintAnimation() {
  const resultCard = document.getElementById('resultCard');
  resultCard.classList.remove('print-anim');
  void resultCard.offsetWidth; // trik reflow, sama seperti animasi countdown
  resultCard.classList.add('print-anim');
}


/* ==========================================================
   ALUR: TOMBOL "FOTO LAGI"
========================================================== */
function handleRetakeClick() {
  capturedPhotos = [];
  updateCounter();
  btnTakePhoto.disabled = false;
  startCamera(); // filter & frame yang sudah dipilih tetap dipakai
}


/* ==========================================================
   FUNGSI: HITUNG ULANG TOTAL_PHOTOS
   TOTAL_PHOTOS mengikuti layout yang dipilih (layoutPhotoCount),
   kecuali frame "Tanpa Frame" aktif — mode itu cuma butuh 1 foto.
========================================================== */
function recomputeTotalPhotos() {
  const theme = FRAMES[currentFrame];
  // Frame "Tanpa Frame" dan "Polaroid Miring" sama-sama cuma butuh 1 foto,
  // sisanya (strip) ikut jumlah pose dari layout yang dipilih.
  TOTAL_PHOTOS = (theme.noFrame || theme.tiltedSingle) ? 1 : layoutPhotoCount;
  updateCounter();
}


/* ==========================================================
   PASANG SEMUA EVENT LISTENER
========================================================== */
btnStartCamera.addEventListener('click', () => showPage(pageLayout));

btnConfirmLayout.addEventListener('click', () => {
  layoutPhotoCount = LAYOUTS[currentLayout].poses;
  recomputeTotalPhotos();
  startCamera();
});

btnTakePhoto.addEventListener('click', handleTakePhotoClick);
btnDownload.addEventListener('click', downloadPhotoStrip);
btnRetake.addEventListener('click', handleRetakeClick);

// Tombol pilihan layout
layoutPicker.addEventListener('click', (e) => {
  const card = e.target.closest('.layout-card');
  if (card) selectLayout(card.dataset.layout);
});

// Tombol pilihan filter (event delegation: satu listener untuk semua tombol)
filterPicker.addEventListener('click', (e) => {
  const btn = e.target.closest('.picker-pill');
  if (btn) selectFilter(btn.dataset.filter);
});

// Tombol pilihan frame
framePicker.addEventListener('click', (e) => {
  const btn = e.target.closest('.frame-swatch');
  if (btn) selectFrame(btn.dataset.frame);
});

// Slider kecerahan: update setiap kali digeser
brightnessSlider.addEventListener('input', (e) => {
  currentBrightness = Number(e.target.value);
  brightnessValue.textContent = `${currentBrightness}%`;
  updateVideoPreview();
});
