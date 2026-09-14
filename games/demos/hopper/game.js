/*
 * Hopper — an endless jumper on Phaser 3.
 *
 * It exists to prove the vendored stack works end to end: Phaser for the game,
 * jsfxr for sound, Press Start 2P for text, Arcade for input and the high score.
 * No image or audio files — every texture is drawn at boot and every sound is
 * synthesised, so copying this folder is enough to start a new game.
 */
(function () {
  'use strict';

  var W = 480;
  var H = 270;
  var GROUND_Y = H - 38;
  var GRAVITY = 1500;
  var JUMP_V = -545;
  var START_SPEED = 190;
  var MAX_SPEED = 430;
  var COYOTE_MS = 90;   // a jump pressed just after walking off still counts

  var input = new Arcade.Input({ surface: document.body });

  function pixel(scene, key, width, height, color) {
    if (scene.textures.exists(key)) return;
    var g = scene.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(color, 1);
    g.fillRect(0, 0, width, height);
    g.generateTexture(key, width, height);
    g.destroy();
  }

  function Play() {
    Phaser.Scene.call(this, { key: 'play' });
  }

  Play.prototype = Object.create(Phaser.Scene.prototype);
  Play.prototype.constructor = Play;

  Play.prototype.create = function () {
    pixel(this, 'hero', 16, 20, 0x3b82f6);
    pixel(this, 'spike', 14, 22, 0xf43f5e);
    pixel(this, 'coin', 10, 10, 0xfbbf24);
    pixel(this, 'ground', W, 4, 0x1e293b);
    pixel(this, 'dust', 3, 3, 0x334155);

    this.cameras.main.setBackgroundColor('#070b14');

    // Parallax specks, cheap depth without any art.
    this.stars = [];
    for (var i = 0; i < 40; i++) {
      var star = this.add.image(Phaser.Math.Between(0, W), Phaser.Math.Between(10, GROUND_Y - 20), 'dust');
      star.depth = -1;
      star.alpha = Phaser.Math.FloatBetween(0.25, 0.7);
      star.speed = star.alpha * 60 + 20;
      this.stars.push(star);
    }

    this.add.image(W / 2, GROUND_Y + 2, 'ground');

    this.player = this.physics.add.sprite(70, GROUND_Y - 30, 'hero');
    this.player.setGravityY(GRAVITY);
    this.player.setCollideWorldBounds(false);

    this.spikes = this.physics.add.group({ allowGravity: false, immovable: true });
    this.coins = this.physics.add.group({ allowGravity: false, immovable: true });

    this.physics.add.overlap(this.player, this.spikes, this.hit, null, this);
    this.physics.add.overlap(this.player, this.coins, this.collect, null, this);

    var style = { fontFamily: '"Press Start 2P", monospace', fontSize: '10px', color: '#e2e8f0' };
    this.scoreText = this.add.text(10, 10, '', style).setDepth(5);
    this.bestText = this.add.text(W - 10, 10, '', style).setOrigin(1, 0).setDepth(5);
    this.overText = this.add.text(W / 2, H / 2 - 14, '', {
      fontFamily: '"Press Start 2P", monospace', fontSize: '13px', color: '#f43f5e', align: 'center'
    }).setOrigin(0.5).setDepth(5);
    this.hintText = this.add.text(W / 2, H / 2 + 16, '', {
      fontFamily: '"Press Start 2P", monospace', fontSize: '8px', color: '#94a3b8', align: 'center'
    }).setOrigin(0.5).setDepth(5);

    Arcade.Sfx.define('jump', 'jump');
    Arcade.Sfx.define('coin', 'pickupCoin');
    Arcade.Sfx.define('hurt', 'hitHurt');

    this.reset();
  };

  Play.prototype.reset = function () {
    this.spikes.clear(true, true);
    this.coins.clear(true, true);
    this.speed = START_SPEED;
    this.score = 0;
    this.coinScore = 0;
    this.distance = 0;
    this.dead = false;
    this.nextSpike = 900;
    this.nextCoin = 1400;
    this.lastGround = 0;
    this.best = Arcade.Store.get('best:hopper', 0);
    this.player.setPosition(70, GROUND_Y - 30);
    this.player.setVelocity(0, 0);
    this.player.setTint(0xffffff);
    this.overText.setText('');
    this.hintText.setText('');
  };

  Play.prototype.spawnSpike = function () {
    var tall = Phaser.Math.Between(0, 2) === 0;
    var spike = this.spikes.create(W + 20, GROUND_Y - (tall ? 30 : 11), 'spike');
    spike.setScale(1, tall ? 1.4 : 1).refreshBody();
    spike.body.setSize(10, spike.displayHeight - 4, true);
  };

  Play.prototype.spawnCoin = function () {
    var y = GROUND_Y - Phaser.Math.Between(28, 76);
    var coin = this.coins.create(W + 20, y, 'coin');
    coin.body.setCircle(5);
  };

  Play.prototype.collect = function (player, coin) {
    coin.destroy();
    this.coinScore += 10;
    Arcade.Sfx.play('coin');
  };

  Play.prototype.hit = function () {
    if (this.dead) return;
    this.dead = true;
    this.player.setTint(0xf43f5e);
    this.player.setVelocityY(-220);
    Arcade.Sfx.play('hurt');
    this.best = Arcade.Store.best('hopper', this.score);
    this.overText.setText('GAME OVER');
    this.hintText.setText('SCORE ' + this.score + '   BEST ' + this.best + '\n\nПРОБІЛ АБО ТАП');
  };

  Play.prototype.update = function (time, delta) {
    var dt = delta / 1000;
    var onGround = this.player.y >= GROUND_Y - 30 - 0.5 && this.player.body.velocity.y >= 0;
    var wantsJump = input.pressed('action') || input.pressed('up') || input.pressed('touch');

    if (this.dead) {
      if (wantsJump) this.reset();
      input.endFrame();
      return;
    }

    if (onGround) {
      this.player.y = GROUND_Y - 30;
      this.player.setVelocityY(0);
      this.lastGround = time;
    }

    if (wantsJump && time - this.lastGround <= COYOTE_MS) {
      this.player.setVelocityY(JUMP_V);
      this.lastGround = -1e9;
      Arcade.Sfx.play('jump');
    }

    // A short hop when the button is released early — the standard platformer feel.
    if (!input.held('action') && !input.held('up') && !input.held('touch') &&
        this.player.body.velocity.y < -180) {
      this.player.setVelocityY(-180);
    }

    this.speed = Math.min(MAX_SPEED, this.speed + 7 * dt);
    this.distance += this.speed * dt;
    this.score = Math.floor(this.distance / 10) + this.coinScore;

    this.spikes.children.iterate(function (spike) {
      if (!spike) return;
      spike.x -= this.speed * dt;
      if (spike.x < -30) spike.destroy();
    }, this);

    this.coins.children.iterate(function (coin) {
      if (!coin) return;
      coin.x -= this.speed * dt;
      coin.y += Math.sin((this.distance + coin.x) / 30) * 0.3;
      if (coin.x < -30) coin.destroy();
    }, this);

    for (var i = 0; i < this.stars.length; i++) {
      var star = this.stars[i];
      star.x -= star.speed * dt;
      if (star.x < -4) {
        star.x = W + 4;
        star.y = Phaser.Math.Between(10, GROUND_Y - 20);
      }
    }

    this.nextSpike -= delta;
    if (this.nextSpike <= 0) {
      this.spawnSpike();
      // Gaps shrink with speed but never below what a single jump can clear.
      this.nextSpike = Phaser.Math.Between(760, 1250) * (START_SPEED / this.speed) + 260;
    }

    this.nextCoin -= delta;
    if (this.nextCoin <= 0) {
      this.spawnCoin();
      this.nextCoin = Phaser.Math.Between(900, 2200);
    }

    if (this.player.y > H + 40) this.hit();

    this.scoreText.setText('SCORE ' + this.score);
    this.bestText.setText('BEST ' + Math.max(this.best, this.score));
    input.endFrame();
  };

  function boot() {
    return new Phaser.Game({
      type: Phaser.AUTO,
      width: W,
      height: H,
      parent: 'stage',
      pixelArt: true,
      backgroundColor: '#070b14',
      physics: { default: 'arcade', arcade: { gravity: { y: 0 }, debug: false } },
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: [Play]
    });
  }

  // Text renders with the wrong face if the font lands after the first frame.
  Arcade.loadFont('../../vendor/fonts/PressStart2P-Regular.ttf').then(function () {
    window.game = boot();
  });
}());
