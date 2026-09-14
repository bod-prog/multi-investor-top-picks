/*
 * The level model: difficulty presets, what is painted, what it pays.
 *
 * Deliberately free of DOM and canvas — the rules of the game are testable with
 * `node test/jewel.test.js`, and the renderer only draws what this returns.
 */
(function (root) {
  'use strict';

  var EMPTY = -1;

  /*
   * Difficulty changes two things that actually matter: how many cells the
   * picture is cut into, and how many colours it is allowed to use. Everything
   * else (assist highlighting, payout) follows from those.
   */
  var DIFFICULTIES = [
    { id: 'easy',   label: 'Легко',   grid: 24, colors: 8,  coinMul: 1,   assist: true },
    { id: 'normal', label: 'Норм',    grid: 36, colors: 14, coinMul: 1.6, assist: true },
    { id: 'hard',   label: 'Складно', grid: 48, colors: 20, coinMul: 2.4, assist: false },
    { id: 'expert', label: 'Експерт', grid: 64, colors: 28, coinMul: 3.4, assist: false }
  ];

  function difficulty(id) {
    for (var i = 0; i < DIFFICULTIES.length; i++) {
      if (DIFFICULTIES[i].id === id) return DIFFICULTIES[i];
    }
    return DIFFICULTIES[1];
  }

  /* Paid out while playing, so a long level pays something before it ends. */
  var DRIP_EVERY = 100;
  var DRIP_COINS = 2;

  function paintableCount(def) {
    var n = 0;
    for (var i = 0; i < def.cells.length; i++) if (def.cells[i] !== EMPTY) n++;
    return n;
  }

  /** Cells per colour, indexed by palette position. */
  function colorTotals(def) {
    var totals = def.palette.map(function () { return 0; });
    for (var i = 0; i < def.cells.length; i++) {
      if (def.cells[i] !== EMPTY) totals[def.cells[i]]++;
    }
    return totals;
  }

  function createProgress(def) {
    return {
      filled: new Array(def.cells.length).fill(false),
      done: new Array(def.palette.length).fill(0),  // filled per colour
      totals: colorTotals(def),
      paintable: paintableCount(def),
      correct: 0,
      mistakes: 0,
      seconds: 0,
      complete: false
    };
  }

  /**
   * Try to place `colorIndex` on `cell`.
   * A wrong colour is not punished with a lost life — it costs accuracy, which
   * costs coins at the end. Repainting a filled cell is simply nothing.
   */
  function paint(progress, def, cell, colorIndex) {
    if (cell < 0 || cell >= def.cells.length) return { ok: false, reason: 'out-of-range' };
    if (def.cells[cell] === EMPTY) return { ok: false, reason: 'empty' };
    if (progress.filled[cell]) return { ok: false, reason: 'already' };

    if (def.cells[cell] !== colorIndex) {
      progress.mistakes++;
      return { ok: false, reason: 'wrong', wanted: def.cells[cell] };
    }

    progress.filled[cell] = true;
    progress.done[colorIndex]++;
    progress.correct++;

    var coins = 0;
    if (progress.correct % DRIP_EVERY === 0) coins = DRIP_COINS;

    var complete = progress.correct >= progress.paintable;
    if (complete) progress.complete = true;

    return {
      ok: true,
      coins: coins,
      colorDone: progress.done[colorIndex] >= progress.totals[colorIndex],
      complete: complete
    };
  }

  function ratio(progress) {
    return progress.paintable ? progress.correct / progress.paintable : 0;
  }

  /** The next colour worth switching to when the current one runs out. */
  function nextColor(progress, from) {
    var n = progress.totals.length;
    for (var step = 1; step <= n; step++) {
      var i = ((from + step) % n + n) % n;
      if (progress.done[i] < progress.totals[i]) return i;
    }
    return -1;
  }

  /** Unfilled cells of a colour — hints and bombs both draw from this. */
  function remainingCells(progress, def, colorIndex, limit) {
    var out = [];
    for (var i = 0; i < def.cells.length && (!limit || out.length < limit); i++) {
      if (def.cells[i] === colorIndex && !progress.filled[i]) out.push(i);
    }
    return out;
  }

  /**
   * Coins for finishing. Size and difficulty set the ceiling; accuracy sets how
   * much of it a player keeps. A replay pays a quarter — the picture is already
   * solved, so grinding the same one is not a living.
   */
  function reward(def, progress, diff, opts) {
    var options = opts || {};
    var paintable = progress.paintable || paintableCount(def);
    var base = 20 + paintable * 0.04;
    var tolerance = Math.max(40, paintable * 0.15);
    var accuracy = Math.max(0.55, Math.min(1, 1 - progress.mistakes / tolerance));
    var coins = Math.round(base * (diff.coinMul || 1) * accuracy);
    if (options.replay) coins = Math.round(coins * 0.25);
    return Math.max(5, coins);
  }

  /* ------------------------------------------------------- serialisation --- */

  var ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  // Six bits need all 64 characters: a 62-character alphabet drops the values
  // 62 and 63, which is every run of six filled cells.
  var BITS = ALPHABET + '-_';

  /** Palette indices as one character each; '.' is a cell outside the picture. */
  function cellsToString(cells) {
    var out = '';
    for (var i = 0; i < cells.length; i++) {
      out += cells[i] === EMPTY ? '.' : ALPHABET.charAt(cells[i]);
    }
    return out;
  }

  function cellsFromString(text) {
    var cells = new Array(text.length);
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      cells[i] = ch === '.' ? EMPTY : ALPHABET.indexOf(ch);
    }
    return cells;
  }

  /** Filled flags packed six to a character — a 64×64 save is under 700 bytes. */
  function packFlags(flags) {
    var out = '';
    for (var i = 0; i < flags.length; i += 6) {
      var bits = 0;
      for (var b = 0; b < 6; b++) if (flags[i + b]) bits |= (1 << b);
      out += BITS.charAt(bits);
    }
    return out;
  }

  function unpackFlags(text, length) {
    var flags = new Array(length).fill(false);
    for (var i = 0; i < text.length; i++) {
      var bits = BITS.indexOf(text.charAt(i));
      for (var b = 0; b < 6; b++) {
        var idx = i * 6 + b;
        if (idx < length) flags[idx] = (bits & (1 << b)) !== 0;
      }
    }
    return flags;
  }

  function saveProgress(progress) {
    return {
      filled: packFlags(progress.filled),
      mistakes: progress.mistakes,
      seconds: Math.round(progress.seconds),
      complete: progress.complete
    };
  }

  /** Rebuild a progress object from a save; counters are recomputed, not trusted. */
  function loadProgress(def, saved) {
    var progress = createProgress(def);
    if (!saved || !saved.filled) return progress;

    progress.filled = unpackFlags(saved.filled, def.cells.length);
    progress.mistakes = saved.mistakes || 0;
    progress.seconds = saved.seconds || 0;

    for (var i = 0; i < def.cells.length; i++) {
      if (def.cells[i] === EMPTY) {
        progress.filled[i] = false;       // a save can never fill a hole
      } else if (progress.filled[i]) {
        progress.done[def.cells[i]]++;
        progress.correct++;
      }
    }

    progress.complete = progress.correct >= progress.paintable;
    return progress;
  }

  var api = {
    EMPTY: EMPTY,
    DIFFICULTIES: DIFFICULTIES,
    DRIP_EVERY: DRIP_EVERY,
    DRIP_COINS: DRIP_COINS,
    difficulty: difficulty,
    paintableCount: paintableCount,
    colorTotals: colorTotals,
    createProgress: createProgress,
    paint: paint,
    ratio: ratio,
    nextColor: nextColor,
    remainingCells: remainingCells,
    reward: reward,
    cellsToString: cellsToString,
    cellsFromString: cellsFromString,
    packFlags: packFlags,
    unpackFlags: unpackFlags,
    saveProgress: saveProgress,
    loadProgress: loadProgress
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.JewelLevel = api;
}(typeof globalThis !== 'undefined' ? globalThis : this));
