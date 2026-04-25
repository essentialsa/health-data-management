const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  console.log('启动浏览器...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    recordVideo: {
      dir: path.join(__dirname, 'screenshots'),
      size: { width: 1440, height: 900 }
    }
  });
  const page = await context.newPage();

  // 测试数据（简化版）
  const testRecords = [
    { id: "r1", date: "2025-10-15", indicatorType: "bloodPressureHigh", value: 128, unit: "mmHg", operationAt: "2025-10-15T08:00:00Z" },
    { id: "r2", date: "2025-10-15", indicatorType: "bloodPressureLow", value: 82, unit: "mmHg", operationAt: "2025-10-15T08:00:00Z" },
    { id: "r3", date: "2025-10-15", indicatorType: "bloodSugar", value: 5.6, unit: "mmol/L", operationAt: "2025-10-15T08:00:00Z" },
    { id: "r4", date: "2025-10-15", indicatorType: "weight", value: 72.5, unit: "kg", operationAt: "2025-10-15T08:00:00Z" },
    { id: "r5", date: "2026-01-10", indicatorType: "bloodPressureHigh", value: 132, unit: "mmHg", operationAt: "2026-01-10T08:00:00Z" },
    { id: "r6", date: "2026-01-10", indicatorType: "bloodPressureLow", value: 85, unit: "mmHg", operationAt: "2026-01-10T08:00:00Z" },
    { id: "r7", date: "2026-01-10", indicatorType: "bloodSugar", value: 5.9, unit: "mmol/L", operationAt: "2026-01-10T08:00:00Z" },
    { id: "r8", date: "2026-01-10", indicatorType: "weight", value: 74.0, unit: "kg", operationAt: "2026-01-10T08:00:00Z" },
    { id: "r9", date: "2026-04-18", indicatorType: "bloodPressureHigh", value: 125, unit: "mmHg", operationAt: "2026-04-18T08:00:00Z" },
    { id: "r10", date: "2026-04-18", indicatorType: "bloodPressureLow", value: 80, unit: "mmHg", operationAt: "2026-04-18T08:00:00Z" },
    { id: "r11", date: "2026-04-18", indicatorType: "bloodSugar", value: 5.3, unit: "mmol/L", operationAt: "2026-04-18T08:00:00Z" },
    { id: "r12", date: "2026-04-18", indicatorType: "weight", value: 70.5, unit: "kg", operationAt: "2026-04-18T08:00:00Z" },
  ];

  const categories = [
    { id: "bloodPressure", name: "血压", items: [
      { id: "bloodPressureHigh", label: "收缩压 (高压)", unit: "mmHg" },
      { id: "bloodPressureLow", label: "舒张压 (低压)", unit: "mmHg" }
    ]},
    { id: "bloodSugar", name: "血糖", items: [
      { id: "bloodSugar", label: "血糖", unit: "mmol/L" }
    ]},
    { id: "weight", name: "体重", items: [
      { id: "weight", label: "体重", unit: "kg" }
    ]}
  ];

  // 注入测试数据和模拟无认证状态
  await page.addInitScript(({ records, categories }) => {
    localStorage.setItem('health_records_v1', JSON.stringify(records));
    localStorage.setItem('health_indicator_categories_v1', JSON.stringify(categories));
    localStorage.removeItem('health_last_active_user_v1');
    // 模拟无 Supabase 配置（让应用使用本地存储模式）
    localStorage.setItem('health_auth_config_v1', JSON.stringify({ enabled: false }));
  }, { records: testRecords, categories });

  console.log('访问应用...');
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded', timeout: 10000 });
  await page.waitForTimeout(3000);

  // 检查是否还在登录页
  const loginBtn = await page.$('button:has-text("登录")');
  if (loginBtn) {
    console.log('仍在登录页，需要调整...');
    // 检查页面内容
    const pageContent = await page.evaluate(() => document.body.innerText);
    console.log('Page content preview:', pageContent.substring(0, 200));
  }

  console.log('录制演示流程...');
  
  // 1. 主页停留
  console.log('Step 1: 主页概览');
  await page.waitForTimeout(4000);

  // 尝试找到 tab 元素
  const tabs = await page.evaluate(() => {
    const elements = document.querySelectorAll('[role="tab"], button, [data-state]');
    return Array.from(elements).slice(0, 30).map(el => ({
      role: el.getAttribute('role'),
      text: el.textContent?.trim()?.substring(0, 30),
      dataState: el.getAttribute('data-state'),
      value: el.getAttribute('data-value') || el.getAttribute('value')
    }));
  });
  console.log('Found elements:', JSON.stringify(tabs, null, 2));

  // 2. 尝试切换视图
  const chartTab = await page.$('[role="tab"]:has-text("图表")') || await page.$('button:has-text("图表")');
  if (chartTab) {
    console.log('Step 2: 点击图表分析');
    await chartTab.click();
    await page.waitForTimeout(3000);
  } else {
    console.log('未找到图表 tab，尝试其他方式');
    // 尝试点击数据列表 tab
    const listTab = await page.$('[role="tab"]:has-text("数据列表")') || await page.$('button:has-text("数据列表")');
    if (listTab) {
      console.log('点击数据列表');
      await listTab.click();
      await page.waitForTimeout(2000);
    }
  }

  // 3. 回到概览
  console.log('Step 3: 返回概览');
  await page.waitForTimeout(2000);

  // 获取视频路径
  const video = page.video();
  if (video) {
    const videoPath = await video.path();
    console.log('视频路径:', videoPath);
  }

  console.log('完成录制');
  await page.waitForTimeout(1000);
  await browser.close();

  // 查找生成的视频文件
  const videoDir = path.join(__dirname, 'screenshots');
  const files = fs.readdirSync(videoDir).filter(f => f.endsWith('.webm'));
  console.log('生成的视频文件:', files);
})();