# Voicer

免费的网页划词转语音 Chrome 扩展，复刻并改进 [Voicer](https://voicer.hellogeek.work/) 的核心体验。

## 功能

- 划选网页文字，右键 **Read This / 朗读此内容** 即可朗读
- 快捷键 **Alt+R** 朗读当前选区
- 底部播放器：播放 / 暂停 / 停止、进度条、语速与音量调节
- 默认 **Web Speech API**，开箱即用，无需后端
- 可选 **HTTP / ChatTTS** 或 **Azure Speech** 引擎
- 远程 TTS 失败时自动降级到 Web Speech
- 设置通过 `chrome.storage` 持久化，切换页面不丢失
- 长文自动分段朗读（>5000 字）
- 中英文界面

## 开发

```bash
npm install
npm run dev
```

1. 打开 `chrome://extensions`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」，选择项目的 `dist` 目录

## 构建

```bash
npm run build
```

产物在 `dist/`，可用于打包发布。

## 使用

1. 在任意网页选中文字
2. 右键选择 **Read This / 朗读此内容**，或按 **Alt+R**
3. 底部播放器出现后点击播放（Web Speech 模式下会自动开始朗读）

点击扩展图标可快速调整引擎、语速、音色和界面语言；「高级设置」中可配置 ChatTTS / Azure。

## ChatTTS 对接

扩展不内置 ChatTTS 模型，需自建 HTTP 服务。在高级设置中填写端点，例如：

```
http://localhost:9966/tts
```

预期请求格式：

```http
POST /tts
Content-Type: application/json

{
  "text": "要朗读的文字",
  "voice": "default",
  "speed": 1.0
}
```

响应为 `audio/wav` 或 `audio/mpeg`。

推荐配合 [ChatTTS](https://github.com/2noise/ChatTTS) 或 [ChatTTS-ui](https://github.com/jianchang512/ChatTTS-ui) 部署本地 API。

## Azure Speech

在高级设置中填写：

- Azure Speech Key
- 区域（如 `eastasia`）
- 音色（如 `zh-CN-XiaoxiaoNeural`）

## 相对原版的改进

| 改进 | 说明 |
|------|------|
| 设置持久化 | 使用 `chrome.storage`，切换 tab 不丢失 |
| 开箱即用 | 默认 Web Speech，无需配置 |
| 混合 TTS | 可插拔 Provider + 失败降级 |
| 快捷键 | Alt+R |
| 长文分段 | 自动按段落拆分 |
| 样式隔离 | Shadow DOM 播放器 |

## 许可证

MIT
