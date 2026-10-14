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
