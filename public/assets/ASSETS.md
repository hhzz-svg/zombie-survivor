# 美术 / 音频资源放这里

游戏会自动从本目录加载资源；**没有资源时自动回退到程序化色块**，所以随时可增量替换。

## 角色图片（必要）

放到 `public/assets/`，**透明背景 PNG**，每个角色一张、正方形、约 512–1024px、人物居中、面朝**右**（代码会自动左右翻转朝向）。

| 文件名 | 角色 |
|---|---|
| `player.png` | 主角（清道夫） |
| `walker.png` | 行尸 |
| `runner.png` | 疾跑者 |
| `spitter.png` | 喷吐者 |
| `exploder.png` | 自爆体 |
| `brute.png` | 壮汉 |
| `boss.png` | 母巢暴君 |
| `ground.png` | （可选）可平铺地面，512×512，不透明 |

## 音频（可选）

放到 `public/assets/audio/`，`.mp3` / `.ogg` / `.wav` 均可：

| 文件名 | 用途 |
|---|---|
| `bgm.mp3` | 循环背景音乐（黑暗 / 紧张动作风） |
| `shoot.wav` `hit.wav` `explode.wav` `levelup.wav` `hurt.wav` `pickup.wav` `boss.wav` | 替换对应程序化音效（有几个放几个即可） |

## 接入方式

把文件丢进来后，告诉我，我会在 `manifest.json` 注册并把音频接到事件上。
`manifest.json` 形如：`{ "player": "player.png", "walker": "walker.png" }`。
