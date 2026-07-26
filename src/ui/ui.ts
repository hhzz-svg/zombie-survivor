import type { Choice } from '../progression';
import type { EquipDef } from '../data/equipment';
import type { OperativeDef, SkillDef } from '../data/schemas';
import type { AchievementDef } from '../data/achievements';
import type { ShopOffer } from '../shop';

export interface HudData {
  stage: number;
  stageName: string;
  stageProgress: number;
  nextStageIn: number | null;
  threatLabel: string;
  primaryWeapon: { name: string; level: number; progress: number };
  tutorialTip: string;
  stageBanner: string;
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
  skills: Array<{ def: SkillDef; remain: number; active: boolean }>;
  shield: number;
  combo: { count: number; name: string; color: string; frac: number };
  surge: { label: string; active: boolean } | null;
}

export interface RunSummary {
  victory: boolean;
  time: number;
  kills: number;
  best: number;
  stage: number;
  primaryWeapon: string;
  gold: number;
  cause: string;
  nextGoal: string;
  maxCombo: number;
  elites: number;
  crates: number;
  tyrants: number; // endless-mode extra tyrant kills
  endless: boolean; // this summary comes from an endless run
  newAchievements: Array<{ name: string; desc: string }>;
  achProgress: { unlocked: number; total: number };
}

