import { expect, test } from '@playwright/test';

test('primary map workflow and simulation cancellation recover cleanly', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '3v3 Map Lab' })).toBeVisible();
  await expect(page.getByRole('table').first()).toContainText('First contact');
  await page.getByLabel('Rounds to run').selectOption('1000');
  await page.getByRole('button', { name: 'Run rounds' }).click();
  await page.getByTestId('tile-0').click();
  const canvas = page.locator('#map');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas not visible');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByRole('button', { name: 'Run rounds' })).toBeEnabled();
  await expect(page.locator('.progress')).toBeHidden();
  expect(errors).toEqual([]);
});

test('layout codes round trip through the interface', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Copy layout code' }).click();
  const code = await page.getByLabel('Layout code').inputValue();
  expect(code).toMatch(/^CS3V3:/);
  await page.getByRole('button', { name: 'Load layout' }).click();
  await expect(page.getByRole('status')).toContainText('Layout loaded');
});

test('keyboard editing and modal focus are accessible', async ({ page }) => {
  await page.goto('/');
  const canvas = page.locator('#map');
  await canvas.focus();
  await canvas.press('ArrowRight');
  await canvas.press('Space');
  await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();
  await expect(page.locator('#canvas-help')).toContainText('Cell 1, 0');

  await page.getByRole('button', { name: 'Hammer blockout' }).click();
  const dialog = page.getByRole('dialog', { name: 'Hammer blockout' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('textbox')).toBeFocused();
  await dialog.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Hammer blockout' })).toBeFocused();
});

test('agent workflow evaluates, exports, and links diagnostics to the editor', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Agent tools' }).click();
  await page.getByRole('button', { name: 'Flat v1' }).click();
  await expect(page.getByLabel('Agent map JSON')).toContainText('"format": "cs-map-maker"');
  await page.getByLabel('Profile').selectOption('one-site-3v3');
  await page.reload();
  await page.getByRole('button', { name: 'Flat v1' }).click();
  await expect(page.getByLabel('Profile')).toHaveValue('one-site-3v3');
  await page.getByLabel('Simulation rounds').selectOption('200');
  await page.getByRole('button', { name: 'Evaluate map' }).click();
  await expect(page.locator('.agent-score')).toBeVisible({ timeout: 15000 });

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Report', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('report.json');

  await page.locator('.diagnostic').first().click();
  await expect(page.getByRole('tab', { name: 'Layout lab' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.locator('#map')).toBeVisible();
});

test('layered editing, deterministic search, and local playtests are usable', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('tab', { name: '2.5D' }).click();
  await expect(page.getByRole('heading', { name: '2.5D layout' })).toBeVisible();
  await page.getByRole('button', { name: 'Add upper level' }).click();
  await expect(page.getByLabel('Active level')).toContainText('Level 2');
  await page.getByRole('button', { name: 'floor' }).click();
  const layeredCanvas = page.getByLabel(/Edit Level 2/);
  const layeredBox = await layeredCanvas.boundingBox();
  if (!layeredBox) throw new Error('Layered canvas not visible');
  await page.mouse.click(layeredBox.x + 20, layeredBox.y + 20);
  await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();

  await page.getByRole('tab', { name: 'Agent tools' }).click();
  await expect(page.getByRole('button', { name: 'Layered v2' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Evaluate map' }).click();
  await expect(page.getByText(/Rubric 2\.0\.0/)).toBeVisible();

  await page.getByRole('tab', { name: 'Search' }).click();
  await page.getByLabel('Candidate budget').selectOption('25');
  await page.getByRole('button', { name: 'Search maps' }).click();
  await expect(page.getByText(/evaluated 25/)).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('button', { name: 'Accept candidate' }).first()).toBeVisible();

  await page.getByRole('tab', { name: 'Playtests' }).click();
  await page.getByLabel('Notes').fill('Routes were easy to understand.');
  await page.getByRole('button', { name: 'Save session' }).click();
  await expect(page.getByRole('status')).toContainText('Playtest evidence saved locally');
  await expect(page.getByText('Routes were easy to understand.')).toBeVisible();
});
