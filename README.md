# DreamRead

免费的网页划词朗读 Chrome 扩展——选中文字，右键即听。

## 功能

- 划选网页文字，右键 **Read This / 朗读此内容** 即可朗读
- 快捷键 **Alt+R** 朗读当前选区
- 独立 **播放 / 暂停 / 停止** 按钮，播完或停止后可重新播放
- 中英文分段朗读，避免英文段落用中文腔读标点
- 紧凑卡通风格播放器，支持 **透明度** 与 **主题色** 调节
- 播放器内置 **设置** 按钮（⚙）
- 默认 **Web Speech API**，开箱即用
- 可选 **HTTP / ChatTTS** 或 **Azure Speech** 引擎
- 设置全局持久化

## 开发

```bash
npm install
npm run dev
```

1. 打开 `chrome://extensions`
2. 开启「开发者模式」
3. 加载 `dist` 目录

## 构建与打包

```bash
npm run build
npm run package
```

发布包：`release/dreamread-v<version>.zip`，其中版本号取自 `package.json`。

## 使用

1. 选中网页文字
2. 右键 **Read This** 或按 **Alt+R**
3. 使用底部播放器控制朗读；点击 ⚙ 调节透明度、主题、语速

## 文档

- [测试清单](docs/TESTING.md)
- [发布指南](docs/RELEASE.md)
- [隐私政策](PRIVACY.md)

## 仓库

https://github.com/Box0129/dreamread

## 许可证

MIT
