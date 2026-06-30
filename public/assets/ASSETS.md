# 美术 / 音频资源放这里

游戏会自动从本目录加载资源；**没有资源时自动回退到程序化色块**，所以随时可增量替换。

## 角色图片（必要）

放到 `public/assets/`，要求是**透明背景 PNG**。主角只保留 `player.png`，不要再混入不同人物变体。

| 文件名 | 角色 |
|---|---|
| `player.png` | 主角（清道夫） |
| `walker.png` | 行尸 |
| `runner.png` | 疾跑者 |
| `spitter.png` | 喷吐者 |
| `exploder.png` | 自爆体 |
| `brute.png` | 壮汉 |
| `boss.png` | 母巢暴君 |
| `ground.png` | （可选）可平铺地面纹理，512×512，透明或半透明都可 |

## 武器 / 技能图标

这些图标同样放在 `public/assets/`，由 `manifest.json` 注册后即可在商店和 HUD 中显示。

| 文件名 | 用途 |
|---|---|
| `pistol.png` `shotgun.png` `smg.png` `magnum.png` | 近远程枪械图标 |
| `shockwave.png` `orbit_blade.png` | 现有技能武器图标 |
| `skill_dash.png` | 疾冲 |
| `skill_burst.png` | 冲击爆破 |
| `skill_barrier.png` | 能量屏障 |
| `skill_slow.png` | 时间迟滞 |

## 装备图标

装备图标为 96×96 透明 PNG，用于商店卡片和底部物品栏，风格统一为战术废土 2.5D 道具。

| 文件名 | 用途 |
|---|---|
| `equip_magnet.png` | 磁能吸附 |
| `equip_grenade.png` | 高爆手雷 |
| `equip_medkit.png` | 急救包 |
| `equip_shield.png` | 护盾发生器 |
| `equip_boots.png` | 疾风战靴 |
| `equip_berserk.png` | 狂暴药剂 |
| `equip_coin_double.png` | 金币倍增 |
| `equip_death_dance.png` | 死亡之舞 |

### 技能图标规范

- 透明 PNG
- 建议 64×64 或 96×96
- 俯视/街机风格，深色描边，高对比
- 不包含文字
- 颜色区分：Dash 偏青蓝，Burst 偏橙红，Barrier 偏蓝，Slow 偏紫蓝

## 音频（可选）

放到 `public/assets/`，`mp3` / `ogg` / `wav` 都可以。

| 文件名 | 用途 |
|---|---|
| `bgm.mp3` | 循环背景音乐 |
| `shoot.wav` `hit.wav` `explode.wav` `levelup.wav` `hurt.wav` `pickup.wav` `boss.wav` | 对应程序化音效替换 |

## 接入方式

把文件放进来后，更新 `manifest.json`。资源键会被游戏直接读取，例如：`{ "player": "player.png", "skill_dash": "skill_dash.png" }`。
