import type { Choice } from '../progression';
import { EQUIPMENT, type EquipDef } from '../data/equipment';

export interface HudData {
  stage: number;
  stageName: string;
  hp: number;
  maxHp: number;
  xp: number;
  xpToNext: number;
  level: number;
  kills: number;
  time: number;
  weapons: Array<{ name: string; level: number }>;
  bossHp: number | null; // 0..1 fraction, or null if no boss
  gold: number;
  items: Array<{ def: EquipDef; count: number; remain: number }>;
  shield: number;
}

const STYLE = `
#ui-hud{position:fixed;inset:0;pointer-events:none;z-index:10;font-family:system-ui,"Microsoft YaHei",sans-serif;color:#dfe7e3}
#ui-xp{position:fixed;top:0;left:0;right:0;height:6px;background:#11201b}
#ui-xp>i{display:block;height:100%;width:0;background:linear-gradient(90deg,#39d68a,#9ff7c8);transition:width .12s}
#ui-top{position:fixed;top:12px;left:0;right:0;text-align:center;font-size:13px;letter-spacing:1px;text-shadow:0 1px 3px #000}
#ui-top b{color:#9ff7c8}
#ui-gold{position:fixed;top:12px;right:16px;font-size:14px;text-shadow:0 1px 3px #000;color:#ffd700;letter-spacing:1px}
#ui-gold b{color:#ffe66a}
#ui-shopbtn{position:fixed;top:36px;right:16px;pointer-events:auto;cursor:pointer;background:rgba(25,70,55,.7);border:1px solid #3fae84;border-radius:8px;padding:4px 12px;font-size:12px;color:#9ff7c8;letter-spacing:1px;transition:.12s}
#ui-shopbtn:hover{background:rgba(40,120,90,.9);color:#eafff5}
#ui-items{position:fixed;bottom:16px;left:50%;transform:translateX(-50%);display:flex;gap:8px;pointer-events:auto}
#ui-items .slot{position:relative;width:48px;height:48px;background:rgba(15,35,28,.8);border:2px solid #2a5a45;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:22px;cursor:pointer;transition:.12s;user-select:none}
#ui-items .slot:hover{border-color:#5fd0a0;background:rgba(25,70,55,.8)}
#ui-items .slot .cd-overlay{position:absolute;inset:0;background:rgba(0,0,0,.65);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:11px;color:#ff9;font-weight:700}
#ui-items .slot .slot-key{position:absolute;top:-8px;right:-6px;background:#1a3a2a;border:1px solid #3fae84;border-radius:4px;font-size:9px;color:#9ff7c8;padding:1px 4px;letter-spacing:0.5px}
#ui-items .slot .slot-count{position:absolute;bottom:-6px;right:-4px;background:#3a2a1a;border:1px solid #ae843f;border-radius:4px;font-size:10px;color:#ffe66a;font-weight:700;padding:0 4px}
#ui-items .slot.passive{border-color:#5a4a20;background:rgba(40,35,15,.8)}
#ui-items .slot.passive .slot-key{display:none}
#ui-hpwrap{position:fixed;left:16px;bottom:16px;width:240px}
#ui-hp{height:16px;border-radius:9px;background:#2a1414;overflow:hidden;border:1px solid #5a2a2a}
#ui-hp>i{display:block;height:100%;width:100%;background:linear-gradient(90deg,#e5483b,#ff8b6b);transition:width .1s}
#ui-hplabel{font-size:12px;margin-top:3px;color:#e7b0a8;text-shadow:0 1px 2px #000}
#ui-weapons{position:fixed;right:16px;bottom:16px;text-align:right;font-size:12px;line-height:1.7;text-shadow:0 1px 2px #000}
#ui-weapons .w{color:#cfe7df}#ui-weapons .lv{color:#9ff7c8}
#ui-boss{position:fixed;top:40px;left:50%;transform:translateX(-50%);width:60%;max-width:520px;display:none}
#ui-boss>i{display:block;height:10px;width:100%;background:linear-gradient(90deg,#9b3b6a,#e36aa0);border-radius:6px}
#ui-boss .t{font-size:12px;color:#e8a8c8;text-align:center;margin-bottom:3px;letter-spacing:2px}
#ui-overlay{position:fixed;inset:0;z-index:20;display:none;align-items:center;justify-content:center;background:rgba(4,8,7,.78);backdrop-filter:blur(3px);pointer-events:auto}
#ui-overlay .panel{width:min(640px,94%);max-height:85vh;overflow-y:auto;text-align:center;padding:30px 26px;background:linear-gradient(160deg,#11221c,#0a1512);border:1px solid #2f5c4a;border-radius:18px;box-shadow:0 0 50px rgba(40,200,140,.18);font-family:system-ui,"Microsoft YaHei",sans-serif;color:#dfe7e3}
#ui-overlay h1{font-size:30px;margin:0 0 8px;color:#9ff7c8;letter-spacing:3px}
#ui-overlay p{font-size:14px;color:#8fc0ac;line-height:1.8;margin:6px 0 18px}
#ui-overlay .cards{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
#ui-overlay .card{flex:1;min-width:130px;max-width:170px;cursor:pointer;background:rgba(25,70,55,.5);border:1px solid #3fae84;border-radius:12px;padding:16px 12px;transition:.12s}
#ui-overlay .card:hover{background:rgba(40,120,90,.8);transform:translateY(-3px);box-shadow:0 6px 18px rgba(40,200,140,.3)}
#ui-overlay .card.cantafford{opacity:.55;cursor:not-allowed}
#ui-overlay .card .icon{font-size:28px;margin-bottom:4px}
#ui-overlay .card .k{font-size:11px;color:#7fc0a4;letter-spacing:1px}
#ui-overlay .card .n{font-size:15px;color:#eafff5;margin:6px 0 4px;font-weight:600}
#ui-overlay .card .d{font-size:12px;color:#9fd0bc;line-height:1.5}
#ui-overlay .card .cost{font-size:13px;color:#ffd700;margin-top:8px;font-weight:700}
#ui-overlay .card .held-label{font-size:11px;color:#9ff7c8;margin-top:6px;font-weight:600}
#ui-overlay .card .key{font-size:11px;color:#5f9c84;margin-top:8px}
#ui-overlay button.start{margin-top:6px;cursor:pointer;background:linear-gradient(90deg,#19a06a,#3fd6a0);border:none;color:#042018;font-weight:700;font-size:16px;padding:12px 30px;border-radius:10px;letter-spacing:2px}
#ui-overlay .gold-display{font-size:16px;color:#ffd700;margin-bottom:14px}
#ui-overlay .gold-display b{color:#ffe66a}
`;