const STYLE = `
#ui-hud{--surface:rgba(7,14,13,.88);--surface-2:rgba(12,24,22,.82);--growth:#61e5de;--fire:#ffb438;--danger:#ff5a4f;--boss:#e56aa8;--text:#eff7f4;--muted:#9ab1aa;--line:rgba(138,216,194,.22);position:fixed;inset:0;pointer-events:none;z-index:10;font-family:system-ui,"Microsoft YaHei",sans-serif;color:var(--text)}
#ui-overlay{--surface:rgba(7,14,13,.88);--surface-2:rgba(12,24,22,.82);--growth:#61e5de;--fire:#ffb438;--danger:#ff5a4f;--boss:#e56aa8;--text:#eff7f4;--muted:#9ab1aa;--line:rgba(138,216,194,.22)}
#ui-hud button,#ui-hud [role=button],#ui-overlay button,#ui-overlay .card{pointer-events:auto}
#ui-hud button:focus-visible,#ui-overlay button:focus-visible,#ui-overlay .card:focus-visible{outline:2px solid var(--growth);outline-offset:3px}
#ui-xp{position:fixed;top:0;left:0;right:0;height:8px;background:rgba(4,8,7,.9);box-shadow:0 1px 0 var(--line)}
#ui-xp>i{display:block;height:100%;width:0;background:linear-gradient(90deg,var(--growth),#e8fff6);box-shadow:0 0 18px rgba(97,229,222,.35);transition:width .12s}
#ui-mission{position:fixed;top:16px;left:50%;transform:translateX(-50%);min-width:min(560px,72vw);display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:16px;padding:10px 16px;background:linear-gradient(180deg,var(--surface),rgba(5,10,9,.78));border:1px solid var(--line);border-radius:16px;box-shadow:0 12px 34px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.05);letter-spacing:.8px;text-transform:uppercase}
#ui-stage{font-size:12px;color:var(--growth);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#ui-time{font-size:20px;color:#fff;font-variant-numeric:tabular-nums;text-shadow:0 0 16px rgba(97,229,222,.24)}
#ui-threat{text-align:right;font-size:12px;color:var(--fire);white-space:nowrap}
#ui-economy{position:fixed;top:16px;right:16px;display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--surface);border:1px solid var(--line);border-radius:14px;box-shadow:0 10px 24px rgba(0,0,0,.24)}
#ui-gold{font-size:14px;color:var(--fire);font-weight:800;font-variant-numeric:tabular-nums;letter-spacing:.8px}
#ui-shopbtn{cursor:pointer;background:linear-gradient(180deg,rgba(255,180,56,.22),rgba(255,180,56,.08));border:1px solid rgba(255,180,56,.45);border-radius:10px;padding:7px 12px;font-size:12px;color:#ffe2a0;letter-spacing:1px;transition:.12s}
#ui-shopbtn:hover{transform:translateY(-1px);background:rgba(255,180,56,.2);color:#fff6dd}
#ui-stage-banner{position:fixed;top:74px;left:50%;transform:translateX(-50%) translateY(-6px);padding:8px 18px;background:rgba(255,180,56,.13);border:1px solid rgba(255,180,56,.45);border-radius:999px;color:#ffe2a0;font-weight:800;letter-spacing:2px;text-transform:uppercase;opacity:0;transition:.18s;box-shadow:0 0 28px rgba(255,180,56,.16)}
#ui-stage-banner.show{opacity:1;transform:translateX(-50%) translateY(0)}
#ui-tutorial{position:fixed;left:50%;bottom:92px;transform:translateX(-50%);max-width:560px;padding:8px 16px;background:rgba(7,14,13,.72);border:1px solid var(--line);border-radius:999px;color:#c9ddd7;font-size:13px;text-align:center;letter-spacing:.5px;opacity:.92}
#ui-items{position:fixed;bottom:16px;left:50%;transform:translateX(-50%);display:flex;gap:8px;pointer-events:auto}
#ui-items .slot{position:relative;width:52px;height:52px;background:linear-gradient(180deg,var(--surface-2),rgba(8,13,12,.92));border:1px solid var(--line);border-radius:14px;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:.12s;user-select:none;overflow:visible;box-shadow:0 8px 20px rgba(0,0,0,.25)}
#ui-items .slot:hover{border-color:var(--growth);background:rgba(24,55,50,.88);transform:translateY(-1px)}
#ui-items .slot .slot-img{width:34px;height:34px;object-fit:contain;filter:drop-shadow(0 0 7px rgba(97,229,222,.28))}
#ui-items .slot .cd-overlay{position:absolute;inset:0;background:rgba(0,0,0,.68);border-radius:13px;display:flex;align-items:center;justify-content:center;font-size:11px;color:#fff0a8;font-weight:800}
#ui-items .slot .slot-key{position:absolute;top:-8px;right:-6px;background:#10231f;border:1px solid var(--line);border-radius:5px;font-size:9px;color:var(--growth);padding:1px 5px;letter-spacing:.5px}
#ui-items .slot .slot-count{position:absolute;bottom:-6px;right:-4px;background:#2b2110;border:1px solid rgba(255,180,56,.5);border-radius:5px;font-size:10px;color:#ffe66a;font-weight:800;padding:0 5px}
#ui-items .slot.passive{border-color:rgba(255,180,56,.35);background:rgba(42,32,15,.82)}
#ui-items .slot.passive .slot-key{display:none}
#ui-items .slot.skill{border-color:rgba(97,229,222,.28)}
#ui-items .slot.skill.ready{border-color:var(--growth);box-shadow:0 0 18px rgba(97,229,222,.24)}
#ui-items .slot.skill.active{border-color:#b7a5ff;box-shadow:0 0 18px rgba(183,165,255,.34)}
#ui-hpwrap{position:fixed;left:16px;bottom:16px;width:320px;padding:10px 12px;background:var(--surface);border:1px solid var(--line);border-radius:16px;box-shadow:0 10px 24px rgba(0,0,0,.26)}
#ui-hp{height:16px;border-radius:999px;background:#2b1414;overflow:hidden;border:1px solid rgba(255,90,79,.35)}
#ui-hp>i{display:block;height:100%;width:100%;background:linear-gradient(90deg,var(--danger),#ff9a72);transition:width .1s;box-shadow:0 0 16px rgba(255,90,79,.24)}
#ui-hplabel{display:flex;justify-content:space-between;font-size:12px;margin-top:6px;color:#ffd5cc;text-shadow:0 1px 2px #000;letter-spacing:.6px}
#ui-weapon-primary{position:fixed;left:16px;bottom:92px;width:320px;padding:10px 12px;background:var(--surface);border:1px solid var(--line);border-radius:16px;box-shadow:0 10px 24px rgba(0,0,0,.22)}
#ui-weapon-primary .meta{display:flex;justify-content:space-between;font-size:12px;color:var(--muted);margin-bottom:7px}
#ui-weapon-primary .name{font-size:15px;color:var(--text);font-weight:800;letter-spacing:.8px}
#ui-weapon-primary .bar{height:6px;background:rgba(255,255,255,.08);border-radius:999px;overflow:hidden}
#ui-weapon-primary .bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,var(--fire),var(--growth));transition:width .12s}
#ui-weapons{position:fixed;right:16px;bottom:16px;min-width:170px;text-align:right;font-size:12px;line-height:1.8;padding:10px 12px;background:var(--surface);border:1px solid var(--line);border-radius:16px;box-shadow:0 10px 24px rgba(0,0,0,.22)}
#ui-weapons .w{color:#d8eee8}#ui-weapons .lv{color:var(--growth);font-weight:800}
#ui-boss{position:fixed;top:82px;left:50%;transform:translateX(-50%);width:60%;max-width:560px;display:none;padding:7px 10px;background:rgba(20,8,15,.82);border:1px solid rgba(229,106,168,.36);border-radius:14px;box-shadow:0 0 24px rgba(229,106,168,.12)}
#ui-boss>i{display:block;height:10px;width:100%;background:linear-gradient(90deg,#8f2859,var(--boss));border-radius:999px}
#ui-boss .t{font-size:12px;color:#ffc7e0;text-align:center;margin-bottom:5px;letter-spacing:2px;font-weight:800}
#ui-combo{position:fixed;right:18px;top:44%;text-align:right;pointer-events:none;opacity:0;transition:opacity .25s}
#ui-combo.show{opacity:1}
#ui-combo .cnum{font-size:46px;font-weight:900;line-height:1;font-variant-numeric:tabular-nums;text-shadow:0 0 20px currentColor,0 2px 4px rgba(0,0,0,.6)}
#ui-combo .cname{font-size:13px;letter-spacing:5px;font-weight:800;margin-top:4px;text-transform:uppercase;text-shadow:0 0 12px currentColor}
#ui-combo .cbar{margin-top:7px;height:4px;width:118px;margin-left:auto;background:rgba(255,255,255,.14);border-radius:999px;overflow:hidden}
#ui-combo .cbar i{display:block;height:100%;background:currentColor}
#ui-combo.pulse .cnum{animation:combo-pop .16s ease}
@keyframes combo-pop{0%{transform:scale(1)}45%{transform:scale(1.24)}100%{transform:scale(1)}}
#ui-surge{position:fixed;top:122px;left:50%;transform:translateX(-50%);padding:8px 22px;background:rgba(64,8,14,.8);border:1px solid rgba(255,82,82,.55);border-radius:999px;color:#ffb3ab;font-weight:900;letter-spacing:3px;display:none;text-transform:uppercase;font-size:13px}
#ui-surge.show{display:block;animation:surge-throb 1.1s ease-in-out infinite}
@keyframes surge-throb{0%,100%{box-shadow:0 0 20px rgba(255,60,60,.22)}50%{box-shadow:0 0 46px rgba(255,60,60,.55)}}
#ui-toast{position:fixed;left:50%;bottom:152px;transform:translateX(-50%) translateY(10px);padding:10px 22px;background:linear-gradient(180deg,rgba(38,32,12,.95),rgba(24,19,7,.95));border:1px solid rgba(255,209,102,.5);border-radius:14px;text-align:center;opacity:0;transition:.22s;pointer-events:none;box-shadow:0 12px 30px rgba(0,0,0,.4),0 0 28px rgba(255,209,102,.15)}
#ui-toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
#ui-toast .t-name{font-size:15px;font-weight:900;color:#ffe66a;letter-spacing:2px}
#ui-toast .t-desc{font-size:12px;color:#e8d9ad;margin-top:3px}
#ui-toast.v-curse{background:linear-gradient(180deg,rgba(46,10,16,.96),rgba(28,6,10,.96));border-color:rgba(255,82,94,.55);box-shadow:0 12px 30px rgba(0,0,0,.4),0 0 28px rgba(255,60,74,.2)}
#ui-toast.v-curse .t-name{color:#ff8a94}#ui-toast.v-curse .t-desc{color:#e8b3b8}
#ui-toast.v-achieve{background:linear-gradient(180deg,rgba(8,36,34,.96),rgba(5,22,21,.96));border-color:rgba(97,229,222,.55);box-shadow:0 12px 30px rgba(0,0,0,.4),0 0 28px rgba(97,229,222,.2)}
#ui-toast.v-achieve .t-name{color:#7ff0e9}#ui-toast.v-achieve .t-desc{color:#b3ded9}
#ui-reveal{position:fixed;left:50%;top:38%;transform:translate(-50%,-50%) scale(.6);padding:18px 34px;background:linear-gradient(165deg,rgba(44,36,13,.97),rgba(22,17,6,.97));border:1px solid rgba(255,209,102,.65);border-radius:18px;text-align:center;opacity:0;pointer-events:none;box-shadow:0 18px 50px rgba(0,0,0,.5),0 0 44px rgba(255,209,102,.22);transition:transform .18s cubic-bezier(.2,1.6,.4,1),opacity .18s}
#ui-reveal.show{opacity:1;transform:translate(-50%,-50%) scale(1)}
#ui-reveal .rv-kicker{font-size:11px;color:#c9a55a;letter-spacing:4px;text-transform:uppercase}
#ui-reveal .rv-name{font-size:22px;font-weight:900;color:#ffe66a;letter-spacing:2px;margin-top:5px;text-shadow:0 0 22px rgba(255,209,102,.4)}
#ui-reveal .rv-desc{font-size:13px;color:#efdcae;margin-top:6px}
#ui-ach-btn{margin-top:10px;cursor:pointer;background:rgba(97,229,222,.1);border:1px solid rgba(97,229,222,.4);color:#7ff0e9;font-size:13px;font-weight:700;padding:9px 20px;border-radius:10px;letter-spacing:1.5px;transition:.12s}
#ui-ach-btn:hover{background:rgba(97,229,222,.18)}
#ui-overlay .ach-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(198px,1fr));gap:9px;margin:16px 0;text-align:left;max-height:52vh;overflow-y:auto;padding-right:4px}
#ui-overlay .ach{padding:10px 12px;border-radius:12px;border:1px solid var(--line);background:rgba(10,20,19,.85)}
#ui-overlay .ach .a-name{font-size:13px;font-weight:800;color:#eafff9;letter-spacing:1px}
#ui-overlay .ach .a-desc{font-size:11px;color:#8fb0a7;margin-top:4px;line-height:1.45}
#ui-overlay .ach.done{border-color:rgba(97,229,222,.55);background:rgba(13,42,39,.9);box-shadow:0 0 14px rgba(97,229,222,.12)}
#ui-overlay .ach.done .a-name{color:#7ff0e9}
#ui-overlay .ach.done .a-name::before{content:'✓ ';color:#61e5de}
#ui-overlay .ach.locked{opacity:.5}
#ui-overlay .new-ach-row{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin:10px 0 4px}
#ui-overlay .new-ach{padding:6px 14px;border-radius:999px;border:1px solid rgba(97,229,222,.5);background:rgba(13,42,39,.9);color:#7ff0e9;font-size:12px;font-weight:800;letter-spacing:1px}
#ui-overlay .ops{display:grid;grid-template-columns:repeat(3,minmax(150px,1fr));gap:12px;margin:18px 0 8px}
#ui-overlay .op{cursor:pointer;padding:16px 10px 13px;background:linear-gradient(180deg,rgba(22,48,43,.8),rgba(9,18,17,.92));border:1px solid var(--line);border-radius:16px;transition:.15s;text-align:center}
#ui-overlay .op img{width:74px;height:74px;object-fit:contain;filter:drop-shadow(0 5px 12px rgba(0,0,0,.55))}
#ui-overlay .op .o-name{font-size:16px;font-weight:900;color:#f2fffa;margin-top:7px;letter-spacing:2px}
#ui-overlay .op .o-title{font-size:11px;color:var(--growth);letter-spacing:2px;margin-top:2px;text-transform:uppercase}
#ui-overlay .op .o-perk{font-size:12px;color:#ffd166;margin-top:7px;font-weight:700}
#ui-overlay .op .o-desc{font-size:11px;color:#a8c7bd;margin-top:5px;line-height:1.5;min-height:33px}
#ui-overlay .op:hover{transform:translateY(-2px);border-color:rgba(97,229,222,.5)}
#ui-overlay .op.sel{border-color:var(--growth);background:rgba(28,66,59,.95);box-shadow:0 0 26px rgba(97,229,222,.28);transform:translateY(-3px)}
#ui-overlay button.ghost{margin:8px 8px 0;cursor:pointer;background:linear-gradient(90deg,rgba(229,106,168,.85),rgba(255,120,120,.85));border:none;color:#2b0714;font-weight:900;font-size:15px;padding:12px 26px;border-radius:12px;letter-spacing:2px;box-shadow:0 8px 24px rgba(229,106,168,.25)}
#ui-overlay{position:fixed;inset:0;z-index:20;display:none;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 42%,rgba(31,54,49,.66),rgba(4,8,7,.86));backdrop-filter:blur(4px);pointer-events:auto}
#ui-overlay .panel{width:min(880px,94%);max-height:86vh;overflow-y:auto;text-align:center;padding:30px 26px;background:linear-gradient(160deg,rgba(12,24,22,.96),rgba(5,10,9,.96));border:1px solid var(--line);border-radius:22px;box-shadow:0 0 60px rgba(0,0,0,.38),0 0 36px rgba(97,229,222,.08);font-family:system-ui,"Microsoft YaHei",sans-serif;color:var(--text)}
#ui-overlay h1{font-size:32px;margin:0 0 8px;color:#eafff7;letter-spacing:3px;text-transform:uppercase}
#ui-overlay p{font-size:14px;color:#a8bbb5;line-height:1.8;margin:6px 0 18px}
#ui-overlay .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(148px,1fr));gap:12px;justify-content:center}
#ui-overlay .card{cursor:pointer;background:linear-gradient(180deg,rgba(22,48,43,.86),rgba(9,18,17,.9));border:1px solid var(--line);border-radius:16px;padding:14px 12px;transition:.12s;text-align:left;min-height:176px;box-shadow:0 8px 20px rgba(0,0,0,.22)}
#ui-overlay .card:hover{background:rgba(28,66,59,.92);transform:translateY(-3px);box-shadow:0 14px 28px rgba(0,0,0,.28),0 0 18px rgba(97,229,222,.12)}
#ui-overlay .card.skill-card{background:linear-gradient(180deg,rgba(18,42,72,.72),rgba(9,18,28,.92));border-color:rgba(97,229,222,.3)}
#ui-overlay .card.cantafford{opacity:.58;cursor:not-allowed}
#ui-overlay .card .icon{text-align:center;margin-bottom:8px;min-height:54px}
#ui-overlay .card .icon img{width:54px;height:54px;object-fit:contain;filter:drop-shadow(0 0 9px rgba(97,229,222,.32))}
#ui-overlay .card .k{font-size:11px;color:var(--growth);letter-spacing:1px;text-transform:uppercase}
#ui-overlay .card.skill-card .k{color:#9ccfff}
#ui-overlay .card .n{font-size:15px;color:#f2fffa;margin:6px 0 4px;font-weight:800;line-height:1.25}
#ui-overlay .card .d{font-size:12px;color:#a8c7bd;line-height:1.45}
#ui-overlay .card .cost{font-size:13px;color:var(--fire);margin-top:8px;font-weight:800}
#ui-overlay .card .lack{font-size:12px;color:var(--danger);margin-top:4px;font-weight:800}
#ui-overlay .card .held-label{font-size:11px;color:#d8fff3;margin-top:6px;font-weight:700}
#ui-overlay .card .key{font-size:11px;color:#77a79a;margin-top:8px}
#ui-overlay button.start{margin-top:8px;cursor:pointer;background:linear-gradient(90deg,var(--fire),#ffd46a);border:none;color:#231706;font-weight:900;font-size:16px;padding:12px 30px;border-radius:12px;letter-spacing:2px;box-shadow:0 8px 24px rgba(255,180,56,.2)}
#ui-overlay .gold-display{font-size:16px;color:var(--fire);margin-bottom:14px}.gold-display b{color:#ffe66a}
#ui-overlay .summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin:16px 0;text-align:left}
#ui-overlay .summary div{padding:10px 12px;background:rgba(255,255,255,.05);border:1px solid var(--line);border-radius:12px}.summary span{display:block;font-size:11px;color:var(--muted);margin-bottom:4px}.summary b{color:var(--text)}
#ui-overlay .shop-panel{width:min(1120px,96%);padding:24px 26px;overflow:hidden}
#ui-overlay .shop-panel .cards{grid-template-columns:repeat(auto-fit,minmax(118px,1fr));gap:10px}
#ui-overlay .shop-panel .card{min-height:0;padding:10px 10px}
#ui-overlay .shop-panel .card .icon{min-height:44px;margin-bottom:5px}
#ui-overlay .shop-panel .card .icon img{width:42px;height:42px}
#ui-overlay .shop-panel .card .n{font-size:14px}
#ui-overlay .shop-panel .card .d{font-size:11px;line-height:1.35}
#ui-overlay .shop-panel .cost{margin-top:6px}
@media (max-width:900px){#ui-mission{min-width:0;width:calc(100vw - 32px);grid-template-columns:1fr auto;gap:10px;top:14px}#ui-threat{display:none}#ui-economy{top:64px;right:12px}#ui-weapons{display:none}#ui-hpwrap,#ui-weapon-primary{left:12px;width:280px}#ui-items{bottom:84px}#ui-tutorial{display:none}}
`

