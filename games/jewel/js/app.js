/*
 * Jewel Coloring — screens, input and everything that touches the DOM.
 *
 * The rules live in level.js / shop.js / quantize.js; this file is the glue:
 * which screen is visible, what a tap on the board means, when a save is
 * written. A level is never stored as pixels — the picture (a built-in drawing
 * or an imported photo) plus a difficulty regenerate it deterministically, so
 * one photo can be replayed at every difficulty for the price of one JPEG.
 */
(function () {
  'use strict';

  var Q = window.JewelQuantize;
  var L = window.JewelLevel;
  var S = window.JewelShop;
  var A = window.JewelArt;
  var R = window.JewelRender;
  var store = window.Arcade.Store;
  var sfx = window.Arcade.Sfx;

  var PHOTO_SIZE = 512;      // stored source resolution — enough for 64×64 expert
  var SAVE_EVERY_MS = 4000;

  var state = {
    wallet: S.normalize(store.get('jewel:wallet', null)),
    photos: store.get('jewel:photos', []),
    screen: 'library',
    tab: 'art',
    picture: null,
    diff: null,
    def: null,
    progress: null,
    board: null,
    panMode: false,
    lastSave: 0,
    lastTick: 0,
    running: false
  };

  var el = {};
  ['back', 'screenTitle', 'coinsBox', 'coinCount', 'shopBtn', 'galleryArt', 'galleryPhoto',
   'photoActions', 'photoInput', 'cropCanvas', 'photoTitle', 'cropCancel', 'cropAccept',
   'board', 'progressFill', 'progressText', 'toolHint', 'toolBomb', 'toolPan', 'toolFit',
   'hintCount', 'bombCount', 'palette', 'shopList', 'sheet', 'sheetTitle', 'difficulties',
   'sheetClose', 'result', 'resultArt', 'resultCoins', 'resultStats', 'resultAgain',
   'resultNext', 'toast'].forEach(function (id) { el[id] = document.getElementById(id); });

  var screens = {
    library: document.getElementById('screen-library'),
    crop: document.getElementById('screen-crop'),
    game: document.getElementById('screen-game'),
    shop: document.getElementById('screen-shop')
  };

  /* ------------------------------------------------------------ utilities -- */

  function hash(text) {
    var h = 2166136261;
    for (var i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  var toastTimer = null;
  function toast(message) {
    el.toast.textContent = message;
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.hidden = true; }, 1800);
  }

  function saveWallet() {
    store.set('jewel:wallet', state.wallet);
    paintCoins();
  }

  function paintCoins(bump) {
    el.coinCount.textContent = state.wallet.coins;
    el.hintCount.textContent = state.wallet.items.hint || 0;
    el.bombCount.textContent = state.wallet.items.bomb || 0;
    if (bump) {
      el.coinsBox.classList.remove('bump');
      void el.coinsBox.offsetWidth;          // restart the animation
      el.coinsBox.classList.add('bump');
    }
  }

  function earn(coins, silent) {
    if (coins <= 0) return;
    S.earn(state.wallet, coins);
    saveWallet();
    paintCoins(true);
    if (!silent) sfx.play('coin', 'pickupCoin');
  }

  /* ------------------------------------------------------------- pictures -- */

  function pictures(kind) {
    if (kind === 'photo') {
      return state.photos.map(function (photo) {
        return { id: photo.id, title: photo.title, kind: 'photo', src: photo.src };
      });
    }
    return A.ART.map(function (art) {
      return { id: art.id, title: art.title, kind: 'art', art: art };
    });
  }

  function saveKey(pictureId, diffId) {
    return 'jewel:save:' + pictureId + ':' + diffId;
  }

  function readSave(pictureId, diffId) {
    return store.get(saveKey(pictureId, diffId), null);
  }

  /** Best progress this picture has at any difficulty — for the gallery badge. */
  function pictureStatus(pictureId) {
    var best = { pct: 0, complete: false };
    L.DIFFICULTIES.forEach(function (diff) {
      var saved = readSave(pictureId, diff.id);
      if (!saved) return;
      if (saved.complete) best.complete = true;
      best.pct = Math.max(best.pct, saved.pct || 0);
    });
    return best;
  }

  var imageCache = {};

  /** Decode a stored photo once; built-ins are drawn, not decoded. */
  function photoImage(picture) {
    if (imageCache[picture.id]) return Promise.resolve(imageCache[picture.id]);
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { imageCache[picture.id] = img; resolve(img); };
      img.onerror = function () { reject(new Error('фото не читається')); };
      img.src = picture.src;
    });
  }

  /**
   * Source pixels for a picture, rendered a few times larger than the grid so
   * the box filter in buildLevel has something to average — sampling a drawing
   * at exactly 24×24 gives jagged, aliased cells.
   */
  function sourcePixels(picture, grid) {
    var size = Math.min(512, Math.max(256, grid * 8));
    if (picture.kind === 'art') {
      return Promise.resolve(A.render(picture.art, size).imageData);
    }
    return photoImage(picture).then(function (img) {
      var canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, size, size);
      return ctx.getImageData(0, 0, size, size);
    });
  }

  function buildDefinition(picture, diff) {
    return sourcePixels(picture, diff.grid).then(function (image) {
      return Q.buildLevel(image, diff.grid, diff.grid, diff.colors, hash(picture.id + ':' + diff.id));
    });
  }

  /* ------------------------------------------------------------- screens --- */

  function show(name) {
    state.screen = name;
    Object.keys(screens).forEach(function (key) { screens[key].hidden = key !== name; });
    el.back.hidden = name === 'library';
    el.shopBtn.hidden = name === 'shop' || name === 'game';
    el.screenTitle.textContent = {
      library: 'Самоцвіти',
      crop: 'Своє фото',
      game: state.picture ? state.picture.title : 'Рівень',
      shop: 'Магазин'
    }[name];
    state.running = name === 'game';
    if (name === 'game') {
      state.lastTick = performance.now();
      requestAnimationFrame(tick);
    }
  }

  function goBack() {
    if (state.screen === 'game') {
      writeSave();
      state.picture = null;
      renderGallery();
      show('library');
    } else if (state.screen === 'crop') {
      show('library');
    } else {
      show('library');
      renderGallery();
    }
  }

  /* ------------------------------------------------------------- gallery --- */

  function card(picture) {
    var button = document.createElement('button');
    button.className = 'card';
    button.type = 'button';

    if (picture.kind === 'art') {
      var rendered = A.render(picture.art, 128);
      rendered.canvas.style.aspectRatio = '1';
      button.appendChild(rendered.canvas);
    } else {
      var img = document.createElement('img');
      img.src = picture.src;
      img.alt = picture.title;
      button.appendChild(img);
    }

    var status = pictureStatus(picture.id);
    if (status.complete || status.pct > 0) {
      var ribbon = document.createElement('span');
      ribbon.className = 'ribbon' + (status.complete ? '' : ' part');
      ribbon.textContent = status.complete ? 'готово' : Math.round(status.pct * 100) + '%';
      button.appendChild(ribbon);
    }

    var body = document.createElement('div');
    body.className = 'card-body';
    body.innerHTML = '<div class="card-title"></div><div class="card-sub"></div>';
    body.querySelector('.card-title').textContent = picture.title;
    body.querySelector('.card-sub').textContent = picture.kind === 'art' ? 'картинка' : 'моє фото';
    button.appendChild(body);

    button.addEventListener('click', function () { openDifficulty(picture); });

    if (picture.kind === 'photo') {
      var del = document.createElement('button');
      del.className = 'card-del';
      del.type = 'button';
      del.textContent = '✕';
      del.setAttribute('aria-label', 'Видалити');
      del.addEventListener('click', function (e) {
        e.stopPropagation();
        removePhoto(picture.id);
      });
      button.appendChild(del);
    }

    return button;
  }

  function renderGallery() {
    el.galleryArt.hidden = state.tab !== 'art';
    el.galleryPhoto.hidden = state.tab !== 'photo';
    el.photoActions.hidden = state.tab !== 'photo';

    var target = state.tab === 'art' ? el.galleryArt : el.galleryPhoto;
    target.textContent = '';
    var list = pictures(state.tab);

    if (!list.length) {
      var empty = document.createElement('p');
      empty.className = 'note';
      empty.textContent = 'Тут зʼявляться рівні з твоїх фото.';
      target.appendChild(empty);
      return;
    }

    list.forEach(function (picture) { target.appendChild(card(picture)); });
  }

  function removePhoto(id) {
    if (!window.confirm('Видалити це фото разом із прогресом?')) return;
    state.photos = state.photos.filter(function (photo) { return photo.id !== id; });
    store.set('jewel:photos', state.photos);
    L.DIFFICULTIES.forEach(function (diff) {
      try { localStorage.removeItem('arcade:' + saveKey(id, diff.id)); } catch (e) { /* blocked storage */ }
    });
    delete imageCache[id];
    renderGallery();
  }

  /* ---------------------------------------------------------- difficulty --- */

  function openDifficulty(picture) {
    state.picture = picture;
    el.sheetTitle.textContent = picture.title;
    el.difficulties.textContent = '';

    L.DIFFICULTIES.forEach(function (diff) {
      var saved = readSave(picture.id, diff.id);
      var button = document.createElement('button');
      button.className = 'diff';
      button.type = 'button';

      var pct = saved ? Math.round((saved.pct || 0) * 100) : 0;
      var line = diff.grid + '×' + diff.grid + ' · ' + diff.colors + ' кольорів';
      if (saved && saved.complete) line += ' · пройдено';
      else if (pct > 0) line += ' · ' + pct + '%';

      button.innerHTML = '<strong></strong><span></span><em class="mul"></em>';
      button.querySelector('strong').textContent = diff.label;
      button.querySelector('span').textContent = line;
      button.querySelector('.mul').textContent = '×' + diff.coinMul;
      if (saved && !saved.complete && pct > 0) button.classList.add('is-current');

      button.addEventListener('click', function () {
        el.sheet.hidden = true;
        startLevel(picture, diff);
      });
      el.difficulties.appendChild(button);
    });

    el.sheet.hidden = false;
  }

  /* -------------------------------------------------------- photo import --- */

  var crop = { img: null, scale: 1, x: 0, y: 0, pointers: new Map(), pinch: 0 };

  function openCrop(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        crop.img = img;
        crop.scale = Math.max(320 / img.width, 320 / img.height);
        crop.x = (320 - img.width * crop.scale) / 2;
        crop.y = (320 - img.height * crop.scale) / 2;
        el.photoTitle.value = 'Моє фото ' + (state.photos.length + 1);
        show('crop');
        drawCrop();
      };
      img.onerror = function () { toast('Не вдалося прочитати фото'); };
      img.src = reader.result;
    };
    reader.onerror = function () { toast('Не вдалося прочитати файл'); };
    reader.readAsDataURL(file);
  }

  function clampCrop() {
    var w = crop.img.width * crop.scale;
    var h = crop.img.height * crop.scale;
    crop.x = Math.min(0, Math.max(320 - w, crop.x));
    crop.y = Math.min(0, Math.max(320 - h, crop.y));
  }

  function drawCrop() {
    if (!crop.img) return;
    var ctx = el.cropCanvas.getContext('2d');
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(0, 0, 320, 320);
    clampCrop();
    ctx.drawImage(crop.img, crop.x, crop.y, crop.img.width * crop.scale, crop.img.height * crop.scale);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    for (var i = 1; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo((320 / 3) * i, 0); ctx.lineTo((320 / 3) * i, 320);
      ctx.moveTo(0, (320 / 3) * i); ctx.lineTo(320, (320 / 3) * i);
      ctx.stroke();
    }
  }

  function acceptCrop() {
    if (!crop.img) return;
    var canvas = document.createElement('canvas');
    canvas.width = PHOTO_SIZE;
    canvas.height = PHOTO_SIZE;
    var ctx = canvas.getContext('2d');
    var k = PHOTO_SIZE / 320;
    ctx.drawImage(crop.img, crop.x * k, crop.y * k,
      crop.img.width * crop.scale * k, crop.img.height * crop.scale * k);

    var photo = {
      id: 'photo-' + Date.now().toString(36),
      title: (el.photoTitle.value || 'Моє фото').slice(0, 24),
      createdAt: Date.now(),
      src: canvas.toDataURL('image/jpeg', 0.82)
    };

    state.photos = state.photos.concat([photo]);
    if (!store.set('jewel:photos', state.photos)) {
      state.photos = state.photos.filter(function (p) { return p.id !== photo.id; });
      toast('Памʼять браузера переповнена — видали старі фото');
      return;
    }

    crop.img = null;
    state.tab = 'photo';
    document.querySelectorAll('.tab').forEach(function (tab) {
      tab.classList.toggle('is-active', tab.dataset.tab === 'photo');
    });
    renderGallery();
    show('library');
    openDifficulty({ id: photo.id, title: photo.title, kind: 'photo', src: photo.src });
  }

  el.photoInput.addEventListener('change', function (e) {
    var file = e.target.files && e.target.files[0];
    if (file) openCrop(file);
    e.target.value = '';
  });

  el.cropCancel.addEventListener('click', function () { crop.img = null; show('library'); });
  el.cropAccept.addEventListener('click', acceptCrop);

  el.cropCanvas.addEventListener('pointerdown', function (e) {
    el.cropCanvas.setPointerCapture(e.pointerId);
    crop.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  });

  el.cropCanvas.addEventListener('pointermove', function (e) {
    if (!crop.pointers.has(e.pointerId) || !crop.img) return;
    var prev = crop.pointers.get(e.pointerId);
    var scale = 320 / el.cropCanvas.getBoundingClientRect().width;
    crop.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (crop.pointers.size === 1) {
      crop.x += (e.clientX - prev.x) * scale;
      crop.y += (e.clientY - prev.y) * scale;
    } else if (crop.pointers.size === 2) {
      var points = Array.from(crop.pointers.values());
      var distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      if (crop.pinch) zoomCrop(distance / crop.pinch);
      crop.pinch = distance;
    }
    drawCrop();
  });

  function endCropPointer(e) {
    crop.pointers.delete(e.pointerId);
    if (crop.pointers.size < 2) crop.pinch = 0;
  }

  el.cropCanvas.addEventListener('pointerup', endCropPointer);
  el.cropCanvas.addEventListener('pointercancel', endCropPointer);

  function zoomCrop(factor) {
    var min = Math.max(320 / crop.img.width, 320 / crop.img.height);
    var next = Math.max(min, Math.min(min * 6, crop.scale * factor));
    var applied = next / crop.scale;
    crop.x = 160 - (160 - crop.x) * applied;
    crop.y = 160 - (160 - crop.y) * applied;
    crop.scale = next;
  }

  el.cropCanvas.addEventListener('wheel', function (e) {
    if (!crop.img) return;
    e.preventDefault();
    zoomCrop(e.deltaY < 0 ? 1.12 : 1 / 1.12);
    drawCrop();
  }, { passive: false });

  /* ------------------------------------------------------------- the game -- */

  function startLevel(picture, diff) {
    state.picture = picture;
    state.diff = diff;
    toast('Готую рівень…');

    buildDefinition(picture, diff).then(function (def) {
      el.toast.hidden = true;
      state.def = def;
      var saved = readSave(picture.id, diff.id);
      state.progress = L.loadProgress(def, saved);
      state.rewarded = !!(saved && saved.rewarded);

      if (state.progress.complete) {
        // Finished before: start it fresh rather than opening a solved picture.
        state.progress = L.createProgress(def);
      }

      if (!state.board) {
        state.board = new R.Board(el.board, { style: state.wallet.style, theme: state.wallet.theme });
        bindBoard(state.board);
      }
      state.board.setStyle(state.wallet.style);
      state.board.setTheme(state.wallet.theme);
      state.board.assist = diff.assist;

      show('game');
      state.board.resize();
      state.board.setLevel(def, state.progress);
      state.board.select(L.nextColor(state.progress, -1));
      renderPalette();
      updateProgressUI();
      state.lastSave = performance.now();
    }).catch(function (err) {
      toast(err.message || 'Не вдалося створити рівень');
      show('library');
    });
  }

  function writeSave() {
    if (!state.picture || !state.def || !state.progress) return;
    var saved = L.saveProgress(state.progress);
    saved.pct = L.ratio(state.progress);
    saved.rewarded = !!state.rewarded;
    store.set(saveKey(state.picture.id, state.diff.id), saved);
    state.lastSave = performance.now();
  }

  function updateProgressUI() {
    var pct = L.ratio(state.progress);
    el.progressFill.style.width = (pct * 100).toFixed(1) + '%';
    el.progressText.textContent = Math.floor(pct * 100) + '%';
  }

  function renderPalette() {
    el.palette.textContent = '';
    state.def.palette.forEach(function (color, index) {
      var left = state.progress.totals[index] - state.progress.done[index];
      var button = document.createElement('button');
      button.className = 'swatch' + (index === state.board.selected ? ' is-active' : '') + (left === 0 ? ' is-done' : '');
      button.type = 'button';
      button.dataset.index = String(index);
      button.innerHTML = '<span class="num"></span><span class="dot"></span><span class="left"></span>';
      button.querySelector('.num').textContent = index + 1;
      button.querySelector('.dot').style.background = R.rgb(color);
      button.querySelector('.left').textContent = left;
      button.addEventListener('click', function () { selectColor(index); });
      el.palette.appendChild(button);
    });
  }

  function refreshSwatch(index) {
    var swatch = el.palette.querySelector('.swatch[data-index="' + index + '"]');
    if (!swatch) return;
    var left = state.progress.totals[index] - state.progress.done[index];
    swatch.querySelector('.left').textContent = left;
    swatch.classList.toggle('is-done', left === 0);
  }

  function selectColor(index) {
    if (index < 0) return;
    state.board.select(index);
    el.palette.querySelectorAll('.swatch').forEach(function (swatch) {
      swatch.classList.toggle('is-active', Number(swatch.dataset.index) === index);
    });
    var active = el.palette.querySelector('.swatch.is-active');
    if (active && active.scrollIntoView) active.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  /** One placement. Returns true when a gem actually landed. */
  function place(cell) {
    var result = L.paint(state.progress, state.def, cell, state.board.selected);

    if (!result.ok) {
      if (result.reason === 'wrong') sfx.play('wrong', 'hitHurt');
      return false;
    }

    state.board.pop(cell);
    sfx.play('place', 'blipSelect');
    refreshSwatch(state.board.selected);
    updateProgressUI();
    if (result.coins) earn(result.coins, true);

    if (result.complete) {
      finish();
    } else if (result.colorDone) {
      // Nobody wants to hunt for the next unfinished colour by hand.
      var next = L.nextColor(state.progress, state.board.selected);
      if (next >= 0) selectColor(next);
      renderPalette();
    }
    return true;
  }

  function finish() {
    var coins = L.reward(state.def, state.progress, state.diff, { replay: state.rewarded });
    state.rewarded = true;
    writeSave();
    earn(coins);
    sfx.play('win', 'powerUp');

    var thumb = R.thumbnail(state.def, 220, document, { theme: state.wallet.theme });
    var ctx = el.resultArt.getContext('2d');
    ctx.clearRect(0, 0, 220, 220);
    ctx.drawImage(thumb, 0, 0);

    var minutes = Math.floor(state.progress.seconds / 60);
    var seconds = Math.round(state.progress.seconds % 60);
    el.resultCoins.textContent = '+' + coins + ' монет';
    el.resultStats.textContent = state.diff.label + ' · ' + state.def.cols + '×' + state.def.rows +
      ' · помилок: ' + state.progress.mistakes +
      ' · час: ' + minutes + ':' + (seconds < 10 ? '0' : '') + seconds;
    el.result.hidden = false;
  }

  /* ---------------------------------------------------------- board input -- */

  function boardPoint(e) {
    var rect = el.board.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function bindBoard(board) {
    var pointers = new Map();
    var painting = false;
    var lastCell = -1;
    var pinch = 0;
    var pinchMid = null;

    el.board.addEventListener('pointerdown', function (e) {
      el.board.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, boardPoint(e));

      if (pointers.size === 1 && !state.panMode) {
        painting = true;
        lastCell = board.cellAt(pointers.get(e.pointerId).x, pointers.get(e.pointerId).y);
        if (lastCell >= 0) place(lastCell);
      } else {
        painting = false;                    // a second finger means pan/zoom
      }
    });

    el.board.addEventListener('pointermove', function (e) {
      if (!pointers.has(e.pointerId)) return;
      var previous = pointers.get(e.pointerId);
      var point = boardPoint(e);
      pointers.set(e.pointerId, point);

      if (pointers.size >= 2) {
        var pts = Array.from(pointers.values());
        var distance = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        var mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
        if (pinch && pinchMid) {
          board.zoomAt(mid.x, mid.y, distance / pinch);
          board.panBy(mid.x - pinchMid.x, mid.y - pinchMid.y);
        }
        pinch = distance;
        pinchMid = mid;
        return;
      }

      if (painting) {
        // Walk the segment so a fast drag doesn't skip cells between frames.
        var steps = Math.ceil(Math.hypot(point.x - previous.x, point.y - previous.y) / (board.view.cell * 0.5));
        for (var i = 1; i <= Math.max(1, Math.min(steps, 24)); i++) {
          var t = i / Math.max(1, steps);
          var cell = board.cellAt(previous.x + (point.x - previous.x) * t, previous.y + (point.y - previous.y) * t);
          if (cell >= 0 && cell !== lastCell) {
            lastCell = cell;
            place(cell);
          }
        }
      } else if (state.panMode) {
        board.panBy(point.x - previous.x, point.y - previous.y);
      }
    });

    function endPointer(e) {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) { pinch = 0; pinchMid = null; }
      if (!pointers.size) { painting = false; lastCell = -1; }
    }

    el.board.addEventListener('pointerup', endPointer);
    el.board.addEventListener('pointercancel', endPointer);

    el.board.addEventListener('wheel', function (e) {
      e.preventDefault();
      var point = boardPoint(e);
      board.zoomAt(point.x, point.y, e.deltaY < 0 ? 1.12 : 1 / 1.12);
    }, { passive: false });

    el.board.addEventListener('dblclick', function (e) {
      var point = boardPoint(e);
      board.zoomAt(point.x, point.y, 1.8);
    });
  }

  function tick(now) {
    if (!state.running) return;
    var dt = Math.min((now - state.lastTick) / 1000, 0.5);
    state.lastTick = now;

    if (state.progress && !state.progress.complete) state.progress.seconds += dt;
    if (state.board && state.board.dirty) state.board.draw(now);
    if (state.progress && now - state.lastSave > SAVE_EVERY_MS) writeSave();

    requestAnimationFrame(tick);
  }

  /* --------------------------------------------------------------- tools -- */

  function useHint() {
    if (!state.progress || state.progress.complete) return;
    var color = state.board.selected;
    if (state.progress.done[color] >= state.progress.totals[color]) {
      color = L.nextColor(state.progress, color);
      if (color < 0) return;
      selectColor(color);
    }

    var payment = S.spend(state.wallet, 'hint');
    if (!payment.ok) {
      toast('Не вистачає ' + payment.short + ' монет');
      return;
    }

    var cells = L.remainingCells(state.progress, state.def, color);
    place(cells[Math.floor(Math.random() * cells.length)]);
    saveWallet();
    toast(payment.paid === 'coins' ? '−' + payment.price + ' монет' : 'Підказка використана');
  }

  function useBomb() {
    if (!state.progress || state.progress.complete) return;
    var color = state.board.selected;
    if (state.progress.done[color] >= state.progress.totals[color]) {
      color = L.nextColor(state.progress, color);
      if (color < 0) return;
      selectColor(color);
    }

    var payment = S.spend(state.wallet, 'bomb');
    if (!payment.ok) {
      toast('Не вистачає ' + payment.short + ' монет');
      return;
    }

    var cells = L.remainingCells(state.progress, state.def, color, S.BOMB_CELLS);
    cells.forEach(function (cell, i) {
      setTimeout(function () { place(cell); }, i * 28);   // a visible sweep, not an instant jump
    });
    saveWallet();
    toast('Бомба: ' + cells.length + ' камінців');
  }

  el.toolHint.addEventListener('click', useHint);
  el.toolBomb.addEventListener('click', useBomb);
  el.toolFit.addEventListener('click', function () { state.board.fitView(); });
  el.toolPan.addEventListener('click', function () {
    state.panMode = !state.panMode;
    el.toolPan.setAttribute('aria-pressed', String(state.panMode));
  });

  el.resultNext.addEventListener('click', function () {
    el.result.hidden = true;
    goBack();
  });

  el.resultAgain.addEventListener('click', function () {
    el.result.hidden = true;
    state.progress = L.createProgress(state.def);
    state.board.setLevel(state.def, state.progress);
    state.board.select(L.nextColor(state.progress, -1));
    renderPalette();
    updateProgressUI();
    writeSave();
  });

  /* ---------------------------------------------------------------- shop -- */

  function shopIcon(entry) {
    var canvas = document.createElement('canvas');
    canvas.width = 42;
    canvas.height = 42;
    var ctx = canvas.getContext('2d');
    var kind = entry.id.split('.')[0];

    if (kind === 'theme') {
      var palette = R.theme(entry.id.split('.')[1]);
      ctx.fillStyle = palette.bg;
      ctx.fillRect(0, 0, 42, 42);
      ctx.fillStyle = palette.slot;
      ctx.fillRect(6, 6, 14, 14);
      R.drawGem(ctx, 'round', 22, 22, 14, [96, 165, 250]);
    } else if (kind === 'style') {
      R.drawGem(ctx, entry.id.split('.')[1], 5, 5, 32, [244, 114, 182]);
    } else if (entry.id.indexOf('bomb') === 0) {
      ctx.fillStyle = '#1f2937';
      ctx.beginPath(); ctx.arc(21, 24, 13, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(26, 12); ctx.quadraticCurveTo(34, 6, 32, 2); ctx.stroke();
    } else {
      // hints: a gem with a spark on it
      R.drawGem(ctx, 'round', 6, 10, 26, [96, 165, 250]);
      ctx.fillStyle = '#fde68a';
      ctx.beginPath();
      [[0, -7], [2, -2], [7, 0], [2, 2], [0, 7], [-2, 2], [-7, 0], [-2, -2]].forEach(function (p, i) {
        var x = 31 + p[0], y = 11 + p[1];
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.fill();
    }
    return canvas;
  }

  function renderShop() {
    el.shopList.textContent = '';

    S.CATALOG.forEach(function (entry) {
      var row = document.createElement('div');
      row.className = 'shop-item';

      var icon = document.createElement('div');
      icon.className = 'shop-icon';
      icon.appendChild(shopIcon(entry));
      row.appendChild(icon);

      var text = document.createElement('div');
      text.className = 'shop-text';
      text.innerHTML = '<div class="shop-title"></div><div class="shop-desc"></div>';
      text.querySelector('.shop-title').textContent = entry.label;
      text.querySelector('.shop-desc').textContent = entry.desc;
      row.appendChild(text);

      var owned = entry.kind !== 'consumable' && S.owns(state.wallet, entry.id);
      var worn = owned && (state.wallet.style === entry.id.split('.')[1] || state.wallet.theme === entry.id.split('.')[1]);
      var action = document.createElement('button');
      action.className = 'btn ' + (owned ? 'ghost' : 'primary');
      action.type = 'button';

      if (worn) {
        action.textContent = 'Одягнено';
        action.disabled = true;
      } else if (owned) {
        action.textContent = 'Обрати';
        action.addEventListener('click', function () {
          S.equip(state.wallet, entry.id);
          applyLook();
          saveWallet();
          renderShop();
        });
      } else {
        action.innerHTML = '<span class="price"><span class="coin"></span>' + entry.price + '</span>';
        action.addEventListener('click', function () {
          var result = S.buy(state.wallet, entry.id);
          if (!result.ok) {
            toast(result.reason === 'poor' ? 'Не вистачає ' + result.short + ' монет' : 'Уже куплено');
            return;
          }
          sfx.play('buy', 'powerUp');
          applyLook();
          saveWallet();
          renderShop();
          toast('Куплено: ' + entry.label);
        });
      }

      row.appendChild(action);
      el.shopList.appendChild(row);
    });
  }

  function applyLook() {
    document.body.dataset.theme = state.wallet.theme;
    if (state.board) {
      state.board.setStyle(state.wallet.style);
      state.board.setTheme(state.wallet.theme);
    }
  }

  /* ---------------------------------------------------------------- init -- */

  document.querySelectorAll('.tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      state.tab = tab.dataset.tab;
      document.querySelectorAll('.tab').forEach(function (other) {
        other.classList.toggle('is-active', other === tab);
      });
      renderGallery();
    });
  });

  el.back.addEventListener('click', goBack);
  el.shopBtn.addEventListener('click', function () { renderShop(); show('shop'); });
  el.sheetClose.addEventListener('click', function () { el.sheet.hidden = true; });
  el.sheet.addEventListener('click', function (e) { if (e.target === el.sheet) el.sheet.hidden = true; });

  window.addEventListener('resize', function () {
    if (state.screen === 'game' && state.board) {
      state.board.resize();
      state.board.clampView();
    }
    drawCrop();
  });

  window.addEventListener('beforeunload', writeSave);
  document.addEventListener('visibilitychange', function () { if (document.hidden) writeSave(); });

  document.addEventListener('keydown', function (e) {
    if (state.screen !== 'game') return;
    if (e.code === 'KeyH') useHint();
    if (e.code === 'KeyB') useBomb();
    if (e.code === 'KeyF') state.board.fitView();
    if (e.code === 'Escape') goBack();
  });

  applyLook();
  paintCoins();
  renderGallery();

  // Handy for the headless checks and for anyone poking at the game in devtools.
  window.Jewel = {
    state: state,
    startLevel: startLevel,
    place: place,
    selectColor: selectColor,
    pictures: pictures,
    renderShop: renderShop,
    show: show
  };
}());
