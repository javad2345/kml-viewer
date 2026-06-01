// ======================= تنظیمات اولیه =======================
const map = L.map('map', {
  center: [32.4279, 53.6880], // مرکز ایران
  zoom: 6,
  zoomControl: true,
});

// لایه نقشه (OpenStreetMap رایگان)
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap',
  maxZoom: 19,
}).addTo(map);

// گروه لایه‌ها برای مدیریت نشانگرها و مسیرها
const kmlLayerGroup = L.layerGroup().addTo(map);
let userMarker = null;
let accuracyCircle = null;
let targetMarker = null;        // نشانگر مقصد انتخاب شده
let targetLine = null;         // خط بین کاربر و مقصد
let watchId = null;
let isFollowing = false;       // حالت تعقیب خودکار
let selectedTarget = null;    // { lat, lng, name }

// دکمه‌ها
const btnLoad = document.getElementById('btn-load');
const btnGps = document.getElementById('btn-gps');
const btnFollow = document.getElementById('btn-follow');
const btnClear = document.getElementById('btn-clear');
const fileInput = document.getElementById('file-input');
const navPanel = document.getElementById('nav-panel');
const targetNameSpan = document.getElementById('target-name');
const distInfoSpan = document.getElementById('dist-info');
const dirInfoSpan = document.getElementById('dir-info');
const btnClearTarget = document.getElementById('btn-clear-target');

