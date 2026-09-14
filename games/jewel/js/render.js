/*
 * The board: drawing the grid, and the pan/zoom view it is drawn through.
 *
 * Everything is in CSS pixels; the backing store is scaled by devicePixelRatio
 * so gems stay crisp on a phone. Only the cells inside the viewport are drawn,
 * which is what keeps a 64×64 board smooth while zoomed in.
 */
(function (root) {
  'use strict';

  var EMPTY = -1;
  var NUMBER_MIN_CELL = 12;   // below this a digit is unreadable, so it is skipped
  var POP_MS = 190;

  var THEMES = {
    night: { bg: '#0b1220', slot: '#16203a', slotEdge: '#223055', number: '#7f92bb', grid: 'rgba(120,150,220,0.16)' },
    candy: { bg: '#2a1524', slot: '#3d2237', slotEdge: '#573049', number: '#d99cc4', grid: 'rgba(255,180,220,0.16)' },
    mint:  { bg: '#0d2220', slot: '#163531', slotEdge: '#245049', number: '#7fc4b4', grid: 'rgba(130,230,210,0.16)' }
  };

  function theme(name) {
    return THEMES[name] || THEMES.night;
  }

  function rgb(color) {
    return 'rgb(' + color[0] + ',' + color[1] + ',' + color[2] + ')';
  }

  function shade(color, amount) {
    var mix = function (c) {
      return Math.max(0, Math.min(255, Math.round(amount > 0
        ? c + (255 - c) * amount
        : c * (1 + amount))));
    };
    return 'rgb(' + mix(color[0]) + ',' + mix(color[1]) + ',' + mix(color[2]) + ')';
  }

  /* --------------------------------------------------------- gem shapes --- */

  function gemPath(ctx, style, x, y, size) {
    var half = size / 2;
    var cx = x + half, cy = y + half;

    if (style === 'square') {
      var r = size * 0.18;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + size, y, x + size, y + size, r);
      ctx.arcTo(x + size, y + size, x, y + size, r);
      ctx.arcTo(x, y + size, x, y, r);
      ctx.arcTo(x, y, x + size, y, r);
      ctx.closePath();
      return;
    }

    if (style === 'heart') {
      var s = size * 0.52;
      ctx.beginPath();
      ctx.moveTo(cx, cy + s * 0.72);
      ctx.bezierCurveTo(cx - s * 1.3, cy - s * 0.2, cx - s * 0.55, cy - s * 0.95, cx, cy - s * 0.3);
      ctx.bezierCurveTo(cx + s * 0.55, cy - s * 0.95, cx + s * 1.3, cy - s * 0.2, cx, cy + s * 0.72);
      ctx.closePath();
      return;
    }

    if (style === 'star') {
      ctx.beginPath();
      for (var i = 0; i < 10; i++) {
        var radius = i % 2 ? half * 0.42 : half * 0.94;
        var a = (i * Math.PI) / 5 - Math.PI / 2;
        var px = cx + Math.cos(a) * radius;
        var py = cy + Math.sin(a) * radius;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      return;
    }

    ctx.beginPath();
    ctx.arc(cx, cy, half * 0.92, 0, Math.PI * 2);
  }

  /** One placed gem: body, rim and the highlight that makes it look cut. */
  function drawGem(ctx, style, x, y, size, color) {
    if (!(size > 0)) return;          // a zero-width board would ask for a negative radius
    gemPath(ctx, style, x, y, size);
    ctx.fillStyle = rgb(color);
    ctx.fill();

    if (size >= 7) {
      ctx.save();
      gemPath(ctx, style, x, y, size);
      ctx.clip();
      ctx.fillStyle = shade(color, 0.42);
      ctx.beginPath();
      ctx.ellipse(x + size * 0.34, y + size * 0.3, size * 0.2, size * 0.13, -0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = shade(color, -0.3);
      ctx.beginPath();
      ctx.moveTo(x, y + size);
      ctx.lineTo(x + size, y + size);
      ctx.lineTo(x + size, y + size * 0.55);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  /* -------------------------------------------------------------- board --- */

  function Board(canvas, opts) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.def = null;
    this.progress = null;
    this.style = (opts && opts.style) || 'round';
    this.theme = theme(opts && opts.theme);
    this.selected = 0;
    this.assist = true;
    this.view = { cell: 20, x: 0, y: 0 };
    this.pops = new Map();
    this.dirty = true;
  }

  Board.prototype.setLevel = function (def, progress) {
    this.def = def;
    this.progress = progress;
    this.pops.clear();
    this.fitView();
  };

  Board.prototype.setStyle = function (style) {
    this.style = style;
    this.dirty = true;
  };

  Board.prototype.setTheme = function (name) {
    this.theme = theme(name);
    this.dirty = true;
  };

  Board.prototype.select = function (colorIndex) {
    this.selected = colorIndex;
    this.dirty = true;
  };

  Board.prototype.size = function () {
    var rect = this.canvas.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  };

  /** Scale the whole picture to fit, with a small margin. */
  Board.prototype.fitView = function () {
    if (!this.def) return;
    var box = this.size();
    var cell = Math.min(box.width / this.def.cols, box.height / this.def.rows) * 0.94;
    this.view.cell = Math.max(2, cell);
    this.centre();
  };

  Board.prototype.centre = function () {
    var box = this.size();
    this.view.x = (box.width - this.def.cols * this.view.cell) / 2;
    this.view.y = (box.height - this.def.rows * this.view.cell) / 2;
    this.dirty = true;
  };

  Board.prototype.clampView = function () {
    if (!this.def) return;
    var box = this.size();
    var width = this.def.cols * this.view.cell;
    var height = this.def.rows * this.view.cell;
    // Keep at least a third of the board on screen in each direction.
    var slackX = Math.min(width, box.width) / 3;
    var slackY = Math.min(height, box.height) / 3;
    this.view.x = Math.max(Math.min(this.view.x, box.width - slackX), slackX - width);
    this.view.y = Math.max(Math.min(this.view.y, box.height - slackY), slackY - height);
  };

  Board.prototype.panBy = function (dx, dy) {
    this.view.x += dx;
    this.view.y += dy;
    this.clampView();
    this.dirty = true;
  };

  /** Zoom around a point in canvas space, so pinch and wheel feel anchored. */
  Board.prototype.zoomAt = function (px, py, factor) {
    if (!this.def) return;
    var box = this.size();
    var min = Math.min(box.width / this.def.cols, box.height / this.def.rows) * 0.6;
    var next = Math.max(min, Math.min(80, this.view.cell * factor));
    var applied = next / this.view.cell;
    this.view.x = px - (px - this.view.x) * applied;
    this.view.y = py - (py - this.view.y) * applied;
    this.view.cell = next;
    this.clampView();
    this.dirty = true;
  };

  /** Canvas-space point → cell index, or -1 outside the grid. */
  Board.prototype.cellAt = function (px, py) {
    if (!this.def) return -1;
    var cx = Math.floor((px - this.view.x) / this.view.cell);
    var cy = Math.floor((py - this.view.y) / this.view.cell);
    if (cx < 0 || cy < 0 || cx >= this.def.cols || cy >= this.def.rows) return -1;
    return cy * this.def.cols + cx;
  };

  Board.prototype.pop = function (cell) {
    this.pops.set(cell, (root.performance ? root.performance.now() : Date.now()));
    this.dirty = true;
  };

  Board.prototype.resize = function () {
    var box = this.size();
    var ratio = Math.min(root.devicePixelRatio || 1, 2.5);
    this.canvas.width = Math.round(box.width * ratio);
    this.canvas.height = Math.round(box.height * ratio);
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.dirty = true;
  };

  Board.prototype.draw = function (now) {
    if (!this.def) return;
    var ctx = this.ctx;
    var box = this.size();
    var cell = this.view.cell;
    var time = now || (root.performance ? root.performance.now() : Date.now());

    ctx.fillStyle = this.theme.bg;
    ctx.fillRect(0, 0, box.width, box.height);

    // Only walk the cells that can be on screen.
    var first = { x: Math.max(0, Math.floor(-this.view.x / cell)), y: Math.max(0, Math.floor(-this.view.y / cell)) };
    var last = {
      x: Math.min(this.def.cols - 1, Math.ceil((box.width - this.view.x) / cell)),
      y: Math.min(this.def.rows - 1, Math.ceil((box.height - this.view.y) / cell))
    };

    var showNumbers = cell >= NUMBER_MIN_CELL;
    if (showNumbers) {
      ctx.font = Math.round(cell * 0.44) + 'px "Inter", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
    }

    var animating = false;

    for (var cy = first.y; cy <= last.y; cy++) {
      for (var cx = first.x; cx <= last.x; cx++) {
        var index = cy * this.def.cols + cx;
        var target = this.def.cells[index];
        if (target === EMPTY) continue;

        var x = this.view.x + cx * cell;
        var y = this.view.y + cy * cell;
        var inset = Math.max(0.5, cell * 0.06);
        var size = cell - inset * 2;

        if (!this.progress.filled[index]) {
          var isSelected = target === this.selected;
          ctx.fillStyle = this.theme.slot;
          ctx.fillRect(x + inset, y + inset, size, size);

          if (isSelected && this.assist) {
            ctx.fillStyle = 'rgba(96,165,250,0.22)';
            ctx.fillRect(x + inset, y + inset, size, size);
            ctx.strokeStyle = '#60a5fa';
            ctx.lineWidth = Math.max(1, cell * 0.07);
            ctx.strokeRect(x + inset, y + inset, size, size);
          } else {
            ctx.strokeStyle = this.theme.slotEdge;
            ctx.lineWidth = 1;
            ctx.strokeRect(x + inset + 0.5, y + inset + 0.5, size - 1, size - 1);
          }

          if (showNumbers) {
            ctx.fillStyle = isSelected ? '#dbeafe' : this.theme.number;
            ctx.fillText(String(target + 1), x + cell / 2, y + cell / 2 + cell * 0.02);
          }
          continue;
        }

        var scale = 1;
        if (this.pops.has(index)) {
          // A frame timestamp can predate the tap that started the animation
          // (rAF hands out the time the frame began), and a negative age used to
          // invert the gem.
          var age = Math.max(0, time - this.pops.get(index));
          if (age >= POP_MS) {
            this.pops.delete(index);
          } else {
            // Overshoot and settle — the little "click" that makes filling fun.
            var t = age / POP_MS;
            scale = 1 + 0.55 * Math.sin(t * Math.PI) * (1 - t * 0.4);
            animating = true;
          }
        }

        var drawSize = Math.max(0, size * scale);
        var offset = (size - drawSize) / 2;
        drawGem(ctx, this.style, x + inset + offset, y + inset + offset, drawSize, this.def.palette[target]);
      }
    }

    // A faint 5×5 lattice: without it, counting cells on a big board is painful.
    if (cell >= 9) {
      ctx.strokeStyle = this.theme.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (var gx = Math.ceil(first.x / 5) * 5; gx <= last.x + 1; gx += 5) {
        var lx = Math.round(this.view.x + gx * cell) + 0.5;
        ctx.moveTo(lx, this.view.y);
        ctx.lineTo(lx, this.view.y + this.def.rows * cell);
      }
      for (var gy = Math.ceil(first.y / 5) * 5; gy <= last.y + 1; gy += 5) {
        var ly = Math.round(this.view.y + gy * cell) + 0.5;
        ctx.moveTo(this.view.x, ly);
        ctx.lineTo(this.view.x + this.def.cols * cell, ly);
      }
      ctx.stroke();
    }

    this.dirty = animating;
    return animating;
  };

  /**
   * A small finished-picture image: gallery cards, the result screen and the
   * shop preview all use it.
   */
  function thumbnail(def, size, doc, options) {
    var opts = options || {};
    var document_ = doc || root.document;
    var canvas = document_.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    var ctx = canvas.getContext('2d');
    var cell = size / Math.max(def.cols, def.rows);
    var offX = (size - def.cols * cell) / 2;
    var offY = (size - def.rows * cell) / 2;

    ctx.fillStyle = opts.background || theme(opts.theme).bg;
    ctx.fillRect(0, 0, size, size);

    for (var i = 0; i < def.cells.length; i++) {
      var target = def.cells[i];
      if (target === EMPTY) continue;
      var x = offX + (i % def.cols) * cell;
      var y = offY + Math.floor(i / def.cols) * cell;
      if (opts.filled && !opts.filled[i]) {
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fillRect(x, y, cell, cell);
        continue;
      }
      ctx.fillStyle = rgb(def.palette[target]);
      ctx.fillRect(x, y, Math.ceil(cell), Math.ceil(cell));
    }

    return canvas;
  }

  var api = {
    Board: Board,
    THEMES: THEMES,
    theme: theme,
    thumbnail: thumbnail,
    drawGem: drawGem,
    rgb: rgb,
    NUMBER_MIN_CELL: NUMBER_MIN_CELL
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.JewelRender = api;
}(typeof globalThis !== 'undefined' ? globalThis : this));
