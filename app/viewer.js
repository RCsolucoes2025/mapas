/* RC Linhas GPS — visualizador web (MapLibre + Google Satélite + GPS ao vivo) */
(function () {
  'use strict';
  var P = window.RC_PROJECT;
  if (!P) { document.body.innerHTML = '<div class="err">Dados do mapa não encontrados.</div>'; return; }

  var $ = function (id) { return document.getElementById(id); };
  var esc = function (v) { return String(v == null ? '' : v).replace(/[&<>'"]/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]; }); };
  var fmt = function (n, d) { return Number(n).toLocaleString('pt-BR', {minimumFractionDigits: d || 0, maximumFractionDigits: d || 0}); };
  var toastTimer;
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600); }

  /* ---------- Cabeçalho ---------- */
  document.title = P.title ? P.title + ' | RC Linhas' : 'RC Linhas';
  $('title').textContent = P.title || 'Mapa de linhas';
  $('subtitle').textContent = [P.subtitle, P.date_br].filter(Boolean).join(' • ');

  /* ---------- Mapa base Google ---------- */
  function google(lyrs) {
    return ['0', '1', '2', '3'].map(function (n) { return 'https://mt' + n + '.google.com/vt/lyrs=' + lyrs + '&x={x}&y={y}&z={z}'; });
  }
  var startHybrid = P.basemap === 'hybrid';
  var style = {
    version: 8,
    sources: {
      sat: {type: 'raster', tiles: google('s'), tileSize: 256, maxzoom: 20, attribution: 'Imagens © Google'},
      hyb: {type: 'raster', tiles: google('y'), tileSize: 256, maxzoom: 20, attribution: 'Imagens © Google'}
    },
    layers: [
      {id: 'bg', type: 'background', paint: {'background-color': '#0a1e16'}},
      {id: 'sat', type: 'raster', source: 'sat', layout: {visibility: startHybrid ? 'none' : 'visible'}},
      {id: 'hyb', type: 'raster', source: 'hyb', layout: {visibility: startHybrid ? 'visible' : 'none'}}
    ]
  };

  var b = P.bounds;
  var opts = {container: 'map', style: style, maxZoom: 22, attributionControl: false, touchPitch: false};
  if (b) { opts.bounds = [[b[0], b[1]], [b[2], b[3]]]; opts.fitBoundsOptions = {padding: fitPadding(), maxZoom: 19}; }
  else { opts.center = [-48.4, -21.0]; opts.zoom = 4; }
  var map = new maplibregl.Map(opts);
  map.addControl(new maplibregl.NavigationControl({visualizePitch: false}), 'top-right');
  map.addControl(new maplibregl.ScaleControl({maxWidth: 110, unit: 'metric'}), 'bottom-left');
  map.addControl(new maplibregl.AttributionControl({compact: true}), 'bottom-right');

  function fitPadding() {
    var s = Math.min(window.innerWidth, window.innerHeight);
    return s < 500 ? {top: 120, bottom: 120, left: 30, right: 30} : {top: 110, bottom: 130, left: 70, right: 70};
  }
  function fitProject(animate) {
    if (!b) return;
    follow(false);
    map.fitBounds([[b[0], b[1]], [b[2], b[3]]], {padding: fitPadding(), maxZoom: 19, duration: animate === false ? 0 : 900});
  }

  /* ---------- Camadas do projeto ---------- */
  var queryable = [];
  map.on('load', function () {
    (P.layers || []).forEach(function (L, i) {
      var id = 'L' + i, color = L.color || '#ffd60a', w = Number(L.width) || 2;
      L._ids = [];
      map.addSource(id, {type: 'geojson', data: L.geojson});
      if (L.geometry === 'point') {
        map.addLayer({id: id, type: 'circle', source: id, paint: {
          'circle-color': color, 'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 2, 18, w + 4],
          'circle-stroke-color': '#000', 'circle-stroke-width': 1}});
        L._ids.push(id);
      } else {
        map.addLayer({id: id + '-halo', type: 'line', source: id,
          layout: {'line-cap': 'round', 'line-join': 'round'},
          paint: {'line-color': '#000', 'line-opacity': 0.45,
            'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 12, 1.5, 16, w + 2, 20, (w + 2) * 2.6]}});
        map.addLayer({id: id, type: 'line', source: id,
          layout: {'line-cap': 'round', 'line-join': 'round'},
          paint: {'line-color': color,
            'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 12, 0.8, 16, w, 20, w * 2.6]}});
        L._ids.push(id + '-halo', id);
      }
      if (L.popup) queryable.push(id);
    });
    buildPanel();
  });

  map.on('click', function (e) {
    if (!queryable.length) return;
    var box = [[e.point.x - 8, e.point.y - 8], [e.point.x + 8, e.point.y + 8]];
    var f = map.queryRenderedFeatures(box, {layers: queryable})[0];
    if (!f) return;
    var rows = Object.keys(f.properties || {}).slice(0, 14).map(function (k) {
      return '<tr><td>' + esc(k) + '</td><td>' + esc(f.properties[k]) + '</td></tr>';
    }).join('');
    if (rows) new maplibregl.Popup({maxWidth: '300px'}).setLngLat(e.lngLat).setHTML('<table class="pop">' + rows + '</table>').addTo(map);
  });

  /* ---------- Painel ---------- */
  function buildPanel() {
    var host = $('layers'); host.innerHTML = '';
    (P.layers || []).forEach(function (L) {
      var row = document.createElement('label'); row.className = 'lyr';
      row.innerHTML = '<input type="checkbox" checked><b>' + esc(L.name) + '</b><i style="background:' + esc(L.color) + '"></i>';
      row.querySelector('input').onchange = function (ev) {
        L._ids.forEach(function (id) { map.setLayoutProperty(id, 'visibility', ev.target.checked ? 'visible' : 'none'); });
      };
      host.appendChild(row);
    });
    var s = P.stats || {}, items = [];
    if (s.features != null) items.push(['Linhas', fmt(s.features)]);
    if (s.length_m != null) items.push(['Comprimento total', s.length_m >= 10000 ? fmt(s.length_m / 1000, 2) + ' km' : fmt(s.length_m) + ' m']);
    if (s.area_ha != null) items.push(['Área (envoltória)', fmt(s.area_ha, 2) + ' ha']);
    if (P.date_br) items.push(['Data', P.date_br]);
    $('stats').innerHTML = items.map(function (x) { return '<div class="stat"><span>' + x[0] + '</span><strong>' + esc(x[1]) + '</strong></div>'; }).join('');
    $('foot').textContent = 'Publicado em ' + (P.published_br || '—') + ' · RC Serviços Agrícolas';
  }
  function setBase(kind) {
    map.setLayoutProperty('sat', 'visibility', kind === 'sat' ? 'visible' : 'none');
    map.setLayoutProperty('hyb', 'visibility', kind === 'hyb' ? 'visible' : 'none');
    $('baseSat').classList.toggle('on', kind === 'sat');
    $('baseHyb').classList.toggle('on', kind === 'hyb');
  }
  $('baseSat').onclick = function () { setBase('sat'); };
  $('baseHyb').onclick = function () { setBase('hyb'); };
  if (startHybrid) { $('baseSat').classList.remove('on'); $('baseHyb').classList.add('on'); }
  $('btnLayers').onclick = function () {
    var open = $('panel').classList.toggle('open');
    $('btnLayers').setAttribute('aria-expanded', open);
  };
  map.on('movestart', function (e) { if (e.originalEvent) $('panel').classList.remove('open'); });
  $('btnShare').onclick = function () {
    var url = location.href.split('#')[0];
    var text = (P.title || 'Mapa de linhas') + (P.subtitle ? ' — ' + P.subtitle : '');
    if (navigator.share) { navigator.share({title: text, text: text, url: url}).catch(function () {}); return; }
    (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(
      function () { toast('Link copiado'); },
      function () { prompt('Copie o link:', url); });
  };
  $('btnFit').onclick = function () { fitProject(true); };

  /* ---------- GPS ao vivo ---------- */
  var watchId = null, following = false, meMarker = null, lastPos = null, wakeLock = null, firstFix = true;
  var meEl = document.createElement('div');
  meEl.className = 'me';
  meEl.innerHTML = '<div class="pulse"></div><div class="head"></div><div class="dot"></div>';

  function circle(lng, lat, r) {
    var pts = [], k = 64, dx = r / (111320 * Math.cos(lat * Math.PI / 180)), dy = r / 110540;
    for (var i = 0; i <= k; i++) { var a = i / k * 2 * Math.PI; pts.push([lng + dx * Math.cos(a), lat + dy * Math.sin(a)]); }
    return {type: 'Feature', geometry: {type: 'Polygon', coordinates: [pts]}, properties: {}};
  }
  function ensureAccLayer() {
    if (map.getSource('acc')) return;
    map.addSource('acc', {type: 'geojson', data: {type: 'FeatureCollection', features: []}});
    map.addLayer({id: 'acc', type: 'fill', source: 'acc', paint: {'fill-color': '#1677ff', 'fill-opacity': 0.15}});
    map.addLayer({id: 'acc-line', type: 'line', source: 'acc', paint: {'line-color': '#1677ff', 'line-width': 1.5, 'line-opacity': 0.7}});
  }
  function onPos(p) {
    var c = p.coords, ll = [c.longitude, c.latitude];
    lastPos = c;
    if (!meMarker) meMarker = new maplibregl.Marker({element: meEl, rotationAlignment: 'map', pitchAlignment: 'map'}).setLngLat(ll).addTo(map);
    else meMarker.setLngLat(ll);
    if (c.heading != null && !isNaN(c.heading) && (c.speed == null || c.speed > 0.5)) {
      meEl.classList.add('has-head'); meEl.querySelector('.head').style.transform = 'rotate(' + c.heading + 'deg)';
    } else meEl.classList.remove('has-head');
    if (map.isStyleLoaded()) { ensureAccLayer(); map.getSource('acc').setData(circle(c.longitude, c.latitude, Math.max(c.accuracy, 1))); }
    var chip = $('gps'), acc = Math.round(c.accuracy);
    chip.classList.add('on'); chip.classList.toggle('mid', acc > 8 && acc <= 25); chip.classList.toggle('bad', acc > 25);
    $('gpsTxt').textContent = 'GPS ±' + acc + ' m';
    if (following) {
      if (firstFix) map.flyTo({center: ll, zoom: Math.max(map.getZoom(), 18), duration: 900});
      else map.easeTo({center: ll, duration: 600});
    }
    firstFix = false;
  }
  function onErr(e) {
    var msg = e.code === 1 ? 'Permita o acesso à localização nas configurações do navegador.'
      : e.code === 3 ? 'GPS demorando para responder… vá para céu aberto.' : 'Não foi possível obter a localização.';
    toast(msg);
    if (e.code === 1) stopGps();
  }
  function startGps() {
    if (!('geolocation' in navigator)) { toast('Este navegador não tem GPS.'); return false; }
    if (watchId == null) {
      firstFix = true;
      watchId = navigator.geolocation.watchPosition(onPos, onErr, {enableHighAccuracy: true, maximumAge: 2000, timeout: 20000});
    }
    return true;
  }
  function stopGps() {
    if (watchId != null) navigator.geolocation.clearWatch(watchId);
    watchId = null; follow(false);
  }
  function follow(on) {
    following = on;
    $('btnMe').classList.toggle('live', on);
    $('btnMe').setAttribute('aria-pressed', on);
    if (on && 'wakeLock' in navigator && !wakeLock) {
      navigator.wakeLock.request('screen').then(function (w) { wakeLock = w; w.addEventListener('release', function () { wakeLock = null; }); }).catch(function () {});
    }
    if (!on && wakeLock) { wakeLock.release().catch(function () {}); wakeLock = null; }
  }
  $('btnMe').onclick = function () {
    if (following) { follow(false); toast('Seguir posição desligado'); return; }
    if (!startGps()) return;
    follow(true);
    if (lastPos) map.flyTo({center: [lastPos.longitude, lastPos.latitude], zoom: Math.max(map.getZoom(), 18), duration: 800});
    else toast('Buscando sinal de GPS…');
  };
  map.on('dragstart', function () { if (following) follow(false); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && following && 'wakeLock' in navigator && !wakeLock) follow(true);
  });
  // Se a permissão já foi dada antes, mostra a posição automaticamente (sem seguir)
  if (navigator.permissions && navigator.permissions.query) {
    navigator.permissions.query({name: 'geolocation'}).then(function (r) { if (r.state === 'granted') startGps(); }).catch(function () {});
  }

})();
