const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
  });
  const page = await context.newPage();
  const screenshotDir = path.join(__dirname, 'screenshots', 'demo');
  fs.mkdirSync(screenshotDir, { recursive: true });

  // ===== Test Data: 3次体检 × 14项指标 = 42条 =====
  const testRecords = [
    { id: "rec_001", date: "2025-10-15", indicatorType: "bloodPressureHigh", value: 128, unit: "mmHg", operationAt: "2025-10-15T08:00:00Z" },
    { id: "rec_002", date: "2025-10-15", indicatorType: "bloodPressureLow", value: 82, unit: "mmHg", operationAt: "2025-10-15T08:00:00Z" },
    { id: "rec_003", date: "2025-10-15", indicatorType: "bloodSugar", value: 5.6, unit: "mmol/L", operationAt: "2025-10-15T08:00:00Z" },
    { id: "rec_004", date: "2025-10-15", indicatorType: "cholesterol", value: 5.2, unit: "mmol/L", operationAt: "2025-10-15T08:00:00Z" },
    { id: "rec_005", date: "2025-10-15", indicatorType: "triglycerides", value: 1.8, unit: "mmol/L", operationAt: "2025-10-15T08:00:00Z" },
    { id: "rec_006", date: "2025-10-15", indicatorType: "ldl", value: 3.1, unit: "mmol/L", operationAt: "2025-10-15T08:00:00Z" },
    { id: "rec_007", date: "2025-10-15", indicatorType: "hdl", value: 1.4, unit: "mmol/L", operationAt: "2025-10-15T08:00:00Z" },
    { id: "rec_008", date: "2025-10-15", indicatorType: "alt", value: 32, unit: "U/L", operationAt: "2025-10-15T08:00:00Z" },
    { id: "rec_009", date: "2025-10-15", indicatorType: "ast", value: 28, unit: "U/L", operationAt: "2025-10-15T08:00:00Z" },
    { id: "rec_010", date: "2025-10-15", indicatorType: "creatinine", value: 78, unit: "µmol/L", operationAt: "2025-10-15T08:00:00Z" },
    { id: "rec_011", date: "2025-10-15", indicatorType: "bun", value: 5.2, unit: "mmol/L", operationAt: "2025-10-15T08:00:00Z" },
    { id: "rec_012", date: "2025-10-15", indicatorType: "weight", value: 72.5, unit: "kg", operationAt: "2025-10-15T08:00:00Z" },
    { id: "rec_013", date: "2025-10-15", indicatorType: "bmi", value: 23.8, unit: "", operationAt: "2025-10-15T08:00:00Z" },
    { id: "rec_014", date: "2025-10-15", indicatorType: "heartRate", value: 72, unit: "次/分", operationAt: "2025-10-15T08:00:00Z" },
    { id: "rec_015", date: "2026-01-10", indicatorType: "bloodPressureHigh", value: 132, unit: "mmHg", operationAt: "2026-01-10T08:00:00Z" },
    { id: "rec_016", date: "2026-01-10", indicatorType: "bloodPressureLow", value: 85, unit: "mmHg", operationAt: "2026-01-10T08:00:00Z" },
    { id: "rec_017", date: "2026-01-10", indicatorType: "bloodSugar", value: 5.9, unit: "mmol/L", operationAt: "2026-01-10T08:00:00Z" },
    { id: "rec_018", date: "2026-01-10", indicatorType: "cholesterol", value: 5.5, unit: "mmol/L", operationAt: "2026-01-10T08:00:00Z" },
    { id: "rec_019", date: "2026-01-10", indicatorType: "triglycerides", value: 2.1, unit: "mmol/L", operationAt: "2026-01-10T08:00:00Z" },
    { id: "rec_020", date: "2026-01-10", indicatorType: "ldl", value: 3.4, unit: "mmol/L", operationAt: "2026-01-10T08:00:00Z" },
    { id: "rec_021", date: "2026-01-10", indicatorType: "hdl", value: 1.3, unit: "mmol/L", operationAt: "2026-01-10T08:00:00Z" },
    { id: "rec_022", date: "2026-01-10", indicatorType: "alt", value: 38, unit: "U/L", operationAt: "2026-01-10T08:00:00Z" },
    { id: "rec_023", date: "2026-01-10", indicatorType: "ast", value: 31, unit: "U/L", operationAt: "2026-01-10T08:00:00Z" },
    { id: "rec_024", date: "2026-01-10", indicatorType: "creatinine", value: 82, unit: "µmol/L", operationAt: "2026-01-10T08:00:00Z" },
    { id: "rec_025", date: "2026-01-10", indicatorType: "bun", value: 5.8, unit: "mmol/L", operationAt: "2026-01-10T08:00:00Z" },
    { id: "rec_026", date: "2026-01-10", indicatorType: "weight", value: 74.0, unit: "kg", operationAt: "2026-01-10T08:00:00Z" },
    { id: "rec_027", date: "2026-01-10", indicatorType: "bmi", value: 24.3, unit: "", operationAt: "2026-01-10T08:00:00Z" },
    { id: "rec_028", date: "2026-01-10", indicatorType: "heartRate", value: 75, unit: "次/分", operationAt: "2026-01-10T08:00:00Z" },
    { id: "rec_029", date: "2026-04-18", indicatorType: "bloodPressureHigh", value: 125, unit: "mmHg", operationAt: "2026-04-18T08:00:00Z" },
    { id: "rec_030", date: "2026-04-18", indicatorType: "bloodPressureLow", value: 80, unit: "mmHg", operationAt: "2026-04-18T08:00:00Z" },
    { id: "rec_031", date: "2026-04-18", indicatorType: "bloodSugar", value: 5.3, unit: "mmol/L", operationAt: "2026-04-18T08:00:00Z" },
    { id: "rec_032", date: "2026-04-18", indicatorType: "cholesterol", value: 4.9, unit: "mmol/L", operationAt: "2026-04-18T08:00:00Z" },
    { id: "rec_033", date: "2026-04-18", indicatorType: "triglycerides", value: 1.5, unit: "mmol/L", operationAt: "2026-04-18T08:00:00Z" },
    { id: "rec_034", date: "2026-04-18", indicatorType: "ldl", value: 2.8, unit: "mmol/L", operationAt: "2026-04-18T08:00:00Z" },
    { id: "rec_035", date: "2026-04-18", indicatorType: "hdl", value: 1.5, unit: "mmol/L", operationAt: "2026-04-18T08:00:00Z" },
    { id: "rec_036", date: "2026-04-18", indicatorType: "alt", value: 25, unit: "U/L", operationAt: "2026-04-18T08:00:00Z" },
    { id: "rec_037", date: "2026-04-18", indicatorType: "ast", value: 22, unit: "U/L", operationAt: "2026-04-18T08:00:00Z" },
    { id: "rec_038", date: "2026-04-18", indicatorType: "creatinine", value: 75, unit: "µmol/L", operationAt: "2026-04-18T08:00:00Z" },
    { id: "rec_039", date: "2026-04-18", indicatorType: "bun", value: 4.9, unit: "mmol/L", operationAt: "2026-04-18T08:00:00Z" },
    { id: "rec_040", date: "2026-04-18", indicatorType: "weight", value: 70.5, unit: "kg", operationAt: "2026-04-18T08:00:00Z" },
    { id: "rec_041", date: "2026-04-18", indicatorType: "bmi", value: 23.1, unit: "", operationAt: "2026-04-18T08:00:00Z" },
    { id: "rec_042", date: "2026-04-18", indicatorType: "heartRate", value: 68, unit: "次/分", operationAt: "2026-04-18T08:00:00Z" },
  ];

  const categories = [
    { id: "bloodPressure", name: "血压", items: [
      { id: "bloodPressureHigh", label: "收缩压 (高压)", unit: "mmHg" },
      { id: "bloodPressureLow", label: "舒张压 (低压)", unit: "mmHg" }
    ]},
    { id: "bloodSugar", name: "血糖", items: [
      { id: "bloodSugar", label: "血糖", unit: "mmol/L" }
    ]},
    { id: "cholesterolPanel", name: "血脂", items: [
      { id: "cholesterol", label: "总胆固醇", unit: "mmol/L" },
      { id: "triglycerides", label: "甘油三酯", unit: "mmol/L" },
      { id: "ldl", label: "低密度脂蛋白", unit: "mmol/L" },
      { id: "hdl", label: "高密度脂蛋白", unit: "mmol/L" }
    ]},
    { id: "liverFunction", name: "肝功能", items: [
      { id: "alt", label: "谷丙转氨酶", unit: "U/L" },
      { id: "ast", label: "谷草转氨酶", unit: "U/L" }
    ]},
    { id: "renalFunction", name: "肾功能", items: [
      { id: "creatinine", label: "肌酐", unit: "µmol/L" },
      { id: "bun", label: "尿素氮", unit: "mmol/L" }
    ]},
    { id: "weight", name: "体重", items: [
      { id: "weight", label: "体重", unit: "kg" }
    ]},
    { id: "bmi", name: "BMI", items: [
      { id: "bmi", label: "BMI", unit: "" }
    ]},
    { id: "heartRate", name: "心率", items: [
      { id: "heartRate", label: "心率", unit: "次/分" }
    ]}
  ];

  // ⚡ 使用 addInitScript 在 App 读取 localStorage 前注入数据
  await page.addInitScript(({ records, categories }) => {
    localStorage.setItem('health_records_v1', JSON.stringify(records));
    localStorage.setItem('health_indicator_categories_v1', JSON.stringify(categories));
    // 清除 last_active_user 确保使用无 scope 的 key
    localStorage.removeItem('health_last_active_user_v1');
  }, { records: testRecords, categories });

  console.log('Loading app with pre-injected data...');
  await page.goto('http://localhost:4173', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  // 验证数据加载
  const countText = await page.evaluate(() => {
    const el = document.querySelector('.text-4xl');
    return el ? el.textContent : 'NOT FOUND';
  });
  console.log('First .text-4xl element:', countText);

  // 获取所有 text-4xl 元素来确认哪个是记录数
  const allCounts = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.text-4xl')).map(el => el.textContent);
  });
  console.log('All .text-4xl elements:', allCounts);

  // 01-homepage.png
  await page.screenshot({ path: path.join(screenshotDir, '01-homepage.png'), fullPage: false });
  console.log('✓ 01-homepage.png');

  // 02-chart.png
  await page.getByRole('tab', { name: '图表分析' }).click();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(screenshotDir, '02-chart.png'), fullPage: false });
  console.log('✓ 02-chart.png');

  // 03-maintenance.png
  await page.getByRole('tab', { name: '数据维护' }).click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(screenshotDir, '03-maintenance.png'), fullPage: false });
  console.log('✓ 03-maintenance.png');

  // 04-data-table.png
  await page.getByRole('tab', { name: '数据列表' }).click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(screenshotDir, '04-data-table.png'), fullPage: false });
  console.log('✓ 04-data-table.png');

  // 05-lipid-table.png
  await page.locator('text=血压').first().click();
  await page.waitForTimeout(800);
  await page.getByRole('option', { name: '血脂' }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(screenshotDir, '05-lipid-table.png'), fullPage: false });
  console.log('✓ 05-lipid-table.png');

  // 06-indicator-maintenance.png
  await page.getByText('检验指标维护').click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(screenshotDir, '06-indicator-maintenance.png'), fullPage: false });
  console.log('✓ 06-indicator-maintenance.png');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // 07-cloud-sync.png
  await page.getByText('云同步').click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(screenshotDir, '07-cloud-sync.png'), fullPage: false });
  console.log('✓ 07-cloud-sync.png');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // 08-report-import.png (报告导入)
  await page.getByText('报告导入').click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(screenshotDir, '08-report-import.png'), fullPage: false });
  console.log('✓ 08-report-import.png');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // 09-excel-import.png (Excel 导入)
  await page.getByText('Excel 导入').click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(screenshotDir, '09-excel-import.png'), fullPage: false });
  console.log('✓ 09-excel-import.png');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // 10-add-record.png (添加检验记录)
  await page.getByText('添加检验记录').click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(screenshotDir, '10-add-record.png'), fullPage: false });
  console.log('✓ 10-add-record.png');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // 11-export.png (导出Excel)
  await page.getByText('导出Excel').click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(screenshotDir, '11-export.png'), fullPage: false });
  console.log('✓ 11-export.png');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // 12-full-page.png
  await page.getByRole('tab', { name: '数据列表' }).click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(screenshotDir, '12-full-page.png'), fullPage: true });
  console.log('✓ 12-full-page.png');

  console.log('\n✅ All screenshots captured!');
  const files = fs.readdirSync(screenshotDir).filter(f => f.endsWith('.png'));
  console.log(`Files (${files.length}):`, files);

  await browser.close();
})().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