/** All DOM presentation: HUD overlay + title/level-up/end/shop screens. Game world stays on the canvas. */
export class UI {
  private hpFill: HTMLElement;
  private xpFill: HTMLElement;
  private topEl: HTMLElement;
  private hpLabel: HTMLElement;
  private weaponsEl: HTMLElement;
  private bossWrap: HTMLElement;
  private bossFill: HTMLElement;
  private overlay: HTMLElement;
  private goldEl: HTMLElement;
  private shopBtn: HTMLElement;
  private itemsBar: HTMLElement;
  private onShopOpen: (() => void) | null = null;

  constructor() {
    const style = document.createElement('style');
    style.textContent = STYLE;
    document.head.appendChild(style);

    const hud = document.createElement('div');
    hud.id = 'ui-hud';
    hud.innerHTML = `
      <div id="ui-xp"><i></i></div>
      <div id="ui-top"></div>
      <div id="ui-gold"></div>
      <div id="ui-shopbtn">[B] 商店</div>
      <div id="ui-items"></div>
      <div id="ui-boss"><div class="t">母 巢 暴 君</div><i></i></div>
      <div id="ui-hpwrap"><div id="ui-hp"><i></i></div><div id="ui-hplabel"></div></div>
      <div id="ui-weapons"></div>`;
    document.body.appendChild(hud);

    const overlay = document.createElement('div');
    overlay.id = 'ui-overlay';
    document.body.appendChild(overlay);

    this.xpFill = hud.querySelector('#ui-xp > i') as HTMLElement;
    this.topEl = hud.querySelector('#ui-top') as HTMLElement;
    this.hpFill = hud.querySelector('#ui-hp > i') as HTMLElement;
    this.hpLabel = hud.querySelector('#ui-hplabel') as HTMLElement;
    this.weaponsEl = hud.querySelector('#ui-weapons') as HTMLElement;
    this.bossWrap = hud.querySelector('#ui-boss') as HTMLElement;
    this.bossFill = hud.querySelector('#ui-boss > i') as HTMLElement;
    this.overlay = overlay;
    this.goldEl = hud.querySelector('#ui-gold') as HTMLElement;
    this.shopBtn = hud.querySelector('#ui-shopbtn') as HTMLElement;
    this.itemsBar = hud.querySelector('#ui-items') as HTMLElement;

    this.shopBtn.addEventListener('click', () => {
      if (this.onShopOpen) this.onShopOpen();
    });
  }

