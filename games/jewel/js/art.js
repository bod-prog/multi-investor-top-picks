/*
 * Built-in pictures.
 *
 * Each one is drawn with plain canvas calls in a 0…100 coordinate space and
 * then goes through the same pipeline as an imported photo. Nothing here is a
 * bitmap, so one picture works at every difficulty: at 24×24 it reads as chunky
 * pixel art, at 64×64 the details survive.
 */
(function (root) {
  'use strict';

  function circle(ctx, x, y, r, fill) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function ellipse(ctx, x, y, rx, ry, fill, rotation) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rotation || 0, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function polygon(ctx, points, fill) {
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (var i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function star(ctx, cx, cy, outer, inner, points, fill, turn) {
    var pts = [];
    for (var i = 0; i < points * 2; i++) {
      var r = i % 2 ? inner : outer;
      var a = (i * Math.PI) / points - Math.PI / 2 + (turn || 0);
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    polygon(ctx, pts, fill);
  }

  function heartPath(ctx, cx, cy, size) {
    ctx.beginPath();
    ctx.moveTo(cx, cy + size * 0.75);
    ctx.bezierCurveTo(cx - size * 1.3, cy - size * 0.2, cx - size * 0.55, cy - size * 0.95, cx, cy - size * 0.35);
    ctx.bezierCurveTo(cx + size * 0.55, cy - size * 0.95, cx + size * 1.3, cy - size * 0.2, cx, cy + size * 0.75);
    ctx.closePath();
  }

  function wash(ctx, top, bottom) {
    var g = ctx.createLinearGradient(0, 0, 0, 100);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 100, 100);
  }

  var ART = [
    {
      id: 'strawberry',
      title: 'Полуниця',
      draw: function (ctx) {
        wash(ctx, '#fff3f6', '#ffdce6');
        // body: a bell, wide at the shoulders, pointed at the bottom
        ctx.beginPath();
        ctx.moveTo(50, 92);
        ctx.bezierCurveTo(18, 74, 14, 44, 34, 32);
        ctx.bezierCurveTo(44, 26, 56, 26, 66, 32);
        ctx.bezierCurveTo(86, 44, 82, 74, 50, 92);
        ctx.closePath();
        ctx.fillStyle = '#e01b3c';
        ctx.fill();
        ellipse(ctx, 38, 48, 9, 14, 'rgba(255,255,255,0.22)', -0.4);

        var seeds = [[38, 44], [52, 41], [64, 48], [32, 58], [46, 56], [60, 62], [40, 70], [54, 73], [47, 84]];
        for (var i = 0; i < seeds.length; i++) {
          ellipse(ctx, seeds[i][0], seeds[i][1], 2.4, 3.4, '#ffd84d', 0.4);
        }

        polygon(ctx, [[50, 34], [30, 24], [40, 22], [34, 12], [48, 20], [50, 8],
                      [54, 20], [68, 12], [62, 22], [72, 24]], '#1f9e4a');
        ellipse(ctx, 50, 16, 3.2, 6, '#7bd18f');
      }
    },
    {
      id: 'cat',
      title: 'Кіт',
      draw: function (ctx) {
        wash(ctx, '#12324f', '#204c6e');
        polygon(ctx, [[24, 40], [28, 12], [48, 28]], '#f08a2c');
        polygon(ctx, [[76, 40], [72, 12], [52, 28]], '#f08a2c');
        polygon(ctx, [[29, 36], [31, 20], [43, 30]], '#ffc2a1');
        polygon(ctx, [[71, 36], [69, 20], [57, 30]], '#ffc2a1');

        ellipse(ctx, 50, 58, 31, 27, '#f7a13d');
        ellipse(ctx, 50, 70, 19, 13, '#ffe9cf');

        ellipse(ctx, 38, 53, 6, 7.5, '#ffffff');
        ellipse(ctx, 62, 53, 6, 7.5, '#ffffff');
        ellipse(ctx, 38, 54, 3.2, 5.6, '#15202e');
        ellipse(ctx, 62, 54, 3.2, 5.6, '#15202e');
        circle(ctx, 39.4, 51, 1.3, '#ffffff');
        circle(ctx, 63.4, 51, 1.3, '#ffffff');

        polygon(ctx, [[46, 65], [54, 65], [50, 70]], '#ff7a9c');
        ctx.strokeStyle = '#3a2418';
        ctx.lineWidth = 1.6;
        ctx.lineCap = 'round';
        [[-1, 0], [-1, 4], [1, 0], [1, 4]].forEach(function (w) {
          ctx.beginPath();
          ctx.moveTo(50 + w[0] * 14, 71 + w[1]);
          ctx.lineTo(50 + w[0] * 32, 68 + w[1] * 1.6);
          ctx.stroke();
        });
      }
    },
    {
      id: 'flower',
      title: 'Квітка',
      draw: function (ctx) {
        wash(ctx, '#d8f0ff', '#a9dcf7');
        ctx.strokeStyle = '#2f8f3e';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(50, 96);
        ctx.quadraticCurveTo(46, 70, 50, 52);
        ctx.stroke();
        ellipse(ctx, 33, 74, 13, 7, '#3aa94c', -0.5);
        ellipse(ctx, 67, 84, 11, 6, '#3aa94c', 0.5);

        for (var i = 0; i < 8; i++) {
          var a = (i / 8) * Math.PI * 2;
          ellipse(ctx, 50 + Math.cos(a) * 20, 44 + Math.sin(a) * 20, 11, 7.5, '#ff5c8a', a);
        }
        circle(ctx, 50, 44, 11, '#ffd23f');
        circle(ctx, 47, 41, 3.4, '#fff0a8');
      }
    },
    {
      id: 'mushroom',
      title: 'Грибочок',
      draw: function (ctx) {
        wash(ctx, '#1b3b2a', '#0f2a1d');
        ellipse(ctx, 50, 86, 26, 5, 'rgba(0,0,0,0.28)');
        polygon(ctx, [[36, 52], [64, 52], [60, 86], [40, 86]], '#f3e3c8');
        ctx.beginPath();
        ctx.moveTo(12, 54);
        ctx.bezierCurveTo(14, 22, 86, 22, 88, 54);
        ctx.closePath();
        ctx.fillStyle = '#e0392b';
        ctx.fill();
        circle(ctx, 30, 42, 7, '#fff6e8');
        circle(ctx, 52, 34, 9, '#fff6e8');
        circle(ctx, 71, 45, 6, '#fff6e8');
        ellipse(ctx, 50, 55, 14, 4, '#d9c7a6');
        ellipse(ctx, 44, 66, 4, 6, '#e6d3b3');
      }
    },
    {
      id: 'balloon',
      title: 'Повітряна куля',
      draw: function (ctx) {
        wash(ctx, '#5fc0f0', '#bfe9ff');
        ellipse(ctx, 24, 22, 13, 7, 'rgba(255,255,255,0.85)');
        ellipse(ctx, 33, 24, 9, 5.5, 'rgba(255,255,255,0.85)');
        ellipse(ctx, 76, 40, 11, 6, 'rgba(255,255,255,0.7)');

        ctx.save();
        ctx.beginPath();
        ctx.ellipse(50, 40, 26, 31, 0, 0, Math.PI * 2);
        ctx.clip();
        ctx.fillStyle = '#ff4f6d';
        ctx.fillRect(24, 9, 52, 62);
        ctx.fillStyle = '#ffd23f';
        ctx.fillRect(38, 9, 8, 62);
        ctx.fillRect(58, 9, 8, 62);
        ctx.fillStyle = '#2f8fe0';
        ctx.fillRect(47, 9, 6, 62);
        ctx.restore();
        ellipse(ctx, 38, 30, 5, 11, 'rgba(255,255,255,0.25)', -0.2);

        ctx.strokeStyle = '#5a4632';
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(38, 68); ctx.lineTo(43, 80); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(62, 68); ctx.lineTo(57, 80); ctx.stroke();
        polygon(ctx, [[42, 80], [58, 80], [56, 90], [44, 90]], '#a9713a');
        ctx.fillStyle = '#8a5a2c';
        ctx.fillRect(42, 83, 16, 2);
      }
    },
    {
      id: 'rocket',
      title: 'Ракета',
      draw: function (ctx) {
        wash(ctx, '#0b1030', '#231a4d');
        star(ctx, 18, 20, 4, 1.6, 4, '#ffffff');
        star(ctx, 82, 28, 3.4, 1.4, 4, '#ffffff');
        star(ctx, 74, 14, 2.6, 1, 4, '#cfe3ff');
        star(ctx, 26, 62, 2.6, 1, 4, '#cfe3ff');

        polygon(ctx, [[50, 8], [64, 34], [64, 66], [36, 66], [36, 34]], '#e8edf5');
        polygon(ctx, [[36, 44], [22, 70], [36, 66]], '#ff4f4f');
        polygon(ctx, [[64, 44], [78, 70], [64, 66]], '#ff4f4f');
        polygon(ctx, [[50, 8], [62, 30], [38, 30]], '#ff4f4f');
        circle(ctx, 50, 40, 8.5, '#2f8fe0');
        circle(ctx, 50, 40, 5.5, '#bde4ff');
        ctx.fillStyle = '#c2cad6';
        ctx.fillRect(36, 60, 28, 6);
        polygon(ctx, [[42, 66], [58, 66], [54, 82], [46, 82]], '#ffb020');
        polygon(ctx, [[46, 70], [54, 70], [50, 92]], '#ffe66b');
      }
    },
    {
      id: 'gemheart',
      title: 'Серце-самоцвіт',
      draw: function (ctx) {
        wash(ctx, '#2a1140', '#521a5e');
        ctx.save();
        heartPath(ctx, 50, 48, 34);
        ctx.fillStyle = '#ff2f6e';
        ctx.fill();
        ctx.clip();
        polygon(ctx, [[50, 10], [76, 34], [50, 52]], '#ff6f9a');
        polygon(ctx, [[24, 34], [50, 52], [30, 64]], '#d61155');
        polygon(ctx, [[50, 52], [76, 34], [70, 66]], '#ff90b4');
        polygon(ctx, [[50, 52], [70, 66], [50, 88]], '#c40d4c');
        ctx.restore();
        ellipse(ctx, 38, 30, 5, 8, 'rgba(255,255,255,0.55)', -0.5);
        star(ctx, 76, 20, 6, 2.4, 4, '#ffe0ef');
        star(ctx, 22, 70, 4.5, 1.8, 4, '#ffe0ef');
      }
    },
    {
      id: 'pug',
      title: 'Мопс',
      draw: function (ctx) {
        wash(ctx, '#b32bb6', '#7b1fa2');
        ellipse(ctx, 50, 58, 30, 28, '#efe3cd');
        ellipse(ctx, 24, 40, 10, 13, '#4a4038', -0.5);
        ellipse(ctx, 76, 40, 10, 13, '#4a4038', 0.5);
        ellipse(ctx, 50, 66, 20, 17, '#6b6057');
        ellipse(ctx, 36, 50, 7, 8, '#ffffff');
        ellipse(ctx, 64, 50, 7, 8, '#ffffff');
        circle(ctx, 36, 51, 4, '#241c16');
        circle(ctx, 64, 51, 4, '#241c16');
        circle(ctx, 37.6, 49, 1.4, '#ffffff');
        circle(ctx, 65.6, 49, 1.4, '#ffffff');
        ellipse(ctx, 50, 64, 7, 5, '#241c16');
        ctx.strokeStyle = '#241c16';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(50, 69);
        ctx.quadraticCurveTo(43, 78, 37, 72);
        ctx.moveTo(50, 69);
        ctx.quadraticCurveTo(57, 78, 63, 72);
        ctx.stroke();
      }
    }
  ];

  /** Render one picture into a canvas of `size` px and hand back its ImageData. */
  function render(art, size, document_) {
    var doc = document_ || root.document;
    var canvas = doc.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    var ctx = canvas.getContext('2d');
    ctx.save();
    ctx.scale(size / 100, size / 100);
    art.draw(ctx);
    ctx.restore();
    return { canvas: canvas, imageData: ctx.getImageData(0, 0, size, size) };
  }

  function byId(id) {
    for (var i = 0; i < ART.length; i++) if (ART[i].id === id) return ART[i];
    return null;
  }

  var api = { ART: ART, byId: byId, render: render };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.JewelArt = api;
}(typeof globalThis !== 'undefined' ? globalThis : this));
