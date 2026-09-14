/*
 * Coins, the shop, and the two power-ups.
 *
 * The wallet is a plain object so it can be stored, restored and asserted on
 * without a live game around it. Every mutation goes through here — a screen
 * never edits `coins` by hand, which is what keeps "спробуй ще" from quietly
 * printing money.
 */
(function (root) {
  'use strict';

  var HINT_COINS = 25;   // price of one hint when the pouch is empty
  var BOMB_COINS = 60;
  var BOMB_CELLS = 25;   // how many cells one bomb fills

  var CATALOG = [
    {
      id: 'hint5', kind: 'consumable', price: 60, grants: { hint: 5 },
      label: 'Підказки ×5', desc: 'Ставить один правильний камінь замість тебе.'
    },
    {
      id: 'hint20', kind: 'consumable', price: 200, grants: { hint: 20 },
      label: 'Підказки ×20', desc: 'Те саме, але дешевше за штуку.'
    },
    {
      id: 'bomb3', kind: 'consumable', price: 150, grants: { bomb: 3 },
      label: 'Бомби ×3', desc: 'Закриває до ' + BOMB_CELLS + ' клітинок обраного кольору.'
    },
    {
      id: 'style.square', kind: 'style', price: 250,
      label: 'Мозаїка', desc: 'Квадратні плитки замість круглих каменів.'
    },
    {
      id: 'style.heart', kind: 'style', price: 400,
      label: 'Сердечка', desc: 'Камені у формі сердець.'
    },
    {
      id: 'style.star', kind: 'style', price: 600,
      label: 'Зірочки', desc: 'Камені у формі зірок.'
    },
    {
      id: 'theme.candy', kind: 'theme', price: 300,
      label: 'Тема «Цукерка»', desc: 'Тепле рожеве тло замість темного.'
    },
    {
      id: 'theme.mint', kind: 'theme', price: 300,
      label: 'Тема «Мʼята»', desc: 'Прохолодне зелене тло.'
    }
  ];

  function item(id) {
    for (var i = 0; i < CATALOG.length; i++) if (CATALOG[i].id === id) return CATALOG[i];
    return null;
  }

  function createWallet() {
    return {
      coins: 120,                                  // enough for a first hint pack
      items: { hint: 3, bomb: 1 },
      owned: ['style.round', 'theme.night'],
      style: 'round',
      theme: 'night'
    };
  }

  /** Fill in anything a wallet from an older save is missing. */
  function normalize(wallet) {
    var base = createWallet();
    if (!wallet || typeof wallet !== 'object') return base;   // first run keeps the starter pouch
    var w = wallet;
    var pouch = w.items && typeof w.items === 'object' ? w.items : base.items;
    return {
      coins: Math.max(0, Math.round(Number(w.coins) >= 0 ? Number(w.coins) : base.coins)),
      items: {
        hint: Math.max(0, Math.round(Number(pouch.hint) || 0)),
        bomb: Math.max(0, Math.round(Number(pouch.bomb) || 0))
      },
      owned: Array.isArray(w.owned) ? base.owned.concat(w.owned.filter(function (id) {
        return base.owned.indexOf(id) === -1;
      })) : base.owned.slice(),
      style: w.style || base.style,
      theme: w.theme || base.theme
    };
  }

  function owns(wallet, id) {
    return wallet.owned.indexOf(id) !== -1;
  }

  function earn(wallet, coins) {
    wallet.coins += Math.max(0, Math.round(coins));
    return wallet.coins;
  }

  function buy(wallet, id) {
    var entry = item(id);
    if (!entry) return { ok: false, reason: 'unknown' };
    if (entry.kind !== 'consumable' && owns(wallet, id)) return { ok: false, reason: 'owned' };
    if (wallet.coins < entry.price) return { ok: false, reason: 'poor', short: entry.price - wallet.coins };

    wallet.coins -= entry.price;

    if (entry.grants) {
      for (var key in entry.grants) wallet.items[key] = (wallet.items[key] || 0) + entry.grants[key];
    } else {
      wallet.owned.push(id);
      equip(wallet, id);      // buying a look means wearing it
    }

    return { ok: true, wallet: wallet, item: entry };
  }

  /** Wear an owned style or theme. */
  function equip(wallet, id) {
    if (!owns(wallet, id)) return { ok: false, reason: 'not-owned' };
    var parts = id.split('.');
    if (parts[0] === 'style') wallet.style = parts[1];
    else if (parts[0] === 'theme') wallet.theme = parts[1];
    else return { ok: false, reason: 'not-wearable' };
    return { ok: true, wallet: wallet };
  }

  /**
   * Spend a power-up: the pouch first, coins second.
   * Returns how it was paid for so the UI can say "−1" or "−25".
   */
  function spend(wallet, kind) {
    var price = kind === 'bomb' ? BOMB_COINS : HINT_COINS;
    if ((wallet.items[kind] || 0) > 0) {
      wallet.items[kind]--;
      return { ok: true, paid: 'item' };
    }
    if (wallet.coins >= price) {
      wallet.coins -= price;
      return { ok: true, paid: 'coins', price: price };
    }
    return { ok: false, reason: 'poor', short: price - wallet.coins };
  }

  var api = {
    CATALOG: CATALOG,
    HINT_COINS: HINT_COINS,
    BOMB_COINS: BOMB_COINS,
    BOMB_CELLS: BOMB_CELLS,
    item: item,
    createWallet: createWallet,
    normalize: normalize,
    owns: owns,
    earn: earn,
    buy: buy,
    equip: equip,
    spend: spend
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.JewelShop = api;
}(typeof globalThis !== 'undefined' ? globalThis : this));
