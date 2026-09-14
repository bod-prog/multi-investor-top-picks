/*
 * Turning any picture into a paintable grid.
 *
 * Both halves of the game lean on this: the built-in drawings and a photo from
 * the camera roll go through exactly the same pipeline, so difficulty (grid size
 * and colour count) means the same thing everywhere.
 *
 *   pixels  →  box-sampled into grid cells  →  k-means in Lab  →  palette + cells
 *
 * Lab rather than RGB because k-means in RGB happily merges colours a person
 * sees as different (and splits ones they don't), which makes a level look
 * muddy. Everything is seeded, so the same photo at the same difficulty always
 * produces the same level — a resumed save must line up with its picture.
 */
(function (root) {
  'use strict';

  /** Deterministic RNG — levels must be reproducible. */
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ------------------------------------------------------------- colour --- */

  function srgbToLinear(c) {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  /** sRGB → CIE Lab (D65). Distances in Lab track what the eye calls different. */
  function rgbToLab(r, g, b) {
    var lr = srgbToLinear(r), lg = srgbToLinear(g), lb = srgbToLinear(b);
    var x = (0.4124 * lr + 0.3576 * lg + 0.1805 * lb) / 0.95047;
    var y = (0.2126 * lr + 0.7152 * lg + 0.0722 * lb);
    var z = (0.0193 * lr + 0.1192 * lg + 0.9505 * lb) / 1.08883;
    var f = function (t) { return t > 0.008856 ? Math.cbrt(t) : (7.787 * t) + 16 / 116; };
    var fx = f(x), fy = f(y), fz = f(z);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }

  function labDist2(a, b) {
    var dl = a[0] - b[0], da = a[1] - b[1], db = a[2] - b[2];
    return dl * dl + da * da + db * db;
  }

  /* -------------------------------------------------------- box sampling --- */

  /**
   * Average an image down to `cols × rows` cells.
   * `image` is anything shaped like ImageData: { width, height, data } RGBA.
   * A cell whose average alpha is low becomes EMPTY — pixel art with a
   * transparent background keeps its silhouette instead of gaining a box.
   */
  function sampleCells(image, cols, rows) {
    var out = [];
    for (var cy = 0; cy < rows; cy++) {
      for (var cx = 0; cx < cols; cx++) {
        var x0 = Math.floor(cx * image.width / cols);
        var x1 = Math.max(x0 + 1, Math.floor((cx + 1) * image.width / cols));
        var y0 = Math.floor(cy * image.height / rows);
        var y1 = Math.max(y0 + 1, Math.floor((cy + 1) * image.height / rows));
        var r = 0, g = 0, b = 0, a = 0, n = 0;

        for (var y = y0; y < y1; y++) {
          for (var x = x0; x < x1; x++) {
            var i = (y * image.width + x) * 4;
            var alpha = image.data[i + 3] / 255;
            // Weight colour by alpha so half-transparent edges don't drag
            // the average towards black.
            r += image.data[i] * alpha;
            g += image.data[i + 1] * alpha;
            b += image.data[i + 2] * alpha;
            a += alpha;
            n++;
          }
        }

        if (a < n * 0.45) out.push(null);
        else out.push([r / a, g / a, b / a]);
      }
    }
    return out;
  }

  /* ------------------------------------------------------------ k-means --- */

  function kmeansPlusPlus(points, k, rand) {
    var centres = [points[Math.floor(rand() * points.length)]];
    var dist = new Array(points.length).fill(Infinity);

    while (centres.length < k) {
      var total = 0, i;
      for (i = 0; i < points.length; i++) {
        dist[i] = Math.min(dist[i], labDist2(points[i], centres[centres.length - 1]));
        total += dist[i];
      }
      if (total <= 0) break;           // every point already sits on a centre
      var target = rand() * total;
      for (i = 0; i < points.length; i++) {
        target -= dist[i];
        if (target <= 0) break;
      }
      centres.push(points[Math.min(i, points.length - 1)]);
    }
    return centres;
  }

  /** Cluster Lab points into at most k groups; returns centres + assignment. */
  function kmeans(points, k, rand, iterations) {
    k = Math.max(1, Math.min(k, points.length));
    var centres = kmeansPlusPlus(points, k, rand);
    var assign = new Array(points.length).fill(0);
    var steps = iterations || 14;

    for (var pass = 0; pass < steps; pass++) {
      var moved = false;
      var i, c;

      for (i = 0; i < points.length; i++) {
        var best = 0, bestD = Infinity;
        for (c = 0; c < centres.length; c++) {
          var d = labDist2(points[i], centres[c]);
          if (d < bestD) { bestD = d; best = c; }
        }
        if (assign[i] !== best) { assign[i] = best; moved = true; }
      }

      var sums = centres.map(function () { return [0, 0, 0, 0]; });
      for (i = 0; i < points.length; i++) {
        var s = sums[assign[i]];
        s[0] += points[i][0]; s[1] += points[i][1]; s[2] += points[i][2]; s[3]++;
      }
      for (c = 0; c < centres.length; c++) {
        if (sums[c][3] > 0) {
          centres[c] = [sums[c][0] / sums[c][3], sums[c][1] / sums[c][3], sums[c][2] / sums[c][3]];
        }
      }
      if (!moved && pass > 0) break;
    }

    return { centres: centres, assign: assign };
  }

  /* -------------------------------------------------------------- level --- */

  function labToRgb(lab) {
    // Round-trip through the inverse of rgbToLab, clamped to the sRGB box.
    var y = (lab[0] + 16) / 116, x = lab[1] / 500 + y, z = y - lab[2] / 200;
    var cube = function (t) { var t3 = t * t * t; return t3 > 0.008856 ? t3 : (t - 16 / 116) / 7.787; };
    var X = 0.95047 * cube(x), Y = cube(y), Z = 1.08883 * cube(z);
    var lr = 3.2406 * X - 1.5372 * Y - 0.4986 * Z;
    var lg = -0.9689 * X + 1.8758 * Y + 0.0415 * Z;
    var lb = 0.0557 * X - 0.2040 * Y + 1.0570 * Z;
    var enc = function (c) {
      c = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(Math.max(c, 0), 1 / 2.4) - 0.055;
      return Math.max(0, Math.min(255, Math.round(c * 255)));
    };
    return [enc(lr), enc(lg), enc(lb)];
  }

  var EMPTY = -1;

  /**
   * Build a playable level.
   *
   *   image   ImageData-shaped source
   *   cols/rows  grid size (difficulty)
   *   colors  how many palette entries at most (difficulty)
   *   seed    keeps the result reproducible
   *
   * Returns { cols, rows, palette: [[r,g,b], …], cells: [paletteIndex | -1] }
   * with the palette ordered by how much of the picture each colour covers, so
   * colour 1 is always the one there is most of.
   */
  function buildLevel(image, cols, rows, colors, seed) {
    var sampled = sampleCells(image, cols, rows);
    var points = [], index = [];

    for (var i = 0; i < sampled.length; i++) {
      if (sampled[i]) {
        index.push(i);
        points.push(rgbToLab(sampled[i][0], sampled[i][1], sampled[i][2]));
      }
    }

    var cells = new Array(sampled.length).fill(EMPTY);
    if (!points.length) return { cols: cols, rows: rows, palette: [], cells: cells };

    var rand = mulberry32(seed || 1);
    var result = kmeans(points, colors, rand);

    // Two swatches a player cannot tell apart are a bug, not a difficulty.
    var merged = mergeClose(result.centres, result.assign, 7);

    // Neither is a swatch worth four cells out of four thousand: the palette bar
    // fills up with colours that are one tap of work each. Fold those into the
    // nearest colour that survived.
    merged = foldTiny(merged.centres, merged.assign, Math.max(2, Math.round(points.length * 0.004)));

    var counts = merged.centres.map(function () { return 0; });
    for (i = 0; i < merged.assign.length; i++) counts[merged.assign[i]]++;

    var order = merged.centres
      .map(function (centre, idx) { return { idx: idx, count: counts[idx], centre: centre }; })
      .filter(function (entry) { return entry.count > 0; })
      .sort(function (a, b) { return b.count - a.count; });

    var remap = {};
    order.forEach(function (entry, position) { remap[entry.idx] = position; });

    for (i = 0; i < index.length; i++) cells[index[i]] = remap[merged.assign[i]];

    return {
      cols: cols,
      rows: rows,
      palette: order.map(function (entry) { return labToRgb(entry.centre); }),
      cells: cells
    };
  }

  /** Move the cells of near-empty clusters onto the closest surviving colour. */
  function foldTiny(centres, assign, minCount) {
    var counts = centres.map(function () { return 0; });
    var i;
    for (i = 0; i < assign.length; i++) counts[assign[i]]++;

    var survivors = [];
    for (i = 0; i < centres.length; i++) if (counts[i] >= minCount) survivors.push(i);
    if (!survivors.length) survivors = [counts.indexOf(Math.max.apply(null, counts))];

    var map = {};
    for (i = 0; i < centres.length; i++) {
      if (!counts[i] || counts[i] >= minCount) { map[i] = i; continue; }
      var best = survivors[0], bestD = Infinity;
      for (var s = 0; s < survivors.length; s++) {
        var d = labDist2(centres[i], centres[survivors[s]]);
        if (d < bestD) { bestD = d; best = survivors[s]; }
      }
      map[i] = best;
    }

    return { centres: centres, assign: assign.map(function (c) { return map[c]; }) };
  }

  /** Fold clusters closer than `minDist` in Lab into one another. */
  function mergeClose(centres, assign, minDist) {
    var map = centres.map(function (_, i) { return i; });
    var limit = minDist * minDist;

    for (var i = 0; i < centres.length; i++) {
      if (map[i] !== i) continue;
      for (var j = i + 1; j < centres.length; j++) {
        if (map[j] !== j) continue;
        if (labDist2(centres[i], centres[j]) < limit) map[j] = i;
      }
    }

    return {
      centres: centres,
      assign: assign.map(function (c) { return map[c]; })
    };
  }

  var api = {
    EMPTY: EMPTY,
    buildLevel: buildLevel,
    sampleCells: sampleCells,
    rgbToLab: rgbToLab,
    labToRgb: labToRgb,
    labDist2: labDist2,
    kmeans: kmeans,
    foldTiny: foldTiny,
    mulberry32: mulberry32
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.JewelQuantize = api;
}(typeof globalThis !== 'undefined' ? globalThis : this));