  setShopHandler(fn: () => void): void {
    this.onShopOpen = fn;
  }

  private static fmt(t: number): string {
    const s = Math.floor(t);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  updateHud(d: HudData): void {
    this.xpFill.style.width = `${Math.min(100, (d.xp / d.xpToNext) * 100)}%`;
    this.hpFill.style.width = `${Math.max(0, (d.hp / d.maxHp) * 100)}%`;
    this.hpLabel.textContent = `HP ${Math.ceil(d.hp)} / ${d.maxHp}`;
    this.topEl.innerHTML = `第 <b>${d.stage}</b> 阶段 ${d.stageName} | 时间 <b>${UI.fmt(d.time)}</b> | 等级 <b>${d.level}</b> | 击杀 <b>${d.kills}</b>`;
    this.weaponsEl.innerHTML = d.weapons
      .map((w) => `<div><span class="w">${w.name}</span> <span class="lv">Lv.${w.level}</span></div>`)
      .join('');
    if (d.bossHp === null) {
      this.bossWrap.style.display = 'none';
    } else {
      this.bossWrap.style.display = 'block';
      this.bossFill.style.width = `${Math.max(0, d.bossHp * 100)}%`;
    }

    // Gold display
    this.goldEl.innerHTML = `🪙 <b>${d.gold}</b>`;

    // Inventory bar: charge/shield items show a ×count badge; buffs show remaining seconds.
    let barHtml = '';
    for (const item of d.items) {
      const isBuff = item.def.kind === 'buff';
      const cls = isBuff ? 'slot passive' : 'slot';
      const overlay = isBuff
        ? `<div class="cd-overlay">${Math.ceil(item.remain)}s</div>`
        : '';
      const countBadge = !isBuff
        ? `<span class="slot-count">×${item.count}</span>`
        : '';
      const keyHint = item.def.kind === 'charge' && item.def.key
        ? `<span class="slot-key">${keyLabel(item.def.key)}</span>`
        : '';
      barHtml += `<div class="${cls}" title="${item.def.tip}">${item.def.icon}${overlay}${countBadge}${keyHint}</div>`;
    }
    this.itemsBar.innerHTML = barHtml;
  }

  showTitle(best: number, onStart: () => void): void {
    this.overlay.innerHTML = `
      <div class="panel">
        <h1>末日清道夫</h1>
        <p>WASD / 方向键移动 · 鼠标瞄准 · 自动开火<br>
        击杀丧尸掉落金币，按 <b style="color:#ffd700">B</b> 打开商店购买装备。<br>
        升级三选一构筑你的 build，活到母巢暴君出现并击杀它。${best > 0 ? `<br>最佳生存 ${UI.fmt(best)}` : ''}</p>
        <button class="start">开 始 （Space）</button>
      </div>`;
    (this.overlay.querySelector('.start') as HTMLElement).onclick = onStart;
    this.overlay.style.display = 'flex';
  }

  hideTitle(): void {
    this.overlay.style.display = 'none';
  }

  showLevelUp(choices: Choice[], onPick: (i: number) => void): void {
    const cards = choices
      .map(
        (c, i) => {
          const spriteKey = c.kind !== 'passive' ? c.sprite : undefined;
          const spriteImg = spriteKey
            ? `<img src="/assets/${spriteKey}.png" style="width:56px;height:56px;object-fit:contain;margin-bottom:4px;filter:drop-shadow(0 0 6px rgba(63,174,132,.5))" alt="">`
            : '';
          return `
        <div class="card" data-i="${i}">
          ${spriteImg}
          <div class="k">${c.kind === 'passive' ? '强化' : c.kind === 'weapon-new' ? '武器' : c.kind === 'weapon-evo' ? '进化' : '升级'}</div>
          <div class="n">${c.label}</div>
          <div class="d">${c.desc}</div>
          <div class="key">按 ${i + 1}</div>
        </div>`;
        },
      )
      .join('');
    this.overlay.innerHTML = `<div class="panel"><h1>升 级</h1><p>选择一项强化</p><div class="cards">${cards}</div></div>`;
    this.overlay.querySelectorAll('.card').forEach((el) => {
      (el as HTMLElement).onclick = () => onPick(Number((el as HTMLElement).dataset.i));
    });
    this.overlay.style.display = 'flex';
  }

  hideLevelUp(): void {
    this.overlay.style.display = 'none';
  }

  showShop(
    gold: number,
    status: (id: string) => string,
    onBuy: (id: string) => boolean,
    onClose: () => void,
  ): void {
    const cards = EQUIPMENT
      .map((eq) => {
        const canAfford = gold >= eq.cost;
        const held = status(eq.id);
        let cls = 'card';
        if (!canAfford) cls += ' cantafford';
        const heldLine = held ? `<div class="held-label">${held}</div>` : '';
        const kindLabel = eq.kind === 'charge' ? '消耗' : eq.kind === 'shield' ? '护盾' : '药剂';
        const keyHint = eq.kind === 'charge' && eq.key
          ? `<div class="key">快捷键: ${keyLabel(eq.key)}</div>`
          : '';
        return `<div class="${cls}" data-id="${eq.id}">
          <div class="icon">${eq.icon}</div>
          <div class="k">${kindLabel}</div>
          <div class="n">${eq.name}</div>
          <div class="d">${eq.desc}</div>
          <div class="cost">🪙 ${eq.cost}</div>
          ${heldLine}
          ${keyHint}
        </div>`;
      })
      .join('');

    this.overlay.innerHTML = `
      <div class="panel">
        <h1>装 备 商 店</h1>
        <div class="gold-display">金币: <b>${gold}</b> 🪙</div>
        <div class="cards">${cards}</div>
        <p style="margin-top:14px;font-size:12px;color:#6a9a84">装备均为一次性消耗品，可反复购买 · 按 B / Esc 关闭</p>
        <button class="start" id="shop-close">关 闭 （B）</button>
      </div>`;

    this.overlay.querySelectorAll('.card').forEach((el) => {
      (el as HTMLElement).onclick = () => {
        const id = (el as HTMLElement).dataset.id!;
        onBuy(id);
      };
    });
    (this.overlay.querySelector('#shop-close') as HTMLElement).onclick = onClose;
    this.overlay.style.display = 'flex';
  }

  hideShop(): void {
    this.overlay.style.display = 'none';
  }

  showEnd(victory: boolean, time: number, kills: number, best: number, onRestart: () => void): void {
    this.overlay.innerHTML = `
      <div class="panel">
        <h1>${victory ? '胜 利' : '阵 亡'}</h1>
        <p>${victory ? '你击杀了母巢暴君，清道夫传说诞生。' : '丧尸潮将你吞没……'}<br>
        生存 ${UI.fmt(time)} · 击杀 ${kills} · 最佳 ${UI.fmt(best)}</p>
        <button class="start">再来一局 （Space）</button>
      </div>`;
    (this.overlay.querySelector('.start') as HTMLElement).onclick = onRestart;
    this.overlay.style.display = 'flex';
  }

  hideEnd(): void {
    this.overlay.style.display = 'none';
  }
}

function keyLabel(code: string): string {
  return code.replace('Key', '');
}