/** All DOM presentation: HUD overlay + title/level-up/end/shop screens. Game world stays on the canvas. */
export class UI {
  private hpFill: HTMLElement;
  private xpFill: HTMLElement;
  private stageEl: HTMLElement;
  private timeEl: HTMLElement;
  private threatEl: HTMLElement;
  private stageBannerEl: HTMLElement;
  private tutorialEl: HTMLElement;
  private hpLabel: HTMLElement;
  private primaryWeaponEl: HTMLElement;
  private weaponsEl: HTMLElement;
  private bossWrap: HTMLElement;
  private bossFill: HTMLElement;
  private overlay: HTMLElement;
  private goldEl: HTMLElement;
  private shopBtn: HTMLElement;
  private itemsBar: HTMLElement;
  private comboEl: HTMLElement;
  private surgeEl: HTMLElement;
  private toastEl: HTMLElement;
  private revealEl: HTMLElement;
  private onShopOpen: (() => void) | null = null;
  private lastComboCount = 0;
  private toastTimer: number | undefined;
  private revealTimer: number | undefined;
  private titleSelection = '';

  constructor() {
    const style = document.createElement('style');
    style.textContent = STYLE;
    document.head.appendChild(style);

    const hud = document.createElement('div');
    hud.id = 'ui-hud';
    hud.innerHTML = `
      <div id="ui-xp"><i></i></div>
      <div id="ui-mission"><span id="ui-stage"></span><strong id="ui-time"></strong><span id="ui-threat"></span></div>
      <div id="ui-economy"><span id="ui-gold"></span><button id="ui-shopbtn">[B] 商店</button></div>
      <div id="ui-stage-banner"></div>
      <div id="ui-surge"></div>
      <div id="ui-tutorial"></div>
      <div id="ui-hpwrap"><div id="ui-hp"><i></i></div><div id="ui-hplabel"></div></div>
      <div id="ui-items"></div>
      <div id="ui-weapon-primary"></div>
      <div id="ui-weapons"></div>
      <div id="ui-combo"><div class="cnum"></div><div class="cname"></div><div class="cbar"><i></i></div></div>
      <div id="ui-toast"><div class="t-name"></div><div class="t-desc"></div></div>
      <div id="ui-reveal"><div class="rv-kicker">空投补给</div><div class="rv-name"></div><div class="rv-desc"></div></div>
      <div id="ui-boss"><div class="t">母巢暴君</div><i></i></div>
    `;
    document.body.appendChild(hud);

    const overlay = document.createElement('div');
    overlay.id = 'ui-overlay';
    document.body.appendChild(overlay);

    this.xpFill = hud.querySelector('#ui-xp > i') as HTMLElement;
    this.stageEl = hud.querySelector('#ui-stage') as HTMLElement;
    this.timeEl = hud.querySelector('#ui-time') as HTMLElement;
    this.threatEl = hud.querySelector('#ui-threat') as HTMLElement;
    this.stageBannerEl = hud.querySelector('#ui-stage-banner') as HTMLElement;
    this.tutorialEl = hud.querySelector('#ui-tutorial') as HTMLElement;
    this.hpFill = hud.querySelector('#ui-hp > i') as HTMLElement;
    this.hpLabel = hud.querySelector('#ui-hplabel') as HTMLElement;
    this.primaryWeaponEl = hud.querySelector('#ui-weapon-primary') as HTMLElement;
    this.weaponsEl = hud.querySelector('#ui-weapons') as HTMLElement;
    this.bossWrap = hud.querySelector('#ui-boss') as HTMLElement;
    this.bossFill = hud.querySelector('#ui-boss > i') as HTMLElement;
    this.overlay = overlay;
    this.goldEl = hud.querySelector('#ui-gold') as HTMLElement;
    this.shopBtn = hud.querySelector('#ui-shopbtn') as HTMLElement;
    this.itemsBar = hud.querySelector('#ui-items') as HTMLElement;
    this.comboEl = hud.querySelector('#ui-combo') as HTMLElement;
    this.surgeEl = hud.querySelector('#ui-surge') as HTMLElement;
    this.toastEl = hud.querySelector('#ui-toast') as HTMLElement;
    this.revealEl = hud.querySelector('#ui-reveal') as HTMLElement;

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
    this.hpLabel.innerHTML = `<span>HP ${Math.ceil(d.hp)} / ${d.maxHp}</span><span>Lv.${d.level} · ${d.kills} K</span>`;
    this.stageEl.textContent = `阶段 ${d.stage} · ${d.stageName} · ${Math.round(d.stageProgress * 100)}%${d.nextStageIn === null ? '' : ` · ${Math.ceil(d.nextStageIn)}s`}`;
    this.timeEl.textContent = UI.fmt(d.time);
    this.threatEl.textContent = d.threatLabel;
    this.stageBannerEl.textContent = d.stageBanner;
    this.stageBannerEl.classList.toggle('show', d.stageBanner.length > 0);
    this.tutorialEl.textContent = d.tutorialTip;
    this.tutorialEl.style.display = d.tutorialTip ? 'block' : 'none';
    this.primaryWeaponEl.innerHTML = `
      <div class="meta"><span>主武器</span><span>Lv.${d.primaryWeapon.level}</span></div>
      <div class="name">${d.primaryWeapon.name}</div>
      <div class="bar"><i style="width:${Math.round(d.primaryWeapon.progress * 100)}%"></i></div>`;
    this.weaponsEl.innerHTML = d.weapons
      .map((w) => `<div><span class="w">${w.name}</span> <span class="lv">Lv.${w.level}</span></div>`)
      .join('');
    if (d.bossHp === null) {
      this.bossWrap.style.display = 'none';
    } else {
      this.bossWrap.style.display = 'block';
      this.bossFill.style.width = `${Math.max(0, d.bossHp * 100)}%`;
    }

    this.goldEl.innerHTML = `金币 <b>${d.gold}</b>`;

    // Kill-combo widget: shows from 3 kills up, colored by tier, pulses on change.
    const combo = d.combo;
    this.comboEl.classList.toggle('show', combo.count >= 3);
    if (combo.count >= 3) {
      this.comboEl.style.color = combo.color;
      (this.comboEl.querySelector('.cnum') as HTMLElement).textContent = `x${combo.count}`;
      (this.comboEl.querySelector('.cname') as HTMLElement).textContent = combo.name || '连锁击杀';
      (this.comboEl.querySelector('.cbar > i') as HTMLElement).style.width = `${Math.round(combo.frac * 100)}%`;
      if (combo.count !== this.lastComboCount) {
        this.comboEl.classList.remove('pulse');
        void this.comboEl.offsetWidth; // restart the pop animation
        this.comboEl.classList.add('pulse');
      }
    }
    this.lastComboCount = combo.count;

    // Blood-moon banner: warning countdown, then the active storm.
    if (d.surge) {
      this.surgeEl.classList.add('show');
      this.surgeEl.textContent = d.surge.label;
      this.surgeEl.style.borderColor = d.surge.active ? 'rgba(255,82,82,.85)' : 'rgba(255,140,82,.6)';
    } else {
      this.surgeEl.classList.remove('show');
    }

    let barHtml = '';
    for (const item of d.items) {
      const isBuff = item.def.kind === 'buff';
      const cls = isBuff ? 'slot passive' : 'slot';
      const overlay = isBuff
        ? `<div class="cd-overlay">${Math.ceil(item.remain)}s</div>`
        : '';
      const countBadge = !isBuff
        ? `<span class="slot-count">x${item.count}</span>`
        : '';
      const keyHint = item.def.kind === 'charge' && item.def.key
        ? `<span class="slot-key">${keyLabel(item.def.key)}</span>`
        : '';
      barHtml += `<div class="${cls}" title="${item.def.tip}"><img class="slot-img" src="/assets/${item.def.iconKey}.png" alt="">${overlay}${countBadge}${keyHint}</div>`;
    }
    for (const skill of d.skills) {
      const ready = skill.remain <= 0;
      const cls = `slot skill${ready ? ' ready' : ''}${skill.active ? ' active' : ''}`;
      const overlay = ready ? '' : `<div class="cd-overlay">${Math.ceil(skill.remain)}s</div>`;
      barHtml += `<div class="${cls}" title="${skill.def.desc}">
        <img class="slot-img" src="/assets/${skill.def.iconKey}.png" alt="">
        ${overlay}
        <span class="slot-key">${keyLabel(skill.def.key)}</span>
      </div>`;
    }
    this.itemsBar.innerHTML = barHtml;
  }

