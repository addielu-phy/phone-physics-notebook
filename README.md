# 手機物理實驗室（里程碑 1）

以手機感測器做物理實驗：手機量測、電腦即時繪圖與分析。純前端，免安裝、免登入。

- 首頁：22 個實驗目錄（目前開放「單擺測 g」）
- `#/lab/pendulum`：電腦端單擺實驗台（QR 配對、即時圖表、自相關求週期、多輪統計、Excel 匯出）
- `#/lab/pendulum/demo`：示範模式（合成數據）
- `?sensor=代碼`：手機感測頁（需 HTTPS）
- 網址加上 `?debug` 會在主控台輸出 PeerJS 除錯訊息

```bash
npm install
npm run dev      # 開發
npm test         # 分析函式單元測試
npm run build    # 輸出 dist/
npm run preview  # 預覽 dist/（port 4173）
```

端對端測試（需 Playwright）：`tests/e2e.py`、`tests/e2e_pair.py`。
