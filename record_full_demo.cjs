const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  console.log('🎬 开始录制完整演示...');
  
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

  // 完整测试数据
  const testRecords = [
    { id: "r1", date: "2025-10-15", indicatorType: "bloodPressureHigh", value: 128, unit: "mmHg" },
    { id: "r2", date: "2025-10-15", indicatorType: "bloodPressureLow", value: 82, unit: "mmHg" },
    { id: "r3", date: "2025-10-15", indicatorType: "bloodSugar", value: 5.6, unit: "mmol/L" },
    { id: "r4", date: "2025-10-15", indicatorType: "cholesterol", value: 5.2, unit: "mmol/L" },
    { id: "r5", date: "2025-10-15", indicatorType: "weight", value: 72.5, unit: "kg" },
    { id: "r6", date: "2026-01-10", indicatorType: "bloodPressureHigh", value: 132, unit: "mmHg" },
    { id: "r7", date: "2026-01-10", indicatorType: "bloodPressureLow", value: 85, unit: "mmHg" },
    { id: "r8", date: "2026-01-10", indicatorType: "bloodSugar", value: 5.9, unit: "mmol/L" },
    { id: "r9", date: "2026-01-10", indicatorType: "weight", value: 74.0, unit: "kg" },
    { id: "r10", date: "2026-04-18", indicatorType: "bloodPressureHigh", value: 125, unit: "mmHg" },
    { id: "r11", date: "2026-04-18", indicatorType: "bloodPressureLow", value: 80, unit: "mmHg" },
    { id: "r12", date: "2026-04-18", indicatorType: "bloodSugar", value: 5.3, unit: "mmol/L" },
    { id: "r13", date: "2026-04-18", indicatorType: "weight", value: 70.5, unit: "kg" },
  ];

  const categories = [
    { id: "bloodPressure", name: "血压", items: [
      { id: "bloodPressureHigh", label: "收缩压", unit: "mmHg" },
      { id: "bloodPressureLow", label: "舒张压", unit: "mmHg" }
    ]},
    { id: "bloodSugar", name: "血糖", items: [{ id: "bloodSugar", label: "血糖", unit: "mmol/L" }] },
    { id: "cholesterol", name: "血脂", items: [{ id: "cholesterol", label: "总胆固醇", unit: "mmol/L" }] },
    { id: "weight", name: "体重", items: [{ id: "weight", label: "体重", unit: "kg" }] }
  ];

  await page.addInitScript(({ records, categories }) => {
    localStorage.setItem('health_records_v1', JSON.stringify(records));
    localStorage.setItem('health_indicator_categories_v1', JSON.stringify(categories));
    localStorage.removeItem('health_last_active_user_v1');
  }, { records: testRecords, categories });

  await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // ===== 演示流程 =====
  
  // 1. 主页概览 - 展示数据统计
  console.log('Step 1: 主页概览');
  await page.waitForTimeout(3000);

  // 2. 数据列表 - 展示表格
  console.log('Step 2: 数据列表');
  await page.locator('[role="tab"][data-state="active"]').waitFor();
  await page.waitForTimeout(1000);

  // 3. 切换分类 - 血糖
  console.log('Step 3: 切换分类 -> 血糖');
  await page.locator('[role="combobox"]').click();
  await page.waitForTimeout(500);
  await page.locator('text=血糖').click();
  await page.waitForTimeout(2000);

  // 4. 图表分析
  console.log('Step 4: 图表分析');
  await page.locator('[role="tab"]:has-text("图表")').click();
  await page.waitForTimeout(3000);

  // 5. 数据维护
  console.log('Step 5: 数据维护');
  await page.locator('[role="tab"]:has-text("维护")').click();
  await page.waitForTimeout(2000);

  // 6. 打开对话框 - 报告导入
  console.log('Step 6: 报告导入对话框');
  await page.locator('button:has-text("报告导入")').click();
  await page.waitForTimeout(2000);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // 7. Excel 导入
  console.log('Step 7: Excel 导入对话框');
  await page.locator('button:has-text("Excel 导入")').click();
  await page.waitForTimeout(1500);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // 8. 添加记录
  console.log('Step 8: 添加检验记录');
  await page.locator('button:has-text("添加检验")').click();
  await page.waitForTimeout(1500);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // 9. 检验指标维护
  console.log('Step 9: 检验指标维护');
  await page.locator('button:has-text("指标维护")').click();
  await page.waitForTimeout(1500);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // 10. 云同步
  console.log('Step 10: 云同步');
  await page.locator('button:has-text("云同步")').click();
  await page.waitForTimeout(1500);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // 11. 返回数据列表
  console.log('Step 11: 返回数据列表');
  await page.locator('[role="tab"]:has-text("数据列表")').click();
  await page.waitForTimeout(1500);

  // 12. 结束 - 展示完整界面
  console.log('Step 12: 结束展示');
  await page.waitForTimeout(2000);

  // 保存视频
  const video = page.video();
  const videoPath = await video.path();
  console.log('✅ 录制完成:', videoPath);

  await browser.close();

  // 重命名视频文件
  const finalPath = path.join(__dirname, 'screenshots', 'demo_full_flow.webm');
  if (fs.existsSync(videoPath)) {
    fs.renameSync(videoPath, finalPath);
    console.log('📁 最终视频:', finalPath);
    
    // 转换为 mp4 (可选)
    const mp4Path = path.join(__dirname, 'screenshots', 'demo_full_flow.mp4');
    console.log('💡 可使用 ffmpeg 转换:');
    console.log(`   ffmpeg -i ${finalPath} -c:v libx264 ${mp4Path}`);
  }
})();