// آیکون سفارشی برای موقعیت کاربر (فلش آبی)
const userIcon = L.divIcon({
  className: 'user-location-icon',
  html: '<div style="width: 24px; height: 24px; background: #1a73e8; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); border: 3px solid white; box-shadow: 0 0 8px rgba(0,0,0,0.4);"></div>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

// آیکون مقصد (نشانگر قرمز)
const targetIcon = L.divIcon({
  className: 'target-icon',
  html: '<div style="width: 28px; height: 28px; background: #ea4335; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 10px rgba(0,0,0,0.5);"></div>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

// ======================= رویدادها =======================
btnLoad.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', handleFileSelect);

// اگر برنامه از طریق کلیک روی فایل باز شود (File Handling API)
if ('launchQueue' in window) {
  launchQueue.setConsumer(async (launchParams) => {
    if (launchParams.files && launchParams.files.length > 0) {
      const fileHandle = launchParams.files[0];
      const file = await fileHandle.getFile();
      processFile(file);
    }
  });
}

btnGps.addEventListener('click', () => {
  if (userMarker) {
    map.setView(userMarker.getLatLng(), 16);
  } else {
    alert('موقعیت فعلی هنوز دریافت نشده. لطفاً GPS را روشن کنید.');
  }
});

btnFollow.addEventListener('click', () => {
  isFollowing = !isFollowing;
  btnFollow.style.background = isFollowing ? '#1a73e8' : 'white';
  btnFollow.style.color = isFollowing ? 'white' : 'black';
  if (isFollowing && userMarker) {
    map.setView(userMarker.getLatLng(), map.getZoom());
  }
});

btnClear.addEventListener('click', () => {
  kmlLayerGroup.clearLayers();
  clearTarget();
});

btnClearTarget.addEventListener('click', clearTarget);

// ======================= توابع اصلی =======================
function handleFileSelect(e) {
  const file = e.target.files[0];
  if (file) processFile(file);
}

async function processFile(file) {
  try {
    const fileName = file.name.toLowerCase();
    if (fileName.endsWith('.kmz')) {
      await loadKMZ(file);
    } else if (fileName.endsWith('.kml')) {
      await loadKML(file);
    } else {
      alert('فقط فایل‌های KML و KMZ پشتیبانی می‌شوند.');
    }
  } catch (err) {
    alert('خطا در پردازش فایل: ' + err.message);
    console.error(err);
  }
}

function loadKML(file) {
  const url = URL.createObjectURL(file);
  omnivore.kml(url)
    .on('ready', function() {
      this.addTo(kmlLayerGroup);
      map.fitBounds(this.getBounds());
      setupMarkerClicks();
    })
    .on('error', function(e) {
      alert('خطا در خواندن KML: ' + e.error);
    });
}

async function loadKMZ(file) {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  const kmlFile = zip.file(/\.kml$/i)[0]; // اولین فایل kml درون zip
  if (!kmlFile) throw new Error('فایل KMZ شامل KML معتبر نیست.');
  
  const kmlText = await kmlFile.async('text');
  const blob = new Blob([kmlText], { type: 'application/vnd.google-earth.kml+xml' });
  const url = URL.createObjectURL(blob);
  
  omnivore.kml(url)
    .on('ready', function() {
      this.addTo(kmlLayerGroup);
      map.fitBounds(this.getBounds());
      setupMarkerClicks();
    })
    .on('error', function(e) {
      alert('خطا در خواندن KML از KMZ: ' + e.error);
    });
}

// فعال‌سازی کلیک روی هر نشانگر برای انتخاب مقصد
function setupMarkerClicks() {
  kmlLayerGroup.eachLayer(layer => {
    if (layer instanceof L.Marker) {
      layer.on('click', function(e) {
        const latlng = e.latlng;
        const name = layer.feature?.properties?.name || 'نقطه';
        setTarget(latlng.lat, latlng.lng, name);
      });
    }
  });
}

// ======================= مدیریت مقصد =======================
function setTarget(lat, lng, name) {
  clearTarget(); // پاک کردن قبلی
  selectedTarget = { lat, lng, name };
  targetMarker = L.marker([lat, lng], { icon: targetIcon }).addTo(map);
  targetNameSpan.textContent = name;
  navPanel.classList.remove('hidden');
  updateNavigationInfo();
}

function clearTarget() {
  if (targetMarker) {
    map.removeLayer(targetMarker);
    targetMarker = null;
  }
  if (targetLine) {
    map.removeLayer(targetLine);
    targetLine = null;
  }
  selectedTarget = null;
  navPanel.classList.add('hidden');
}

// به‌روزرسانی خط، فاصله و جهت بین کاربر و مقصد
function updateNavigationInfo() {
  if (!selectedTarget || !userMarker) return;
  const userPos = userMarker.getLatLng();
  const targetPos = L.latLng(selectedTarget.lat, selectedTarget.lng);

  // رسم یا به‌روزرسانی خط
  if (targetLine) {
    targetLine.setLatLngs([userPos, targetPos]);
  } else {
    targetLine = L.polyline([userPos, targetPos], {
      color: '#1a73e8',
      weight: 3,
      dashArray: '10, 10',
      opacity: 0.8,
    }).addTo(map);
  }

  // محاسبه فاصله (متر) و جهت (درجه)
  const dist = Math.round(userPos.distanceTo(targetPos));
  let bearing = userPos.bearingTo(targetPos); // درجه از شمال در جهت عقربه‌های ساعت
  bearing = Math.round((bearing + 360) % 360);
  
  distInfoSpan.textContent = `📏 ${dist} متر`;
  
  // تبدیل درجه به جهت فارسی
  let dirText = '';
  if (bearing >= 337.5 || bearing < 22.5) dirText = 'شمال';
  else if (bearing >= 22.5 && bearing < 67.5) dirText = 'شمال شرق';
  else if (bearing >= 67.5 && bearing < 112.5) dirText = 'شرق';
  else if (bearing >= 112.5 && bearing < 157.5) dirText = 'جنوب شرق';
  else if (bearing >= 157.5 && bearing < 202.5) dirText = 'جنوب';
  else if (bearing >= 202.5 && bearing < 247.5) dirText = 'جنوب غرب';
  else if (bearing >= 247.5 && bearing < 292.5) dirText = 'غرب';
  else dirText = 'شمال غرب';
  
  dirInfoSpan.textContent = `🧭 ${dirText}`;
  
  // چرخاندن نشانگر کاربر به سمت مقصد (اختیاری: فقط اطلاعات)
  // می‌توانیم icon کاربر را بچرخانیم ولی با DivIcon سخت است – صرف نظر می‌کنیم.
}

// ======================= GPS =======================
function startGPS() {
  if (!navigator.geolocation) {
    alert('مرورگر شما GPS پشتیبانی نمی‌کند.');
    return;
  }
  
  watchId = navigator.geolocation.watchPosition(
    position => {
      const { latitude, longitude, accuracy } = position.coords;
      const latlng = L.latLng(latitude, longitude);
      
      if (!userMarker) {
        userMarker = L.marker(latlng, { icon: userIcon }).addTo(map);
        // دایره دقت
        accuracyCircle = L.circle(latlng, {
          radius: accuracy,
          color: '#1a73e8',
          fillColor: '#1a73e8',
          fillOpacity: 0.1,
          weight: 1,
        }).addTo(map);
        map.setView(latlng, 16);
      } else {
        userMarker.setLatLng(latlng);
        accuracyCircle.setLatLng(latlng).setRadius(accuracy);
      }
      
      // به‌روزرسانی مسیریابی
      updateNavigationInfo();
      
      // اگر حالت تعقیب روشن باشد، نقشه را دنبال کند
      if (isFollowing) {
        map.setView(latlng, map.getZoom(), { animate: true, pan: { duration: 0.5 } });
      }
    },
    error => {
      console.warn('خطای GPS:', error.message);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 27000,
    }
  );
}

// ======================= شروع =======================
startGPS();

// پشتیبانی از Drag & Drop (اختیاری)
map.on('dragover', (e) => e.preventDefault());
map.on('drop', (e) => {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if (file) processFile(file);
});