  showTitle(
    best: number,
    operatives: readonly OperativeDef[],
    selectedId: string,
    onStart: (operativeId: string) => void,
    ach?: { unlocked: number; total: number },
    onShowAchievements?: () => void,
  ): void {
    this.titleSelection = operatives.some((o) => o.id === selectedId)
      ? selectedId
      : operatives[0]?.id ?? '';
    const cards = operatives
      .map(
        (op) => `
        <div class="op${op.id === this.titleSelection ? ' sel' : ''}" data-op="${op.id}" role="button" tabindex="0">
          <img src="/assets/${op.spriteKey}.png" alt="">
          <div class="o-name">${op.name}</div>
          <div class="o-title">${op.title}</div>
          <div class="o-perk">${op.perk}</div>
          <div class="o-desc">${op.desc}</div>
        </div>`,
      )
      .join('');
    const achBtn = ach && onShowAchievements
      ? `<br><button id="ui-ach-btn">成就 ${ach.unlocked} / ${ach.total}</button>`
      : '';
    this.overlay.innerHTML = `
      <div class="panel">
        <h1>末日清道夫</h1>
        <p>战术俯视生存 · 自动开火 · 阶段推进<br>
        WASD 移动 · 鼠标瞄准 · <b style="color:#ffb438">B</b> 商店 · <b style="color:#ffb438">Esc</b> 暂停 · 连杀提升经验金币 · 空投 / 血月 / 血怨祭坛改变战局${best > 0 ? `<br>最佳生存 ${UI.fmt(best)}` : ''}</p>
        <div class="ops">${cards}</div>
        <button class="start">出击 (Space)</button>
        ${achBtn}
      </div>`;
    this.overlay.querySelectorAll('.op').forEach((el) => {
      const card = el as HTMLElement;
      const select = () => {
        this.titleSelection = card.dataset.op ?? this.titleSelection;
        this.overlay.querySelectorAll('.op').forEach((o) => o.classList.toggle('sel', o === card));
      };
      card.onclick = select;
      card.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') select();
      };
    });
    (this.overlay.querySelector('.start') as HTMLElement).onclick = () => onStart(this.titleSelection);
    const achEl = this.overlay.querySelector('#ui-ach-btn') as HTMLElement | null;
    if (achEl && onShowAchievements) achEl.onclick = onShowAchievements;
    this.overlay.style.display = 'flex';
  }

  /** Full-wall achievement browser reached from the title screen. */
  showAchievements(defs: readonly AchievementDef[], unlocked: ReadonlySet<string>, onBack: () => void): void {
    const cells = defs
      .map((a) => {
        const done = unlocked.has(a.id);
        return `<div class="ach ${done ? 'done' : 'locked'}">
          <div class="a-name">${a.name}</div>
          <div class="a-desc">${a.desc}</div>
        </div>`;
      })
      .join('');
    this.overlay.innerHTML = `
      <div class="panel">
        <h1>成就</h1>
        <p>已解锁 ${[...unlocked].filter((id) => defs.some((d) => d.id === id)).length} / ${defs.length} · 输赢都有进度</p>
        <div class="ach-grid">${cells}</div>
        <button class="start" id="ach-back">返回</button>
      </div>`;
    (this.overlay.querySelector('#ach-back') as HTMLElement).onclick = onBack;
    this.overlay.style.display = 'flex';
  }

  /** Pause curtain: resume or abandon into a fresh run. */
  showPause(onResume: () => void, onRestart: () => void): void {
    this.overlay.innerHTML = `
      <div class="panel">
        <h1>已暂停</h1>
        <p>喘口气。尸潮不会真的等你。</p>
        <button class="start" id="pause-resume">继续 (Esc)</button>
        <button class="ghost" id="pause-restart">重新出击</button>
      </div>`;
    (this.overlay.querySelector('#pause-resume') as HTMLElement).onclick = onResume;
    (this.overlay.querySelector('#pause-restart') as HTMLElement).onclick = onRestart;
    this.overlay.style.display = 'flex';
  }

  hidePause(): void {
    this.overlay.style.display = 'none';
  }

  /** Operative currently highlighted on the title screen (for Space-to-start). */
  selectedOperative(): string {
    return this.titleSelection;
  }

  hideTitle(): void {
    this.overlay.style.display = 'none';
  }

  /** Transient bottom-center announcement, tinted by kind. */
  toast(name: string, desc: string, kind: 'gold' | 'curse' | 'achieve' | 'adrenaline' = 'gold'): void {
    (this.toastEl.querySelector('.t-name') as HTMLElement).textContent = name;
    (this.toastEl.querySelector('.t-desc') as HTMLElement).textContent = desc;
    this.toastEl.classList.remove('v-curse', 'v-achieve');
    if (kind === 'curse') this.toastEl.classList.add('v-curse');
    if (kind === 'achieve') this.toastEl.classList.add('v-achieve');
    this.toastEl.classList.add('show');
    if (this.toastTimer !== undefined) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), kind === 'achieve' ? 3400 : 2800);
  }

  /** Center-screen supply-crate reveal: a short pop ceremony, no game pause. */
  reveal(name: string, desc: string): void {
    (this.revealEl.querySelector('.rv-name') as HTMLElement).textContent = name;
    (this.revealEl.querySelector('.rv-desc') as HTMLElement).textContent = desc;
    this.revealEl.classList.remove('show');
    void this.revealEl.offsetWidth; // restart the pop-in animation
    this.revealEl.classList.add('show');
    if (this.revealTimer !== undefined) window.clearTimeout(this.revealTimer);
    this.revealTimer = window.setTimeout(() => this.revealEl.classList.remove('show'), 1900);
  }

  showLevelUp(choices: Choice[], onPick: (i: number) => void): void {
    const cards = choices
      .map(
        (c, i) => {
          const spriteKey = c.kind !== 'passive' ? c.sprite : undefined;
          const spriteImg = spriteKey
            ? `<img src="/assets/${spriteKey}.png" style="width:56px;height:56px;object-fit:contain;margin-bottom:4px;filter:drop-shadow(0 0 6px rgba(63,174,132,.5))" alt="">`
            : '';
          const kind = c.kind === 'passive' ? '强化' : c.kind === 'weapon-new' ? '武器' : c.kind === 'weapon-evo' ? '进化' : '升级';
          const upgradeLine = c.kind === 'weapon-up' ? '<div class="held-label">当前 → 下一等级</div>' : '';
          return `
        <div class="card" data-i="${i}" role="button" tabindex="0">
          ${spriteImg}
          <div class="k">${kind}</div>
          <div class="n">${c.label}</div>
          <div class="d">${c.desc}</div>
          ${upgradeLine}
          <div class="key">按 ${i + 1}</div>
        </div>`;
        },
      )
      .join('');
    this.overlay.innerHTML = `<div class="panel"><h1>升级</h1><p>选择一项强化</p><div class="cards">${cards}</div></div>`;
    this.overlay.querySelectorAll('.card').forEach((el) => {
      const card = el as HTMLElement;
      card.onclick = () => onPick(Number(card.dataset.i));
      card.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') onPick(Number(card.dataset.i));
      };
    });
    this.overlay.style.display = 'flex';
  }

  hideLevelUp(): void {
    this.overlay.style.display = 'none';
  }

  showShop(
    gold: number,
    offers: ShopOffer[],
    status: (id: string) => string,
    onBuy: (offer: ShopOffer) => boolean,
    onClose: () => void,
  ): void {
    const cards = offers
      .map((offer, i) => {
        const isSkill = offer.type === 'skill';
        const def = isSkill ? offer.skill : offer.equipment;
        const canAfford = gold >= def.cost;
        const held = status(offer.id);
        let cls = isSkill ? 'card skill-card' : 'card';
        if (!canAfford) cls += ' cantafford';
        const heldLine = held ? `<div class="held-label">${held}</div>` : '';
        const kindLabel = isSkill ? '主动技能' : equipmentKindLabel(offer.equipment.kind);
        const iconKey = isSkill ? offer.skill.iconKey : offer.equipment.iconKey;
        const icon = `<img src="/assets/${iconKey}.png" alt="">`;
        const lackLine = canAfford ? '' : `<div class="lack">还差 ${def.cost - gold} 金币</div>`;
        const keyHint = isSkill
          ? `<div class="key">技能键 ${keyLabel(offer.skill.key)}</div>`
          : offer.equipment.kind === 'charge' && offer.equipment.key
            ? `<div class="key">快捷键 ${keyLabel(offer.equipment.key)}</div>`
            : '';
        return `<div class="${cls}" data-offer="${i}" role="button" tabindex="0">
          <div class="icon">${icon}</div>
          <div class="k">${kindLabel}</div>
          <div class="n">${def.name}</div>
          <div class="d">${def.desc}</div>
          <div class="cost">金币 ${def.cost}</div>
          ${lackLine}
          ${heldLine}
          ${keyHint}
        </div>`;
      })
      .join('');

    this.overlay.innerHTML = `
      <div class="panel shop-panel">
        <h1>装备商店</h1>
        <div class="gold-display">金币: <b>${gold}</b></div>
        <div class="cards">${cards}</div>
        <p style="margin-top:14px;font-size:12px;color:#6a9a84">装备可重复购买；第 3 阶段后会出现本局主动技能。按 B / Esc 关闭。</p>
        <button class="start" id="shop-close">关闭 (B)</button>
      </div>`;

    this.overlay.querySelectorAll('.card').forEach((el) => {
      const card = el as HTMLElement;
      const buy = () => {
        const offer = offers[Number(card.dataset.offer)];
        if (offer) onBuy(offer);
      };
      card.onclick = buy;
      card.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') buy();
      };
    });
    (this.overlay.querySelector('#shop-close') as HTMLElement).onclick = onClose;
    this.overlay.style.display = 'flex';
  }

  hideShop(): void {
    this.overlay.style.display = 'none';
  }

  showEnd(summary: RunSummary, onRestart: () => void, onEndless?: () => void): void {
    const headline = summary.victory
      ? '任务完成'
      : summary.endless
        ? '无尽终局'
        : '行动失败';
    const sub = summary.victory
      ? '你击杀了母巢暴君，清道夫路线已打通。还敢挑战无尽尸潮吗？'
      : summary.endless
        ? `你在无尽尸潮中又斩落 ${summary.tyrants} 尊暴君，这里是极限，也是新的起点。`
        : '丧尸潮压垮了防线，下一局优先补足短板。';
    const endlessBtn = summary.victory && onEndless
      ? '<button class="ghost" id="end-endless">无尽尸潮 (E)</button>'
      : '';
    const achRow = summary.newAchievements.length > 0
      ? `<div class="new-ach-row">${summary.newAchievements
          .map((a) => `<span class="new-ach" title="${a.desc}">✓ ${a.name}</span>`)
          .join('')}</div>
         <p style="margin:2px 0 10px;font-size:12px;color:#6a9a84">本局解锁 ${summary.newAchievements.length} 项成就 · 总进度 ${summary.achProgress.unlocked}/${summary.achProgress.total}</p>`
      : `<p style="margin:2px 0 10px;font-size:12px;color:#6a9a84">成就进度 ${summary.achProgress.unlocked}/${summary.achProgress.total}</p>`;
    this.overlay.innerHTML = `
      <div class="panel">
        <h1>${headline}</h1>
        <p>${sub}</p>
        ${achRow}
        <div class="summary">
          <div><span>生存时间</span><b>${UI.fmt(summary.time)}</b></div>
          <div><span>击杀</span><b>${summary.kills}</b></div>
          <div><span>最高连击</span><b>x${summary.maxCombo}</b></div>
          <div><span>精英击破</span><b>${summary.elites}</b></div>
          <div><span>空投回收</span><b>${summary.crates}</b></div>
          <div><span>阶段</span><b>${summary.stage}</b></div>
          <div><span>主武器</span><b>${summary.primaryWeapon}</b></div>
          <div><span>金币</span><b>${summary.gold}</b></div>
          <div><span>最佳</span><b>${UI.fmt(summary.best)}</b></div>
          ${summary.tyrants > 0 ? `<div><span>额外暴君</span><b>${summary.tyrants}</b></div>` : ''}
        </div>
        <p>原因：${summary.cause}<br>${summary.nextGoal}</p>
        <button class="start">再来一局 (Space)</button>
        ${endlessBtn}
      </div>`;
    (this.overlay.querySelector('.start') as HTMLElement).onclick = onRestart;
    const endlessEl = this.overlay.querySelector('#end-endless') as HTMLElement | null;
    if (endlessEl && onEndless) endlessEl.onclick = onEndless;
    this.overlay.style.display = 'flex';
  }

  hideEnd(): void {
    this.overlay.style.display = 'none';
  }
}

function equipmentKindLabel(kind: EquipDef['kind']): string {
  if (kind === 'charge') return '消耗品';
  if (kind === 'shield') return '护盾';
  return '药剂';
}

function keyLabel(code: string): string {
  return code.replace('Key', '');
}
