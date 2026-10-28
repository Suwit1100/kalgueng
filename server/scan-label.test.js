import assert from 'node:assert/strict'
import test from 'node:test'
import { parseNutritionLabel, scanLabel } from './scan-label.js'

test('extracts Thai label values per serving', () => {
  assert.deepEqual(parseNutritionLabel('ขนาดหนึ่งหน่วยบริโภค 1 ซอง\nพลังงานทั้งหมด 210 กิโลแคลอรี\nโปรตีน 6 กรัม\nคาร์โบไฮเดรต 27 กรัม\nไขมันทั้งหมด 8 กรัม'), {
    serving: 'ขนาดหนึ่งหน่วยบริโภค 1 ซอง',
    values: { calories: 210, protein: 6, carbs: 27, fat: 8 },
  })
})

test('extracts values from an OCR markdown table', () => {
  assert.deepEqual(parseNutritionLabel('| Nutrient | Amount |\n| --- | --- |\n| Calories | 180 kcal |\n| Protein | 7 g |\n| Carbohydrate | 24 g |\n| Total Fat | 5 g |').values, {
    calories: 180, protein: 7, carbs: 24, fat: 5,
  })
})

test('sends image to OCR and preserves raw text', async () => {
  const result = await scanLabel('data:image/png;base64,aGVsbG8=', 'secret', { fetcher: async (url, init) => {
    assert.equal(url, 'https://api.opentyphoon.ai/v1/ocr')
    assert.equal(init.headers.Authorization, 'Bearer secret')
    assert.equal(init.body.get('model'), 'typhoon-ocr')
    return { ok: true, json: async () => ({ results: [{ success: true, message: { choices: [{ message: { content: JSON.stringify({ natural_text: 'Energy 120 kcal\nProtein 4 g\nCarbohydrate 20 g\nTotal Fat 2 g' }) } }] } }] }) }
  } })
  assert.equal(result.values.calories, 120)
  assert.equal(result.values.fat, 2)
  assert.match(result.text, /Protein 4 g/)
})
